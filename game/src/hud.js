// DELTA POST — HUD. One job: draw every flight instrument and mission
// panel from the shared state. Canvas tapes + compass + minimap (drawn,
// not DOM-polling), DOM for text/bars. Event-driven where it can be:
// the checklist and banners react to mission events.

import * as THREE from 'three';
import { DELTA_POST, MISSION_NAMES } from './config.js';
import { state, Phases } from './gameState.js';
import { on, Events } from './eventBus.js';
import { drawGaugePanel } from './gauges.js';
import { riverX, riverWidthAt, RING_POSITIONS, DOCK_POS, RUNWAY } from './world.js';
import { distanceToNextRing, distanceToDock } from './missions.js';

const KT = 1.94384;
const FT = 3.28084;

const els = {};
let compassCtx;
let speedCtx;
let altCtx;
let mapCtx;
let gaugeCtx;
let lastChecklist = '';

export function initHud() {
  const ids = ['compass', 'speedTape', 'altTape', 'minimap', 'gauges', 'missions', 'score', 'time', 'message', 'fuelBar', 'fuelLabel', 'throttleBar', 'throttleLabel', 'warnBanner', 'title', 'debrief', 'pause', 'debriefBody', 'debriefTitle', 'debriefGrade', 'debriefScore', 'titleStart', 'debriefRestart'];
  for (const id of ids) els[id] = document.getElementById(id);
  compassCtx = els.compass.getContext('2d');
  speedCtx = els.speedTape.getContext('2d');
  altCtx = els.altTape.getContext('2d');
  mapCtx = els.minimap.getContext('2d');
  gaugeCtx = els.gauges.getContext('2d');

  els.titleStart.addEventListener('click', () => window.dispatchEvent(new CustomEvent('delta-start')));
  els.debriefRestart.addEventListener('click', () => window.dispatchEvent(new CustomEvent('delta-start')));
  on(Events.LOW_FUEL, ({ critical }) => {
    showWarn(critical ? 'FUEL CRITICAL — FIND WATER, NOW' : 'LOW FUEL', critical);
  });
  on(Events.FUEL_EMPTY, () => showWarn('OUT OF FUEL — GLIDE TO WATER', true));
  on(Events.DEBRIEF, () => showDebrief());
}

function showWarn(text, critical) {
  els.warnBanner.textContent = text;
  els.warnBanner.classList.toggle('critical', !!critical);
  els.warnBanner.style.display = 'block';
  setTimeout(() => {
    els.warnBanner.style.display = 'none';
  }, 4000);
}

function headingDeg() {
  // True compass bearing: heading 0 (due south, +Z) is 180 deg, east
  // (+X) is 90 deg. Bearing = 180 - psi.
  const psi = THREE.MathUtils.radToDeg(state.heading);
  return (((180 - psi) % 360) + 360) % 360;
}

function drawCompass() {
  const ctx = compassCtx;
  const w = els.compass.width;
  const h = els.compass.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(10, 14, 22, 0.55)';
  ctx.fillRect(0, 0, w, h);
  const hdg = headingDeg();
  const pxPerDeg = 4;
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  for (let d = -60; d <= 60; d += 5) {
    let deg = Math.round(hdg + d);
    deg = ((deg % 360) + 360) % 360;
    const x = w / 2 + d * pxPerDeg;
    const major = deg % 30 === 0;
    ctx.strokeStyle = major ? '#ffd76a' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, h - 6);
    ctx.lineTo(x, h - (major ? 20 : 12));
    ctx.stroke();
    if (major) {
      const label = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : String(deg).padStart(3, '0');
      ctx.fillStyle = '#f2e3c6';
      ctx.fillText(label, x, 14);
    }
  }
  // Centre caret + heading readout pill at the bottom (tick labels live
  // at the top, so the readout must not share their line).
  ctx.fillStyle = '#ff6b1a';
  ctx.beginPath();
  ctx.moveTo(w / 2 - 7, 0);
  ctx.lineTo(w / 2 + 7, 0);
  ctx.lineTo(w / 2, 9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(10, 14, 22, 0.85)';
  ctx.fillRect(w / 2 - 26, h - 20, 52, 18);
  ctx.strokeStyle = '#ffd76a';
  ctx.lineWidth = 1;
  ctx.strokeRect(w / 2 - 26, h - 20, 52, 18);
  ctx.fillStyle = '#ffd76a';
  ctx.font = 'bold 14px monospace';
  ctx.fillText(String(Math.round(hdg)).padStart(3, '0'), w / 2, h - 6);
}

