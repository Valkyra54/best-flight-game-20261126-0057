// DELTA POST — configuration. Every magic number, balance value and asset
// path lives here; game logic never hardcodes one (threejs-game pattern).
// Units: metres, seconds, knots/feet for display only.

export const DELTA_POST = {
  title: 'DELTA POST',
  subtitle: 'Seaplane mail runs on the river delta at dawn',
  seed: 20261126,
  world: {
    size: 2400, // playable square, metres (x and z from -1200 to +1200)
    waterLevel: 0,
    riverWidth: 130,
    riverBendAmp1: 180,
    riverBendFreq1: 0.0016,
    riverBendAmp2: 90,
    riverBendFreq2: 0.004,
    riverBendPhase2: 1.7,
    hillHeight: 62,
    bankHeight: 9,
    terrainSegments: 128,
  },
  flight: {
    maxThrustAccel: 14, // m/s^2 at full throttle
    dragK: 0.0035, // drag = dragK * speed^2
    stallSpeed: 26, // m/s — below this the wing quits
    maxSpeed: 78, // m/s structural-ish cap
    pitchRate: 0.55, // rad/s at full elevator
    rollRate: 1.25, // rad/s at full aileron
    rollLevelRate: 0.55, // rad/s auto-levelling when no aileron input
    gravity: 9.81,
    crosswind: { x: 3.1, z: 0, gustAmp: 0.9, gustFreq: 0.11 }, // m/s, from the west
    floatsTouchY: 0.35,
    crashVerticalSpeed: 8, // m/s down at water contact = crash
    crashSpeed: 62, // m/s horizontal at water contact = crash
    crashRoll: 0.5, // rad of bank at touchdown = crash
  },
  fuel: {
    start: 100,
    baseBurn: 0.08, // units/s
    throttleBurn: 0.55, // units/s at full throttle
    lowWarn: 25,
    criticalWarn: 12,
  },
  hull: {
    start: 100,
    terrainHit: 100, // hitting land is always fatal
    hardWater: 60,
  },
  missions: {
    ringCount: 6,
    ringRadius: 14,
    ringScore: 100,
    dropMaxAltFt: 130,
    dropMaxSpeedKt: 95,
    dropRadiusM: 25,
    dropScore: 300,
    dropMissPenalty: 50,
    dropMaxAttempts: 3,
    runwayHeadingDeg: 15, // water lane runs south, following the river bend
    // (from riverX(850) to riverX(1150): atan2(82, 300) = ~15 deg)
    runwayLength: 300,
    runwayWidth: 60,
    touchdownZoneStart: 40, // metres past threshold that count as the zone
    touchdownZoneEnd: 180,
    landingScores: { S: 500, A: 400, B: 300, C: 150 },
    timeBonusCap: 240, // seconds; each second under the cap is +1
    fuelBonusPerUnit: 2,
  },
  camera: {
    chaseDistance: 13,
    chaseHeight: 3.4,
    chaseLagRate: 5.5, // 1 - exp(-rate*dt) smoothing (camera-systems)
    cockpitOffset: { x: 0, y: 1.15, z: 1.6 },
    towerPosition: { x: 210, y: 26, z: 1180 },
    fov: 62,
    fovSpeedStretch: 10, // extra degrees at max speed
    near: 0.1,
    far: 12000,
  },
  hud: {
    referenceWidth: 1280,
    referenceHeight: 720,
  },
  audio: {
    masterVolume: 0.5,
  },
  // Dawn sun: low in the east, warm. Elevation 7 degrees, azimuth 90 (east).
  sun: { elevationDeg: 7, azimuthDeg: 92, turbidity: 4, rayleigh: 2.0 },
  colors: {
    dawnSkyTop: 0x2e4a7a,
    dawnHorizon: 0xffb36b,
    water: 0x2e5f6e,
    fog: 0xf2a56b,
    planeRed: 0xc23b22,
    planeCream: 0xf2e3c6,
    planeDark: 0x2b2b30,
    ringGold: 0xffc93c,
    ringNext: 0xffd76a,
    buoyOrange: 0xff6b1a,
    dockWood: 0x8a6b46,
  },
};

export const MISSION_NAMES = [
  'RING SLALOM',
  'MAIL DROP',
  'PRECISION LANDING',
];

export const GRADE_ORDER = ['S', 'A', 'B', 'C', 'D'];
