// DELTA POST — the three-mission sortie state machine. One job: run the
// mission sequence (ring slalom -> mail drop -> precision landing), score
// it, and produce the debrief. Flight, grading and fuel live elsewhere.

import * as THREE from 'three';
import { DELTA_POST, MISSION_NAMES } from './config.js';
import { state, Phases, MissionIds, setMessage, resetState } from './gameState.js';
import { emit, Events } from './eventBus.js';
import { RING_POSITIONS, DOCK_POS, worldRefs, isWaterAt } from './world.js';
import { gradeTouchdown, landingSummary } from './landingGrader.js';
import { fuelBonus } from './fuelSystem.js';
import { resetFlight } from './flight.js';
import { resetFuel } from './fuelSystem.js';

const M = DELTA_POST.missions;
const KT = 1.94384; // 1 m/s in knots
const FT = 3.28084; // 1 m in feet

let packageFallTime = 0;
let packageVel = new THREE.Vector3();
let packageStart = new THREE.Vector3();

export function startSortie(seed = DELTA_POST.seed) {
  resetState(seed);
  resetFlight();
  resetFuel();
  packageFallTime = 0;
  state.phase = Phases.FLYING;
  state.missionStartTime = 0;
  for (const ring of worldRefs.rings) ring.passed = false;
  if (worldRefs.packageMesh) worldRefs.packageMesh.visible = false;
  emit(Events.SORTIE_START, {});
  emit(Events.MISSION_START, { mission: 0, name: MISSION_NAMES[0] });
  setMessage('MISSION 1 — RING SLALOM: fly through all 6 rings', 5);
}

export function distanceToNextRing() {
  if (state.missionIndex !== MissionIds.RINGS) return 0;
  const ring = RING_POSITIONS[state.ringGate];
  if (!ring) return 0;
  return Math.hypot(
    ring.x - state.position.x,
    ring.y - state.position.y,
    ring.z - state.position.z,
  );
}

export function distanceToDock() {
  return Math.hypot(
    DOCK_POS.x - state.position.x,
    DOCK_POS.z - state.position.z,
  );
}

function advanceMission() {
  if (state.missionIndex === MissionIds.RINGS) state.ringTime = state.elapsed;
  state.missionIndex += 1;
  if (state.missionIndex === MissionIds.DROP) {
    emit(Events.MISSION_COMPLETE, { mission: 0, name: MISSION_NAMES[0] });
    emit(Events.MISSION_START, { mission: 1, name: MISSION_NAMES[1] });
    setMessage('MISSION 2 — MAIL DROP: slow to under 95 kt, below 130 ft, press SPACE over the dock', 6);
  } else if (state.missionIndex === MissionIds.LANDING) {
    emit(Events.MISSION_COMPLETE, { mission: 1, name: MISSION_NAMES[1] });
    emit(Events.MISSION_START, { mission: 2, name: MISSION_NAMES[2] });
    setMessage('MISSION 3 — PRECISION LANDING: follow the PAPI, 2 red + 2 white, land between the buoys', 6);
  }
}

function checkRings() {
  const ring = RING_POSITIONS[state.ringGate];
  if (!ring) return;
  const d = Math.hypot(
    ring.x - state.position.x,
    ring.y - state.position.y,
    ring.z - state.position.z,
  );
  if (d <= M.ringRadius) {
    worldRefs.rings[state.ringGate].passed = true;
    state.ringsPassed += 1;
    state.ringGate += 1;
    state.score += M.ringScore;
    emit(Events.RING_PASSED, { ring: state.ringsPassed, total: M.ringCount, score: state.score });
    if (state.ringsPassed >= M.ringCount) {
      advanceMission();
    } else {
      setMessage(`RING ${state.ringsPassed} OF ${M.ringCount} — ${M.ringScore} PTS`, 2.5);
    }
  }
}

