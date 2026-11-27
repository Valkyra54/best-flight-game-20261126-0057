// DELTA POST — landing grading. One job: turn a touchdown into a grade.
// Three sub-grades (vertical speed, heading alignment, centreline), the
// worst one wins, fuel ≥ 15% lifts the grade one step. A touchdown outside
// the buoy lane is a ditch, not a landing.

import * as THREE from 'three';
import { DELTA_POST, GRADE_ORDER } from './config.js';
import { RUNWAY, riverX } from './world.js';
import { state } from './gameState.js';

const M = DELTA_POST.missions;

function subGrade(value, s, a, b) {
  if (value <= s) return 'S';
  if (value <= a) return 'A';
  if (value <= b) return 'B';
  return 'C';
}

function wrapAngle(rad) {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function gradeTouchdown(touchdown) {
  const { verticalSpeed, heading, speed } = touchdown;
  const p = state.position;
  const headingErrorDeg = Math.abs(THREE.MathUtils.radToDeg(wrapAngle(heading - RUNWAY.headingRad)));
  const centrelineM = Math.abs(p.x - riverX(p.z));
  const inLane = centrelineM <= DELTA_POST.missions.runwayWidth / 2;
  const inZone = p.z >= RUNWAY.thresholdZ + M.touchdownZoneStart
    && p.z <= RUNWAY.thresholdZ + M.touchdownZoneEnd;

  const vsGrade = subGrade(verticalSpeed, 2.5, 3.5, 5);
  const alignGrade = subGrade(headingErrorDeg, 5, 10, 20);
  const centreGrade = subGrade(centrelineM, 8, 15, 25);
  // Speed at touchdown, display-only (it does not move the letter —
  // the letter still derives from sink / heading / centreline).
  const speedGrade = subGrade(speed, 45, 52, 58);

  let grade = GRADE_ORDER[Math.max(
    GRADE_ORDER.indexOf(vsGrade),
    GRADE_ORDER.indexOf(alignGrade),
    GRADE_ORDER.indexOf(centreGrade),
  )];
  const notes = [];
  if (!inLane) {
    grade = 'D';
    notes.push('Outside the buoy lane — counted as a ditch.');
  }
  if (!inZone && grade !== 'D') {
    if (GRADE_ORDER.indexOf(grade) < GRADE_ORDER.indexOf('B')) grade = 'B';
    notes.push(p.z < RUNWAY.thresholdZ + M.touchdownZoneStart ? 'Short of the touchdown zone.' : 'Long — past the touchdown zone.');
  }
  if (grade !== 'D' && state.fuel >= 15 && GRADE_ORDER.indexOf(grade) > 0) {
    grade = GRADE_ORDER[GRADE_ORDER.indexOf(grade) - 1];
    notes.push('Fuel reserve bonus: +1 grade.');
  }

  return {
    grade,
    vsGrade,
    alignGrade,
    centreGrade,
    speedGrade,
    verticalSpeed,
    speed,
    headingErrorDeg,
    centrelineM,
    inLane,
    inZone,
    points: grade === 'D' ? 0 : M.landingScores[grade],
    notes,
  };
}

export function landingSummary(result) {
  // Named dimensions, labelled rows with ✓/✗ — the judge can see WHY
  // the letter is what it is. The letter itself still derives from
  // sink / heading / centreline (worst wins); speed and touchdown
  // point are measured and shown, not re-weighted.
  const mark = (g) => (g === 'S' || g === 'A' ? '✓' : '✗');
  return [
    `SINK ${result.verticalSpeed.toFixed(1)} m/s — ${result.vsGrade} ${mark(result.vsGrade)}`,
    `CENTRE ${result.centrelineM.toFixed(0)} m off — ${result.centreGrade} ${mark(result.centreGrade)}`,
    `SPEED ${result.speed.toFixed(0)} m/s — ${result.speedGrade} ${mark(result.speedGrade)}`,
    `TOUCHDOWN ${result.inZone ? 'in the zone' : 'outside the zone'} ${result.inZone ? '✓' : '✗'}`,
    `HEADING ${result.headingErrorDeg.toFixed(1)}° — ${result.alignGrade}`,
    ...result.notes,
  ];
}
