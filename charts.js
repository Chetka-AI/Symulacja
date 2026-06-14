/*
 * Lekki moduł wykresów liniowych na <canvas>.
 * Bez zależności zewnętrznych — działa offline.
 */
(function (global) {
  'use strict';

  const COLORS = {
    grid: '#26303f',
    axis: '#54637a',
    text: '#8b98a9',
    bg: 'transparent',
  };

  function setupCanvas(canvas) {
    const dpr = global.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {number[]} xs  wartości osi X (np. numery pokoleń)
   * @param {Array<{data:number[], color:string, width?:number}>} series
   */
  function lineChart(canvas, xs, series) {
    const { ctx, w, h } = setupCanvas(canvas);
    ctx.clearRect(0, 0, w, h);

    const padL = 38, padR = 10, padT = 10, padB = 22;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    // zakresy
    let minY = Infinity, maxY = -Infinity;
    for (const s of series) {
      for (const v of s.data) {
        if (v < minY) minY = v;
        if (v > maxY) maxY = v;
      }
    }
    if (!isFinite(minY)) { minY = 0; maxY = 1; }
    if (minY === maxY) { maxY = minY + 1; }
    // niewielki margines u góry
    maxY += (maxY - minY) * 0.08;

    const xMin = xs.length ? xs[0] : 0;
    const xMax = xs.length ? xs[xs.length - 1] : 1;
    const xSpan = xMax - xMin || 1;

    const X = (x) => padL + ((x - xMin) / xSpan) * plotW;
    const Y = (y) => padT + plotH - ((y - minY) / (maxY - minY)) * plotH;

    // siatka pozioma + etykiety Y
    ctx.font = '10px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.text;
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const val = minY + (maxY - minY) * (i / ticks);
      const py = Y(val);
      ctx.beginPath();
      ctx.moveTo(padL, py);
      ctx.lineTo(w - padR, py);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(fmt(val), padL - 6, py);
    }

    // etykiety X (start i koniec)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(String(Math.round(xMin)), padL, h - padB + 5);
    ctx.fillText(String(Math.round(xMax)), w - padR, h - padB + 5);

    // serie
    for (const s of series) {
      ctx.beginPath();
      ctx.lineWidth = s.width || 2;
      ctx.strokeStyle = s.color;
      ctx.lineJoin = 'round';
      for (let i = 0; i < s.data.length; i++) {
        const px = X(xs[i]);
        const py = Y(s.data[i]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  function fmt(v) {
    if (Math.abs(v) >= 1000) return Math.round(v / 100) / 10 + 'k';
    if (Math.abs(v) >= 10) return Math.round(v).toString();
    return (Math.round(v * 10) / 10).toString();
  }

  global.Charts = { lineChart };
})(window);
