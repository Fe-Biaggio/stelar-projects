// Carrega o histórico (arquivo do site) e completa com concursos novos da Caixa ou digitados à mão.
(function () {
  const LF = window.LF;
  const API = 'https://servicebus2.caixa.gov.br/portaldeloterias/api/lotofacil';
  const CACHE = 'lotofacil.caixa.v1';

  const doArquivo = ([c, d, n, r]) => ({ c, d, n, m: LF.maskDe(n), r, fonte: 'oficial' });

  LF.dados = {
    draws: [],
    atualizadoEm: null,
    online: false,

    montar(extras) {
      const porC = new Map();
      for (const x of (window.LOTO_DADOS && window.LOTO_DADOS.concursos) || []) porC.set(x[0], doArquivo(x));
      for (const e of extras) {
        const atual = porC.get(e.c);
        // resultado oficial sempre vence o digitado à mão
        if (!atual || (atual.fonte === 'manual' && e.fonte !== 'manual')) porC.set(e.c, { ...e, m: LF.maskDe(e.n) });
      }
      this.draws = [...porC.values()].sort((a, b) => a.c - b.c);
      this.atualizadoEm = window.LOTO_DADOS && window.LOTO_DADOS.atualizadoEm;
      return this.draws;
    },

    ultimo() {
      return this.draws[this.draws.length - 1];
    },
    porConcurso(c) {
      return this.draws.find((d) => d.c === c);
    },

    // Busca na Caixa os concursos que faltam (funciona no GitHub Pages; dentro do Claude é bloqueado).
    async buscarCaixa() {
      const cache = LF.ls.get(CACHE, []);
      const pegar = async (n) => {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 8000);
        try {
          const r = await fetch(API + (n ? '/' + n : ''), { signal: ctl.signal, headers: { Accept: 'application/json' } });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const j = await r.json();
          const faixas = {};
          (j.listaRateioPremio || []).forEach((f) => (faixas[f.faixa] = f));
          const rr = [];
          [1, 2, 3, 4, 5].forEach((fx) => rr.push(+(faixas[fx] || {}).numeroDeGanhadores || 0, +(faixas[fx] || {}).valorPremio || 0));
          return { c: +j.numero, d: j.dataApuracao, n: j.listaDezenas.map(Number).sort((a, b) => a - b), r: rr, fonte: 'caixa' };
        } finally {
          clearTimeout(t);
        }
      };
      const ultimoLocal = this.ultimo() ? this.ultimo().c : 0;
      const novo = await pegar();
      const novos = [novo];
      for (let n = Math.max(ultimoLocal + 1, novo.c - 30); n < novo.c; n++) {
        if (this.porConcurso(n) && this.porConcurso(n).fonte !== 'manual') continue;
        try {
          novos.push(await pegar(n));
        } catch (e) {
          break;
        }
      }
      const porC = new Map(cache.map((x) => [x.c, x]));
      novos.forEach((x) => porC.set(x.c, x));
      const lista = [...porC.values()].filter((x) => x.c > ((window.LOTO_DADOS.concursos.at(-1) || [0])[0] || 0));
      LF.ls.set(CACHE, lista);
      this.online = true;
      return novos.filter((x) => x.c > ultimoLocal).length;
    },

    cacheCaixa() {
      return LF.ls.get(CACHE, []);
    },
  };
})();
