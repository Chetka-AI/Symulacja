/*
 * Trainer — koewolucja dwóch populacji: ofiary (prey) i drapieżniki (predators).
 * Każda populacja ewoluuje ODDZIELNIE (własna selekcja, crossover, mutacja),
 * ale obie żyją i współdziałają w tym samym świecie przez całe pokolenie.
 *
 * Wyścig zbrojeń: ofiary ewoluują ucieczkę, drapieżniki — polowanie.
 */
(function (global) {
  'use strict';

  class Trainer {
    constructor(config) {
      this.cfg  = config;
      this.rng  = new RNG(config.seed);

      // Wspólna architektura sieci dla obu gatunków
      this.io     = World.ioSizes(config);
      this.layout = [this.io.inputs];
      for (let i = 0; i < config.hiddenLayers; i++) this.layout.push(config.hiddenSize);
      this.layout.push(this.io.outputs);

      this.world = new World(config, this.rng);

      // Dwie oddzielne populacje
      this.prey       = this._initPop(config.preyCount);
      this.predators  = this._initPop(config.predatorCount);

      this.gen  = 1;
      this.done = false;
      this.history = [];

      // Rekordziści każdego gatunku
      this.bestEverPrey = { fitness: -Infinity, genome: null, tag: 0, gen: 0 };
      this.bestEverPred = { fitness: -Infinity, genome: null, tag: 0, gen: 0 };

      this.world.reset(this.predators, this.prey);
    }

    _initPop(count) {
      const pop = [];
      for (let i = 0; i < count; i++) {
        const net = new NeuralNet(this.layout, this.cfg.activation).randomize(this.rng);
        net.tag = this.rng.next();
        pop.push(net);
      }
      return pop;
    }

    tick()            { return this.world.tick(); }
    generationOver()  { return this.world.step >= this.cfg.steps || this.world.aliveCount() === 0; }

    finishGeneration() {
      const cells  = this.world.cells;
      const nPred  = this.predators.length;

      // Podział komórek zachowuje kolejność z reset(): predators pierwsze, prey po
      const predCells = cells.slice(0, nPred);
      const preyCells = cells.slice(nPred);

      const predFit = predCells.map(c => this.world.fitnessOf(c));
      const preyFit = preyCells.map(c => this.world.fitnessOf(c));

      const predStats = this._stats(predFit);
      const preyStats = this._stats(preyFit);

      const totalFood  = preyCells.reduce((s, c) => s + c.foodEaten, 0);
      const totalKills = predCells.reduce((s, c) => s + c.kills, 0);
      const preyEnergyTotal = predCells.reduce((s, c) => s + c.preyEnergy, 0);

      this.history.push({
        gen: this.gen,
        prey: {
          best:  round2(preyStats.best),
          avg:   round2(preyStats.avg),
          worst: round2(preyStats.worst),
          alive: this.world.alivePrey(),
          diversity: round3(this._diversity(this.prey)),
        },
        pred: {
          best:  round2(predStats.best),
          avg:   round2(predStats.avg),
          worst: round2(predStats.worst),
          alive: this.world.alivePredators(),
          diversity: round3(this._diversity(this.predators)),
        },
        totalFood,
        totalKills,
        preyEnergyTotal: round2(preyEnergyTotal),
      });

      // Aktualizacja rekordów
      if (preyStats.best > this.bestEverPrey.fitness) {
        const bn = this.prey[preyStats.bestIdx];
        this.bestEverPrey = { fitness: preyStats.best, genome: bn.genome.slice(), tag: bn.tag, gen: this.gen };
      }
      if (predStats.best > this.bestEverPred.fitness) {
        const bn = this.predators[predStats.bestIdx];
        this.bestEverPred = { fitness: predStats.best, genome: bn.genome.slice(), tag: bn.tag, gen: this.gen };
      }

      if (this.gen >= this.cfg.generations) {
        this.done = true;
        return true;
      }

      // Niezależna ewolucja każdego gatunku
      this.prey       = this._evolve(this.prey, preyFit);
      this.predators  = this._evolve(this.predators, predFit);
      this.gen++;
      this.world.reset(this.predators, this.prey);
      return false;
    }

    // Ogólna funkcja ewolucji — działa dla obu populacji
    _evolve(population, fitness) {
      const cfg     = this.cfg;
      const popSize = population.length;
      const ranked  = population
        .map((net, i) => ({ net, f: fitness[i] }))
        .sort((a, b) => b.f - a.f);

      const next = [];
      const eliteCount = Math.max(1, Math.floor(popSize * cfg.elitism));
      for (let i = 0; i < eliteCount && i < ranked.length; i++) {
        const e = ranked[i].net.clone();
        e.tag   = ranked[i].net.tag;
        next.push(e);
      }
      while (next.length < popSize) {
        const a     = this._tournament(ranked);
        const b     = this._tournament(ranked);
        const child = this._crossover(a, b);
        this._mutate(child);
        next.push(child);
      }
      return next;
    }

    _tournament(ranked, k = 3) {
      let best = null;
      for (let i = 0; i < k; i++) {
        const pick = ranked[this.rng.int(ranked.length)];
        if (!best || pick.f > best.f) best = pick;
      }
      return best.net;
    }

    _crossover(a, b) {
      const child = new NeuralNet(this.layout, this.cfg.activation);
      const ga = a.genome, gb = b.genome, gc = child.genome;
      for (let i = 0; i < gc.length; i++)
        gc[i] = this.rng.next() < 0.5 ? ga[i] : gb[i];
      child.tag = this.rng.next() < 0.5 ? a.tag : b.tag;
      return child;
    }

    _mutate(net) {
      const g = net.genome, rate = this.cfg.mutRate, str = this.cfg.mutStrength;
      for (let i = 0; i < g.length; i++)
        if (this.rng.next() < rate) g[i] += this.rng.gauss() * str;
      if (this.rng.next() < rate) {
        let t = net.tag + this.rng.gauss() * 0.05;
        t -= Math.floor(t);
        net.tag = t;
      }
    }

    _stats(fitness) {
      let best = -Infinity, worst = Infinity, sum = 0, bestIdx = 0;
      for (let i = 0; i < fitness.length; i++) {
        const f = fitness[i]; sum += f;
        if (f > best) { best = f; bestIdx = i; }
        if (f < worst) worst = f;
      }
      return { best, worst, avg: fitness.length ? sum / fitness.length : 0, bestIdx };
    }

    _diversity(population) {
      const n = population.length;
      if (n === 0) return 0;
      const len = population[0].genome.length;
      let acc = 0;
      for (let d = 0; d < len; d++) {
        let mean = 0;
        for (let i = 0; i < n; i++) mean += population[i].genome[d];
        mean /= n;
        let varr = 0;
        for (let i = 0; i < n; i++) { const x = population[i].genome[d] - mean; varr += x*x; }
        acc += Math.sqrt(varr / n);
      }
      return acc / len;
    }
  }

  function round2(x) { return Math.round(x * 100) / 100; }
  function round3(x) { return Math.round(x * 1000) / 1000; }

  global.Trainer = Trainer;
})(window);
