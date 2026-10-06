const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),sharp=require('sharp');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
async function main(){
  const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
  const {DoorController}=await import(pathToFileURL(path.join(root,'tools/door-controller.mjs')));
  const report={doors:[],checks:[],limitations:['No target game application is present; engine integration and actual navigation/collision geometry remain to be checked in the target project.','Coordinates use the provided 1254x1254 office scene; adapt all coordinates uniformly if its scale changes.']};
  for(const door of manifest.doors){
    const hashes=new Set(),atlas=JSON.parse(await fs.readFile(path.join(root,door.atlas),'utf8'));
    assert.equal(Object.keys(atlas.frames).length,8);
    for(let i=0;i<8;i++){
      const file=path.join(root,'doors',door.id,'frames','door_'+String(i).padStart(2,'0')+'.png');
      const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      assert.equal(info.width,door.frameSize.w);assert.equal(info.height,door.frameSize.h);
      let transparent=0,solid=0;for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const a=data[(y*info.width+x)*4+3];if(a===0)transparent++;if(a>96)solid++;if(x<2||x>=info.width-2||y<2||y>=info.height-2)assert.equal(a,0,'Clipped sprite edge');}
      assert.ok(transparent>info.width*info.height*.3);assert.ok(solid>10);hashes.add(crypto.createHash('sha256').update(data).digest('hex'));
      if(i===7){const center=door.waypoints.corridor.x-door.scenePosition.x;for(let x=center-14;x<=center+14;x++)for(let y=door.anchor.y-70;y<door.anchor.y;y++)assert.ok(data[(y*info.width+x)*4+3]<16,'Open leaf obstructs center passage');}
    }
    assert.equal(hashes.size,8);assert.deepEqual(door.animations.close.frames,[...door.animations.open.frames].reverse());
    let grants=[],events=[];const c=new DoorController(door,{onTraversalGranted:v=>grants.push(v.actorId),onPassabilityChange:v=>events.push(v)});
    c.request('A','corridor');c.request('B','room');c.request('B','room');assert.equal(c.queue.length,2);assert.equal(c.passable,false);
    c.tick(640);assert.equal(c.frameIndex,7);assert.equal(c.passable,false);assert.deepEqual(grants,[]);
    c.tick(160);assert.equal(c.passable,true);assert.equal(c.active.actorId,'A');assert.deepEqual(grants,['A']);
    c.tick(10000);assert.equal(c.state,'open');assert.equal(c.release('wrong'),false);
    assert.equal(c.release('A'),true);assert.equal(c.active.actorId,'B');assert.equal(c.release('A'),false);assert.deepEqual(grants,['A','B']);
    c.setObstruction('crate',true);c.release('B');c.tick(10000);assert.equal(c.state,'open');
    c.setObstruction('crate',false);c.setNearby('near',true);c.tick(10000);assert.equal(c.state,'open');c.setNearby('near',false);
    c.tick(door.autoCloseDelayMs);assert.equal(c.state,'closing');assert.equal(c.passable,false);c.tick(350);
    const before=c.frameIndex;c.request('C','corridor');assert.equal(c.state,'opening');assert.equal(c.frameIndex,before);assert.equal(c.passable,false);c.tick(2000);assert.equal(c.active.actorId,'C');
    c.removeActor('C');c.request('cancel','room'); // Immediately admitted while fully open: active requests need explicit safe removal.
    c.removeActor('cancel');c.tick(door.autoCloseDelayMs);c.tick(2000);assert.equal(c.state,'closed');
    c.request('waiting','corridor');c.cancel('waiting');c.tick(2000);assert.equal(c.active,null);c.tick(door.autoCloseDelayMs);assert.equal(c.state,'closing');
    const pose=c.frameIndex;c.setObstruction('blocked',true);assert.equal(c.state,'opening');assert.equal(c.frameIndex,pose);c.tick(2000);c.tick(20000);assert.equal(c.state,'open');c.setObstruction('blocked',false);c.tick(door.autoCloseDelayMs);c.tick(2000);assert.equal(c.state,'closed');
    assert.deepEqual(events.slice(0,2),[true,false]);assert.throws(()=>c.tick(-1));assert.throws(()=>c.request('bad','unknown'));
    report.doors.push({id:door.id,uniqueFrames:hashes.size,openingDurationMs:door.animations.open.durationsMs.reduce((a,b)=>a+b,0)});
  }
  const original=await sharp(path.join(root,'../02_ANIMATION/character_free_restoration_plate.png')).ensureAlpha().raw().toBuffer();
  const restored=await sharp(path.join(root,manifest.scene.background)).ensureAlpha().raw().toBuffer();let unchanged=0,changed=0;
  assert.equal(original.length,restored.length);
  for(let y=0;y<1254;y++)for(let x=0;x<1254;x++){const inside=manifest.scene.editedRegions.some(r=>x>=r.left&&x<r.left+r.width&&y>=r.top&&y<r.top+r.height),i=(y*1254+x)*4,same=original.subarray(i,i+4).equals(restored.subarray(i,i+4));if(!inside){assert.ok(same,'Background modified outside requested entrances');unchanged++;}else if(!same)changed++;}
  assert.ok(changed>500);report.preservedBackgroundPixels=unchanged;
  const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1180},deviceScaleFactor:1}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('file://'+path.join(root,'index.html'));await page.waitForFunction(()=>window.DOOR_DEMO?.ready);
  await page.evaluate(()=>{DOOR_DEMO.setPaused(true);for(const m of DOOR_DEMO.models){m.auto=false;m.actor.restUntil=Infinity;}DOOR_DEMO.advance(0);});
  await page.screenshot({path:path.join(root,'previews/closed.png'),fullPage:true});
  await page.locator('[data-action=pass]').nth(0).click();await page.locator('[data-action=pass]').nth(1).click();
  await page.evaluate(()=>DOOR_DEMO.advance(400));await page.screenshot({path:path.join(root,'previews/opening.png'),fullPage:true});
  await page.evaluate(()=>DOOR_DEMO.advance(400));assert.deepEqual(await page.evaluate(()=>DOOR_DEMO.models.map(m=>m.controller.state)),['open','open']);
  await page.screenshot({path:path.join(root,'previews/open-passage.png'),fullPage:true});
  await page.locator('.detail canvas').nth(0).screenshot({path:path.join(root,'previews/manager-open.png')});await page.locator('.detail canvas').nth(1).screenshot({path:path.join(root,'previews/meeting-open.png')});
  await page.evaluate(()=>DOOR_DEMO.advance(2200));assert.deepEqual(await page.evaluate(()=>DOOR_DEMO.models.map(m=>m.actor.side)),['room','room']);
  await page.evaluate(()=>{DOOR_DEMO.advance(1100);DOOR_DEMO.advance(800);});assert.deepEqual(await page.evaluate(()=>DOOR_DEMO.models.map(m=>m.controller.state)),['closed','closed']);
  await page.locator('[data-action=pass]').nth(0).click();await page.locator('[data-action=pass]').nth(1).click();
  await page.evaluate(()=>{DOOR_DEMO.advance(800);DOOR_DEMO.advance(2200);});assert.deepEqual(await page.evaluate(()=>DOOR_DEMO.models.map(m=>m.actor.side)),['corridor','corridor']);
  await page.evaluate(()=>{DOOR_DEMO.advance(1100);DOOR_DEMO.advance(800);});
  // Record one entry-and-exit cycle deterministically for GIF/MP4 export.
  const temp=await fs.mkdtemp('/private/tmp/artel-doors-');
  await page.setViewportSize({width:1440,height:1180});
  await page.evaluate(()=>{for(const m of DOOR_DEMO.models)m.auto=true;});
  for(let i=0;i<132;i++){const data=await page.evaluate(()=>{DOOR_DEMO.advance(100);for(const m of DOOR_DEMO.models){if(m.actor.side==='room')m.recordVisitedRoom=true;if(m.recordVisitedRoom&&m.actor.side==='corridor'&&m.actor.phase==='waiting')m.auto=false;}return document.querySelector('#scene').toDataURL('image/png').split(',')[1]});await fs.writeFile(path.join(temp,'frame-'+String(i).padStart(3,'0')+'.png'),Buffer.from(data,'base64'));}
  await fs.writeFile(path.join(root,'docs/RECORDING_TEMP.json'),JSON.stringify({temp,frameCount:132,fps:10}));
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(root,'previews/mobile.png'),fullPage:false});assert.deepEqual(errors,[]);await browser.close();
  report.checks=['8 distinct RGBA frames per door','No clipped frame edges','Fully open leaves clear center traversal lane','Closing reuses opening frames in reverse','Closed/partial opening blocks traversal','FIFO two-way requests and deduplication','Active traversal and nearby sensors prevent auto-close','Obstacle prevents auto-close','Reversal retains visible pose','Deletion, cancellation and ownership-safe release','Large time delta and invalid input handling','Original background pixels unchanged outside entrance patches','Offline browser preview loads without errors','Both doors allow entry and return','Desktop and mobile layout','Deterministic cycle recorded for video'];
  await fs.writeFile(path.join(root,'docs/VALIDATION.json'),JSON.stringify(report,null,2));
  console.log('Verified 16 frames, passage controller, preserved background, entry/exit preview and mobile. Recording: '+temp);
}
main().catch(e=>{console.error(e);process.exitCode=1});
