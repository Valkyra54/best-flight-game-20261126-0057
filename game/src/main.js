// DELTA POST — orchestrator. One job: wire every system together and run
// the loop. Fixed-step physics at 60 Hz with a delta cap (physics-tuning),
// render interpolation is unnecessary at a 1:1 step ratio, and the loop
// is restart-safe: startSortie resets every system.

import * as THREE from 'three';
import { DELTA_POST } from './config.js';
import { state, Phases } from './gameState.js';
import { on, Events } from './eventBus.js';
import { buildWorld, updateWorld, updatePapi } from './world.js';
import { buildGulls, updateGulls } from './gulls.js';
import { buildWake, updateWake } from './wake.js';
import { buildAircraft, poseAircraft } from './aircraft.js';
import { stepFlight, FIXED_DT } from './flight.js';
import { startSortie, updateMissions, requestDrop, onTouchdown, onCrash } from './missions.js';
import { initInput } from './input.js';
import { initHud, updateHud, showTitle, showPause } from './hud.js';
import { initAudio, unlockAudio, updateEngineSound } from './audio.js';
import { initCamera, updateCamera, resetCamera } from './cameraRig.js';
import { createRenderer, resizeRenderer, renderFrame, makeCamera } from './render.js';
import { stageShot, isShotMode } from './shots.js';

const params = new URLSearchParams(window.location.search);
const SEED = Number(params.get('seed') || DELTA_POST.seed);
const SHOT = params.get('shot');

let renderer;
let scene;
let camera;
let aircraft;
let timer;
let accumulator = 0;
let timeSeconds = 0;
let framesRendered = 0;

function startSortieHandler() {
  unlockAudio();
  resetCamera();
  startSortie(SEED);
  document.getElementById('title').style.display = 'none';
  document.getElementById('debrief').style.display = 'none';
}

function init() {
  const canvas = document.getElementById('game');
  try {
    renderer = createRenderer(canvas);
  } catch (error) {
    document.getElementById('title').innerHTML =
      '<h1>DELTA POST</h1><p>WebGL is not available in this browser, so the game cannot start.</p>';
    console.error('WebGL init failed', error);
    return;
  }
  scene = new THREE.Scene();
  scene.background = new THREE.Color(DELTA_POST.colors.dawnHorizon);
  camera = makeCamera();

  buildWorld(scene, SEED);
  buildGulls(scene);
  buildWake(scene);
  aircraft = buildAircraft();
  scene.add(aircraft.group);

  initInput();
  initHud();
  initAudio();
  initCamera();

  // Event wiring: input intents become mission actions here.
  on('drop-requested', requestDrop);
  on('start-requested', startSortieHandler);
  window.addEventListener('delta-start', startSortieHandler);
  on(Events.TOUCHDOWN, onTouchdown);
  on(Events.CRASH, onCrash);
  on(Events.PAUSE_CHANGED, ({ paused }) => showPause(paused));

  window.addEventListener('resize', () => resizeRenderer(renderer, camera));

  timer = new THREE.Timer();
  timer.connect(document);

  if (SHOT) {
    stageShot(SHOT, 1);
    document.getElementById('title').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
  } else {
    showTitle();
  }

  renderer.setAnimationLoop(loop);
  window.__GAME_READY__ = true;
}

function loop() {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.1); // delta cap (threejs-game)
  timeSeconds += dt;

  const frozen = state.frozen === true;
  if (!frozen && state.phase === Phases.FLYING) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < 5) {
      stepFlight(FIXED_DT);
      updateMissions(FIXED_DT);
      accumulator -= FIXED_DT;
      steps += 1;
    }
    if (steps === 5) accumulator = 0; // spiral-of-death guard
  }

  poseAircraft(aircraft, dt);
  updateCamera(camera, dt, timeSeconds);
  updateWorld(timeSeconds);
  updateGulls(timeSeconds);
  updateWake(dt, timeSeconds);
  updatePapi();
  updateHud(camera);
  updateEngineSound();
  renderFrame(renderer, scene, camera);
  framesRendered += 1;
}

function renderGameToText() {
  const lines = [
    `DELTA POST — phase=${state.phase} mission=${state.missionIndex}`,
    `pos=(${state.position.x.toFixed(1)}, ${state.position.y.toFixed(1)}, ${state.position.z.toFixed(1)})`,
    `heading=${(THREE.MathUtils.radToDeg(state.heading) + 360) % 360 | 0}deg pitch=${state.pitch.toFixed(2)} roll=${state.roll.toFixed(2)}`,
    `speed=${(state.speed * 1.94384).toFixed(0)}kt alt=${(state.position.y * 3.28084).toFixed(0)}ft agl=${(state.altitudeAgl * 3.28084).toFixed(0)}ft`,
    `throttle=${Math.round(state.throttle * 100)}% fuel=${Math.round(state.fuel)}% hull=${state.hull}`,
    `rings=${state.ringsPassed}/6 drop=${state.dropDelivered ? 'delivered' : 'pending'} score=${state.score} elapsed=${Math.round(state.elapsed)}s`,
    `frames=${framesRendered}`,
  ];
  return lines.join('\n');
}

init();

// QA bridge (game-qa pattern): deterministic state readout + time control.
window.__GAME__ = {
  state,
  start: startSortieHandler,
  render_game_to_text: renderGameToText,
  advanceTime(seconds) {
    const steps = Math.round(seconds * 60);
    for (let i = 0; i < steps; i += 1) {
      stepFlight(FIXED_DT);
      updateMissions(FIXED_DT);
    }
    return renderGameToText();
  },
};