export function requestDrop() {
  if (state.missionIndex !== MissionIds.DROP) return;
  if (state.packageState !== 'idle') return;
  if (state.dropAttempts >= M.dropMaxAttempts) return;
  const altFt = state.altitudeAgl * FT;
  const speedKt = state.speed * KT;
  if (altFt > M.dropMaxAltFt) {
    setMessage(`TOO HIGH — drop below ${M.dropMaxAltFt} ft (now ${Math.round(altFt)} ft)`, 3);
    return;
  }
  if (speedKt > M.dropMaxSpeedKt) {
    setMessage(`TOO FAST — slow under ${M.dropMaxSpeedKt} kt (now ${Math.round(speedKt)} kt)`, 3);
    return;
  }
  state.dropAttempts += 1;
  state.packageState = 'falling';
  packageFallTime = 0;
  packageStart.set(state.position.x, state.position.y - 1.5, state.position.z);
  packageVel.set(state.speed * Math.sin(state.heading), 0, state.speed * Math.cos(state.heading));
  if (worldRefs.packageMesh) {
    worldRefs.packageMesh.visible = true;
    worldRefs.packageMesh.position.copy(packageStart);
  }
  emit(Events.MAIL_DROPPED, { attempt: state.dropAttempts });
}

function updatePackage(dt) {
  if (state.packageState !== 'falling') return;
  packageFallTime += dt;
  // Chute opens after 1.0 s; terminal sink ~6 m/s under canopy. The chute
  // also brakes the package horizontally, so it lands roughly 30-40 m past
  // the release point — release just short of the dock.
  const sink = packageFallTime < 1.0 ? 9.81 * packageFallTime : 6;
  const drag = Math.exp(-1.2 * dt);
  packageVel.x *= drag;
  packageVel.z *= drag;
  packageVel.y = -sink;
  packageStart.x += (packageVel.x + state.windX * 0.6) * dt;
  packageStart.y += packageVel.y * dt;
  packageStart.z += packageVel.z * dt;
  if (worldRefs.packageMesh) {
    worldRefs.packageMesh.position.copy(packageStart);
    worldRefs.packageMesh.rotation.y += dt * 0.8;
  }
  if (packageStart.y <= 1.1) {
    const target = new THREE.Vector3(DOCK_POS.x + 1.5, 0, DOCK_POS.z + 1.2);
    const miss = Math.hypot(packageStart.x - target.x, packageStart.z - target.z);
    if (miss <= M.dropRadiusM) {
      state.packageState = 'delivered';
      state.dropDelivered = true;
      state.dropMiss = Math.round(miss);
      state.score += M.dropScore;
      emit(Events.MAIL_DELIVERED, { score: state.score, miss: Math.round(miss) });
      setMessage(`MAIL DELIVERED — ${M.dropScore} PTS (miss ${Math.round(miss)} m)`, 4);
      advanceMission();
    } else {
      state.packageState = 'splashed';
      state.score = Math.max(0, state.score - M.dropMissPenalty);
      emit(Events.MAIL_MISSED, { miss: Math.round(miss), attempts: state.dropAttempts });
      setMessage(`SPLASH — missed by ${Math.round(miss)} m (−${M.dropMissPenalty} pts). ${M.dropMaxAttempts - state.dropAttempts} tries left`, 4);
      if (worldRefs.packageMesh) worldRefs.packageMesh.visible = false;
      state.packageState = 'idle';
      if (state.dropAttempts >= M.dropMaxAttempts) {
        setMessage('OUT OF MAIL — heading to the runway anyway', 4);
        advanceMission();
      }
    }
  }
}

