(() => {
 'use strict';
 const svg=document.getElementById('network');if(!svg||svg.dataset.rovingKeyboard)return;svg.dataset.rovingKeyboard='true';
 let activeId=null,mapHadFocus=false,scheduled=false;
 const visibleNodes=()=>[...svg.querySelectorAll('[data-node]')].sort((a,b)=>a.dataset.node<b.dataset.node?-1:a.dataset.node>b.dataset.node?1:0);
 const help=document.createElement('p');help.id='networkKeyboardHelp';help.textContent='Network keyboard: one Tab entry. Arrow keys visit displayed work IDs; Home/End go first/last; Enter inspects. Tab leaves the map. The Table and evidence search include works hidden by map filters.';help.style.cssText='font-size:.8rem;line-height:1.4;margin:.5rem 0';
 const stage=svg.closest('.network-stage')||svg,exit=document.createElement('p');exit.id='networkKeyboardExit';exit.tabIndex=-1;exit.textContent='End of network. Use Table or evidence search to inspect the full selected evidence, including hidden isolates.';exit.style.cssText='font-size:.8rem;line-height:1.4';stage.after(help,exit);
 const skip=document.createElement('a');skip.href='#networkKeyboardExit';skip.textContent='Skip past network';skip.style.cssText='display:inline-block;font-size:.85rem;margin:.3rem 0';stage.before(skip);skip.addEventListener('click',event=>{event.preventDefault();mapHadFocus=false;exit.focus();});
 svg.setAttribute('role','group');svg.setAttribute('aria-describedby',[svg.getAttribute('aria-describedby'),help.id].filter(Boolean).join(' '));
 const style=document.createElement('style');style.textContent='#network [data-node]:focus-visible{outline:3px solid #b37500;outline-offset:4px}#network [data-node]:focus-visible>circle{stroke:#ffd35c;stroke-width:4}';document.head.append(style);
 function apply(){
  scheduled=false;const nodes=visibleNodes(),focused=document.activeElement?.closest?.('[data-node]');if(focused&&svg.contains(focused))activeId=focused.dataset.node;
  if(!nodes.some(node=>node.dataset.node===activeId))activeId=nodes[0]?.dataset.node??null;
  for(const node of nodes)node.setAttribute('tabindex',node.dataset.node===activeId?'0':'-1');
  for(const item of svg.querySelectorAll('[data-edge],[data-label]'))item.setAttribute('tabindex','-1');
  svg.setAttribute('tabindex',nodes.length?'-1':'0');
  if(mapHadFocus&&nodes.length&&(!document.activeElement||document.activeElement===document.body||!document.activeElement.isConnected))nodes.find(node=>node.dataset.node===activeId)?.focus({preventScroll:true});
 }
 function schedule(){if(!scheduled){scheduled=true;queueMicrotask(apply);}}
 document.addEventListener('focusin',event=>{const node=event.target.closest?.('[data-node]');mapHadFocus=!!node&&svg.contains(node);if(mapHadFocus){activeId=node.dataset.node;apply();}});
 document.addEventListener('pointerdown',event=>{const node=event.target.closest?.('[data-node]');mapHadFocus=!!node&&svg.contains(node);if(mapHadFocus){activeId=node.dataset.node;apply();node.focus({preventScroll:true});}},true);
 svg.addEventListener('keydown',event=>{
  const current=event.target.closest?.('[data-node]');if(!current||!svg.contains(current))return;
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
  event.preventDefault();event.stopPropagation();const nodes=visibleNodes(),index=nodes.indexOf(current);if(!nodes.length)return;
  const next=event.key==='Home'?0:event.key==='End'?nodes.length-1:(index+(['ArrowRight','ArrowDown'].includes(event.key)?1:-1)+nodes.length)%nodes.length;
  activeId=nodes[next].dataset.node;mapHadFocus=true;apply();nodes[next].focus({preventScroll:true});
 },true);
 new MutationObserver(schedule).observe(svg,{childList:true,subtree:true});apply();
 window.ATLAS_NETWORK_KEYBOARD={refresh:apply,state:()=>({activeId,displayed:visibleNodes().map(node=>node.dataset.node),mapHadFocus})};
})();
