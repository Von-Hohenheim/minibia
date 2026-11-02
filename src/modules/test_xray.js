const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const src = fs.readFileSync(__dirname + '/xray.js','utf8');
function setup({protectedGetter=false, legacy=false}={}) {
  const win = { setInterval(){return 1;}, clearInterval(){} };
  let getterCalls=0;
  if (protectedGetter) Object.defineProperty(win, 'gameClient',{ configurable:true, get(){ getterCalls++; throw new Error('Getter protegido activado'); }});
  if (legacy) win.gameClient = {
    player:{id:1,name:'Jugador',__position:{x:100,y:100,z:7}},
    world:{activeCreatures:{a:{id:1,name:'Jugador',type:0,__position:{x:100,y:100,z:7}}, b:{id:2,name:'Rat',type:1,__position:{x:103,y:100,z:6}}, c:{id:3,name:'Person',type:0,__position:{x:130,y:100,z:7}}}}
  };
  const document={
    querySelector(){return null;}, querySelectorAll(){return [];},
    getElementById(){return null;},
  };
  const bot={
    storage:{get(){return {overlayEnabled:false,selectedFloor:null}}, set(){}},
    runtimeAdapter:{getStats(){return {name:'Jugador',health:250,maxHealth:400,manaPercent:70}}},
    addCleanup(){}
  };
  vm.runInNewContext(src, {window:win,document,console,Number,Object,Array,String,Math,Date});
  win.__minibiaCopilotBundle.installXrayModule(bot);
  return {win,bot,getterCalls:()=>getterCalls};
}
{
  const {bot,getterCalls}=setup({protectedGetter:true});
  assert.equal(bot.xray.status().dataAvailable,false);
  assert.equal(bot.xray.inspectSources().gameClientDescriptor,'protected-accessor');
  assert.equal(getterCalls(),0,'Protected getter must never be called');
}
{
  const {bot}=setup({legacy:true});
  const status=bot.xray.status();
  assert.equal(status.dataAvailable,true);
  assert.equal(status.playerPosition.x,100);
  assert.equal(status.visibleCreatures.length,1);
  assert.equal(status.overlayCreatures.length,2);
  assert.equal(status.overlayCreatures[0].position.z,6);
}
{
  const {bot}=setup();
  const ok=bot.xray.setDataProvider(()=>({playerPosition:{x:1,y:2,z:7},creatures:[{id:2,name:'Rat',type:1,position:{x:2,y:2,z:8}}]}));
  assert.equal(ok,true);
  assert.equal(bot.xray.status().visibleCreatures.length,1);
  assert.equal(bot.xray.inspectSources().source,'custom-provider');
}
console.log('X-Ray mocks OK: protected accessor, legacy, custom provider.');
