// Mechanical extraction of ImageGen sprite sheets, canonical endpoint alignment and metadata.
const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp');
const {runs,boundaries,bbox,characters}=require('../../06_CHARACTER_ANIMATIONS/tools/pack-sprites.cjs');
const root=path.resolve(__dirname,'..'),project=path.dirname(root),size=160,pivot={x:80,y:136};
const groups={lounge:['sofa_sit','sofa_idle','sofa_drink','armchair_sit','armchair_idle','armchair_drink'],social:['pat_shoulder','pat_received','give_item','receive_item'],gaming:['sofa_game','armchair_game','retrieve_console','carry_console','set_console','return_console'],conversation:['sofa_talk','armchair_talk','sofa_laugh','armchair_laugh','sofa_game_win','armchair_game_win']};
const labels={sofa_sit:'Сесть на диван',sofa_idle:'Сидеть на диване',sofa_drink:'Пить на диване',sofa_stand:'Встать с дивана',armchair_sit:'Сесть в мягкое кресло',armchair_idle:'Сидеть в мягком кресле',armchair_drink:'Пить в мягком кресле',armchair_stand:'Встать из мягкого кресла',sofa_game:'Играть на диване',armchair_game:'Играть в кресле',pat_shoulder:'Хлопнуть по плечу',pat_received:'Принять дружеский хлопок',give_item:'Передать предмет',receive_item:'Принять предмет',retrieve_console:'Достать приставку',carry_console:'Нести приставку',set_console:'Установить приставку',return_console:'Убрать приставку',take_installed_console:'Забрать установленную приставку'};
Object.assign(labels,{sofa_talk:'Говорить на диване',armchair_talk:'Говорить в кресле',sofa_laugh:'Смеяться на диване',armchair_laugh:'Смеяться в кресле',sofa_game_win:'Победа на диване',armchair_game_win:'Победа в кресле'});
const short=[160,120,120,180,180,120,120,260],sit=[160,140,140,160,160,160,180,260],drink=[200,180,200,420,200,180,220,300],idle=[280,220,260,220,280,260,220,260],game=[160,140,140,160,180,160,180,180],carry=[110,110,110,110,110,110,110,110],retrieve=[180,180,200,280,180,180,160,240];
function headBox(data,width,b){return bbox(data,width,b.left,b.top,b.right+1,b.top+Math.max(15,Math.round(b.height*.33)));}
async function extractGroup(id,group,refHead){
 const file=path.join(root,'sources/characters',id+'-'+group+'.png'),{data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const xp=Array(info.width).fill(0);for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>96)xp[x]++;
 const columns=runs(xp,8);while(columns.length>8){const gaps=columns.slice(1).map((span,i)=>span[0]-columns[i][1]),minimum=Math.min(...gaps),at=gaps.indexOf(minimum);if(minimum>info.width*.025)break;columns[at][1]=columns[at+1][1];columns.splice(at+1,1);}if(columns.length!==8)throw Error(id+'/'+group+': '+columns.length+' columns; expected 8');
 const xb=boundaries(columns,info.width),yb=[];
 for(let ci=0;ci<8;ci++){
  const yp=Array(info.height).fill(0);for(let y=0;y<info.height;y++)for(let x=xb[ci];x<xb[ci+1];x++)if(data[(y*info.width+x)*4+3]>96)yp[y]++;
  const rows=runs(yp,5);if(rows.length!==groups[group].length)throw Error(id+'/'+group+' column '+ci+': '+rows.length+' rows; expected '+groups[group].length);
  yb.push(boundaries(rows,info.height));
 }
 const boxes=groups[group].map((_,ri)=>Array.from({length:8},(_,ci)=>bbox(data,info.width,xb[ci],yb[ci][ri],xb[ci+1],yb[ci][ri+1])));
 const referenceRow=group==='lounge'?1:group==='social'?1:0;
 const heads=boxes[referenceRow].map(b=>headBox(data,info.width,b)),widths=heads.map(b=>b.width).sort((a,b)=>a-b),centers=heads.map(b=>(b.left+b.right)/2);
 const extent=Math.max(...boxes.flatMap(row=>row.map((b,i)=>Math.max(centers[i]-b.left,b.right-centers[i]))));
 const scale=Math.min(refHead/widths[4],76/extent,130/Math.max(...boxes.flat().map(b=>b.height)));
 const result={frames:{},audit:[]};
 for(let ri=0;ri<groups[group].length;ri++)for(let ci=0;ci<8;ci++){
  const b=boxes[ri][ci],w=Math.round(b.width*scale),h=Math.round(b.height*scale),x=Math.round(pivot.x-(centers[ci]-b.left)*scale),y=pivot.y-h;
  if(x<2||y<2||x+w>158||y+h>158)throw Error('Frame exceeds safe canvas '+id+'/'+groups[group][ri]+'/'+ci);
  const input=await sharp(file).extract({left:b.left,top:b.top,width:b.width,height:b.height}).resize(w,h,{kernel:'nearest'}).png().toBuffer();
  const png=await sharp({create:{width:size,height:size,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input,left:x,top:y}]).png().toBuffer();
  const action=groups[group][ri];(result.frames[action]??=[]).push(png);result.audit.push({action,frame:ci,source:path.relative(root,file),sourceBounds:b,scale,destination:{x,y,w,h}});
 }
 return result;
}
async function standing(id,direction){const pixels=await sharp(path.join(project,'06_CHARACTER_ANIMATIONS/characters',id,'frames','idle_'+direction+'_00.png')).ensureAlpha().raw().toBuffer(),out=Buffer.alloc(size*size*4);for(let y=0;y<128;y++)pixels.copy(out,((y+24)*size+16)*4,y*128*4,(y+1)*128*4);return sharp(out,{raw:{width:size,height:size,channels:4}}).png().toBuffer();}

