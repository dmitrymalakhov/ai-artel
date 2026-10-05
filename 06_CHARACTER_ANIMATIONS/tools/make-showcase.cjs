const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
async function main(){
 const pack=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
 const temp=await fs.mkdtemp('/private/tmp/artel-showcase-');
 const seated=process.argv.includes('--seating');
 const actions=seated?['sit_down_right','seated_idle_right','work_down','work_up','seated_coffee_right','seated_talk_right','lounge_right','stand_up_right','sit_down_left','seated_coffee_left','stand_up_left']:['walk_right','walk_down','walk_up','walk_left','work_right','coffee','talk','laugh','celebrate','wave','think'];
 const outputName=seated?'seated-characters':'all-characters';
 const playlist=[];let i=0;
 for(const action of actions){
  const clip=pack.characters[0].animations[action];
  for(let fi=0;fi<8;fi++){
   const elements=[];
   const svg=Buffer.from('<svg width="1856" height="344" xmlns="http://www.w3.org/2000/svg"><text x="38" y="43" fill="#e8e1cf" font-family="Arial" font-size="24">'+clip.label+'</text><text x="1818" y="40" text-anchor="end" fill="#c7aa72" font-family="Arial" font-size="16">AI ARTEL / 07 CHARACTERS / PIXEL MOTION</text>'+pack.characters.map((c,k)=>'<text x="'+(k*256+160)+'" y="326" text-anchor="middle" fill="#a5b5ad" font-family="Arial" font-size="13">'+c.name+'</text>').join('')+'</svg>');
   elements.push({input:svg,left:0,top:0});
   for(let ci=0;ci<7;ci++){
    const c=pack.characters[ci],key=c.animations[action].frames[fi];
    const sprite=await sharp(path.join(root,'characters',c.id,'frames',key+'.png')).resize(256,256,{kernel:'nearest'}).png().toBuffer();
    elements.push({input:sprite,left:32+ci*256,top:54});
   }
   const name='frame-'+String(i++).padStart(3,'0')+'.png';
   await sharp({create:{width:1856,height:344,channels:4,background:'#21292a'}}).composite(elements).png().toFile(path.join(temp,name));
   playlist.push("file '"+path.join(temp,name)+"'\nduration "+clip.durationsMs[fi]/1000);
  }
 }
 const last='frame-'+String(i-1).padStart(3,'0')+'.png';playlist.push("file '"+path.join(temp,last)+"'");
 await fs.writeFile(path.join(temp,'frames.txt'),playlist.join('\n'));
 execFileSync('/opt/homebrew/bin/ffmpeg',['-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',path.join(temp,'frames.txt'),'-filter_complex','[0:v]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=none','-loop','0',path.join(root,'previews',outputName+'.gif')]);
 execFileSync('/opt/homebrew/bin/ffmpeg',['-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',path.join(temp,'frames.txt'),'-vf','fps=25','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',path.join(root,'previews',outputName+'.mp4')]);
 await fs.rm(temp,{recursive:true,force:true});
 console.log('Showcase GIF and MP4 created: 11 actions, all seven characters.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
