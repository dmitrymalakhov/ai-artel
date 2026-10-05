/** Use in Phaser scene preload(): preloadCharacters(this, '/06_CHARACTER_ANIMATIONS/'). */
export const characterIds = ['manager_navy','worker_orange_yellow','worker_dark_purple','worker_brown_green','worker_black_charcoal','worker_blond_blue','worker_brown_red'];
export function preloadCharacters(scene, base='/06_CHARACTER_ANIMATIONS/') {
 if(!base.endsWith('/'))base+='/';
 scene.load.json('artel-manifest',base+'manifest.json');
 for(const id of characterIds)scene.load.atlas(id,base+'characters/'+id+'/atlas.png',base+'characters/'+id+'/atlas.json');
}
/** Use in create() after preload completes. Each frame retains its authored duration. */
export function createCharacterAnimations(scene) {
 const pack=scene.cache.json.get('artel-manifest');
 if(!pack)throw new Error('Load the Artel manifest before creating animations');
 for(const c of pack.characters)for(const [action,clip]of Object.entries(c.animations)){
  const key=c.id+':'+action;
  if(scene.anims.exists(key))continue;
  scene.anims.create({key,frames:clip.frames.map((frame,i)=>({key:c.id,frame,duration:clip.durationsMs[i]-1})),frameRate:1000,repeat:clip.loop?-1:0});
 }
 return pack;
}
/** Feet are the world position. Sort actors by feet Y whenever they move. */
export function spawnCharacter(scene,id,x,y,action='idle_down'){
 if(!characterIds.includes(id))throw new Error('Unknown Artel character: '+id);
 const sprite=scene.add.sprite(x,y,id,action+'_00').setOrigin(.5,.875);
 sprite.setDepth(y);sprite.play(id+':'+action);return sprite;
}
/** Calibrate seatAnchor and offsets per actor/seat type; this is a placement helper. */
export function placeCharacterAtSeat(sprite,seatX,seatY,clip,offset={x:0,y:0}){
 if(!clip.seatAnchor)throw new Error('The selected clip does not define a seat anchor');
 sprite.setOrigin(.5,.875);
 sprite.setPosition(seatX+(64-clip.seatAnchor.x)*sprite.scaleX+offset.x,seatY+(112-clip.seatAnchor.y)*sprite.scaleY+offset.y);
 sprite.setDepth(sprite.y);return sprite;
}
