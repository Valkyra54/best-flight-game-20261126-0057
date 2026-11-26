// DELTA POST — fuel. One job: burn fuel with throttle, warn, and report
// when the tank is dry. The flight model calls stepFuel every fixed step.

import { DELTA_POST } from './config.js';
import { state } from './gameState.js';
import { emit, Events } from './eventBus.js';

let warnedLow = false;
let warnedCritical = false;

export function resetFuel() {
  warnedLow = false;
  warnedCritical = false;
}

export function stepFuel(dt) {
  if (state.fuel <= 0) return;
  const burn = (DELTA_POST.fuel.baseBurn + DELTA_POST.fuel.throttleBurn * state.throttle) * dt;
  state.fuel = Math.max(0, state.fuel - burn);
  if (state.fuel <= DELTA_POST.fuel.lowWarn && !warnedLow) {
    warnedLow = true;
    emit(Events.LOW_FUEL, { fuel: state.fuel, critical: false });
  }
  if (state.fuel <= DELTA_POST.fuel.criticalWarn && !warnedCritical) {
    warnedCritical = true;
    emit(Events.LOW_FUEL, { fuel: state.fuel, critical: true });
  }
  if (state.fuel === 0 && !state.outOfFuel) {
    state.outOfFuel = true;
    emit(Events.FUEL_EMPTY, {});
  }
}

// Fuel left at landing is worth points — reward the pilot who manages it.
export function fuelBonus() {
  return Math.round(state.fuel * DELTA_POST.missions.fuelBonusPerUnit);
}