function buildClips(){
 const clips={};
 for(const direction of ['right','left'])for(const action of [...Object.values(groups).flat(),'sofa_stand','armchair_stand','take_installed_console']){
  const reverse=action.endsWith('_stand')||action==='take_installed_console',source=action==='sofa_stand'?'sofa_sit':action==='armchair_stand'?'armchair_sit':action==='take_installed_console'?'set_console':action;
  const order=reverse?[7,6,5,4,3,2,1,0]:[0,1,2,3,4,5,6,7];
  let durations=action.includes('_idle')?idle:action.includes('_sit')||action.includes('_stand')?sit:action.includes('_drink')?drink:action.endsWith('_game')?game:action==='carry_console'?carry:['retrieve_console','return_console','set_console','take_installed_console'].includes(action)?retrieve:short;
  if(reverse)durations=[...durations].reverse();
  const loop=action.endsWith('_idle')||action.endsWith('_game')||action.endsWith('_talk')||action==='carry_console';
  const furniture=action.startsWith('sofa_')?'sofa':action.startsWith('armchair_')?'lounge_armchair':null;
  const events=[];if(action.endsWith('_sit'))events.push({frame:5,name:'seat_contact'},{frame:7,name:'seated',phase:'completion'});
  if(action.endsWith('_stand'))events.push({frame:7,name:'seat_released',phase:'completion'});
  if(action.endsWith('_drink'))events.push({frame:1,name:'mug_grasp'},{frame:3,name:'sip'},{frame:6,name:'mug_place'});
  if(action==='pat_shoulder')events.push({frame:3,name:'shoulder_contact'});
  if(action==='pat_received')events.push({frame:3,name:'shoulder_reaction'});
  if(['give_item','receive_item'].includes(action))events.push({frame:4,name:'item_transfer'});
  if(action==='retrieve_console')events.push({frame:3,name:'console_pickup'});
  if(action==='set_console')events.push({frame:4,name:'console_install'});
  if(action==='return_console')events.push({frame:4,name:'console_store'});
  if(action==='take_installed_console')events.push({frame:4,name:'console_pickup_installed'});
  if(action.endsWith('_laugh'))events.push({frame:3,name:'seated_chuckle'});
  if(action.endsWith('_game_win'))events.push({frame:3,name:'seated_game_cheer'});
  const completion=loop?null:action.endsWith('_game_win')?(action.startsWith('sofa_')?'sofa':'armchair')+'_game_'+direction:action.endsWith('_sit')||action.endsWith('_drink')||action.endsWith('_laugh')?(action.startsWith('sofa_')?'sofa':'armchair')+'_idle_'+direction:action==='retrieve_console'||action==='take_installed_console'?'carry_console_'+direction:'base:idle_'+direction;
  const clip={label:labels[action]+' · '+(direction==='right'?'вправо':'влево'),frames:order.map(i=>source+'_right_'+String(i).padStart(2,'0')),durationsMs:durations,totalDurationMs:durations.reduce((a,b)=>a+b,0),loop,flipX:direction==='left',furniture,events,completionAction:completion,exitAction:loop&&furniture?(action.startsWith('sofa_')?'sofa':'armchair')+'_idle_'+direction:null,frameOverrides:{}};
  if(direction==='left'){
   if(action.endsWith('_sit')||['pat_shoulder','pat_received','retrieve_console'].includes(action))clip.frameOverrides['0']={frame:'standing_left',flipX:false};
   if(action.endsWith('_stand')||['pat_shoulder','pat_received','give_item','set_console','return_console'].includes(action))clip.frameOverrides['7']={frame:'standing_left',flipX:false};
   if(action==='take_installed_console')clip.frameOverrides['0']={frame:'standing_left',flipX:false};
  }
  clips[action+'_'+direction]=clip;
 }
 return clips;
}
async function packProps(){
 const file=path.join(root,'sources/media-cabinet.png'),{data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true}),boxes=[];
 for(let i=0;i<8;i++){const x0=Math.round(i%4*info.width/4),x1=Math.round((i%4+1)*info.width/4),y0=Math.round(Math.floor(i/4)*info.height/2),y1=Math.round((Math.floor(i/4)+1)*info.height/2);boxes.push(bbox(data,info.width,x0,y0,x1,y1));}
 const scale=96/boxes[0].width,map={},sprites=[];await fs.mkdir(path.join(root,'props/media_cabinet/frames'),{recursive:true});
 for(let i=0;i<8;i++){
  const b=boxes[i],w=Math.round(b.width*scale),h=Math.round(b.height*scale),x=80-Math.round(w/2),y=136-h;
  const input=await sharp(file).extract({left:b.left,top:b.top,width:b.width,height:b.height}).resize(w,h,{kernel:'nearest'}).png().toBuffer();
  const png=await sharp({create:{width:160,height:160,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input,left:x,top:y}]).png().toBuffer();
  const name='state_'+i;await fs.writeFile(path.join(root,'props/media_cabinet/frames',name+'.png'),png);sprites.push({input:png,left:i*160,top:0});map[name]={frame:{x:i*160,y:0,w:160,h:160},rotated:false,trimmed:false,sourceSize:{w:160,h:160},spriteSourceSize:{x:0,y:0,w:160,h:160}};
 }
 await sharp({create:{width:1280,height:160,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(sprites).png().toFile(path.join(root,'props/media_cabinet/atlas.png'));
 await fs.writeFile(path.join(root,'props/media_cabinet/atlas.json'),JSON.stringify({frames:map,meta:{image:'atlas.png',size:{w:1280,h:160}}},null,2));
 const propNames=['console','controller','two_controllers','parcel'],propWidths=[30,18,27,17],small=path.join(root,'sources/small-props.png'),raw=await sharp(small).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 for(let i=0;i<4;i++){const x0=Math.round(i*raw.info.width/4),x1=Math.round((i+1)*raw.info.width/4),b=bbox(raw.data,raw.info.width,x0,0,x1,raw.info.height);await sharp(small).extract({left:b.left,top:b.top,width:b.width,height:b.height}).resize({width:propWidths[i],kernel:'nearest'}).png().toFile(path.join(root,'props',propNames[i]+'.png'));}
 const recipe={id:'media_cabinet',frameSize:{w:160,h:160},pivot,scenePosition:{x:760,y:665},interactionPoint:{x:845,y:819},consoleInstallPoint:{x:871,y:734},states:{stored:0,opening_stored:1,open_stored:2,open_empty:3,closing_empty:4,installed_off:5,playing:6,paused:7},drawerAnimations:{open_stored:{frames:[0,1,2],durationsMs:[120,160,220]},close_stored:{frames:[2,1,0],durationsMs:[220,160,120]},close_empty:{frames:[3,4,0],durationsMs:[220,160,120]},open_empty:{frames:[0,4,3],durationsMs:[120,160,220]}},inventory:{consoleCount:1,controllerCount:2,initialConsole:'drawer',initialControllers:'drawer'},collisionFootprint:{x:790,y:756,width:96,height:44}};
 await fs.writeFile(path.join(root,'props/media_cabinet/manifest.json'),JSON.stringify(recipe,null,2));return recipe;
}
async function main(){
 const entries=[],audits=[];
 for(const [id,name]of characters){
  const ref=await sharp(path.join(project,'06_CHARACTER_ANIMATIONS/characters',id,'frames/idle_right_00.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const rb=bbox(ref.data,128,0,0,128,128),refHead=headBox(ref.data,128,rb).width,frames={};
  for(const group of Object.keys(groups)){const extraction=await extractGroup(id,group,refHead);Object.assign(frames,extraction.frames);audits.push({character:id,group,frames:extraction.audit});}
  const stand=await standing(id,'right'),leftStand=await standing(id,'left');
  for(const kind of ['sofa','armchair']){frames[kind+'_sit'][0]=stand;frames[kind+'_sit'][7]=frames[kind+'_idle'][0];frames[kind+'_drink'][0]=frames[kind+'_idle'][0];frames[kind+'_drink'][7]=frames[kind+'_idle'][0];}
  for(const kind of ['sofa','armchair'])for(const action of ['talk','laugh','game_win']){const pose=frames[kind+(action==='game_win'?'_game':'_idle')][0];frames[kind+'_'+action][0]=pose;frames[kind+'_'+action][7]=pose;}
  for(const action of ['pat_shoulder','pat_received']){frames[action][0]=stand;frames[action][7]=stand;}
  frames.give_item[7]=stand;frames.receive_item[3]=frames.receive_item[2];
  frames.retrieve_console[0]=stand;frames.retrieve_console[7]=frames.carry_console[0];frames.set_console[0]=frames.carry_console[0];frames.set_console[7]=stand;frames.return_console[0]=frames.carry_console[0];frames.return_console[7]=stand;
  const dir=path.join(root,'characters',id);await fs.mkdir(path.join(dir,'frames'),{recursive:true});
  const composites=[],frameMap={},ordered=Object.values(groups).flat();
  for(let ri=0;ri<ordered.length;ri++)for(let i=0;i<8;i++){
   const key=ordered[ri]+'_right_'+String(i).padStart(2,'0'),png=frames[ordered[ri]][i];await fs.writeFile(path.join(dir,'frames',key+'.png'),png);composites.push({input:png,left:i*size,top:ri*size});frameMap[key]={frame:{x:i*size,y:ri*size,w:size,h:size},rotated:false,trimmed:false,sourceSize:{w:size,h:size},spriteSourceSize:{x:0,y:0,w:size,h:size},pivot:{x:.5,y:.85}};
  }
  await fs.writeFile(path.join(dir,'frames/standing_left.png'),leftStand);composites.push({input:leftStand,left:0,top:ordered.length*size});frameMap.standing_left={frame:{x:0,y:ordered.length*size,w:size,h:size},rotated:false,trimmed:false,sourceSize:{w:size,h:size},spriteSourceSize:{x:0,y:0,w:size,h:size},pivot:{x:.5,y:.85}};
  const atlasHeight=(ordered.length+1)*size,atlasPixels=Buffer.alloc(1280*atlasHeight*4);for(const tile of composites){const rgba=await sharp(tile.input).ensureAlpha().raw().toBuffer();for(let y=0;y<size;y++)rgba.copy(atlasPixels,((tile.top+y)*1280+tile.left)*4,y*size*4,(y+1)*size*4);}await sharp(atlasPixels,{raw:{width:1280,height:atlasHeight,channels:4}}).png().toFile(path.join(dir,'atlas.png'));
  const clips=buildClips();await fs.writeFile(path.join(dir,'atlas.json'),JSON.stringify({frames:frameMap,meta:{image:'atlas.png',format:'RGBA8888',size:{w:1280,h:atlasHeight}}},null,2));await fs.writeFile(path.join(dir,'animations.json'),JSON.stringify(clips,null,2));
  entries.push({id,name,image:'characters/'+id+'/atlas.png',atlas:'characters/'+id+'/atlas.json',animations:clips});console.log('Packed '+id+': '+Object.keys(frameMap).length+' exported frames / '+Object.keys(clips).length+' directed clips.');
 }
 const props=await packProps();await fs.copyFile(path.join(project,'07_DOOR_ANIMATIONS/scene/character_free_all_doors_open.png'),path.join(root,'scene/office_entrance_lounge_clean.png'));
 const manifest={version:'1.0.0',characterCount:7,frameCount:1239,animationCount:350,frameSize:{w:160,h:160},pivot,characters:entries,propManifest:'props/media_cabinet/manifest.json',scene:{width:1254,height:1254,background:'scene/office_entrance_lounge_clean.png',doorsManifest:'../07_DOOR_ANIMATIONS/manifest.json',mediaCabinet:props.scenePosition,sofaSlots:[{id:'sofa_upper',feet:{x:1031,y:808},entry:{x:989,y:808},facing:'left'},{id:'sofa_lower',feet:{x:1031,y:876},entry:{x:989,y:876},facing:'left'}],armchairSlot:{id:'armchair',feet:{x:827,y:893},entry:{x:870,y:893},facing:'right'}},leftDirections:'Left clips reuse authored right-facing frames with flipX=true; frameOverrides preserve original left standing endpoint. Honor overrides per frame.',baseAnimations:'../06_CHARACTER_ANIMATIONS/manifest.json'};
 await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2));await fs.writeFile(path.join(root,'docs/EXTRACTION_AUDIT.json'),JSON.stringify(audits,null,2));
 const bundle={manifest,props,background:'data:image/png;base64,'+(await fs.readFile(path.join(root,manifest.scene.background))).toString('base64'),characters:{},cabinet:[],doors:[]};
 for(const c of entries){bundle.characters[c.id]={};for(const key of Object.keys(JSON.parse(await fs.readFile(path.join(root,c.atlas),'utf8')).frames))bundle.characters[c.id][key]='data:image/png;base64,'+(await fs.readFile(path.join(root,'characters',c.id,'frames',key+'.png'))).toString('base64');}
 for(let i=0;i<8;i++)bundle.cabinet.push('data:image/png;base64,'+(await fs.readFile(path.join(root,'props/media_cabinet/frames/state_'+i+'.png'))).toString('base64'));
 const doors=JSON.parse(await fs.readFile(path.join(project,'07_DOOR_ANIMATIONS/manifest.json'),'utf8'));
 for(const d of doors.doors){bundle.doors.push({config:d,closed:'data:image/png;base64,'+(await fs.readFile(path.join(project,'07_DOOR_ANIMATIONS/doors',d.id,'frames/door_00.png'))).toString('base64')});}
 const runtime=await fs.readFile(path.join(root,'tools/lounge-runtime.mjs'),'utf8');await fs.writeFile(path.join(root,'preview-data.js'),runtime.replaceAll('export class ','class ').replaceAll('export function ','function ')+'\nwindow.LOUNGE_PACK='+JSON.stringify(bundle)+';');
 console.log('Lounge pack ready: 1239 frames, 350 clips and game cabinet.');
}
module.exports={buildClips,groups};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
