/*
 * Świat symulacji — dwie ODDZIELNE, PREDEFINIOWANE populacje ewoluujące razem:
 *
 *   OFIARA (prey)  — żywi się wyłącznie roślinami; ucieka przed drapieżnikami.
 *   DRAPIEŻNIK (predator) — żywi się wyłącznie żywymi ofiarami; nie je roślin.
 *
 * Sensory (wspólna architektura sieci dla obu typów):
 *   Dla każdego promienia wzroku (visionRays):
 *     kanał 0: bliskość rośliny    (ofiara → lokalizuje pokarm; drapieżnik → zawsze 0)
 *     kanał 1: bliskość "celu"     (ofiara → drapieżnik; drapieżnik → ofiara)
 *     kanał 2: względna energia celu  (cel.energy - self.energy) / maxEnergy
 *   + własna energia (0..1)
 *   + stała bias = 1
 *   + wektor pamięci (memorySize wartości)
 *
 * Wyjścia sieci (bez wyjścia atak — atak jest hardcoded dla drapieżnika):
 *   0: skręt  (-1..1)
 *   1: prędkość (-1..1 → 0..maxSpeed)
 *   2..: pamięć (memorySize)
 */
(function (global) {
  'use strict';

  const C = {
    cellRadius: 4,
    foodRadius: 3,
    maxSpeed: 2.4,
    maxTurn: 0.35,
    maxEnergy: 100,
    startEnergy: 70,
    metabolism: 0.10,
    moveCost: 0.06,
    foodEnergy: 34,

    // wzrok (wspólny dla obu typów)
    sensorRange: 150,
    visionFOV: Math.PI * 5 / 6,  // ~150°
    rayHitSlack: 4,

    // predacja (hardcoded dla drapieżnika)
    // 2 ugryzienia zabijają ofiarę (70-40=30; 30-40<0 -> śmierć)
    attackRange: 14,
    attackCooldown: 16,  // wolny cooldown -> ~38% przeżywalność ofiar = mocna presja selekcyjna
    biteEnergy: 30,      // energia zyskiwana przez drapieżnika (stała)
    biteDamage: 40,      // obrażenia ofiary (stałe)
  };

  function wrapDelta(d, size) {
    const half = size * 0.5;
    if (d > half) d -= size;
    else if (d < -half) d += size;
    return d;
  }

  function normAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  class World {
    constructor(config, rng) {
      this.cfg = config;
      this.rng = rng;
      this.size = config.worldSize;
      this.io = World.ioSizes(config);
      this.foods = [];
      this.cells = [];
      this.step = 0;
      this._initFood();
    }

    // Rozmiary IO — outputs = 2 + mem (brak wyjścia atak)
    static ioSizes(cfg) {
      const rays = Math.max(1, (cfg.visionRays | 0) || 5);
      const mem  = Math.max(0, (cfg.memorySize  | 0) || 0);
      return {
        rays,
        mem,
        inputs:  rays * 3 + 2 + mem,
        outputs: 2 + mem,
      };
    }

    // Roślinny pokarm w skupiskach — te same miejsca przez cały trening
    _initFood() {
      const margin = 16, size = this.size;
      const clusters = Math.max(1, (this.cfg.foodClusters | 0) || 6);
      const spread = size * 0.06;
      const centers = [];
      for (let i = 0; i < clusters; i++) {
        centers.push({ x: this.rng.range(margin, size - margin),
                       y: this.rng.range(margin, size - margin) });
      }
      for (let i = 0; i < this.cfg.foodCount; i++) {
        const c = centers[i % clusters];
        let x = c.x + this.rng.gauss() * spread;
        let y = c.y + this.rng.gauss() * spread;
        x = Math.min(size - margin, Math.max(margin, x));
        y = Math.min(size - margin, Math.max(margin, y));
        this.foods.push({ x, y, available: true, timer: 0 });
      }
    }

    // Nowe pokolenie: przyjmuje dwie oddzielne tablice genomów
    reset(predators, prey) {
      this.step = 0;
      for (const f of this.foods) { f.available = true; f.timer = 0; }
      const M = this.io.mem;

      const makeCell = (brain, type) => ({
        brain, type,
        tag: typeof brain.tag === 'number' ? brain.tag : this.rng.next(),
        x: this.rng.range(0, this.size),
        y: this.rng.range(0, this.size),
        heading: this.rng.range(0, Math.PI * 2),
        energy: C.startEnergy,
        alive: true,
        age: 0,
        memory: new Float32Array(M),
        plantEnergy: 0,
        preyEnergy: 0,
        foodEaten: 0,
        kills: 0,
        attacking: false,   // drapieżnik: czy właśnie gryzie
        damaged:   false,   // ofiara: czy właśnie oberwała (do renderu)
        attackCD: 0,
        _turn: 0, _speed: 0,
      });

      // WAŻNE: predators PIERWSZE, prey PO — kolejność zachowana dla slice() w evolution.js
      this.cells = [
        ...predators.map(b => makeCell(b, 'predator')),
        ...prey.map(b => makeCell(b, 'prey')),
      ];
      this._nPred = predators.length;
      return this;
    }

    aliveCount()     { let n=0; for (const c of this.cells) if (c.alive) n++; return n; }
    alivePrey()      { let n=0; for (const c of this.cells) if (c.alive && c.type==='prey') n++; return n; }
    alivePredators() { let n=0; for (const c of this.cells) if (c.alive && c.type==='predator') n++; return n; }

    // Percepcja — kanały zależne od typu:
    //   Ofiara:     kanał0 = rośliny,    kanał1+2 = drapieżniki (zagrożenie)
    //   Drapieżnik: kanał0 = 0 (ślepy),  kanał1+2 = ofiary (cel)
    _sense(cell) {
      const size = this.size;
      const R = this.io.rays, range = C.sensorRange, range2 = range * range;
      const fov = C.visionFOV, isPrey = cell.type === 'prey';

      const rayAng = [];
      for (let k = 0; k < R; k++) {
        rayAng[k] = (R > 1) ? cell.heading - fov/2 + fov*(k/(R-1)) : cell.heading;
      }

      const foodProx = new Float64Array(R);
      const cellProx = new Float64Array(R);
      const cellRel  = new Float64Array(R);

      // Kanał 0: rośliny — tylko ofiara je widzi
      if (isPrey) {
        for (const f of this.foods) {
          if (!f.available) continue;
          const dx = wrapDelta(f.x - cell.x, size);
          const dy = wrapDelta(f.y - cell.y, size);
          const d2 = dx*dx + dy*dy;
          if (d2 > range2) continue;
          const d = Math.sqrt(d2);
          const ang = Math.atan2(dy, dx);
          const prox = 1 - d / range;
          for (let k = 0; k < R; k++) {
            const rel = normAngle(ang - rayAng[k]);
            if (Math.cos(rel) <= 0) continue;
            if (Math.abs(d * Math.sin(rel)) <= C.foodRadius + C.rayHitSlack)
              if (prox > foodProx[k]) foodProx[k] = prox;
          }
        }
      }

      // Kanał 1+2: "cel" — dla ofiary = drapieżniki, dla drapieżnika = ofiary
      const targetType = isPrey ? 'predator' : 'prey';
      for (const o of this.cells) {
        if (o === cell || !o.alive || o.type !== targetType) continue;
        const dx = wrapDelta(o.x - cell.x, size);
        const dy = wrapDelta(o.y - cell.y, size);
        const d2 = dx*dx + dy*dy;
        if (d2 > range2) continue;
        const d = Math.sqrt(d2);
        const ang = Math.atan2(dy, dx);
        const prox = 1 - d / range;
        const relE = (o.energy - cell.energy) / C.maxEnergy;
        for (let k = 0; k < R; k++) {
          const rel = normAngle(ang - rayAng[k]);
          if (Math.cos(rel) <= 0) continue;
          if (Math.abs(d * Math.sin(rel)) <= C.cellRadius + C.rayHitSlack)
            if (prox > cellProx[k]) { cellProx[k] = prox; cellRel[k] = relE; }
        }
      }

      const inp = new Array(this.io.inputs);
      let idx = 0;
      for (let k = 0; k < R; k++) { inp[idx++]=foodProx[k]; inp[idx++]=cellProx[k]; inp[idx++]=cellRel[k]; }
      inp[idx++] = cell.energy / C.maxEnergy;
      inp[idx++] = 1;  // bias
      for (let m = 0; m < this.io.mem; m++) inp[idx++] = cell.memory[m];
      return inp;
    }

    _nearestFoodWithin(cell, maxDist) {
      const size = this.size;
      let best = null, bestD2 = maxDist * maxDist;
      for (const f of this.foods) {
        if (!f.available) continue;
        const dx = wrapDelta(f.x - cell.x, size);
        const dy = wrapDelta(f.y - cell.y, size);
        const d2 = dx*dx + dy*dy;
        if (d2 < bestD2) { bestD2 = d2; best = f; }
      }
      return best;
    }

    _nearestPreyWithin(cell, maxDist) {
      const size = this.size;
      let best = null, bestD2 = maxDist * maxDist;
      for (const o of this.cells) {
        if (!o.alive || o.type !== 'prey') continue;
        const dx = wrapDelta(o.x - cell.x, size);
        const dy = wrapDelta(o.y - cell.y, size);
        const d2 = dx*dx + dy*dy;
        if (d2 < bestD2) { bestD2 = d2; best = o; }
      }
      return best;
    }

    tick() {
      const size = this.size, M = this.io.mem;
      const eatDist = C.cellRadius + C.foodRadius + 2;

      // Regeneracja pokarmu
      for (const f of this.foods)
        if (!f.available && --f.timer <= 0) f.available = true;

      // PASS 1: percepcja + decyzja (symultaniczna)
      for (const cell of this.cells) {
        if (!cell.alive) continue;
        cell.age++;
        cell.attacking = false;
        cell.damaged   = false;
        const inp = this._sense(cell);
        const out = cell.brain.forward(inp);
        cell._turn  = out[0] * C.maxTurn;
        cell._speed = Math.max(0, out[1]) * C.maxSpeed;
        for (let m = 0; m < M; m++) cell.memory[m] = out[2 + m];
      }

      // PASS 2: ruch (toroidalny)
      for (const cell of this.cells) {
        if (!cell.alive) continue;
        cell.heading += cell._turn;
        cell.x = (cell.x + Math.cos(cell.heading) * cell._speed + size) % size;
        cell.y = (cell.y + Math.sin(cell.heading) * cell._speed + size) % size;
      }

      // PASS 3: interakcje
      for (const cell of this.cells) {
        if (!cell.alive) continue;
        if (cell.attackCD > 0) cell.attackCD--;

        if (cell.type === 'prey') {
          // Ofiara: zbiera rośliny
          const f = this._nearestFoodWithin(cell, eatDist);
          if (f && f.available) {
            f.available = false;
            f.timer = this.cfg.foodRegen;
            const gained = Math.min(C.foodEnergy, C.maxEnergy - cell.energy);
            cell.energy += gained;
            cell.plantEnergy += gained;
            cell.foodEaten++;
          }
        } else {
          // Drapieżnik: poluje na ofiary (hardcoded, brak wyboru)
          if (cell.attackCD <= 0) {
            const target = this._nearestPreyWithin(cell, C.attackRange);
            if (target) {
              cell.attacking = true;
              // stały zysk dla drapieżnika (ograniczony do wolnego miejsca)
              const gained = Math.min(C.biteEnergy, C.maxEnergy - cell.energy);
              cell.energy     += gained;
              cell.preyEnergy += gained;
              // stałe obrażenia ofiary (niezależne od jej energii -> pewna śmierć po 2 ugryzieniach)
              target.energy -= C.biteDamage;
              target.damaged = true;
              if (target.energy <= 0) {
                target.energy = 0; target.alive = false;
                cell.kills++;
              }
              cell.attackCD = C.attackCooldown;
            }
          }
        }
      }

      // PASS 4: metabolizm
      for (const cell of this.cells) {
        if (!cell.alive) continue;
        cell.energy -= C.metabolism + cell._speed * C.moveCost;
        if (cell.energy <= 0) { cell.energy = 0; cell.alive = false; }
      }

      this.step++;
      return this.aliveCount();
    }

    fitnessOf(cell) {
      if (cell.type === 'prey') {
        // Nagroda za jedzenie + silny bonus za przeżycie → ewolucja ucieczki
        return cell.plantEnergy + cell.age * 1.5;
      } else {
        // Nagroda za polowanie + bonus za zabójstwa; przeżycie ma małą wagę
        return cell.preyEnergy + cell.kills * 8 + cell.age * 0.05;
      }
    }
  }

  World.CONST = C;
  World.wrapDelta = wrapDelta;
  global.World = World;
})(window);
