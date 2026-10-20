export function railArticles(group,tracked=''){
 const members=[...new Set(group?.members||[])];return {members,context:tracked&&!members.includes(tracked)?tracked:null};
}

export function projectedRailAnchor(point,scene,body){
 if(![point.x,point.y,point.z,scene.left,scene.top,scene.width,scene.height,body.left,body.top].every(Number.isFinite)||scene.width<=0||scene.height<=0||Math.abs(point.x)>1||Math.abs(point.y)>1||Math.abs(point.z)>1)return null;
 return {x:scene.left-body.left+(point.x+1)*scene.width/2,y:scene.top-body.top+(1-point.y)*scene.height/2};
}

export function railConnectorPath(start,end,stacked=false){
 const bend=Math.min(60,Math.max(24,Math.abs(stacked?end.y-start.y:end.x-start.x)*.25));return stacked?`M${start.x},${start.y}C${start.x},${start.y+bend} ${end.x},${end.y-bend} ${end.x},${end.y}`:`M${start.x},${start.y}C${start.x+bend},${start.y} ${end.x-bend},${end.y} ${end.x},${end.y}`;
}

export function railConnectorAppearance(id,hovered,tracked){const focus=hovered||tracked,emphasized=focus===id;return {opacity:emphasized?.9:focus?.24:.36,width:emphasized?1.6:1,emphasized};}
