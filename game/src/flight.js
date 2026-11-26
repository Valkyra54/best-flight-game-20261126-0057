// DELTA POST — arcade flight model (physics-tuning pattern: fixed step,
// speed/tick small against the thinnest obstacle, damping, no hidden
// state). One job: turn intents + throttle + fuel into position, attitude
// and speed. No rendering, no missions, no HUD here.

import * as THREE from 'three';
import { DELTA_POST } from './config.js';
import { state, Phases } from './gameState.js';
import { input } from './input.js';
import { emit, Events } from './eventBus.js';
import { terrainHeightAt, isWaterAt } from './world.js';
import { stepFuel } from './fuelSystem.js';

const F = DELTA_POST.flight;
const FIXED_DT = 1 / 60;

let windPhase = 0;

export function resetFlight() {
  windPhase = 0;
}

export function forwardVector(out = new THREE.Vector3()) {
  const cp = Math.cos(state.pitch);
  return out.set(
    Math.sin(state.heading) * cp,
    Math.sin(state.pitch),
    Math.cos(state.heading) * cp,
  );
}

// Crosswind with a slow gust, active through the whole sortie and felt
// most on the landing run.
export function currentWind(timeSeconds) {
  const gust = Math.sin(timeSeconds * F.crosswind.gustFreq * Math.PI * 2) * F.crosswind.gustAmp;
  return F.crosswind.x + gust;
}

export function stepFlight(dt) {
  if (state.phase !== Phases.FLYING) return;

  windPhase += dt;
  state.windX = currentWind(windPhase);

  // --- Throttle and fuel (fuelSystem owns the burn + warnings) ---
  state.throttle = THREE.MathUtils.clamp(
    state.throttle + input.throttleDelta * dt * 0.7,
    0,
    1,
  );
  stepFuel(dt);
  const thrust = state.outOfFuel ? 0 : state.throttle * F.maxThrustAccel;

  // --- Control authority falls off below stall speed (mushy controls). ---
  const authority = state.speed < F.stallSpeed
    ? 0.35 + 0.65 * (state.speed / F.stallSpeed)
    : 1;

  // --- Pitch and roll ---
  state.pitch = THREE.MathUtils.clamp(
    state.pitch + input.pitch * F.pitchRate * authority * dt,
    -0.42,
    0.5,
  );
  state.roll += input.roll * F.rollRate * authority * dt;
  state.roll = THREE.MathUtils.clamp(state.roll, -1.1, 1.1);
  if (input.roll === 0) {
    // Gentle auto-levelling so the player is not fighting the wing.
    const levelStep = F.rollLevelRate * dt;
    if (Math.abs(state.roll) <= levelStep) state.roll = 0;
    else state.roll -= Math.sign(state.roll) * levelStep;
  }

  // --- Bank-to-turn: a banked wing pulls the nose around. ---
  const yawRate = -F.gravity * Math.tan(state.roll) / Math.max(state.speed, 15);
  state.heading += yawRate * dt;

  // --- Speed: thrust minus drag, gravity along the flight path. ---
  const drag = F.dragK * state.speed * state.speed;
  const gravityAlongPath = -F.gravity * Math.sin(state.pitch);
  state.speed = THREE.MathUtils.clamp(
    state.speed + (thrust - drag + gravityAlongPath) * dt,
    0,
    F.maxSpeed,
  );

  // --- Stall: below stall speed the wing stops flying and the nose drops. ---
  const stalled = state.speed < F.stallSpeed;
  if (stalled) {
    state.pitch -= 0.25 * dt * (1 - state.speed / F.stallSpeed);
    state.pitch = Math.max(state.pitch, -0.42);
  }

  // --- Position: forward speed + crosswind drift + stall sink. ---
  const forward = forwardVector();
  const sink = stalled ? (1 - state.speed / F.stallSpeed) * 6 : 0;
  const prevY = state.position.y;
  state.position.x += (forward.x * state.speed + state.windX) * dt;
  state.position.y += (forward.y * state.speed - sink) * dt;
  state.position.z += forward.z * state.speed * dt;
  state.verticalSpeed = (state.position.y - prevY) / dt;
  state.groundSpeed = Math.hypot(forward.x * state.speed + state.windX, forward.z * state.speed);

  // Soft world edge: steer the player back instead of a hard wall.
  const half = DELTA_POST.world.size / 2;
  if (Math.abs(state.position.x) > half || Math.abs(state.position.z) > half) {
    state.position.x = THREE.MathUtils.clamp(state.position.x, -half, half);
    state.position.z = THREE.MathUtils.clamp(state.position.z, -half, half);
    state.heading += Math.PI; // turn around, gently
    state.heading = ((state.heading + Math.PI) % (Math.PI * 2)) - Math.PI;
  }

  // --- Altitude above ground/water ---
  const ground = terrainHeightAt(state.position.x, state.position.z);
  state.altitudeAgl = state.position.y - Math.max(ground, 0);

  // --- Contact: water or terrain ---
  if (state.position.y <= F.floatsTouchY && isWaterAt(state.position.x, state.position.z)) {
    handleWaterContact();
  } else if (state.position.y <= ground) {
    handleTerrainContact(ground);
  }
}

function handleWaterContact() {
  const vs = Math.abs(state.verticalSpeed);
  const aligned = Math.abs(state.roll) <= F.crashRoll;
  const gentle = vs <= F.crashVerticalSpeed && state.speed <= F.crashSpeed;
  state.position.y = F.floatsTouchY;
  if (gentle && aligned) {
    emit(Events.TOUCHDOWN, {
      verticalSpeed: vs,
      speed: state.speed,
      heading: state.heading,
      roll: state.roll,
    });
  } else {
    state.hull = 0;
    emit(Events.CRASH, {
      reason: vs > F.crashVerticalSpeed
        ? 'Too hard on the water — the hull broke apart.'
        : state.speed > F.crashSpeed
          ? 'Too fast at touchdown — the floats dug in.'
          : 'Touched down banked — a float caught and flipped the plane.',
      verticalSpeed: vs,
    });
  }
}

function handleTerrainContact(ground) {
  state.position.y = ground;
  state.hull = 0;
  emit(Events.CRASH, {
    reason: 'Flew into the delta bank — the mail run ends in the mud.',
    verticalSpeed: Math.abs(state.verticalSpeed),
  });
}

export { FIXED_DT };
