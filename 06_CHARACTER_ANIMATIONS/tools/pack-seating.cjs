/* Extract generated supplementary frames; original 16 clips remain byte-for-byte intact. */
const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp');
const {runs,boundaries,bbox,characters,size,pivot}=require('./pack-sprites.cjs');
const root=path.resolve(__dirname,'..');
const slow=[280,280,180,160,280,280,280,280],work=[150,100,100,140,150,100,100,220],sit=[160,120,120,120,140,160,160,220],rise=[160,140,120,120,120,140,160,220],coffee=[260,180,180,420,280,200,180,300],talk=[160,140,180,140,160,180,140,180],lounge=[300,280,260,320,280,260,280,340];
const actions=[
 ['seated_idle_down','Сидит · вперёд',true,slow,'down'],
 ['seated_idle_up','Сидит · назад',true,slow,'up'],
 ['seated_idle_right','Сидит · вправо',true,slow,'right'],
 ['seated_idle_left','Сидит · влево',true,slow,'left'],
 ['work_down','Работа · вперёд',true,work,'down'],
 ['work_up','Работа · назад',true,work,'up'],
 ['sit_down_right','Садится · вправо',false,sit,'right'],
 ['sit_down_left','Садится · влево',false,sit,'left'],
 ['stand_up_right','Встаёт · вправо',false,rise,'right'],
 ['stand_up_left','Встаёт · влево',false,rise,'left'],
 ['seated_coffee_right','Кофе сидя · вправо',false,coffee,'right'],
 ['seated_coffee_left','Кофе сидя · влево',false,coffee,'left'],
 ['seated_talk_right','Разговор сидя · вправо',true,talk,'right'],
 ['seated_talk_left','Разговор сидя · влево',true,talk,'left'],
 ['lounge_right','Отдых · вправо',true,lounge,'right'],
 ['lounge_left','Отдых · влево',true,lounge,'left']
];
function headWidth(data,width,b){
 const hb=bbox(data,width,b.left,b.top,b.right+1,b.top+Math.round(b.height*.5));
 return hb.width;
}
async function readSheet(filename,expectedRows,refHead,refRows=[2]){
 const {data,info}=await sharp(filename).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const xp=Array(info.width).fill(0);
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>96)xp[x]++;
 const cols=runs(xp);if(cols.length<8)throw Error(filename+': fewer than 8 columns');
 const xb=boundaries(cols,info.width),selected=Array.from({length:8},(_,i)=>Math.round(i*(cols.length-1)/7));
 const yb=selected.map(ci=>{
  const profile=Array(info.height).fill(0);
  for(let y=0;y<info.height;y++)for(let x=xb[ci];x<xb[ci+1];x++)if(data[(y*info.width+x)*4+3]>96)profile[y]++;
  const rr=runs(profile,2);if(rr.length!==expectedRows)throw Error(path.basename(filename)+': column '+ci+' has '+rr.length+' rows (expected '+expectedRows+')');
  return boundaries(rr,info.height);
 });
 const boxes=Array.from({length:expectedRows},(_,ri)=>selected.map((ci,fi)=>bbox(data,info.width,xb[ci],yb[fi][ri],xb[ci+1],yb[fi][ri+1])));
 const hw=refRows.flatMap(ri=>boxes[ri].map(b=>headWidth(data,info.width,b))).sort((a,b)=>a-b);
 const scale=Math.min(refHead/hw[Math.floor(hw.length/2)],90/Math.max(...boxes.flat().map(b=>b.height)));
 const centers=selected.map((ci,fi)=>(boxes[refRows[0]][fi].left+boxes[refRows[0]][fi].right)/2);
 return{filename,info,data,xb,yb,selected,boxes,scale,centers};
}
async function makeFrame(sheet,row,index){
 const b=sheet.boxes[row][index],ci=sheet.selected[index],ground=Math.max(...sheet.boxes[row].map(v=>v.bottom));
 const left=Math.max(sheet.xb[ci],b.left-2),top=Math.max(sheet.yb[index][row],b.top-2);
 const right=Math.min(sheet.xb[ci+1],b.right+3),bottom=Math.min(sheet.yb[index][row+1],b.bottom+3);
 const w=Math.round((right-left)*sheet.scale),h=Math.round((bottom-top)*sheet.scale);
 const x=Math.round(pivot.x-(sheet.centers[index]-left)*sheet.scale),y=Math.round(pivot.y-(ground-top+1)*sheet.scale);
 if(x<2||y<2||x+w>126||y+h>126)throw Error(path.basename(sheet.filename)+' '+row+'/'+index+' exceeds safe cell');
 const input=await sharp(sheet.filename).extract({left,top,width:right-left,height:bottom-top}).resize(w,h,{kernel:'nearest'}).png().toBuffer();
 const buffer=await sharp({create:{width:128,height:128,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input,left:x,top:y}]).png().toBuffer();
 return{buffer,audit:{source:path.relative(root,sheet.filename),sourceRow:row,sourceColumn:ci,sourceBounds:{left,top,right,bottom},scale:sheet.scale,destination:{x,y,w,h}}};
}
function exportGodot(id,animations,frameMap){
 const names=Object.entries(animations);
 let tres='[gd_resource type="SpriteFrames" load_steps='+(Object.keys(frameMap).length+2)+' format=3]\n\n[ext_resource type="Texture2D" path="res://06_CHARACTER_ANIMATIONS/characters/'+id+'/atlas.png" id="1"]\n';
 for(const [key,v]of Object.entries(frameMap))tres+='\n[sub_resource type="AtlasTexture" id="'+key+'"]\natlas = ExtResource("1")\nregion = Rect2('+v.frame.x+', '+v.frame.y+', 128, 128)\n';
 return tres+'\n[resource]\nanimations = [\n'+names.map(([action,clip])=>'{\n"frames": ['+clip.frames.map((key,i)=>'{ "duration": '+clip.durationsMs[i]/100+', "texture": SubResource("'+key+'") }').join(', ')+'],\n"loop": '+clip.loop+',\n"name": &"'+action+'",\n"speed": 10.0\n}').join(',\n')+'\n]\n';
}
async function main(){
 const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
 for(const c of manifest.characters){
  const dir=path.join(root,'characters',c.id);
  const {data,info}=await sharp(path.join(dir,'frames','idle_right_00.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const ref=bbox(data,info.width,0,0,128,128),refHead=headWidth(data,info.width,ref);
  const seating=await readSheet(path.join(root,'sources','seating',c.id+'.png'),c.id==='worker_brown_green'?17:16,refHead);
  const transitions=await readSheet(path.join(root,'sources','seating',c.id+'-transitions.png'),4,refHead,[0,1]);
  const corrections=c.id==='worker_brown_green'?await readSheet(path.join(root,'sources','seating',c.id+'-corrections.png'),4,refHead,[0]):null;
  const oldAtlas=JSON.parse(await fs.readFile(path.join(dir,'atlas.json'),'utf8'));
  const frameMap=Object.fromEntries(Object.entries(oldAtlas.frames).filter(([k,v])=>v.frame.y<2048));
  const clips=Object.fromEntries(Object.entries(c.animations).filter(([k,v])=>v.row<16));
  const tags=(oldAtlas.meta.frameTags||[]).filter(v=>v.from<128),composites=[],audit=[];
  for(const [key,v]of Object.entries(frameMap))composites.push({input:path.join(dir,'frames',key+'.png'),left:v.frame.x,top:v.frame.y});
  for(let ai=0;ai<actions.length;ai++){
   const [action,label,loop,durations,facing]=actions[ai],row=16+ai;
   let sheet=seating,sourceRow=ai;
   if(ai>=6&&ai<=9){sheet=transitions;sourceRow=ai-6;}
   if(corrections){
    if(ai===5){sheet=corrections;sourceRow=2;}
    if(ai===11){sheet=corrections;sourceRow=0;}
    if(ai===13){sheet=corrections;sourceRow=3;}
    if(ai===12)sourceRow=13;
    if(ai===14)sourceRow=15;
    if(ai===15){sheet=corrections;sourceRow=1;}
   }
   const strip=[],keys=[];
   for(let fi=0;fi<8;fi++){
    const key=action+'_'+String(fi).padStart(2,'0');keys.push(key);
    let result;
    // Shared canonical endpoints make transition boundaries exact, not merely similar.
    if((ai>=6&&ai<=9)&&(fi===0||fi===7)){
     const sitAction=ai<=7;
     const sourceAction=(sitAction?fi===0:fi===7)?'idle_'+facing:'seated_idle_'+facing;
     const sourceKey=sourceAction+'_00';
     result={buffer:await fs.readFile(path.join(dir,'frames',sourceKey+'.png')),audit:{canonicalEndpoint:sourceKey}};
    }else result=await makeFrame(sheet,sourceRow,fi);
    await fs.writeFile(path.join(dir,'frames',key+'.png'),result.buffer);
    strip.push({input:result.buffer,left:fi*128,top:0});composites.push({input:result.buffer,left:fi*128,top:row*128});
    frameMap[key]={frame:{x:fi*128,y:row*128,w:128,h:128},rotated:false,trimmed:false,spriteSourceSize:{x:0,y:0,w:128,h:128},sourceSize:{w:128,h:128},duration:durations[fi],pivot:{x:.5,y:.875}};
    audit.push({action,index:fi,...result.audit});
   }
   await sharp({create:{width:1024,height:128,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(strip).png().toFile(path.join(dir,'strips',action+'.png'));
   const sitAction=action.startsWith('sit_down'),standAction=action.startsWith('stand_up');
   const completion=standAction?'idle_'+facing:sitAction||action.startsWith('seated_coffee')?'seated_idle_'+facing:null;
   clips[action]={label,row,category:'seating',facing,loop,frames:keys,durationsMs:durations,totalDurationMs:durations.reduce((a,b)=>a+b,0),posture:sitAction||standAction?'transition':'seated',seatAnchor:{x:64,y:94,calibration:'Suggested pelvis anchor. Calibrate once against the chosen furniture.'},locksLocomotion:true,completionAction:completion,events:sitAction?[{frame:5,name:'seat_contact'},{frame:7,name:'seated'}]:standAction?[{frame:7,name:'seat_released'}]:action.startsWith('seated_coffee')?[{frame:3,name:'sip'}]:[]};
   tags.push({name:action,from:row*8,to:row*8+7,direction:'forward',repeat:loop?0:1});
  }
  for(const [key,clip]of Object.entries(clips))if(clip.row<16){clip.category='basic';if(key==='work_right'||key==='work_left'){clip.category='seating';clip.posture='seated';clip.facing=key.endsWith('right')?'right':'left';clip.locksLocomotion=true;clip.seatAnchor={x:64,y:94,calibration:'Suggested pelvis anchor; calibrate against furniture.'};}}
  await sharp({create:{width:1024,height:4096,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(composites).png().toFile(path.join(dir,'atlas.png'));
  const atlas={frames:frameMap,meta:{...oldAtlas.meta,version:'3.0',size:{w:1024,h:4096},frameTags:tags}};
  await fs.writeFile(path.join(dir,'atlas.json'),JSON.stringify(atlas,null,2));
  c.animations=clips;c.atlasSize={w:1024,h:4096};c.seating={suggestedSeatAnchor:{x:64,y:94},worldFootPivot:pivot,calibrationRequired:true};
  await fs.writeFile(path.join(dir,'animations.json'),JSON.stringify(c,null,2));
  await fs.writeFile(path.join(dir,'seating-extraction-audit.json'),JSON.stringify({referenceHeadWidth:refHead,frames:audit},null,2));
  await fs.writeFile(path.join(dir,'sprite_frames.tres'),exportGodot(c.id,clips,frameMap));
  console.log(c.id+': 32 clips, 256 frames; basic frames preserved');
 }
 manifest.version='3.0.0';manifest.frameCount=1792;manifest.animationCount=224;manifest.seatingManifest='seating.json';
 await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2));
 await fs.writeFile(path.join(root,'preview-data.js'),'window.SPRITE_PACK = '+JSON.stringify(manifest)+';\n');
}
module.exports={main};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
