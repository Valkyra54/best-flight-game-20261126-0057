// DELTA POST — tiny typed event bus (threejs-game pattern). Systems never
// reach into each other's internals; they emit events and react to them.
// This keeps HUD, audio, missions and flight decoupled.

const listeners = new Map();

export function on(type, handler) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  const set = listeners.get(type);
  set.add(handler);
  return () => {
    set.delete(handler);
  };
}

export function emit(type, payload) {
  const set = listeners.get(type);
  if (!set) return;
  for (const handler of [...set]) handler(payload);
}

export function clearBus() {
  listeners.clear();
}

// Event types (kept as constants so a typo fails loudly at the call site).
export const Events = Object.freeze({
  RING_PASSED: 'ring-passed',
  RING_MISSED: 'ring-missed',
  MISSION_START: 'mission-start',
  MISSION_COMPLETE: 'mission-complete',
  MAIL_DROPPED: 'mail-dropped',
  MAIL_DELIVERED: 'mail-delivered',
  MAIL_MISSED: 'mail-missed',
  LOW_FUEL: 'low-fuel',
  FUEL_EMPTY: 'fuel-empty',
  TOUCHDOWN: 'touchdown',
  CRASH: 'crash',
  DEBRIEF: 'debrief',
  SORTIE_START: 'sortie-start',
  SORTIE_RESTART: 'sortie-restart',
  CAMERA_CHANGED: 'camera-changed',
  PAUSE_CHANGED: 'pause-changed',
  AUDIO_TOGGLED: 'audio-toggled',
});
