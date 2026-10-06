// Record the actual offline animation demo, including its resource lifecycle.
const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process'),sharp=require('sharp'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
async function main(){
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1180},deviceScaleFactor:1});await page.goto('file://'+path.join(root,'index.html'));await page.waitForFunction(()=>LOUNGE_DEMO?.ready);await page.evaluate(()=>LOUNGE_DEMO.setPaused(true));
  const videos=[{name:'lounge-actions',segments:[['sit',5200],['drink',3400],['talk',2200],['laugh',1800],['game',2200],['win',1800],['pat',1900],['exchange',1900]]},{name:'playstation-cycle',segments:[['setup',10200],['return',8000]]}];
  for(const video of videos){
   const temp=await fs.mkdtemp('/private/tmp/artel-lounge-video-');let index=0;
   try{
    for(const [mode,duration]of video.segments){
     await page.evaluate(m=>LOUNGE_DEMO.setMode(m),mode);
     const labels={sit:'Отдельная посадка: диван и мягкое кресло',drink:'Питьё с сохранением позы мебели',talk:'Разговор сидя',laugh:'Смех сидя',game:'Два игрока · два контроллера',win:'Победа без вставания',pat:'Дружеский хлопок по плечу',exchange:'Передача одного предмета',setup:'Ящик → перенос → установка → игра',return:'Забрать приставку → убрать в ящик'};
     const title=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="960" height="886"><text x="22" y="38" fill="#eee3cf" font-family="Arial" font-size="24">'+labels[mode]+'</text><text x="22" y="878" fill="#b8c2b9" font-family="Arial" font-size="13">AI ARTEL · пиксельный офис · анимации зоны отдыха</text></svg>');
     for(let t=0;t<duration;t+=100){
      const uri=await page.evaluate(()=>document.querySelector('#stage').toDataURL());
      await sharp({create:{width:960,height:886,channels:4,background:'#182021'}}).composite([{input:Buffer.from(uri.split(',')[1],'base64'),left:0,top:54},{input:title,left:0,top:0}]).png().toFile(path.join(temp,'frame-'+String(index++).padStart(4,'0')+'.png'));
      await page.evaluate(()=>LOUNGE_DEMO.advance(100));
     }
    }
    const input=['-hide_banner','-loglevel','error','-y','-framerate','10','-i',path.join(temp,'frame-%04d.png')],ffmpeg=process.env.ARTEL_FFMPEG||'ffmpeg';
    execFileSync(ffmpeg,[...input,'-filter_complex','[0:v]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=none','-loop','0',path.join(root,'previews',video.name+'.gif')]);
    execFileSync(ffmpeg,[...input,'-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',path.join(root,'previews',video.name+'.mp4')]);
    console.log('Exported '+video.name+': '+index+' frames at 10 fps.');
   }finally{await fs.rm(temp,{recursive:true,force:true});}
  }
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
