/* Mechanical extraction and atlas packing only. Source artwork remains untouched. */
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const characters = [
 ['manager_navy', 'Менеджер', 'navy'],
 ['worker_orange_yellow', 'Рыжая · жёлтый', 'yellow'],
 ['worker_dark_purple', 'Тёмные волосы · фиолетовый', 'purple'],
 ['worker_brown_green', 'Каштановые волосы · зелёный', 'green'],
 ['worker_black_charcoal', 'Тёмные волосы · графит', 'charcoal'],
 ['worker_blond_blue', 'Блондин · синий', 'blue'],
 ['worker_brown_red', 'Каре · красный', 'red']
];
const actions = [
 ['idle_down','Ожидание · вперёд',true,[260,260,160,120,260,260,260,260]],
 ['idle_up','Ожидание · назад',true,[280,280,280,280,280,280,280,280]],
 ['idle_right','Ожидание · вправо',true,[260,260,160,120,260,260,260,260]],
 ['idle_left','Ожидание · влево',true,[260,260,160,120,260,260,260,260]],
 ['walk_down','Ходьба · вперёд',true,[110,90,90,110,110,90,90,110]],
 ['walk_up','Ходьба · назад',true,[110,90,90,110,110,90,90,110]],
 ['walk_right','Ходьба · вправо',true,[110,90,90,110,110,90,90,110]],
 ['walk_left','Ходьба · влево',true,[110,90,90,110,110,90,90,110]],
 ['work_right','Работа · вправо',true,[150,100,100,140,150,100,100,220]],
 ['work_left','Работа · влево',true,[150,100,100,140,150,100,100,220]],
 ['coffee','Кофе',false,[280,160,180,420,280,180,160,320]],
 ['talk','Разговор',true,[140,140,180,140,140,180,140,180]],
 ['laugh','Смех',false,[140,100,110,100,110,120,160,280]],
 ['celebrate','Празднование',false,[140,100,100,180,150,120,180,300]],
 ['wave','Приветствие',false,[180,120,140,140,140,140,140,260]],
 ['think','Размышление',true,[250,200,280,380,300,240,220,300]]
];
const size = 128, pivot = {x:64,y:112};
const runs = (values, threshold=5) => {
 let start=null; const result=[];
 for(let i=0;i<=values.length;i++){
  if(values[i]>threshold && start===null) start=i;
  if(!(values[i]>threshold) && start!==null){
   if(i-start>15) result.push([start,i]); start=null;
  }
 }
 return result;
};
const boundaries = (rs, length) => [0,...rs.slice(1).map((r,i)=>Math.round((rs[i][1]+r[0])/2)),length];
function bbox(data, width, x0,y0,x1,y1,threshold=96){
 let l=x1,t=y1,r=-1,b=-1,n=0;
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
  if(data[(y*width+x)*4+3]>threshold){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);n++;}
 }
 if(n<100)throw Error('Empty or incomplete sprite cell');
 return {left:l,top:t,right:r,bottom:b,width:r-l+1,height:b-t+1,pixels:n};
}
async function packCharacter([id,name,color]){
 const source = path.join(root,'sources',id+'.png');
 const {data,info} = await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const xs=Array(info.width).fill(0),ys=Array(info.height).fill(0);
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  if(data[(y*info.width+x)*4+3]>96){xs[x]++;ys[y]++;}
 }
 const columns=runs(xs),rows=runs(ys);
 if(columns.length<8)throw Error(id+': source has fewer than eight columns');
 const xb=boundaries(columns,info.width);
 // Some generated sources have an additional column. Keep eight ordered, genuine frames.
 const selected=Array.from({length:8},(_,i)=>Math.round(i*(columns.length-1)/7));
 const columnRows=selected.map(ci=>{
  const profile=Array(info.height).fill(0);
  for(let y=0;y<info.height;y++)for(let x=xb[ci];x<xb[ci+1];x++)if(data[(y*info.width+x)*4+3]>96)profile[y]++;
  const rr=runs(profile,2);
  if(rr.length!==16)throw Error(id+': column '+ci+' contains '+rr.length+' rows; inspection required');
  return boundaries(rr,info.height);
 });
 const boxes = Array.from({length:16},(_,ri)=>selected.map((ci,fi)=>bbox(data,info.width,xb[ci],columnRows[fi][ri],xb[ci+1],columnRows[fi][ri+1])));
 const heights=boxes.slice(0,4).flat().map(b=>b.height).sort((a,b)=>a-b);
 const scale=86/heights[Math.floor(heights.length/2)];
 const centers=selected.map((ci,i)=>(boxes[0][i].left+boxes[0][i].right)/2);
 const dir=path.join(root,'characters',id);
 await fs.mkdir(path.join(dir,'frames'),{recursive:true});
 await fs.mkdir(path.join(dir,'strips'),{recursive:true});
 const composites=[], frameMap={}, clips={}, tags=[], audit=[];
 for(let ri=0;ri<16;ri++){
  const [action,label,loop,durations]=actions[ri];
  const ground=Math.max(...boxes[ri].map(b=>b.bottom));
  const strip=[];
  for(let fi=0;fi<8;fi++){
   const ci=selected[fi], b=boxes[ri][fi];
   const left=Math.max(xb[ci],b.left-2),top=Math.max(columnRows[fi][ri],b.top-2);
   const right=Math.min(xb[ci+1],b.right+3),bottom=Math.min(columnRows[fi][ri+1],b.bottom+3);
   const w=Math.round((right-left)*scale),h=Math.round((bottom-top)*scale);
   const dx=Math.round(pivot.x-(centers[fi]-left)*scale);
   const dy=Math.round(pivot.y-(ground-top+1)*scale);
   if(dx<2 ||dy<2 ||dx+w>126 ||dy+h>126)throw Error(id+'/'+action+'/'+fi+': frame does not fit safely');
   const sprite=await sharp(source).extract({left,top,width:right-left,height:bottom-top}).resize(w,h,{kernel:'nearest'}).png().toBuffer();
   const frame=await sharp({create:{width:size,height:size,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:sprite,left:dx,top:dy}]).png().toBuffer();
   const key=action+'_'+String(fi).padStart(2,'0');
   await fs.writeFile(path.join(dir,'frames',key+'.png'),frame);
   composites.push({input:frame,left:fi*size,top:ri*size});
   strip.push({input:frame,left:fi*size,top:0});
   frameMap[key]={frame:{x:fi*size,y:ri*size,w:size,h:size},rotated:false,trimmed:false,spriteSourceSize:{x:0,y:0,w:size,h:size},sourceSize:{w:size,h:size},duration:durations[fi],pivot:{x:.5,y:.875}};
   audit.push({action,index:fi,sourceColumn:ci,sourceBounds:{left,top,right,bottom},destination:{x:dx,y:dy,w,h},opaquePixels:b.pixels});
  }
  await sharp({create:{width:size*8,height:size,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(strip).png().toFile(path.join(dir,'strips',action+'.png'));
  const frameNames=Array.from({length:8},(_,fi)=>action+'_'+String(fi).padStart(2,'0'));
  clips[action]={label,row:ri,loop,frames:frameNames,durationsMs:durations,totalDurationMs:durations.reduce((a,b)=>a+b,0),events:action==='walk_down'||action==='walk_up'||action==='walk_right'||action==='walk_left'?[{frame:0,name:'footstep'},{frame:4,name:'footstep'}]:action==='coffee'?[{frame:3,name:'sip'}]:action==='celebrate'?[{frame:3,name:'cheer'},{frame:6,name:'land'}]:[]};
  tags.push({name:action,from:ri*8,to:ri*8+7,direction:'forward',repeat:loop?0:1});
 }
 await sharp({create:{width:size*8,height:size*16,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(composites).png().toFile(path.join(dir,'atlas.png'));
 const atlas={frames:frameMap,meta:{app:'AI Artel character pack',version:'2.0',image:'atlas.png',format:'RGBA8888',size:{w:1024,h:2048},scale:'1',frameTags:tags}};
 await fs.writeFile(path.join(dir,'atlas.json'),JSON.stringify(atlas,null,2));
 const manifest={id,name,color,image:'characters/'+id+'/atlas.png',atlas:'characters/'+id+'/atlas.json',frameSize:{w:size,h:size},pivot,bodyHeightPx:86,directions:{down:'front / toward viewer',up:'back / away from viewer',right:'screen right',left:'screen left'},animations:clips};
 await fs.writeFile(path.join(dir,'animations.json'),JSON.stringify(manifest,null,2));
 await fs.writeFile(path.join(dir,'extraction-audit.json'),JSON.stringify({sourceWidth:info.width,sourceHeight:info.height,detectedColumns:columns.length,detectedRowsPerColumn:16,selectedSourceColumns:selected,scale,frames:audit},null,2));
 let tres='[gd_resource type="SpriteFrames" load_steps=130 format=3]\n\n[ext_resource type="Texture2D" path="res://06_CHARACTER_ANIMATIONS/characters/'+id+'/atlas.png" id="1"]\n';
 for(let ri=0;ri<16;ri++)for(let fi=0;fi<8;fi++)tres+='\n[sub_resource type="AtlasTexture" id="Frame_'+ri+'_'+fi+'"]\natlas = ExtResource("1")\nregion = Rect2('+fi*128+', '+ri*128+', 128, 128)\n';
 tres+='\n[resource]\nanimations = [\n'+actions.map(([action,label,loop,durations],ri)=>'{\n"frames": ['+durations.map((d,fi)=>'{ "duration": '+(d/100)+', "texture": SubResource("Frame_'+ri+'_'+fi+'") }').join(', ')+'],\n"loop": '+loop+',\n"name": &"'+action+'",\n"speed": 10.0\n}').join(',\n')+'\n]\n';
 await fs.writeFile(path.join(dir,'sprite_frames.tres'),tres);
 console.log(id+': 128 frames; detected source '+columns.length+' columns, 16 rows per column');
 return manifest;
}
async function main(){
 const entries=[];
 for(const c of characters)entries.push(await packCharacter(c));
 const manifest={version:'2.0.0',licenseNote:'Original project assets remain unchanged. Generated source artwork is included; no third-party sprite library was used.',frameCount:896,animationCount:112,frameSize:{w:128,h:128},pivot,characterCount:7,characters:entries};
 await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2));
 await fs.writeFile(path.join(root,'preview-data.js'),'window.SPRITE_PACK = '+JSON.stringify(manifest)+';\n');
}
module.exports={runs,boundaries,bbox,characters,size,pivot};
if(require.main===module)main().then(async()=>{
 try{await fs.access(path.join(root,'sources','seating','manager_navy.png'));}catch{return;}
 await require('./pack-seating.cjs').main();
}).catch(e=>{console.error(e);process.exitCode=1});
