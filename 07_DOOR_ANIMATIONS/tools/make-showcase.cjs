const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
async function main(){
  const recording=JSON.parse(await fs.readFile(path.join(root,'docs/RECORDING_TEMP.json'),'utf8'));
  const clips=await fs.mkdtemp('/private/tmp/artel-doors-detail-');
  for(let i=0;i<recording.frameCount;i++){
    const file=path.join(recording.temp,'frame-'+String(i).padStart(3,'0')+'.png'),meta=await sharp(file).metadata(),s=meta.width/1254;
    const regions=[{left:342,top:294,width:190,height:196},{left:700,top:434,width:315,height:214}];
    const inputs=[];
    for(let j=0;j<2;j++){
      const r=regions[j],rect=Object.fromEntries(Object.entries(r).map(([k,v])=>[k,Math.round(v*s)]));
      const input=await sharp(file).extract(rect).resize({height:392,kernel:'nearest'}).png().toBuffer();
      inputs.push({input,left:j===0?20:422,top:58});
    }
    const title=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1020" height="482"><text x="20" y="34" fill="#e7dfce" font-family="Arial" font-size="21">Кабинет руководителя</text><text x="422" y="34" fill="#e7dfce" font-family="Arial" font-size="21">Переговорная</text><text x="20" y="474" fill="#b3beb9" font-family="Arial" font-size="14">AI ARTEL · Двери открываются перед проходом и закрываются после выхода персонажа</text></svg>');
    await sharp({create:{width:1020,height:482,channels:4,background:'#1b2227'}}).composite([...inputs,{input:title,left:0,top:0}]).png().toFile(path.join(clips,'frame-'+String(i).padStart(3,'0')+'.png'));
  }
  const ffmpeg=process.env.ARTEL_FFMPEG||'ffmpeg';
  const common=['-hide_banner','-loglevel','error','-y','-framerate',String(recording.fps),'-i',path.join(clips,'frame-%03d.png')];
  execFileSync(ffmpeg,[...common,'-filter_complex','[0:v]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=none','-loop','0',path.join(root,'previews/doors-passage.gif')]);
  execFileSync(ffmpeg,[...common,'-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',path.join(root,'previews/doors-passage.mp4')]);
  await fs.rm(clips,{recursive:true,force:true});await fs.rm(recording.temp,{recursive:true,force:true});await fs.rm(path.join(root,'docs/RECORDING_TEMP.json'));
  console.log('Door passage GIF and MP4 exported, temporary recording removed.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
