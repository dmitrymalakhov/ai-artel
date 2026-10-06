/** Engine-independent door lifecycle. All times are milliseconds of game time. */
export class DoorController {
  constructor(config, hooks = {}) {
    this.config = config; this.hooks = hooks;
    this.state = 'closed'; this.elapsed = 0; this.idleElapsed = 0;
    this.queue = []; this.active = null; this.nearby = new Set();
    this.obstructions = new Set(); this.sequencePosition = 0;
  }
  get passable() { return this.state === 'open'; }
  get frameIndex() {
    if (this.state === 'closed') return 0;
    if (this.state === 'open') return 7;
    const order = this.state === 'opening' ? this.config.animations.open.frames : this.config.animations.close.frames;
    return order[this.sequencePosition];
  }
  request(actorId, side) {
    if (!['corridor', 'room'].includes(side)) throw new Error('Unknown door side: ' + side);
    if (this.active?.actorId === actorId || this.queue.some(q => q.actorId === actorId)) return;
    this.queue.push({ actorId, side }); this.idleElapsed = 0;
    if (this.state === 'closed') this.transition('opening');
    else if (this.state === 'closing') this.reopen();
    this.admit();
  }
  setNearby(actorId, present) {
    if (present) {
      this.nearby.add(actorId); this.idleElapsed = 0;
      if (this.state === 'closing') this.reopen();
    }
    else this.nearby.delete(actorId);
  }
  setObstruction(id, present) {
    if (present) {
      this.obstructions.add(id); this.idleElapsed = 0;
      if (this.state === 'closing') this.reopen();
    } else this.obstructions.delete(id);
  }
  cancel(actorId) {
    // Cancel waiting requests only. Actors already crossing must call release after clearing.
    this.queue = this.queue.filter(q => q.actorId !== actorId);
  }
  release(actorId) {
    if (this.active?.actorId !== actorId) return false;
    const released = this.active; this.active = null; this.idleElapsed = 0;
    this.hooks.onTraversalReleased?.(released); this.admit(); return true;
  }
  removeActor(actorId) {
    this.cancel(actorId); this.nearby.delete(actorId); this.obstructions.delete(actorId);
    this.release(actorId);
  }
  transition(state, sequencePosition = 0) {
    const previouslyPassable = this.passable;
    this.state = state; this.elapsed = 0; this.sequencePosition = sequencePosition;
    this.hooks.onStateChange?.(state);
    if (previouslyPassable !== this.passable) this.hooks.onPassabilityChange?.(this.passable);
  }
  reopen() {
    // Preserve the visible pose when reversing. Movement remains blocked until fully open.
    const pose = this.frameIndex;
    this.transition('opening', this.config.animations.open.frames.indexOf(pose));
  }
  admit() {
    if (this.passable && !this.active && this.queue.length) {
      this.active = this.queue.shift(); this.idleElapsed = 0;
      this.hooks.onTraversalGranted?.(this.active);
    }
  }
  tick(deltaMs) {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new Error('Invalid game delta');
    if (this.state === 'opening' || this.state === 'closing') {
      const animation = this.config.animations[this.state === 'opening' ? 'open' : 'close'];
      this.elapsed += deltaMs;
      while (this.elapsed >= animation.durationsMs[this.sequencePosition]) {
        this.elapsed -= animation.durationsMs[this.sequencePosition];
        this.sequencePosition++;
        if (this.sequencePosition === animation.frames.length) {
          this.transition(this.state === 'opening' ? 'open' : 'closed'); this.admit();
          return; // Conservative: do not consume excess time as an immediate close.
        }
      }
      return;
    }
    if (this.state !== 'open') return;
    this.admit();
    if (this.active || this.queue.length || this.nearby.size || this.obstructions.size) {
      this.idleElapsed = 0; return;
    }
    this.idleElapsed += deltaMs;
    if (this.idleElapsed >= this.config.autoCloseDelayMs) this.transition('closing');
  }
}
