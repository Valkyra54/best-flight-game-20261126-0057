// DELTA POST — the one shared state object (threejs-game GameState).
// Flight, missions, HUD, camera and audio all read/write this and nothing
// else. A sortie reset restores every field, so RESTART is always safe.

import { DELTA_POST } from './config.js';

export const Phases = Object.freeze({
  TITLE: 'title',
  FLYING: 'flying',
  PAUSED: 'paused',
  DEBRIEF: 'debrief',
});

export const MissionIds = Object.freeze({
  RINGS: 0,
  DROP: 1,
  LANDING: 2,
});

export function createInitialState() {
  return {
    phase: Phases.TITLE,
    // Flight — start OVER the river (riverX(-1000) is about -247), not over
    // the hills, so the first ring is dead ahead.
    position: { x: -247, y: 120, z: -1000 },
    heading: 0, // radians; 0 = due south (+Z), + turns toward west
    pitch: 0, // radians; + = nose up
    roll: 0, // radians; + = right wing down
    speed: 42, // m/s along the forward axis
    throttle: 0.55,
    fuel: DELTA_POST.fuel.start,
    hull: DELTA_POST.hull.start,
    verticalSpeed: 0,
    groundSpeed: 0,
    altitudeAgl: 120,
    windX: 0,
    // Missions
    missionIndex: MissionIds.RINGS,
    ringsPassed: 0,
    ringGate: 0, // index of the next ring
    dropAttempts: 0,
    dropDelivered: false,
    packageState: 'idle', // idle | falling | delivered | splashed
    packagePos: null,
    touchdown: null, // { verticalSpeed, headingErrorDeg, centrelineM, grade }
    score: 0,
    elapsed: 0,
    missionStartTime: 0,
    // Run state
    muted: false,
    cameraMode: 0, // 0 chase, 1 cockpit, 2 tower
    crashed: false,
    crashReason: '',
    outOfFuel: false,
    debrief: null,
    seed: DELTA_POST.seed,
    message: '',
    messageUntil: 0,
  };
}

// Single shared instance. Systems import `state` and mutate fields
// directly; `resetState` restores a fresh sortie.
export const state = createInitialState();

export function resetState(seed = DELTA_POST.seed) {
  const fresh = createInitialState();
  fresh.seed = seed;
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, fresh);
}

export function setMessage(text, seconds = 3) {
  state.message = text;
  state.messageUntil = state.elapsed + seconds;
}
