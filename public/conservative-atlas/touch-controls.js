(() => {
 'use strict';
 window.attachAtlasTouch=(surface,{point,camera,move,start,tap,hold,end=()=>{},holdMs=550})=>{
  const pointers=new Map();let gesture=null,timer=null,target=null,moved=false,held=false,suppressUntil=0;
  const cancelHold=()=>{clearTimeout(timer);timer=null;};
  function baseline(){const positions=[...pointers.values()],current=camera();gesture={...current,positions};}
  function finish(event){
   if(event.pointerType!=='touch'||!pointers.has(event.pointerId))return;
   event.preventDefault();event.stopImmediatePropagation();cancelHold();
   const activate=event.type==='pointerup'&&pointers.size===1&&!moved&&!held;
   pointers.delete(event.pointerId);suppressUntil=Date.now()+700;
   if(surface.hasPointerCapture(event.pointerId))surface.releasePointerCapture(event.pointerId);
   if(pointers.size){moved=true;baseline();}else{gesture=null;end();}
   if(activate)tap(target,event);
  }
  surface.addEventListener('pointerdown',event=>{
   if(event.pointerType!=='touch')return;event.preventDefault();event.stopImmediatePropagation();start();
   pointers.set(event.pointerId,point(event));surface.setPointerCapture(event.pointerId);
   if(pointers.size===1){target=event.target;moved=false;held=false;timer=setTimeout(()=>{if(!moved&&pointers.size===1){held=true;hold(target,event);}},holdMs);}else{moved=true;cancelHold();}
   baseline();
  },{capture:true,passive:false});
  surface.addEventListener('pointermove',event=>{
   if(event.pointerType!=='touch'||!pointers.has(event.pointerId))return;event.preventDefault();event.stopImmediatePropagation();
   pointers.set(event.pointerId,point(event));const positions=[...pointers.values()];if(!gesture||held)return;
   if(positions.length>=2){
    moved=true;cancelHold();const [first,second]=positions,[initialFirst,initialSecond]=gesture.positions;
    const initialDistance=Math.hypot(initialSecond.x-initialFirst.x,initialSecond.y-initialFirst.y)||1;
    const distance=Math.hypot(second.x-first.x,second.y-first.y),zoom=Math.max(.08,Math.min(12,gesture.zoom*distance/initialDistance));
    const initialCenter={x:(initialFirst.x+initialSecond.x)/2,y:(initialFirst.y+initialSecond.y)/2},center={x:(first.x+second.x)/2,y:(first.y+second.y)/2};
    move({zoom,tx:center.x-(initialCenter.x-gesture.tx)*zoom/gesture.zoom,ty:center.y-(initialCenter.y-gesture.ty)*zoom/gesture.zoom});
   }else{
    const dx=positions[0].x-gesture.positions[0].x,dy=positions[0].y-gesture.positions[0].y;
    if(Math.hypot(dx,dy)>8){moved=true;cancelHold();}
    if(moved)move({zoom:gesture.zoom,tx:gesture.tx+dx,ty:gesture.ty+dy});
   }
  },{capture:true,passive:false});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])surface.addEventListener(type,finish,{capture:true,passive:false});
  surface.addEventListener('click',event=>{if(Date.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation();}},{capture:true});
  surface.addEventListener('contextmenu',event=>{if(pointers.size||Date.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation();}},{capture:true});
 };
 window.attachAtlasLongPress=(element,action)=>{
  let timer=null,origin=null,suppressUntil=0;
  const cancel=()=>{clearTimeout(timer);timer=null;};
  element.addEventListener('pointerdown',event=>{if(event.pointerType!=='touch')return;cancel();origin={x:event.clientX,y:event.clientY};timer=setTimeout(()=>{suppressUntil=Date.now()+900;action(event);},550);},{passive:true});
  element.addEventListener('pointermove',event=>{if(origin&&Math.hypot(event.clientX-origin.x,event.clientY-origin.y)>8)cancel();},{passive:true});
  for(const type of ['pointerup','pointercancel','pointerleave'])element.addEventListener(type,()=>{cancel();origin=null;});
  element.addEventListener('click',event=>{if(Date.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation();}},{capture:true});
  element.addEventListener('contextmenu',event=>{if(origin||Date.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation();}},{capture:true});
 };
})();
