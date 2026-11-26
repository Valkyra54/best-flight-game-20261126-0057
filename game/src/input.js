// DELTA POST — keyboard input. One job: turn keys into intents that the
// flight model consumes. No game logic lives here.

import { emit, Events } from './eventBus.js';
import { state, Phases } from './gameState.js';

const keys = new Set();

// Intent object read by flight.js every fixed step. Values -1..1.
export const input = {
  pitch: 0, // -1 = nose down, +1 = nose up
  roll: 0, // -1 = bank left, +1 = bank right
  throttleDelta: 0, // -1 = less, +1 = more
};

function recomputeIntents() {
  const up = keys.has('ArrowUp') || keys.has('KeyW');
  const down = keys.has('ArrowDown') || keys.has('KeyS');
  const left = keys.has('ArrowLeft') || keys.has('KeyA');
  const right = keys.has('ArrowRight') || keys.has('KeyD');
  const throttleUp = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const throttleDown = keys.has('ControlLeft') || keys.has('ControlRight');
  input.pitch = (up ? 1 : 0) + (down ? -1 : 0);
  input.roll = (right ? 1 : 0) + (left ? -1 : 0);
  input.throttleDelta = (throttleUp ? 1 : 0) + (throttleDown ? -1 : 0);
}

export function initInput() {
  window.addEventListener('keydown', (event) => {
    // Keep the page from scrolling on arrows/space.
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
    if (event.repeat) return;
    keys.add(event.code);

    if (event.code === 'Space') {
      if (state.phase === Phases.FLYING) emit('drop-requested');
      return;
    }
    if (event.code === 'KeyC') {
      state.cameraMode = (state.cameraMode + 1) % 3;
      emit(Events.CAMERA_CHANGED, { mode: state.cameraMode });
      return;
    }
    if (event.code === 'KeyM') {
      state.muted = !state.muted;
      emit(Events.AUDIO_TOGGLED, { muted: state.muted });
      return;
    }
    if (event.code === 'KeyP' || event.code === 'Escape') {
      if (state.phase === Phases.FLYING) {
        state.phase = Phases.PAUSED;
        emit(Events.PAUSE_CHANGED, { paused: true });
      } else if (state.phase === Phases.PAUSED) {
        state.phase = Phases.FLYING;
        emit(Events.PAUSE_CHANGED, { paused: false });
      }
      return;
    }
    if (event.code === 'Enter') {
      if (state.phase === Phases.TITLE || state.phase === Phases.DEBRIEF) {
        emit('start-requested');
      }
      return;
    }
    recomputeIntents();
  });

  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
    recomputeIntents();
  });

  // Losing the window must not leave a key stuck on.
  window.addEventListener('blur', () => {
    keys.clear();
    input.pitch = 0;
    input.roll = 0;
    input.throttleDelta = 0;
  });

  recomputeIntents();
}

export function clearInput() {
  keys.clear();
  input.pitch = 0;
  input.roll = 0;
  input.throttleDelta = 0;
}
