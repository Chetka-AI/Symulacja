/*
 * Warstwa UI: panel sterowania, przełączanie widoków, renderowanie świata
 * (ofiara=teal, drapieżnik=pomarańczowy) oraz wykresy koewolucji.
 */
(function (global) {
  'use strict';

  const PARAMS = [
    { id: 'hiddenLayers', fmt: v => v },
    { id: 'hiddenSize',   fmt: v => v },
    { id: 'visionRays',   fmt: v => v },
    { id: 'memorySize',   fmt: v => v },
    { id: 'preyCount',    fmt: v => v },
    { id: 'predatorCount',fmt: v => v },
    { id: 'generations',  fmt: v => v },
    { id: 'steps',        fmt: v => v },
    { id: 'mutRate',      fmt: v => Number(v).toFixed(2) },
    { id: 'mutStrength',  fmt: v => Number(v).toFixed(2) },
    { id: 'elitism',      fmt: v => Number(v).toFixed(2) },
    { id: 'worldSize',    fmt: v => v },
    { id: 'foodCount',    fmt: v => v },
    { id: 'foodClusters', fmt: v => v },
    { id: 'foodRegen',    fmt: v => v },
    { id: 'speed',        fmt: v => v + '×' },
  ];

  function $(id) { return document.getElementById(id); }

  function bindControls() {
    for (const p of PARAMS) {
      const inp = $('p-' + p.id), out = $('o-' + p.id);
      if (!inp || !out) continue;
      const upd = () => { out.textContent = p.fmt(inp.value); };
      inp.addEventListener('input', upd); upd();
    }
  }

  function readConfig() {
    const num = id => Number($('p-' + id).value);
    const numOr = (id, def) => { const el = $('p-' + id); return el ? Number(el.value) : def; };
    return {
      hiddenLayers:  num('hiddenLayers'),
      hiddenSize:    num('hiddenSize'),
      activation:    $('p-activation').value,
      visionRays:    numOr('visionRays', 5),
      memorySize:    numOr('memorySize', 3),
      preyCount:     numOr('preyCount', 60),
      predatorCount: numOr('predatorCount', 5),
      generations:   num('generations'),
      steps:         num('steps'),
      mutRate:       num('mutRate'),
      mutStrength:   num('mutStrength'),
      elitism:       num('elitism'),
      worldSize:     num('worldSize'),
      foodCount:     num('foodCount'),
      foodClusters:  numOr('foodClusters', 6),
      foodRegen:     num('foodRegen'),
      seed:          num('seed'),
    };
  }

  function switchView(name) {
    document.querySelectorAll('.tab').forEach(t =>
      t.classList.toggle('is-active', t.dataset.view === name));
    document.querySelectorAll('.view').forEach(v =>
      v.classList.toggle('is-active', v.dataset.view === name));
  }

  // ---------- Renderowanie ----------
  class WorldRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx    = canvas.getContext('2d');
      this.displaySize = 0;
    }

    _fit(worldSize) {
      const wrap = this.canvas.parentElement;
      const avail = Math.min(wrap.clientWidth - 16, wrap.clientHeight - 16);
      const size  = Math.max(120, Math.floor(avail));
      if (size === this.displaySize) return;
      this.displaySize = size;
      const dpr = global.devicePixelRatio || 1;
      this.canvas.style.width  = size + 'px';
      this.canvas.style.height = size + 'px';
      this.canvas.width  = Math.floor(size * dpr);
      this.canvas.height = Math.floor(size * dpr);
      this.dpr = dpr;
    }

    render(world) {
      this._fit(world.size);
      const ctx   = this.ctx;
      const scale = (this.displaySize / world.size) * this.dpr;
      const px    = this.canvas.width;

      ctx.clearRect(0, 0, px, px);

      // Pokarm roślinny (skupiska)
      for (const f of world.foods) {
        const x = f.x * scale, y = f.y * scale;
        if (f.available) {
          ctx.fillStyle = '#36d399';
          ctx.beginPath(); ctx.arc(x, y, World.CONST.foodRadius * scale, 0, Math.PI*2); ctx.fill();
        } else {
          ctx.strokeStyle = 'rgba(54,211,153,0.18)';
          ctx.lineWidth = 1 * this.dpr;
          ctx.beginPath(); ctx.arc(x, y, World.CONST.foodRadius * scale, 0, Math.PI*2); ctx.stroke();
        }
      }

      // Najlepsza ofiara i najlepszy drapieżnik → podgląd wzroku
      let watchPrey = null, watchPred = null, bePrey = -1, bePred = -1;
      for (const c of world.cells) {
        if (!c.alive) continue;
        if (c.type === 'prey'     && c.energy > bePrey) { bePrey = c.energy; watchPrey = c; }
        if (c.type === 'predator' && c.energy > bePred) { bePred = c.energy; watchPred = c; }
      }
      // Wachlarze wzroku (ofiara=teal, drapieżnik=pomarańczowy)
      if (watchPrey) this._drawVision(ctx, world, watchPrey, scale, 'rgba(54,211,153,0.18)');
      if (watchPred) this._drawVision(ctx, world, watchPred, scale, 'rgba(255,159,67,0.20)');

      // Komórki
      const r = World.CONST.cellRadius * scale;
      for (const c of world.cells) {
        if (!c.alive) continue;
        const x = c.x * scale, y = c.y * scale;
        const e = c.energy / World.CONST.maxEnergy;
        const light = 30 + e * 28;   // 30%..58% — ciemny gdy głodny

        ctx.fillStyle = c.type === 'prey'
          ? `hsl(190, 75%, ${light}%)`   // teal — ofiara
          : `hsl(22,  82%, ${light}%)`;  // pomarańczowy — drapieżnik

        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();

        // Flash: ofiara oberwała (czerwona obwódka)
        if (c.damaged) {
          ctx.strokeStyle = 'rgba(255,93,108,0.95)';
          ctx.lineWidth   = 2 * this.dpr;
          ctx.beginPath(); ctx.arc(x, y, r + 2*this.dpr, 0, Math.PI*2); ctx.stroke();
        }
        // Flash: drapieżnik gryzie (pomarańczowa obwódka)
        if (c.attacking) {
          ctx.strokeStyle = 'rgba(255,159,67,0.92)';
          ctx.lineWidth   = 2 * this.dpr;
          ctx.beginPath(); ctx.arc(x, y, r + 2.5*this.dpr, 0, Math.PI*2); ctx.stroke();
        }

        // Wskaźnik kierunku
        ctx.strokeStyle = 'rgba(255,255,255,0.42)';
        ctx.lineWidth   = 1 * this.dpr;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(c.heading)*r*1.8, y + Math.sin(c.heading)*r*1.8);
        ctx.stroke();
      }

      // Pierścienie obserwowanych
      if (watchPrey) this._drawRing(ctx, watchPrey, scale, 'rgba(54,211,153,0.80)');
      if (watchPred) this._drawRing(ctx, watchPred, scale, 'rgba(255,159,67,0.80)');
    }

    _drawVision(ctx, world, cell, scale, color) {
      const R   = (world.io && world.io.rays) || 5;
      const fov = World.CONST.visionFOV;
      const rng = World.CONST.sensorRange * scale;
      const x   = cell.x * scale, y = cell.y * scale;
      ctx.strokeStyle = color; ctx.lineWidth = 1 * this.dpr;
      for (let k = 0; k < R; k++) {
        const a = (R > 1) ? cell.heading - fov/2 + fov*(k/(R-1)) : cell.heading;
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a)*rng, y + Math.sin(a)*rng); ctx.stroke();
      }
    }

    _drawRing(ctx, cell, scale, color) {
      const r = World.CONST.cellRadius * scale;
      const x = cell.x * scale, y = cell.y * scale;
      ctx.strokeStyle = color; ctx.lineWidth = 1.5 * this.dpr;
      ctx.beginPath(); ctx.arc(x, y, r + 4*this.dpr, 0, Math.PI*2); ctx.stroke();
    }
  }

  // ---------- Statystyki na żywo ----------
  function renderStats(trainer) {
    const last = trainer.history[trainer.history.length - 1];
    $('s-gen').textContent  = trainer.gen;
    $('s-prey').textContent = trainer.world.alivePrey();
    $('s-pred').textContent = trainer.world.alivePredators();
    $('s-step').textContent = trainer.world.step;
    const bestPreyEl = $('s-best-prey');
    const bestPredEl = $('s-best-pred');
    if (last && bestPreyEl) bestPreyEl.textContent = last.prey.best;
    if (last && bestPredEl) bestPredEl.textContent = last.pred.best;
  }

  function setProgress(trainer) {
    const total = trainer.cfg.generations * trainer.cfg.steps;
    const cur   = (trainer.gen - 1) * trainer.cfg.steps + trainer.world.step;
    $('train-progress').value = Math.min(1, cur / total);
  }

  // ---------- Analiza ----------
  function renderAnalysis(trainer) {
    const h = trainer.history;
    if (!h.length) return;
    $('analysis-empty').classList.add('hidden');
    $('analysis-content').classList.remove('hidden');

    const xs = h.map(d => d.gen);

    // Karty podsumowania
    const preyAvgArr  = h.map(d => d.prey.avg);
    const predAvgArr  = h.map(d => d.pred.avg);
    const summary = [
      { val: trainer.bestEverPrey.fitness.toFixed(1), key: 'max fitness ofiara (pok. ' + trainer.bestEverPrey.gen + ')' },
      { val: trainer.bestEverPred.fitness.toFixed(1), key: 'max fitness drapieżnik (pok. ' + trainer.bestEverPred.gen + ')' },
      { val: preyAvgArr[preyAvgArr.length-1].toFixed(1), key: 'avg ofiara (ost. pok.)' },
      { val: predAvgArr[predAvgArr.length-1].toFixed(1), key: 'avg drapieżnik (ost. pok.)' },
    ];
    $('summary-grid').innerHTML = summary.map(s =>
      `<div class="summary-card"><div class="sc-val">${s.val}</div><div class="sc-key">${s.key}</div></div>`
    ).join('');

    // Wykres 1: Fitness obu gatunków
    Charts.lineChart($('chart-fitness'), xs, [
      { data: h.map(d=>d.prey.best), color: '#36d399',             width: 2.5 },
      { data: h.map(d=>d.prey.avg),  color: 'rgba(54,211,153,.5)', width: 1.5 },
      { data: h.map(d=>d.pred.best), color: '#ff9f43',             width: 2.5 },
      { data: h.map(d=>d.pred.avg),  color: 'rgba(255,159,67,.5)', width: 1.5 },
    ]);

    // Wykres 2: Dynamika populacji (Lotka-Volterra)
    const popCanvas = $('chart-population');
    if (popCanvas) Charts.lineChart(popCanvas, xs, [
      { data: h.map(d=>d.prey.alive), color: '#4f9cff', width: 2 },
      { data: h.map(d=>d.pred.alive), color: '#ff5d6c', width: 2 },
    ]);

    // Wykres 3: Jedzenie vs zabójstwa
    const foodCanvas = $('chart-food');
    if (foodCanvas) Charts.lineChart(foodCanvas, xs, [
      { data: h.map(d=>d.totalFood),  color: '#36d399', width: 2 },
      { data: h.map(d=>d.totalKills), color: '#ff5d6c', width: 2 },
    ]);

    // Wykres 4: Różnorodność genetyczna (dwa gatunki)
    Charts.lineChart($('chart-diversity'), xs, [
      { data: h.map(d=>d.prey.diversity), color: '#4f9cff', width: 2 },
      { data: h.map(d=>d.pred.diversity), color: '#ff9f43', width: 2 },
    ]);
  }

  global.UI = {
    $, bindControls, readConfig, switchView,
    WorldRenderer, renderStats, setProgress, renderAnalysis,
  };
})(window);
