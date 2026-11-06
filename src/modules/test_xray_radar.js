'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
let battleVisible=false;
const timers = new Map();
let nextTimer = 1;
class Node {
  constructor(tag='div') {
    this.tagName=tag.toUpperCase(); this.id=''; this.className=''; this.textContent='';
    this.title=''; this.type=''; this.hidden=false; this.children=[]; this.dataset={};
    this.style={}; this.scrollTop=0; this.isConnected=true;
    this.events={}; this.parent=null;
  }
  setAttribute(name, value) { this[name]=value; }
  getClientRects() { return battleVisible ? [{}] : []; }
  getBoundingClientRect() {return {left:parseInt(this.style.left)||0,top:parseInt(this.style.top)||0,width:280,height:200,right:280,bottom:200};}
  addEventListener(name,cb){this.events[name]=cb;}
  append(...nodes){for(const node of nodes)this.appendChild(node);}
  appendChild(node){
    if(node.tagName==='FRAGMENT') {for(const child of [...node.children]) this.appendChild(child);}
    else {this.children.push(node);node.parent=this;}
    return node;
  }
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  remove(){if(this.parent){this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;}this.isConnected=false;}
  contains(target) {if(this===target)return true;return this.children.some(n=>n.contains(target));}
  querySelector(selector){
    const value=selector.slice(1);const target=selector[0]==='.'?'className':'id';
    function find(n){for(const child of n.children){if(target==='className'&&child.className.split(' ').includes(value)||target==='id'&&child.id===value)return child;const deep=find(child);if(deep)return deep;}return null;}
    return find(this);
  }
}
const rows=[];
const makeRow=(id,name,detail,hp)=>({id,isConnected:true,
  querySelector(selector){const map={'.battle-window-target-title':name,'.battle-window-target-sub':detail,'.battle-window-bar-wrapper .bar-text':hp}; return Object.hasOwn(map,selector)?{textContent:map[selector]}:null;},
  setHp(value){hp=value;}
});
rows.push(makeRow('123','Cuitlahuac','LVL 45 [EK]','734 / 740'));
rows.push(makeRow('456','Timur','','100 / 100'));
const battle={isConnected:true,getClientRects:()=>battleVisible?[{}]:[],querySelectorAll:()=>rows};
const head=new Node('head'),body=new Node('body');
const document={head,body,
  createElement:tag=>new Node(tag),
  createDocumentFragment:()=>new Node('fragment'),
  querySelector:selector=>selector==='#battle-window'?battle:null,
  querySelectorAll:()=>[],
  getElementById(id){function find(n){if(n.id===id)return n;for(const ch of n.children){const t=find(ch);if(t)return t;}return null;}return find(head)||find(body);}
};
const windowObj={__minibiaCopilotBundle:{},innerWidth:1440,innerHeight:900,
  getComputedStyle:()=>({display:battleVisible?'block':'none',visibility:'visible'}),
  setInterval(cb,ms){const id=nextTimer++;timers.set(id,{cb,ms,interval:true});return id;},
  clearInterval(id){timers.delete(id);},
  setTimeout(cb,ms){const id=nextTimer++;timers.set(id,{cb,ms,interval:false});return id;},
  clearTimeout(id){timers.delete(id);},
  addEventListener(){},removeEventListener(){},
};
Object.defineProperty(windowObj,'gameClient',{get(){throw Error('NEVER access protected getter');}, configurable:true});
const ctx={window:windowObj,document,console,Date,Set,JSON,Math,Array,Number,Object,String,parseFloat};
vm.runInNewContext(fs.readFileSync(__dirname+'/xray.js','utf8'),ctx);
const store = new Map(); const cleanup=[];
const bot={storage:{get:(key,def)=>store.get(key)||def,set:(key,val)=>store.set(key,val)},runtimeAdapter:{getStats:()=>({name:'Me'})},addCleanup:fn=>cleanup.push(fn)};
windowObj.__minibiaCopilotBundle.installXrayModule(bot);
assert.equal(bot.xray.inspectRadar().count,2);
assert.equal(bot.xray.inspectRadar().identifiedPlayers,1);
assert.equal(bot.xray.status().radarRunning,false);
assert.equal(bot.xray.setPlayerAlertsEnabled(true),true);
assert.equal(bot.xray.setRadarEnabled(true),true);
let root=document.getElementById('minibia-copilot-xray-radar');
assert.ok(root,'radar floating DOM created');
assert.equal(root.querySelector('.mc-xray-radar-count').textContent,'2');
assert.equal(root.querySelector('.mc-xray-radar-items').children.length,2);
assert.equal(root.querySelector('.mc-xray-radar-alert').hidden,true,'no alert for baseline');
assert.ok(root.querySelector('.mc-xray-radar-sub').textContent.includes('Battle cerrada'));
// New identified player is reported, without alerting on unclassified entries.
rows.push(makeRow('777','Elva Ginon','LVL 58 [MS]','435 / 435'));
for(const t of [...timers.values()].filter(t=>t.interval))t.cb();
assert.equal(root.querySelector('.mc-xray-radar-count').textContent,'3');
assert.equal(root.querySelector('.mc-xray-radar-alert').hidden,false);
assert.ok(root.querySelector('.mc-xray-radar-alert').textContent.includes('Elva Ginon'));
assert.equal(bot.xray.inspectRadar().updatesWhileHiddenConfirmed,true);
rows.push(makeRow('999','Monk','','???'));
for(const t of [...timers.values()].filter(t=>t.interval))t.cb();
assert.equal(root.querySelector('.mc-xray-radar-count').textContent,'4');
assert.equal(bot.xray.inspectRadar().identifiedPlayers,2);
assert.ok(!bot.xray.inspectRadar().entries.some(x=>x.position!==null));
assert.equal(bot.xray.getVisibleCreatures().length,0);
assert.equal(bot.xray.getVisiblePlayers().length,0);
const saved=bot.xray.setRadarPosition(300,120);assert.equal(saved.left,300);
assert.equal(bot.xray.status().config.radarPosition.left,300);
const close=root.querySelector('.mc-xray-radar-close');close.events.click();
assert.equal(document.getElementById('minibia-copilot-xray-radar'),null);
assert.equal(bot.xray.status().radarRunning,false);
assert.equal(bot.xray.status().config.radarEnabled,false);
assert.equal(bot.xray.inspectSources().gameClientDescriptor,'protected-accessor');
cleanup.forEach(fn=>fn());
assert.equal(timers.size,0,'cleanup removes any timers');
console.log('OK: radar with hidden Battle, counts/HP, identified players, alert only new, drag position, close, cleanup, protected getter unaffected');
