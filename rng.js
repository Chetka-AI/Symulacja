/*
 * Deterministyczny generator liczb pseudolosowych (mulberry32).
 * Dzięki ziarnu (seed) ten sam trening można powtórzyć z identycznym wynikiem.
 */
(function(global) {
  'use strict';
  
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function() {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  
  class RNG {
    constructor(seed) {
      // 0 lub brak => losowe ziarno z czasu
      this.seed = (seed && seed > 0) ? (seed >>> 0) : ((Date.now() ^ (Math.random() * 1e9)) >>> 0);
      this._next = mulberry32(this.seed);
    }
    // [0,1)
    next() { return this._next(); }
    // [min,max)
    range(min, max) { return min + (max - min) * this._next(); }
    // liczba całkowita [0,n)
    int(n) { return Math.floor(this._next() * n); }
    // rozkład normalny (Box–Muller), średnia 0, odch. 1
    gauss() {
      let u = 0,
        v = 0;
      while (u === 0) u = this._next();
      while (v === 0) v = this._next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
  }
  
  global.RNG = RNG;
})(window);