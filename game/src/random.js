// DELTA POST — seeded randomness. One SplitMix64 stream per system, so a
// seed reproduces one world and adding a decoration roll never reshuffles
// the layout (procedural-gen pattern). No Math.random anywhere in the game.

export function makeSplitMix64(seed) {
  const MASK = (1n << 64n) - 1n;
  let state = BigInt(seed) & MASK;
  return {
    nextU64() {
      state = (state + 0x9e3779b97f4a7c15n) & MASK;
      let z = state;
      z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
      z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK;
      return z ^ (z >> 31n);
    },
    // Float in [0, 1).
    nextFloat() {
      // Top 53 bits -> double.
      return Number(this.nextU64() >> 11n) / 9007199254740992;
    },
    // Integer in [0, n).
    below(n) {
      const limit = MASK - ((MASK + 1n) % BigInt(n));
      let x;
      do {
        x = this.nextU64();
      } while (x > limit);
      return Number(x % BigInt(n));
    },
    // Float in [min, max).
    range(min, max) {
      return min + this.nextFloat() * (max - min);
    },
  };
}

// Child stream for one system, derived from a parent stream.
export function deriveChild(rng, salt) {
  return makeSplitMix64(Number(rng.nextU64() & 0xffffffffn) ^ (salt * 2654435761));
}

// 2D value noise with smooth interpolation, driven by a hash of integer
// lattice points. Deterministic for a seed; good enough for terrain fBm
// without vendoring a noise library.
export function makeValueNoise2D(seed) {
  function hash2(ix, iz) {
    let h = (ix * 374761393 + iz * 668265263 + seed * 974634781) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }
  function smooth(t) {
    return t * t * (3 - 2 * t);
  }
  function noise(x, z) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const a = hash2(ix, iz);
    const b = hash2(ix + 1, iz);
    const c = hash2(ix, iz + 1);
    const d = hash2(ix + 1, iz + 1);
    const ux = smooth(fx);
    const uz = smooth(fz);
    return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1;
  }
  // Fractal Brownian motion, `octaves` layers, result roughly in [-1, 1].
  function fbm(x, z, octaves) {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i += 1) {
      sum += amp * noise(x * freq, z * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / norm;
  }
  return { noise, fbm };
}

// mulberry32 — tiny seeded RNG for the few places that want a plain
// function instead of the SplitMix64 object (5 lines, our own code).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
