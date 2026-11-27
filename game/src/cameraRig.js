// DELTA POST — camera rig. One job: place the camera. Three modes
// (chase / cockpit / tower), exponential smoothing (camera-systems:
// 1 - exp(-rate*dt), never a fixed lerp), deadzone + look-ahead on the
// chase cam, trauma-based shake layered on top.

import * as THREE from 'three';
import { DELTA_POST } from './config.js';
import { state, Phases } from './gameState.js';
import { forwardVector } from './flight.js';
import { on, Events } from './eventBus.js';

const C = DELTA_POST.camera;

const chasePos = new THREE.Vector3(-247, 125, -1015);
const chaseLook = new THREE.Vector3(-247, 120, -1000);
let trauma = 0;
let fovCurrent = C.fov;

export function addTrauma(amount) {
  trauma = Math.min(1, trauma + amount);
}

export function initCamera() {
  on(Events.CRASH, () => addTrauma(0.9));
  on(Events.TOUCHDOWN, () => addTrauma(0.35));
  on(Events.MAIL_DELIVERED, () => addTrauma(0.22)); // small kick + shake on a hit
  on(Events.RING_PASSED, () => addTrauma(0.08));
}

export function updateCamera(camera, dt, timeSeconds) {
  const p = state.position;
  const forward = forwardVector(new THREE.Vector3());

  if (state.cameraMode === 1) {
    // Cockpit: fixed to the airframe, looking down the nose.
    const off = C.cockpitOffset;
    const right = new THREE.Vector3(Math.cos(state.heading), 0, -Math.sin(state.heading));
    camera.position.set(
      p.x + right.x * off.x + forward.x * off.z,
      p.y + off.y,
      p.z + right.z * off.x + forward.z * off.z,
    );
    camera.lookAt(
      p.x + forward.x * 60,
      p.y + forward.y * 60 - 2,
      p.z + forward.z * 60,
    );
  } else if (state.cameraMode === 2) {
    // Tower: fixed at the runway, tracking the plane.
    camera.position.set(C.towerPosition.x, C.towerPosition.y, C.towerPosition.z);
    camera.lookAt(p.x, p.y, p.z);
  } else if (state.cameraMode === 3) {
    // Hero: low over the water, looking into the dawn sun. Staging-only
    // (the C key cycles 0..2); the frozen shot sim keeps it static. The
    // camera sits ~18 m west of the plane, just above the water, so the
    // plane fills ~28% of the frame width (wingspan 11.2 m seen from
    // below) instead of ~8%; the look point stays ahead and south of
    // the plane so the sun glow (upper left), the flight-path marker
    // and the runway buoys (right edge) all stay in frame, and the low
    // angle into the sun is kept. Camera height 7 m (not 3.6 m): at
    // water level the 7-degree dawn sun sits behind the east bank and
    // the disc never shows — at 7 m it clears the bank crest.
    camera.position.set(p.x - 17, 7, p.z - 7);
    camera.lookAt(p.x + 35, p.y + 2, p.z + 22);
  } else {
    // Chase: behind and above, with look-ahead and a deadzone so small
    // corrections do not whip the camera around.
    const desired = new THREE.Vector3(
      p.x - forward.x * C.chaseDistance,
      p.y - forward.y * C.chaseDistance + C.chaseHeight,
      p.z - forward.z * C.chaseDistance,
    );
    const k = 1 - Math.exp(-C.chaseLagRate * dt);
    chasePos.lerp(desired, k);
    // Keep the camera out of the water and the terrain.
    chasePos.y = Math.max(chasePos.y, 2.5);
    const lookDesired = new THREE.Vector3(
      p.x + forward.x * 28,
      p.y + forward.y * 28,
      p.z + forward.z * 28,
    );
    const kLook = 1 - Math.exp(-8 * dt);
    chaseLook.lerp(lookDesired, kLook);
    camera.position.copy(chasePos);
    camera.lookAt(chaseLook);
  }

  // Trauma shake: decays, applied as a small offset on top of the follow.
  if (trauma > 0.001) {
    trauma = Math.max(0, trauma - dt * 1.4);
    const shake = trauma * trauma; // game-feel: trauma^2
    const t = timeSeconds * 47;
    camera.position.x += Math.sin(t * 1.1) * shake * 0.5;
    camera.position.y += Math.sin(t * 1.7) * shake * 0.4;
    camera.position.z += Math.cos(t * 1.3) * shake * 0.5;
  }

  // FOV stretches a little with speed — the sense of going fast.
  const speedFrac = THREE.MathUtils.clamp(state.speed / DELTA_POST.flight.maxSpeed, 0, 1);
  const targetFov = C.fov + speedFrac * C.fovSpeedStretch;
  fovCurrent += (targetFov - fovCurrent) * (1 - Math.exp(-4 * dt));
  if (Math.abs(camera.fov - fovCurrent) > 0.05) {
    camera.fov = fovCurrent;
    camera.updateProjectionMatrix();
  }
}

export function resetCamera() {
  chasePos.set(-247, 125, -1015);
  chaseLook.set(-247, 120, -1000);
  trauma = 0;
  fovCurrent = C.fov;
}
