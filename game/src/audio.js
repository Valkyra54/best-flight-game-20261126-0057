// DELTA POST — sound. One job: every sound the game makes. ZzFX one-shots
// for events (ring chime, drop, splash, thud, click), a small WebAudio
// oscillator engine hum that follows the throttle. No audio files.

import { DELTA_POST } from './config.js';
import { state, Phases } from './gameState.js';
import { on, Events } from './eventBus.js';

// ZzFX is an ES module (v1.4.0 exports `zzfx`); import it directly so the
// game gets real sound instead of a silent classic-script failure.
import { zzfx as zzfxFn } from '../vendor/zzfx.js';

function playZzfx(...params) {
  if (state.muted) return;
  try {
    zzfxFn(...params);
  } catch (error) {
    // Sound must never break the game.
    console.warn('zzfx failed', error);
  }
}

// ZzFX parameter arrays: [volume, random, frequency, attack, slide, ...]
// (see the ZzFX docs for the full 20-parameter layout).
const SOUNDS = {
  ring: [0.5, 0, 880, 0.02, 0, 0.25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ringChime: [0.5, 0, 1320, 0.01, 0.1, 0.3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  drop: [0.4, 0, 300, 0.01, -0.3, 0.15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  delivered: [0.5, 0, 660, 0.01, 0.2, 0.35, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  splash: [0.45, 0.2, 500, 0.01, -0.5, 0.3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  thud: [0.7, 0.1, 120, 0.01, -0.4, 0.25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  crash: [0.8, 0.2, 90, 0.01, -0.6, 0.6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  click: [0.3, 0, 1200, 0.005, 0, 0.05, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  warn: [0.45, 0, 440, 0.01, 0.3, 0.2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

let audioCtx = null;
let engineOsc = null;
let engineOsc2 = null;
let engineGain = null;
let engineFilter = null;

function ensureEngine() {
  if (audioCtx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  audioCtx = new AC();
  engineOsc = audioCtx.createOscillator();
  engineOsc.type = 'sawtooth';
  engineOsc.frequency.value = 55;
  engineOsc2 = audioCtx.createOscillator();
  engineOsc2.type = 'square';
  engineOsc2.frequency.value = 110;
  engineFilter = audioCtx.createBiquadFilter();
  engineFilter.type = 'lowpass';
  engineFilter.frequency.value = 320;
  engineGain = audioCtx.createGain();
  engineGain.gain.value = 0;
  engineOsc.connect(engineFilter);
  engineOsc2.connect(engineFilter);
  engineFilter.connect(engineGain);
  engineGain.connect(audioCtx.destination);
  engineOsc.start();
  engineOsc2.start();
}

// Call from a user gesture (start button / Enter) — browsers block audio
// before interaction.
export function unlockAudio() {
  ensureEngine();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
}

export function updateEngineSound() {
  if (!audioCtx || !engineGain) return;
  const target = state.phase === Phases.FLYING && !state.muted && !state.outOfFuel
    ? 0.05 + state.throttle * 0.06
    : 0;
  engineGain.gain.setTargetAtTime(target, audioCtx.currentTime, 0.1);
  const freq = 48 + state.throttle * 70 + state.speed * 0.15;
  engineOsc.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.1);
  engineOsc2.frequency.setTargetAtTime(freq * 2, audioCtx.currentTime, 0.1);
  engineFilter.frequency.setTargetAtTime(220 + state.throttle * 500, audioCtx.currentTime, 0.1);
}

export function initAudio() {
  on(Events.RING_PASSED, () => {
    playZzfx(...SOUNDS.ring);
    setTimeout(() => playZzfx(...SOUNDS.ringChime), 90);
  });
  on(Events.MAIL_DROPPED, () => playZzfx(...SOUNDS.drop));
  on(Events.MAIL_DELIVERED, () => playZzfx(...SOUNDS.delivered));
  on(Events.MAIL_MISSED, () => playZzfx(...SOUNDS.splash));
  on(Events.TOUCHDOWN, () => playZzfx(...SOUNDS.thud));
  on(Events.CRASH, () => playZzfx(...SOUNDS.crash));
  on(Events.LOW_FUEL, () => playZzfx(...SOUNDS.warn));
  on(Events.SORTIE_START, () => playZzfx(...SOUNDS.click));
  on(Events.AUDIO_TOGGLED, ({ muted }) => {
    if (muted && engineGain) engineGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);
  });
}
