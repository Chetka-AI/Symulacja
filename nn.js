/*
 * Prosta sieć neuronowa typu feed-forward.
 * Wagi i biasy są spłaszczone do jednego wektora ("genomu"),
 * dzięki czemu neuroewolucja może je łatwo krzyżować i mutować.
 */
(function (global) {
  'use strict';

  const ACTIVATIONS = {
    tanh: (x) => Math.tanh(x),
    sigmoid: (x) => 1 / (1 + Math.exp(-x)),
    relu: (x) => (x > 0 ? x : 0),
  };

  class NeuralNet {
    /**
     * @param {number[]} layout  np. [5, 6, 2] — wejścia, ukryte..., wyjścia
     * @param {string}   activation  'tanh' | 'sigmoid' | 'relu'
     */
    constructor(layout, activation = 'tanh') {
      this.layout = layout.slice();
      this.activation = activation;
      this.act = ACTIVATIONS[activation] || ACTIVATIONS.tanh;
      this.genomeSize = NeuralNet.genomeSizeFor(layout);
      this.genome = new Float32Array(this.genomeSize);
    }

    static genomeSizeFor(layout) {
      let n = 0;
      for (let i = 1; i < layout.length; i++) {
        n += layout[i - 1] * layout[i]; // wagi
        n += layout[i];                 // biasy
      }
      return n;
    }

    randomize(rng) {
      for (let i = 0; i < this.genome.length; i++) {
        this.genome[i] = rng.gauss(); // inicjalizacja ~N(0,1)
      }
      return this;
    }

    setGenome(arr) {
      this.genome = arr instanceof Float32Array ? arr : Float32Array.from(arr);
      return this;
    }

    /**
     * Propagacja w przód.
     * @param {number[]|Float32Array} inputs
     * @returns {number[]} wyjścia (warstwa wyjściowa zawsze tanh -> -1..1)
     */
    forward(inputs) {
      const g = this.genome;
      const layout = this.layout;
      let cur = inputs;
      let ptr = 0;

      for (let l = 1; l < layout.length; l++) {
        const inN = layout[l - 1];
        const outN = layout[l];
        const next = new Array(outN);
        const isOutput = l === layout.length - 1;

        for (let o = 0; o < outN; o++) {
          let sum = 0;
          for (let i = 0; i < inN; i++) {
            sum += cur[i] * g[ptr++];
          }
          sum += g[ptr++]; // bias
          // warstwa wyjściowa: tanh dla sterowania w zakresie -1..1
          next[o] = isOutput ? Math.tanh(sum) : this.act(sum);
        }
        cur = next;
      }
      return cur;
    }

    clone() {
      const nn = new NeuralNet(this.layout, this.activation);
      nn.genome = this.genome.slice();
      return nn;
    }
  }

  NeuralNet.ACTIVATIONS = ACTIVATIONS;
  global.NeuralNet = NeuralNet;
})(window);
