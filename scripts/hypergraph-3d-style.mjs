import {Shape,Vector3,Matrix4,MathUtils} from 'three';

export const LAYER_STYLE=Object.freeze({width:500,height:500,radius:18,spacing:72});

export function roundedLayerShape(width=LAYER_STYLE.width,height=LAYER_STYLE.height,radius=LAYER_STYLE.radius){
 const corner=Math.max(0,Math.min(radius,width/2,height/2)),left=-width/2,right=width/2,bottom=-height/2,top=height/2,shape=new Shape();
 shape.moveTo(left+corner,bottom);shape.lineTo(right-corner,bottom);shape.quadraticCurveTo(right,bottom,right,bottom+corner);shape.lineTo(right,top-corner);shape.quadraticCurveTo(right,top,right-corner,top);shape.lineTo(left+corner,top);shape.quadraticCurveTo(left,top,left,top-corner);shape.lineTo(left,bottom+corner);shape.quadraticCurveTo(left,bottom,left+corner,bottom);return shape;
}

function outlineHull(points){
 const sorted=[...new Map(points.filter(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)).map(point=>[point.x+'|'+point.y,{x:point.x,y:point.y}])).values()].sort((left,right)=>left.x-right.x||left.y-right.y);
 if(sorted.length<3)return sorted;
 const turn=(start,middle,end)=>(middle.x-start.x)*(end.y-start.y)-(middle.y-start.y)*(end.x-start.x),lower=[],upper=[];
 for(const point of sorted){while(lower.length>1&&turn(lower.at(-2),lower.at(-1),point)<=0)lower.pop();lower.push(point);}
 for(const point of sorted.slice().reverse()){while(upper.length>1&&turn(upper.at(-2),upper.at(-1),point)<=0)upper.pop();upper.push(point);}
 return lower.slice(0,-1).concat(upper.slice(0,-1));
}

export function clusterLayerShape(points,padding=24){
 const outline=outlineHull(points),radius=Number.isFinite(padding)?Math.max(12,padding):24,expanded=[];
 for(const point of outline.length?outline:[{x:0,y:0}])for(let position=0;position<32;position++){const angle=position/32*Math.PI*2;expanded.push({x:point.x+Math.cos(angle)*radius,y:point.y+Math.sin(angle)*radius});}
 const boundary=outlineHull(expanded),shape=new Shape();shape.moveTo(boundary[0].x,boundary[0].y);for(const point of boundary.slice(1))shape.lineTo(point.x,point.y);shape.closePath();return shape;
}

export function layerAppearance(position,active,blend=1){
 const amount=Math.max(0,Math.min(1,blend)),focused=active===position,dimmed=active>=0&&!focused;
 return {sheet:amount*(dimmed?.45:.94),shadow:amount*(dimmed?.025:.085),border:amount*(focused?.85:dimmed?.14:.28),connection:amount*(dimmed?.2:.72),member:amount*(dimmed?.3:1),caption:amount*(dimmed?.4:1)};
}

export function layerCaption(group,number,coupling=false){return 'Combination '+number+' · '+group.members.length+' members · '+(coupling?'1 shared reference':(group.articles?.length||0)+' sources');}

export function layerCaptionVisible(position,active,blend=1,heading=false){return heading||active>=0&&position===active&&blend>.01;}

export function fittedLayerCamera(count,expanded,aspect,fov=42){
 const direction=new Vector3(.38,.85,1).normalize(),basis=new Matrix4().lookAt(direction,new Vector3(),new Vector3(0,1,0)),right=new Vector3().setFromMatrixColumn(basis,0),up=new Vector3().setFromMatrixColumn(basis,1),vertical=Math.tan(MathUtils.degToRad(fov/2)),horizontal=vertical*Math.max(.1,aspect),halfDepth=expanded?Math.max(0,count-1)*LAYER_STYLE.spacing/2:55;
 let distance=0;for(const x of [-250,250])for(const y of [-halfDepth,halfDepth])for(const z of [-280,280]){const point=new Vector3(x,y,z);distance=Math.max(distance,point.dot(direction)+Math.max(Math.abs(point.dot(right))/horizontal,Math.abs(point.dot(up))/vertical));}
 return direction.multiplyScalar(Math.max(500,distance*1.08)).toArray();
}

export function fittedStackCamera(stacks,expanded,aspect,fov=42){
 const direction=new Vector3(.38,.85,1).normalize(),basis=new Matrix4().lookAt(direction,new Vector3(),new Vector3(0,1,0)),right=new Vector3().setFromMatrixColumn(basis,0),up=new Vector3().setFromMatrixColumn(basis,1),vertical=Math.tan(MathUtils.degToRad(fov/2)),horizontal=vertical*Math.max(.1,aspect);
 let distance=500;for(const stack of stacks)for(const x of [stack.x-(stack.width||500)/2-40,stack.x+(stack.width||500)/2+40])for(const z of [-stack.y-(stack.height||500)/2-60,-stack.y+(stack.height||500)/2+60])for(const y of expanded?[-Math.max(0,stack.groups.length-1)*LAYER_STYLE.spacing,Math.max(0,stack.groups.length-1)*LAYER_STYLE.spacing]:[-55,55]){const point=new Vector3(x,y,z);distance=Math.max(distance,point.dot(direction)+Math.max(Math.abs(point.dot(right))/horizontal,Math.abs(point.dot(up))/vertical));}
 return direction.multiplyScalar(distance*1.1).toArray();
}
