/*
 * Główny kontroler aplikacji: spina panel sterowania, pętlę treningu
 * (requestAnimationFrame) i renderowanie. Dwie populacje (prey / predators)
 * ewoluują niezależnie i współdziałają w tym samym świecie.
 */
(function () {
  'use strict';

  const $ = UI.$;
  let trainer  = null;
  let renderer = null;
  let running  = false;
  let paused   = false;
  let rafId    = 0;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    UI.bindControls();
    renderer = new UI.WorldRenderer($('world'));

    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => UI.switchView(tab.dataset.view));
    });

    $('btn-start').addEventListener('click', startTraining);
    $('btn-pause').addEventListener('click', togglePause);
    $('btn-stop').addEventListener('click',  stopTraining);
    $('btn-again').addEventListener('click', () => UI.switchView('setup'));
    $('btn-export').addEventListener('click', exportData);

    let rt = 0;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        if (trainer && trainer.history.length &&
            document.querySelector('.view-analysis').classList.contains('is-active'))
          UI.renderAnalysis(trainer);
      }, 150);
    });

    showOverlay(true);
  }

  function startTraining() {
    const cfg = readAndValidate();
    if (!cfg) return;

    trainer = new Trainer(cfg);
    running = true;
    paused  = false;
    $('btn-pause').textContent = '⏸ Pauza';
    showOverlay(false);
    UI.switchView('sim');
    UI.renderStats(trainer);
    UI.setProgress(trainer);
    loop();
  }

  function readAndValidate() {
    const cfg = UI.readConfig();
    if ((cfg.preyCount || 0) < 2) {
      alert('Liczba ofiar musi wynosić co najmniej 2.'); return null;
    }
    if ((cfg.predatorCount || 0) < 1) {
      alert('Liczba drapieżników musi wynosić co najmniej 1.'); return null;
    }
    return cfg;
  }

  function loop() {
    if (!running || paused) return;
    const turbo = $('p-turbo').checked;

    if (turbo) {
      const end = performance.now() + 12;
      do { if (!stepOnce()) return; } while (performance.now() < end && running && !paused);
    } else {
      const n = Number($('p-speed').value);
      for (let i = 0; i < n; i++) { if (!stepOnce()) return; }
      renderer.render(trainer.world);
    }

    UI.renderStats(trainer);
    UI.setProgress(trainer);
    if (running && !paused) rafId = requestAnimationFrame(loop);
  }

  function stepOnce() {
    trainer.tick();
    if (trainer.generationOver()) {
      const done = trainer.finishGeneration();
      if (done) { finishTraining(); return false; }
    }
    return true;
  }

  function finishTraining() {
    running = false; paused = false;
    cancelAnimationFrame(rafId);
    UI.setProgress(trainer);
    UI.switchView('analysis');

  }

  function togglePause() {
    if (!running) return;
    paused = !paused;
    $('btn-pause').textContent = paused ? '▶ Wznów' : '⏸ Pauza';
    if (!paused) loop();
  }

  function stopTraining() {
    if (!trainer) { UI.switchView('setup'); return; }
    running = false; paused = false;
    cancelAnimationFrame(rafId);
    if (trainer.history.length) {
      UI.renderAnalysis(trainer);
      UI.switchView('analysis');
    } else {
      showOverlay(true);
      UI.switchView('setup');
    }
  }

  function exportData() {
    if (!trainer) return;
    const payload = {
      generatedAt: new Date().toISOString(),
      config:  trainer.cfg,
      layout:  trainer.layout,
      bestEverPrey: {
        gen: trainer.bestEverPrey.gen,
        fitness: trainer.bestEverPrey.fitness,
        genome: trainer.bestEverPrey.genome ? Array.from(trainer.bestEverPrey.genome) : null,
      },
      bestEverPred: {
        gen: trainer.bestEverPred.gen,
        fitness: trainer.bestEverPred.fitness,
        genome: trainer.bestEverPred.genome ? Array.from(trainer.bestEverPred.genome) : null,
      },
      history: trainer.history,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'neurolife-' + Date.now() + '.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function showOverlay(show) {
    $('sim-overlay').classList.toggle('hidden', !show);
  }
})();