function drawTape(ctx, canvas, value, step, majorStep, unit, formatter) {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(10, 14, 22, 0.55)';
  ctx.fillRect(0, 0, w, h);
  const pxPerUnit = h / (step * 12);
  const centre = h / 2;
  const start = Math.floor((value - step * 6) / step) * step;
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  for (let v = start; v <= value + step * 6; v += step) {
    if (v < 0) continue;
    const y = centre - (v - value) * pxPerUnit;
    const major = v % majorStep === 0;
    ctx.strokeStyle = major ? '#ffd76a' : 'rgba(255,255,255,0.45)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(w - 14, y);
    ctx.lineTo(w - (major ? 26 : 20), y);
    ctx.stroke();
    if (major) {
      ctx.fillStyle = '#f2e3c6';
      ctx.fillText(formatter(v), 4, y + 4);
    }
  }
  // Centre readout box.
  ctx.fillStyle = '#ff6b1a';
  ctx.fillRect(0, centre - 13, w, 26);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(formatter(Math.round(value)) + unit, w / 2, centre + 5);
  ctx.textAlign = 'left';
}

function drawMinimap() {
  const ctx = mapCtx;
  const w = els.minimap.width;
  const h = els.minimap.height;
  const scale = w / 2400; // world metres -> px
  const toX = (x) => w / 2 + x * scale;
  const toY = (z) => h / 2 + z * scale;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(10, 20, 26, 0.6)';
  ctx.fillRect(0, 0, w, h);
  // River.
  ctx.strokeStyle = '#4d8ea8';
  ctx.lineWidth = Math.max(3, 130 * scale);
  ctx.beginPath();
  for (let z = -1200; z <= 1200; z += 60) {
    const x = riverX(z);
    if (z === -1200) ctx.moveTo(toX(x), toY(z));
    else ctx.lineTo(toX(x), toY(z));
  }
  ctx.stroke();
  // Runway lane.
  ctx.strokeStyle = '#ff6b1a';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(
    toX(RUNWAY.centreXAt(1000) - 30),
    toY(RUNWAY.thresholdZ),
    60 * scale,
    (RUNWAY.endZ - RUNWAY.thresholdZ) * scale,
  );
  ctx.setLineDash([]);
  // Dock.
  ctx.fillStyle = '#ffd76a';
  ctx.fillRect(toX(DOCK_POS.x) - 3, toY(DOCK_POS.z) - 3, 6, 6);
  // Rings.
  RING_POSITIONS.forEach((ring, i) => {
    ctx.fillStyle = i < state.ringsPassed ? '#3fae5a' : i === state.ringGate ? '#ffd76a' : 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.arc(toX(ring.x), toY(ring.z), i === state.ringGate ? 5 : 3.5, 0, Math.PI * 2);
    ctx.fill();
  });
  // Plane.
  const px = toX(state.position.x);
  const py = toY(state.position.z);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(state.heading);
  ctx.fillStyle = '#ff5a3c';
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.lineTo(-5, -6);
  ctx.lineTo(5, -6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function updateChecklist() {
  const rows = MISSION_NAMES.map((name, i) => {
    const mark = i < state.missionIndex ? '✓' : i === state.missionIndex ? '▶' : '○';
    const cls = i < state.missionIndex ? 'done' : i === state.missionIndex ? 'active' : '';
    let detail = '';
    if (i === 0) detail = ` ${state.ringsPassed}/${DELTA_POST.missions.ringCount} rings`;
    if (i === 1) detail = state.dropDelivered ? ' delivered' : ` ${state.dropAttempts}/${DELTA_POST.missions.dropMaxAttempts} tries`;
    if (i === 2) detail = state.touchdown ? ` ${state.touchdown.grade}` : '';
    return `<div class="mission ${cls}"><span class="mark">${mark}</span> ${name}${detail}</div>`;
  }).join('');
  const html = rows + `<div class="score">SCORE ${state.score}</div>`;
  if (html !== lastChecklist) {
    els.missions.innerHTML = html;
    lastChecklist = html;
  }
}

export function updateHud() {
  drawCompass();
  drawTape(speedCtx, els.speedTape, state.speed * KT, 5, 20, ' kt', (v) => String(v));
  drawTape(altCtx, els.altTape, Math.max(0, state.position.y) * FT, 50, 500, ' ft', (v) => String(v));
  drawMinimap();
  drawGaugePanel(gaugeCtx, els.gauges.width, els.gauges.height, state);

  els.fuelBar.style.width = `${Math.max(0, state.fuel)}%`;
  els.fuelBar.classList.toggle('low', state.fuel < DELTA_POST.fuel.lowWarn);
  els.fuelLabel.textContent = `FUEL ${Math.round(state.fuel)}%`;
  els.throttleBar.style.width = `${Math.round(state.throttle * 100)}%`;
  els.throttleLabel.textContent = `THR ${Math.round(state.throttle * 100)}%`;

  const mins = Math.floor(state.elapsed / 60);
  const secs = Math.floor(state.elapsed % 60);
  els.time.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  els.score.textContent = `SCORE ${state.score}`;

  if (state.message && state.elapsed < state.messageUntil) {
    els.message.textContent = state.message;
    els.message.style.opacity = '1';
  } else {
    els.message.style.opacity = '0';
  }

  // Context line: distance to the current objective.
  let context = '';
  if (state.missionIndex === 0) context = `NEXT RING ${Math.round(distanceToNextRing())} m`;
  else if (state.missionIndex === 1) context = `DOCK ${Math.round(distanceToDock())} m — AGL ${Math.round(state.altitudeAgl * FT)} ft · ${Math.round(state.speed * KT)} kt`;
  else if (state.missionIndex === 2) context = `RUNWAY ${Math.max(0, Math.round(RUNWAY.thresholdZ - state.position.z))} m — XWIND ${Math.round(state.windX * KT)} kt`;
  updateChecklist();
  const scoreEl = els.missions.querySelector('.score');
  if (scoreEl) scoreEl.textContent = `SCORE ${state.score} · ${context}`;
}

export function showTitle() {
  document.getElementById('hud').classList.remove('debrief-mode');
  els.title.style.display = 'flex';
  els.debrief.style.display = 'none';
  els.pause.style.display = 'none';
}

export function showPause(paused) {
  els.pause.style.display = paused ? 'flex' : 'none';
}

export function showDebrief() {
  const d = state.debrief;
  if (!d) return;
  document.getElementById('hud').classList.add('debrief-mode');
  els.title.style.display = 'none';
  els.debrief.style.display = 'flex';
  els.debriefTitle.textContent = d.reason;
  els.debriefGrade.textContent = d.grade;
  els.debriefScore.textContent = `${d.total} PTS`;
  els.debriefBody.innerHTML = d.lines.map((l) => `<div>${l}</div>`).join('')
    + `<div class="debrief-foot">TIME ${Math.floor(d.elapsed / 60)}:${String(d.elapsed % 60).padStart(2, '0')} · FUEL LEFT ${d.fuelLeft}% · RINGS ${state.ringsPassed}/${DELTA_POST.missions.ringCount}</div>`;
}
