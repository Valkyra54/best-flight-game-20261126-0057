// DELTA POST — analog gauge panel. One job: draw four round dials
// (airspeed, attitude, altimeter, fuel) on a canvas, the way a real
// floatplane panel reads. Pure 2D canvas, no DOM, no polling.

import * as THREE from 'three';

const KT = 1.94384;
const FT = 3.28084;

function dial(ctx, cx, cy, r, label) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#10151d';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#c8b08a';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 5, 0, Math.PI * 2);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.stroke();
  ctx.fillStyle = '#f2e3c6';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label, cx, cy + r - 9);
  ctx.restore();
}

function needle(ctx, cx, cy, r, angle, color = '#ff5a3c', width = 2.5) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(0, r * 0.25);
  ctx.lineTo(0, -r + 8);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function ticks(ctx, cx, cy, r, from, to, step, majorStep, labels) {
  ctx.save();
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2e3c6';
  for (let v = from; v <= to; v += step) {
    const a = -Math.PI * 0.75 + ((v - from) / (to - from)) * Math.PI * 1.5;
    const major = v % majorStep === 0;
    const r1 = r - 6;
    const r2 = r - (major ? 16 : 11);
    ctx.strokeStyle = major ? '#ffd76a' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1);
    ctx.lineTo(cx + Math.sin(a) * r2, cy - Math.cos(a) * r2);
    ctx.stroke();
    if (labels && major) {
      ctx.fillText(labels(v), cx + Math.sin(a) * (r - 26), cy - Math.cos(a) * (r - 26) + 3);
    }
  }
  ctx.restore();
}

function redArc(ctx, cx, cy, r, fromFrac, toFrac, color = '#ff2a1a') {
  // Dial angles: 0 = 12 o'clock, clockwise. Canvas arc measures from +X.
  const start = -Math.PI * 0.75 - Math.PI / 2 + fromFrac * Math.PI * 1.5;
  const end = -Math.PI * 0.75 - Math.PI / 2 + toFrac * Math.PI * 1.5;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 9, start, end);
  ctx.stroke();
  ctx.restore();
}

function drawAirspeed(ctx, cx, cy, r, speedKt) {
  dial(ctx, cx, cy, r, 'AIRSPEED KT');
  ticks(ctx, cx, cy, r, 0, 160, 10, 20, (v) => String(v));
  const a = -Math.PI * 0.75 + (Math.min(speedKt, 160) / 160) * Math.PI * 1.5;
  needle(ctx, cx, cy, r, a);
  // Red arc: stall region under 50 kt.
  redArc(ctx, cx, cy, r, 0, 50 / 160);
}

function drawAttitude(ctx, cx, cy, r, pitch, roll) {
  dial(ctx, cx, cy, r, 'ATTITUDE');
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 6, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-roll);
  const pitchPx = THREE.MathUtils.clamp(pitch, -0.5, 0.5) * (r * 1.4);
  // Sky above, ground below, horizon line.
  ctx.fillStyle = '#7fb2d9';
  ctx.fillRect(-r, -r + pitchPx, r * 2, r);
  ctx.fillStyle = '#8a6b46';
  ctx.fillRect(-r, pitchPx, r * 2, r);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r, pitchPx);
  ctx.lineTo(r, pitchPx);
  ctx.stroke();
  // Pitch ladder ticks.
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1;
  for (const dp of [-0.3, -0.15, 0.15, 0.3]) {
    const y = pitchPx - dp * (r * 1.4);
    ctx.beginPath();
    ctx.moveTo(-14, y);
    ctx.lineTo(14, y);
    ctx.stroke();
  }
  ctx.restore();
  // Fixed aircraft symbol + bank pointer.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = '#ffd76a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-16, 0);
  ctx.lineTo(16, 0);
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 5);
  ctx.stroke();
  ctx.rotate(-roll);
  ctx.fillStyle = '#ffd76a';
  ctx.beginPath();
  ctx.moveTo(0, -r + 8);
  ctx.lineTo(-5, -r + 16);
  ctx.lineTo(5, -r + 16);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawAltimeter(ctx, cx, cy, r, altFt) {
  dial(ctx, cx, cy, r, 'ALT FT');
  ticks(ctx, cx, cy, r, 0, 1000, 100, 100, (v) => String(v / 100));
  // Long needle: hundreds; short needle: thousands (single-turn dial).
  const hundreds = (altFt % 1000) / 1000;
  const a = -Math.PI * 0.75 + hundreds * Math.PI * 1.5;
  needle(ctx, cx, cy, r, a);
  const thousands = Math.floor(altFt / 1000) % 10;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI * 0.75 + (thousands / 10) * Math.PI * 1.5);
  ctx.strokeStyle = '#ffd76a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -r + 26);
  ctx.stroke();
  ctx.restore();
}

function drawFuel(ctx, cx, cy, r, fuelPct) {
  dial(ctx, cx, cy, r, 'FUEL %');
  ticks(ctx, cx, cy, r, 0, 100, 10, 25, (v) => String(v));
  const a = -Math.PI * 0.75 + (Math.max(0, fuelPct) / 100) * Math.PI * 1.5;
  const color = fuelPct < 25 ? '#ff2a1a' : '#3fae5a';
  needle(ctx, cx, cy, r, a, color);
  // Red arc under 25%.
  redArc(ctx, cx, cy, r, 0, 0.25);
}

export function drawGaugePanel(ctx, width, height, gameState) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(10, 14, 22, 0.6)';
  ctx.fillRect(0, 0, width, height);
  const r = Math.min(width / 8 - 4, height / 2 - 8);
  const cy = height / 2;
  const xs = [width / 8, (width / 8) * 3, (width / 8) * 5, (width / 8) * 7];
  drawAirspeed(ctx, xs[0], cy, r, gameState.speed * KT);
  drawAttitude(ctx, xs[1], cy, r, gameState.pitch, gameState.roll);
  drawAltimeter(ctx, xs[2], cy, r, Math.max(0, gameState.position.y) * FT);
  drawFuel(ctx, xs[3], cy, r, gameState.fuel);
}
