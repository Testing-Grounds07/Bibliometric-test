import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context={window:{},setTimeout,clearTimeout,Date};
vm.runInNewContext(fs.readFileSync(new URL('../public/conservative-atlas/touch-controls.js',import.meta.url),'utf8'),context);
function fixture(){
 const handlers=new Map(),captures=new Set();let camera={zoom:1,tx:0,ty:0},taps=0,holds=0;
 const surface={addEventListener(type,handler){if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push(handler);},setPointerCapture(id){captures.add(id);},hasPointerCapture(id){return captures.has(id);},releasePointerCapture(id){captures.delete(id);}};
 context.window.attachAtlasTouch(surface,{point:event=>({x:event.clientX,y:event.clientY}),camera:()=>camera,move:value=>{camera=value;},start:()=>{},tap:()=>taps++,hold:()=>holds++,holdMs:10});
 const send=(type,id,x,y)=>{const event={type,pointerType:'touch',pointerId:id,clientX:x,clientY:y,target:surface,preventDefault(){},stopImmediatePropagation(){}};for(const handler of handlers.get(type)||[])handler(event);};
 return {send,get camera(){return camera;},get taps(){return taps;},get holds(){return holds;}};
}
test('single finger pans instead of dragging a node or selecting after movement',()=>{
 const view=fixture();view.send('pointerdown',1,100,100);view.send('pointermove',1,140,125);view.send('pointerup',1,140,125);
 assert.equal(view.camera.tx,40);assert.equal(view.camera.ty,25);assert.equal(view.taps,0);
});
test('pinch preserves the world point under the midpoint and transitions to pan',()=>{
 const view=fixture();view.send('pointerdown',1,100,100);view.send('pointerdown',2,200,100);view.send('pointermove',2,300,100);
 assert.equal(view.camera.zoom,2);assert.equal(view.camera.tx,-100);assert.equal(view.camera.ty,-100);
 view.send('pointerup',2,300,100);view.send('pointermove',1,120,130);assert.equal(view.camera.tx,-80);assert.equal(view.camera.ty,-70);view.send('pointerup',1,120,130);assert.equal(view.taps,0);
});
test('tap selects once while cancelled input does not select',()=>{
 const view=fixture();view.send('pointerdown',1,10,10);view.send('pointerup',1,10,10);assert.equal(view.taps,1);
 view.send('pointerdown',2,10,10);view.send('pointercancel',2,10,10);assert.equal(view.taps,1);
});
test('long press opens the menu without tapping; movement cancels it',async()=>{
 const view=fixture();view.send('pointerdown',1,10,10);await new Promise(resolve=>setTimeout(resolve,25));view.send('pointerup',1,10,10);assert.equal(view.holds,1);assert.equal(view.taps,0);
 view.send('pointerdown',2,10,10);view.send('pointermove',2,30,10);await new Promise(resolve=>setTimeout(resolve,25));view.send('pointerup',2,30,10);assert.equal(view.holds,1);
});
