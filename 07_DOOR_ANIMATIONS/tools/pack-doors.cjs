// Mechanical extraction and packing of ImageGen artwork; no procedural door drawing.
const fs = require('node:fs/promises'), path = require('node:path'), sharp = require('sharp');
const root = path.resolve(__dirname, '..'), project = path.dirname(root);
const backgroundPatches = [{left:400,top:318,width:75,height:108},{left:789,top:477,width:135,height:110}];
async function bounds(file, rect) {
  const {data,info} = await sharp(file).extract(rect).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let l=info.width,t=info.height,r=-1,b=-1;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>96){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);b=Math.max(b,y);}
  if(r<0)throw Error('Empty sprite cell');
  return {left:rect.left+l,top:rect.top+t,width:r-l+1,height:b-t+1};
}
async function main(){
  const original=path.join(project,'02_ANIMATION/character_free_restoration_plate.png');
  const generated=await sharp(path.join(root,'sources/open-background-generated.png')).resize(1254,1254,{kernel:'nearest'}).png().toBuffer();
  const patches=[];
  for(const rect of backgroundPatches)patches.push({input:await sharp(generated).extract(rect).png().toBuffer(),left:rect.left,top:rect.top});
  await sharp(original).composite(patches).png().toFile(path.join(root,'scene/character_free_doors_open.png'));
  const configs=[
    {id:'manager_office',name:'Кабинет руководителя',source:'manager-opening.png',size:{w:128,h:160},anchor:{x:92,y:136},position:{x:372,y:283},closedWidth:54,leafHeight:88,kind:'right_hinged',depthY:420,clearance:{left:412,top:410,width:46,height:22},points:{corridor:{x:435,y:462},room:{x:435,y:300}}},
    {id:'meeting_room',name:'Переговорная',source:'meeting-opening.png',size:{w:256,h:192},anchor:{x:128,y:168},position:{x:727,y:414},closedWidth:134,leafHeight:106,kind:'paired_sliding',depthY:583,clearance:{left:798,top:571,width:115,height:24},points:{corridor:{x:855,y:630},room:{x:855,y:528}}}
  ];
  const manifest={version:'1.0.0',scene:{width:1254,height:1254,background:'scene/character_free_doors_open.png',preservedOutsidePatches:true,editedRegions:backgroundPatches,originalBackground:'../02_ANIMATION/character_free_restoration_plate.png'},frameCount:16,doors:[],coordinates:'Scene pixels, top-left origin, Y down; waypoints are character foot positions.',doorController:'tools/door-controller.mjs'};
  const audit=[];
  for(const c of configs){
    const dir=path.join(root,'doors',c.id);await fs.mkdir(path.join(dir,'frames'),{recursive:true});
    const source=path.join(root,'sources',c.source),meta=await sharp(source).metadata();
    const boxes=[];
    for(let i=0;i<8;i++){
      const x0=Math.round((i%4)*meta.width/4),x1=Math.round((i%4+1)*meta.width/4),y0=Math.round(Math.floor(i/4)*meta.height/2),y1=Math.round((Math.floor(i/4)+1)*meta.height/2);
      boxes.push(await bounds(source,{left:x0,top:y0,width:x1-x0,height:y1-y0}));
    }
    const scaleX=c.closedWidth/boxes[0].width;
    const sprites=[],frameMap={};
    for(let i=0;i<8;i++){
      const b=boxes[i],w=Math.round(b.width*scaleX),h=c.leafHeight;
      const x=c.kind==='right_hinged'?c.anchor.x-w:Math.round(c.anchor.x-w/2),y=c.anchor.y-h;
      if(x<2||y<2||x+w>c.size.w-2||y+h>c.size.h-2)throw Error('Sprite exceeds cell: '+c.id+'/'+i);
      const input=await sharp(source).extract(b).resize(w,h,{kernel:'nearest'}).png().toBuffer();
      const png=await sharp({create:{width:c.size.w,height:c.size.h,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input,left:x,top:y}]).png().toBuffer();
      const key='door_'+String(i).padStart(2,'0');await fs.writeFile(path.join(dir,'frames',key+'.png'),png);
      sprites.push({input:png,left:i*c.size.w,top:0});
      frameMap[key]={frame:{x:i*c.size.w,y:0,w:c.size.w,h:c.size.h},rotated:false,trimmed:false,spriteSourceSize:{x:0,y:0,w:c.size.w,h:c.size.h},sourceSize:c.size,pivot:{x:c.anchor.x/c.size.w,y:c.anchor.y/c.size.h}};
      audit.push({door:c.id,frame:i,source:c.source,sourceBounds:b,destination:{x,y,w,h}});
    }
    await sharp({create:{width:c.size.w*8,height:c.size.h,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(sprites).png().toFile(path.join(dir,'atlas.png'));
    await fs.writeFile(path.join(dir,'atlas.json'),JSON.stringify({frames:frameMap,meta:{image:'atlas.png',format:'RGBA8888',size:{w:c.size.w*8,h:c.size.h},scale:'1'}},null,2));
    const durations=[100,90,90,90,90,90,90,160];
    const animations={closed:{frames:[0],durationsMs:[100],loop:true},open:{frames:[0,1,2,3,4,5,6,7],durationsMs:durations,loop:false,completionState:'open',events:[{name:'passage_ready',frame:7,phase:'completion'}]},opened:{frames:[7],durationsMs:[100],loop:true},close:{frames:[7,6,5,4,3,2,1,0],durationsMs:[160,90,90,90,90,90,90,100],loop:false,completionState:'closed'}};
    const door={id:c.id,name:c.name,kind:c.kind,image:'doors/'+c.id+'/atlas.png',atlas:'doors/'+c.id+'/atlas.json',frameSize:c.size,anchor:c.anchor,scenePosition:c.position,depthY:c.depthY,clearance:c.clearance,waypoints:c.points,autoCloseDelayMs:1100,maxConcurrentTraversals:1,animations,eventsNote:'Passage permitted only after full opening completes; keep reservations until actor clears doorway.'};
    await fs.writeFile(path.join(dir,'animations.json'),JSON.stringify(animations,null,2));manifest.doors.push(door);
    // Foreground jamb/rail overlays are exact rectangular cutouts of existing artwork.
    const rects=c.id==='manager_office'?[{left:400,top:318,width:8,height:108},{left:465,top:318,width:10,height:108},{left:408,top:318,width:57,height:9}]:[{left:779,top:462,width:10,height:127},{left:924,top:462,width:10,height:127},{left:789,top:462,width:135,height:14}];
    const overlays=[];for(const r of rects)overlays.push({input:await sharp(original).extract(r).png().toBuffer(),left:r.left-c.position.x,top:r.top-c.position.y});
    await sharp({create:{width:c.size.w,height:c.size.h,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(overlays).png().toFile(path.join(dir,'frame_foreground.png'));door.foreground='doors/'+c.id+'/frame_foreground.png';
  }
  await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2));
  await fs.writeFile(path.join(root,'docs/EXTRACTION_AUDIT.json'),JSON.stringify({backgroundPatches,frames:audit},null,2));
  const bundle={manifest,background:'data:image/png;base64,'+(await fs.readFile(path.join(root,manifest.scene.background))).toString('base64'),doors:{},characters:{}};
  for(const door of manifest.doors){bundle.doors[door.id]={frames:[],foreground:'data:image/png;base64,'+(await fs.readFile(path.join(root,door.foreground))).toString('base64')};for(let i=0;i<8;i++)bundle.doors[door.id].frames.push('data:image/png;base64,'+(await fs.readFile(path.join(root,'doors',door.id,'frames','door_'+String(i).padStart(2,'0')+'.png'))).toString('base64'));}
  for(const id of ['manager_navy','worker_orange_yellow']){bundle.characters[id]={};for(const action of ['idle_up','idle_down','walk_up','walk_down']){bundle.characters[id][action]=[];for(let i=0;i<8;i++){const filename=path.join(project,'06_CHARACTER_ANIMATIONS/characters',id,'frames',action+'_'+String(i).padStart(2,'0')+'.png');bundle.characters[id][action].push('data:image/png;base64,'+(await fs.readFile(filename)).toString('base64'));}}}
  const controller=await fs.readFile(path.join(root,'tools/door-controller.mjs'),'utf8');
  await fs.writeFile(path.join(root,'preview-data.js'),controller.replace('export class DoorController','class DoorController')+'\nwindow.DOOR_PACK='+JSON.stringify(bundle)+';\n');
  console.log('Packed 16 unique door frames, 4 action clips per door, background and offline preview data.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
