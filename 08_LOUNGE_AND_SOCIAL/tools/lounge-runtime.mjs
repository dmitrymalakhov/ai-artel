/** Resolve atlas key and mirror per frame; canonical standing overrides are not mirrored twice. */
export function resolveSpriteFrame(clip, index) {
  return clip.frameOverrides?.[index] ?? {frame:clip.frames[index],flipX:!!clip.flipX};
}
/** Atomic item transfer for paired clips. Run once on the shared transfer marker. */
export function transferItem(inventory, itemId, from, to, transactionId) {
  if(inventory.transactions.has(transactionId)) return false;
  if(from===to||inventory.items.get(itemId)!==from) return false;
  inventory.items.set(itemId,to);inventory.transactions.add(transactionId);return true;
}
/** Single console, two controllers, slot ownership and drawer/game lifecycle. */
export class LoungeSession {
  constructor(){this.consoleLocation='drawer';this.carrier=null;this.drawerOpen=false;this.screen='off';this.storageOwner=null;this.players=new Map;this.seats=new Map;this.seatedActors=new Set;this.transactions=new Set;}
  reserveStorage(actor){if(this.storageOwner&&this.storageOwner!==actor)return false;this.storageOwner=actor;return true;}
  releaseStorage(actor){if(this.storageOwner===actor)this.storageOwner=null;}
  openDrawer(actor){if(!this.reserveStorage(actor))return false;this.drawerOpen=true;return true;}
  closeDrawer(actor){if(this.storageOwner!==actor)return false;this.drawerOpen=false;this.releaseStorage(actor);return true;}
  once(id,change){if(this.transactions.has(id))return false;if(!change())return false;this.transactions.add(id);return true;}
  pickup(actor,id){return this.once(id,()=>{if(this.consoleLocation!=='drawer'||!this.drawerOpen||this.storageOwner!==actor)return false;this.consoleLocation='carried';this.carrier=actor;return true;});}
  install(actor,id){return this.once(id,()=>{if(this.consoleLocation!=='carried'||this.carrier!==actor)return false;this.consoleLocation='installed';this.carrier=null;this.screen='menu';return true;});}
  takeInstalled(actor,id){return this.once(id,()=>{if(this.consoleLocation!=='installed'||this.players.size||!this.reserveStorage(actor))return false;this.consoleLocation='carried';this.carrier=actor;this.screen='off';return true;});}
  store(actor,id){return this.once(id,()=>{if(this.consoleLocation!=='carried'||this.carrier!==actor||!this.drawerOpen||this.storageOwner!==actor)return false;this.consoleLocation='drawer';this.carrier=null;this.screen='off';return true;});}
  reserveSeat(actor,seat){const owner=this.seats.get(seat);if(owner&&owner!==actor)return false;for(const [other,occupant]of this.seats)if(occupant===actor&&other!==seat)return false;this.seats.set(seat,actor);return true;}
  markSeated(actor,seat){if(this.seats.get(seat)!==actor)return false;this.seatedActors.add(actor);return true;}
  markStanding(actor){if(this.players.has(actor))return false;this.seatedActors.delete(actor);return true;}
  releaseSeat(actor,seat){if(this.players.has(actor)||this.seatedActors.has(actor)||this.seats.get(seat)!==actor)return false;this.seats.delete(seat);return true;}
  join(actor,seat){if(this.consoleLocation!=='installed'||this.seats.get(seat)!==actor||!this.seatedActors.has(actor))return false;if(this.players.has(actor))return true;if(this.players.size>=2)return false;const used=new Set(this.players.values());this.players.set(actor,used.has(0)?1:0);this.screen='playing';return true;}
  leave(actor){if(!this.players.delete(actor))return false;this.screen=this.players.size?'playing':'menu';return true;}
  pause(){if(this.players.size)this.screen='paused';}
  resume(){if(this.players.size)this.screen='playing';}
  removeActor(actor){this.leave(actor);this.seatedActors.delete(actor);for(const [seat,owner]of this.seats)if(owner===actor)this.seats.delete(seat);this.releaseStorage(actor);if(this.carrier===actor){this.consoleLocation='recovery';this.carrier=null;} }
  recoverConsole(actor,id){return this.once(id,()=>{if(this.consoleLocation!=='recovery'||!this.reserveStorage(actor))return false;this.consoleLocation='carried';this.carrier=actor;return true;});}
  get cabinetState(){if(this.consoleLocation==='installed')return this.screen==='playing'?6:this.screen==='menu'||this.screen==='paused'?7:5;if(this.drawerOpen)return this.consoleLocation==='drawer'?2:3;return 0;}
}
