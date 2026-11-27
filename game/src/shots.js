// DELTA POST — screenshot staging. One job: put the game into a fixed,
// photogenic state for the four contact-sheet shots (?shot=name&seed=1).
// Every staged state is a state the real game can reach; the hook only
// pre-positions it so a screenshot is reproducible. The sim is frozen
// while a shot is staged.

import * as THREE from 'three';
import { DELTA_POST } from './config.js';
import { state, Phases, MissionIds, resetState } from './gameState.js';
import { riverX, worldRefs, terrainHeightAt } from './world.js';
import { resetFlight } from './flight.js';
import { resetFuel } from './fuelSystem.js';
import { emit, Events } from './eventBus.js';

export const SHOT_NAMES = ['approach', 'rings', 'drop', 'debrief'];

function baseStaging(seed) {
  resetState(seed);
  resetFlight();
  resetFuel();
  for (const ring of worldRefs.rings) ring.passed = false;
  if (worldRefs.packageMesh) worldRefs.packageMesh.visible = false;
  state.phase = Phases.FLYING;
  state.cameraMode = 0;
  state.windX = 3.1; // steady crosswind from the west, as in flight
}

function setPlane(x, y, z, headingDeg, speed, throttle, fuel) {
  state.position.x = x;
  state.position.y = y;
  state.position.z = z;
  state.heading = THREE.MathUtils.degToRad(headingDeg);
  state.pitch = 0.02;
  state.roll = 0;
  state.speed = speed;
  state.throttle = throttle;
  state.fuel = fuel;
  state.verticalSpeed = -1.2;
  // altitudeAgl is normally maintained by the flight step; staging is
  // frozen, so compute it here or the HUD shows the stale start value.
  state.altitudeAgl = y - Math.max(terrainHeightAt(x, z), 0);
}

export function stageShot(name, seed = 1) {
  baseStaging(seed);
  const runwayHeading = DELTA_POST.missions.runwayHeadingDeg;

  if (name === 'approach') {
    // Final approach, on the 3-degree glide: 2 red + 2 white on the PAPI,
    // water runway and buoys ahead. Staged 180 m out so the threshold and
    // PAPI read clearly — from the low hero camera over the water,
    // looking into the dawn sun (camera mode 3), with the minimap's PAPI
    // dots and the sun glow both in frame.
    state.missionIndex = MissionIds.LANDING;
    state.ringsPassed = 6;
    state.ringGate = 6;
    state.dropDelivered = true;
    state.score = 900;
    state.elapsed = 165;
    for (const ring of worldRefs.rings) ring.passed = true;
    setPlane(riverX(670), 9.5, 670, runwayHeading, 42, 0.42, 45);
    state.cameraMode = 3;
  } else if (name === 'rings') {
    // Mid-slalom: two rings done, third ring dead ahead over the river.
    state.missionIndex = MissionIds.RINGS;
    state.ringsPassed = 2;
    state.ringGate = 2;
    state.score = 200;
    state.elapsed = 48;
    worldRefs.rings[0].passed = true;
    worldRefs.rings[1].passed = true;
    // Heading 30 deg follows the river bend south toward ring 3.
    setPlane(riverX(-450), 42, -450, 30, 48, 0.6, 78);
  } else if (name === 'drop') {
    // Mail drop: low over the dock, package just released, chute open.
    state.missionIndex = MissionIds.DROP;
    state.ringsPassed = 6;
    state.ringGate = 6;
    state.score = 600;
    state.elapsed = 112;
    for (const ring of worldRefs.rings) ring.passed = true;
    // Heading 0 deg = due south, straight at the dock.
    setPlane(riverX(470), 30, 470, 0, 38, 0.45, 62);
    state.packageState = 'falling';
    if (worldRefs.packageMesh) {
      // Offset right of the flight path so the plane does not hide it.
      worldRefs.packageMesh.visible = true;
      worldRefs.packageMesh.position.set(riverX(500) + 12, 20, 505);
    }
  } else if (name === 'debrief') {
    // Finished sortie: grade A debrief over the runway.
    state.missionIndex = MissionIds.LANDING;
    state.ringsPassed = 6;
    state.ringGate = 6;
    state.dropDelivered = true;
    state.score = 900;
    state.elapsed = 178;
    state.fuel = 31;
    for (const ring of worldRefs.rings) ring.passed = true;
    setPlane(riverX(1000), 0.35, 1000, runwayHeading, 0, 0, 31);
    state.debrief = {
      reason: 'Landed. Sortie complete.',
      grade: 'A',
      total: 1562,
      score: 900,
      landingPoints: 400,
      timeBonus: 62,
      fuelBonus: 62,
      elapsed: 178,
      fuelLeft: 31,
      lines: [
        'Rings: 6/6 × 100 pts',
        'Mail drop: delivered +300',
        'Rings ★★★ — 62 s · ★★★ ≤ 70 s',
        'Mail ★★★ — miss 4 m · ★★★ ≤ 5 m',
        'Landing ★★★ — grade A · ★★★ = A',
        'Landing A +400',
        'SINK 2.1 m/s — S ✓',
        'CENTRE 6 m off — S ✓',
        'SPEED 38 m/s — S ✓',
        'TOUCHDOWN in the zone ✓',
        'HEADING 4.2° — S',
        'Fuel reserve bonus: +1 grade.',
        'Time bonus +62 (178 s)',
        'Fuel bonus +62 (31 units left)',
      ],
    };
    state.phase = Phases.DEBRIEF;
    emit(Events.DEBRIEF, state.debrief);
    return;
  }
  // Freeze the sim: the frame is staged, not simulated.
  state.frozen = true;
  return;
}

export function isShotMode() {
  return new URLSearchParams(window.location.search).has('shot');
}
