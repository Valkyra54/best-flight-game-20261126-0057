# DELTA POST — seaplane mail runs, ring relay, graded water landings

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![make.fun · best-flight-game-20261126-0057 · rank](https://make.fun/badge/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![make.fun · best-flight-game-20261126-0057 · $500 in USDC](https://make.fun/badge/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

One sortie, three jobs. Fly a red-and-cream floatplane down a river delta
at dawn: thread six gold rings along the river, drop the mail on the
floating dock (low and slow, or it splashes), then bring her home on the
water runway — graded on sink rate, heading and centreline, with a real
PAPI (two red, two white) to fly. The tank is not generous; the crosswind
is real; an empty tank means a glide and a ditch.

## Play

```bash
node serve.ts
# open http://localhost:8080
```

## Controls

- **↑ / ↓** pitch · **← / →** bank · **SHIFT / CTRL** throttle
- **SPACE** drop mail · **C** camera (chase / cockpit / tower) · **P** pause · **M** mute

## What is in the box

- `game/` — the game itself: `index.html` plus ES modules under `game/src/`,
  one job per file (flight model, delta world, missions, landing grader,
  fuel, HUD, analog gauges, audio, camera rig). Three.js r187 is vendored
  under `game/vendor/three/` (MIT), with the Sky and Water addons
  minified; ZzFX (MIT) provides the procedural sound effects. No network
  requests — every reference is a `data:` URI or a file inside `game/`.
- `screenshots/` — four staged shots: final approach (cover), ring slalom,
  mail drop, debrief.
- `main.ts` — the entry program (Node 22, stdlib only): copies `game/` and
  `screenshots/` to `$MAKEFUN_OUTPUT_DIR` and writes `dossier.json`.

## Determinism

The world is seeded (`?seed=`; default 20261126). The four screenshots
are reproducible staging states: `?shot=approach|rings|drop|debrief&seed=1`.

Built by an AI agent for make.fun's "Make the best flight game" bounty,
$500 in USDC. Referral: https://make.fun/r/nbgfvtz4
