'use strict';
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');
let visible=true, hidden=false;
const createRow=(id,name,detail,hp)=>{
  const cells={
    '.battle-window-target-title':{textContent:name},
    '.battle-window-target-sub':{textContent:detail},
    '.battle-window-bar-wrapper .bar-text':{textContent:hp},
  };
  return {id,isConnected:true,getClientRects(){return hidden?[]:[{}]},querySelector(key){return cells[key]||null},cells};
};
const rows=[
 createRow('7550498','Cuitlahuac','LVL 45 [EK]','734 / 740'),
 createRow('91542','Timur','','100 / 100'),
 createRow('4617456','Storm Lord','','???'),
 createRow('2763667','Yokiyolakua','','???'),
 createRow('2759450','Bulega','','???'),
 createRow('4774927','Monk','','???'),
 createRow('battle-window-target','???','','???')
];
const battle={isConnected:true,getClientRects:()=>visible?[{}]:[],querySelectorAll:()=>rows};
const document={
 querySelector:selector=>selector==='#battle-window'?battle:null,
 querySelectorAll:()=>[],getElementById:()=>null
};
const windowObj={
 __minibiaCopilotBundle:{},
 getComputedStyle:()=>({visibility:'visible',display:visible?'block':'none'}),
 setInterval:()=>{throw new Error('timer unexpected')}, clearInterval:()=>{}
};
Object.defineProperty(windowObj,'gameClient',{get(){throw Error('protected getter called!')},configurable:true});
const ctx={window:windowObj,document,console,Date,Set,JSON,Math,Array,Number,Object,String};
vm.runInNewContext(fs.readFileSync(__dirname+'/xray.js','utf8'),ctx);
const bot={storage:{get:(k,d)=>d,set(){}},runtimeAdapter:{getStats:()=>({name:'Test'})},addCleanup(){}};
windowObj.__minibiaCopilotBundle.installXrayModule(bot);
let snapshot=bot.xray.inspectBattleList();
assert.equal(snapshot.windowVisible,true);
assert.equal(snapshot.count,6);
assert.equal(snapshot.entries[0].health,734);
assert.equal(snapshot.entries[2].health,null);
assert.equal(snapshot.entries[2].healthText,null);
visible=false;hidden=true;
snapshot=bot.xray.inspectBattleList();
assert.equal(snapshot.windowVisible,false);
assert.equal(snapshot.count,6,'closed Battle should still have six entries');
assert.equal(snapshot.updatesWhileHiddenConfirmed,false,'not yet verified');
assert.equal(bot.xray.status().battleListCreatures.length,6);
assert.equal(bot.xray.getVisibleCreatures().length,0,'no fake coordinate-dependent creatures');
assert.equal(bot.xray.getVisiblePlayers().length,0,'no fake panic player list');
rows[0].cells['.battle-window-bar-wrapper .bar-text'].textContent='605 / 740';
snapshot=bot.xray.inspectBattleList();
assert.equal(snapshot.entries[0].health,605);
assert.equal(snapshot.updatesWhileHiddenConfirmed,true);
assert.ok(snapshot.lastChangedWhileHiddenAt > 0);
assert.equal(snapshot.hiddenChangesObserved,1);
snapshot=bot.xray.inspectBattleList();
assert.equal(snapshot.hiddenChangesObserved,1,'avoid counting unchanged rows');
assert.equal(bot.xray.inspectSources().gameClientDescriptor,'protected-accessor');
visible=true;hidden=false;
snapshot=bot.xray.inspectBattleList();
assert.equal(snapshot.windowVisible,true);
assert.equal(snapshot.updatesWhileHiddenConfirmed,false);
console.log('OK: open 6; closed 6; no false live claim; HP changed while closed detected; no protected getter; no coords/panic pollution');
