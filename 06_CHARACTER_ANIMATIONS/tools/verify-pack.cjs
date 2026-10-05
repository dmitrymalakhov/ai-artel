const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),sharp=require('sharp');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
async function main(){
 const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
 assert.equal(manifest.characters.length,7);let count=0,clips=0;const details=[];
 for(const c of manifest.characters){
  const atlas=JSON.parse(await fs.readFile(path.join(root,c.atlas),'utf8'));
  const meta=await sharp(path.join(root,c.image)).metadata();
  assert.equal(meta.width,1024);assert.equal(meta.height,4096);assert.equal(meta.hasAlpha,true);
  assert.equal(Object.keys(atlas.frames).length,256);
  for(const [action,clip]of Object.entries(c.animations)){
   assert.equal(clip.frames.length,8);assert.equal(clip.durationsMs.length,8);const hashes=new Set();
   for(const key of clip.frames){
    const filename=path.join(root,'characters',c.id,'frames',key+'.png');
    const {data,info}=await sharp(filename).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    assert.equal(info.width,128);assert.equal(info.height,128);let opaque=0;
    for(let y=0;y<128;y++)for(let x=0;x<128;x++){const a=data[(y*128+x)*4+3];if(a>96)opaque++;if(x<2||x>125||y<2||y>125)assert.equal(a,0,c.id+'/'+key+': edge pixels');}
    assert.ok(opaque>500,c.id+'/'+key+': empty frame');
    const r=atlas.frames[key].frame;assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=1024&&r.y+r.h<=4096);
    hashes.add(crypto.createHash('sha256').update(data).digest('hex'));count++;
   }
   assert.ok(hashes.size>1,c.id+'/'+action+': static sequence');
   details.push({character:c.id,action,distinctFrames:hashes.size});clips++;
  }
  for(const facing of ['left','right']){
   for(const [transition,first,last]of [['sit_down','idle','seated_idle'],['stand_up','seated_idle','idle']]){
    const start=await fs.readFile(path.join(root,'characters',c.id,'frames',transition+'_'+facing+'_00.png'));
    const end=await fs.readFile(path.join(root,'characters',c.id,'frames',transition+'_'+facing+'_07.png'));
    assert.deepEqual(start,await fs.readFile(path.join(root,'characters',c.id,'frames',first+'_'+facing+'_00.png')));
    assert.deepEqual(end,await fs.readFile(path.join(root,'characters',c.id,'frames',last+'_'+facing+'_00.png')));
   }
  }
 }
 assert.equal(count,1792);assert.equal(clips,224);
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('file://'+path.join(root,'index.html'));
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Кадр'));
 assert.equal(await page.locator('.person').count(),7);
 await page.locator('#category').selectOption('all');
 for(const action of Object.keys(manifest.characters[0].animations)){await page.locator('[data-action="'+action+'"]').click();assert.equal(await page.locator('[data-action="'+action+'"]').getAttribute('aria-pressed'),'true');}
 await page.locator('[data-action="celebrate"]').click();await page.locator('#pause').click();
 await page.evaluate(()=>{time=340});await page.waitForTimeout(60);
 await page.screenshot({path:path.join(root,'previews','celebrate.png'),fullPage:true});
 await page.locator('[data-action="coffee"]').click();await page.evaluate(()=>{time=650});await page.waitForTimeout(60);
 await page.locator('#background').selectOption('light');
 await page.screenshot({path:path.join(root,'previews','coffee-light.png'),fullPage:true});
 await page.locator('#background').selectOption('');await page.locator('[data-action="walk_right"]').click();
 await page.locator('#step').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('2 / 8'));
 await page.screenshot({path:path.join(root,'previews','walk.png'),fullPage:true});
 await page.locator('[data-action="seated_coffee_right"]').click();await page.evaluate(()=>{time=700});await page.waitForTimeout(60);
 await page.screenshot({path:path.join(root,'previews','seated-coffee.png'),fullPage:true});
 for(const station of ['desk','meeting','lounge']){await page.locator('#station').selectOption(station);await page.waitForTimeout(80);await page.screenshot({path:path.join(root,'previews','seated-'+station+'.png'),fullPage:true})}
 await page.locator('#station').selectOption('none');await page.locator('#sequence').click();
 await page.waitForFunction(()=>action==='sit_down_right');await page.evaluate(()=>{time=first.animations[action].totalDurationMs+1});
 await page.waitForFunction(()=>action==='seated_idle_right');
 await page.evaluate(()=>{time=first.animations[action].totalDurationMs+1});await page.waitForFunction(()=>action==='stand_up_right');
 await page.evaluate(()=>{time=first.animations[action].totalDurationMs+1});await page.waitForFunction(()=>action==='idle_right');
 await page.locator('#sequence').click();await page.locator('#category').selectOption('seating');
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:path.join(root,'previews','mobile.png'),fullPage:false});
 assert.deepEqual(errors,[]);await browser.close();
 const report={frameCount:count,animationCount:clips,verified:['RGBA transparency','128x128 individual frames','1024x4096 atlases','safe frame margins','nonempty artwork','all animation sequences vary','exact sit/stand endpoint matching','metadata references and timing','all 32 action buttons','furniture previews at desk/meeting/lounge','sit-idle-stand sequence','local-file loading without server','mobile layout','no browser errors'],limitations:['No target engine project is present; Phaser and Godot integration has not been run in a game.','Seat anchors and furniture occlusion require calibration in the target scene.','Front/back sit/stand transitions are not provided; use documented lateral-turn staging.'],clips:details};
 await fs.writeFile(path.join(root,'docs','VALIDATION.json'),JSON.stringify(report,null,2));
 console.log('Verified '+count+' frames, '+clips+' clips, desktop/mobile preview and all controls.');
}
main().catch(e=>{console.error(e);process.exit(1)});