function buildDebrief(reason, landingResult = null) {
  const timeBonus = Math.max(0, Math.round(M.timeBonusCap - state.elapsed));
  const fuelPts = fuelBonus();
  const total = state.score + (landingResult ? landingResult.points : 0) + timeBonus + fuelPts;
  const lines = [
    `Rings: ${state.ringsPassed}/${M.ringCount} × ${M.ringScore} pts`,
    `Mail drop: ${state.dropDelivered ? `delivered +${M.dropScore}` : 'not delivered +0'}`,
  ];
  // Published 1-3★ thresholds per mission (Drone Range pattern — the
  // same thresholds are printed on the title screen). Display only:
  // stars never change the S/A/B/C/D grade or the points.
  const star = (n) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n));
  const ringStars = state.ringTime == null ? 0
    : (state.ringTime <= 70 ? 3 : state.ringTime <= 90 ? 2 : 1);
  const dropStars = !state.dropDelivered ? 0
    : (state.dropMiss <= 5 ? 3 : state.dropMiss <= 10 ? 2 : 1);
  const landStars = !landingResult ? 0
    : (landingResult.grade === 'S' || landingResult.grade === 'A' ? 3
      : landingResult.grade === 'B' ? 2 : 1);
  lines.push(`Rings ${star(ringStars)} — ${state.ringTime != null ? `${Math.round(state.ringTime)} s` : (state.ringsPassed >= M.ringCount ? 'time not recorded' : 'not finished')} · ★★★ ≤ 70 s`);
  lines.push(`Mail ${star(dropStars)} — ${state.dropDelivered ? `miss ${state.dropMiss} m` : 'not delivered'} · ★★★ ≤ 5 m`);
  if (landingResult) lines.push(`Landing ${star(landStars)} — grade ${landingResult.grade} · ★★★ = A`);
  if (state.lowPassCount > 0) lines.push(`Low passes: ${state.lowPassCount} × 25 pts`);
  if (landingResult) {
    lines.push(`Landing ${landingResult.grade} +${landingResult.points}`);
    lines.push(...landingSummary(landingResult));
  }
  lines.push(`Time bonus +${timeBonus} (${Math.round(state.elapsed)} s)`);
  lines.push(`Fuel bonus +${fuelPts} (${Math.round(state.fuel)} units left)`);
  const grade = landingResult ? landingResult.grade : (state.crashed ? 'D' : 'C');
  state.debrief = {
    reason,
    grade,
    total,
    score: state.score,
    landingPoints: landingResult ? landingResult.points : 0,
    timeBonus,
    fuelBonus: fuelPts,
    elapsed: Math.round(state.elapsed),
    fuelLeft: Math.round(state.fuel),
    lines,
  };
  state.phase = Phases.DEBRIEF;
  emit(Events.DEBRIEF, state.debrief);
}

export function onTouchdown(payload) {
  if (state.phase !== Phases.FLYING) return;
  const result = gradeTouchdown(payload);
  state.touchdown = result;
  // NOTE: do NOT re-emit TOUCHDOWN here — flight.js already emitted it
  // and this handler is subscribed to it; re-emitting recurses forever.
  if (state.missionIndex === MissionIds.LANDING) {
    buildDebrief('Landed. Sortie complete.', result);
  } else if (state.outOfFuel) {
    buildDebrief('Out of fuel — ditched on the water. The mail is late, the pilot is fine.', result);
  } else {
    // Early water contact before the landing mission: a ditch, sortie over.
    buildDebrief('Ditched early — the sortie ends on the water.', result);
  }
}

export function onCrash(payload) {
  if (state.phase !== Phases.FLYING) return;
  state.crashed = true;
  state.crashReason = payload.reason;
  // NOTE: do NOT re-emit CRASH here — flight.js already emitted it and
  // this handler is subscribed to it; re-emitting recurses forever.
  buildDebrief(payload.reason, null);
}

export function updateMissions(dt) {
  if (state.phase !== Phases.FLYING) return;
  state.elapsed += dt;
  if (state.missionIndex === MissionIds.RINGS) checkRings();
  if (state.missionIndex === MissionIds.DROP) updatePackage(dt);
  // Risk/reward (X hunt, wingsuit lesson): a low pass through the reeds
  // — fast, low, over land — pays +25, at most once per 10 s. One `if`,
  // one debrief line; the flight model never sees it.
  if (state.missionIndex <= 1 && state.altitudeAgl < 8 && state.speed > 30
      && !isWaterAt(state.position.x, state.position.z)
      && state.elapsed - state.lastLowPassAt > 10) {
    state.lastLowPassAt = state.elapsed;
    state.lowPassCount += 1;
    state.lowPassPoints += 25;
    state.score += 25;
    setMessage('LOW PASS THROUGH THE REEDS +25', 2.5);
  }
}
