// Montagem dos jogos, jogos aleatórios de comparação, conferência e validação histórica.
(function () {
  const LF = window.LF;

  // Prêmios fixos de 11, 12 e 13 acertos (2026). 14 e 15 dependem do rateio do concurso.
  LF.PREMIO_FIXO = { 11: 7, 12: 14, 13: 35 };

  // Sorteia "k" itens de "itens" com chance proporcional ao peso (Efraimidis–Spirakis).
  function amostraPonderada(itens, pesos, k) {
    const chaves = itens.map((it, i) => [Math.pow(LF.rand(), 1 / pesos[i]), it]);
    chaves.sort((a, b) => b[0] - a[0]);
    return chaves.slice(0, k).map((x) => x[1]);
  }

  // Todas as combinações de "k" itens (só quando são poucas).
  function combinacoes(itens, k, cb) {
    const idx = [];
    const rec = (ini, prof) => {
      if (prof === k) return cb(idx.map((i) => itens[i]));
      for (let i = ini; i <= itens.length - (k - prof); i++) {
        idx[prof] = i;
        rec(i + 1, prof + 1);
      }
    };
    rec(0, 0);
  }

  function passaFiltros(mask, filtros, ultimoMask) {
    if (!filtros) return true;
    const f = LF.metricas(mask, ultimoMask);
    for (const id in filtros) {
      const r = filtros[id];
      if (!r || !r.ativo) continue;
      const v = f[id];
      if (v == null) continue;
      if (v < r.min || v > r.max) return false;
    }
    return true;
  }

  /**
   * Gera jogos com as obrigatórias + uma combinação das opcionais.
   * cfg: { cat: {n: 'obrig'|'opc'|'recus'}, scores: {n: score}, tamanho, quantidade, filtros, ultimoMask, amostras }
   */
  LF.gerarJogos = function (cfg) {
    const obrig = [], opc = [];
    for (let n = 1; n <= 25; n++) {
      if (cfg.cat[n] === 'obrig') obrig.push(n);
      else if (cfg.cat[n] === 'opc') opc.push(n);
    }
    const falta = cfg.tamanho - obrig.length;
    if (falta < 0) return { erro: `Há ${obrig.length} obrigatórias, mais que as ${cfg.tamanho} dezenas do jogo.` };
    if (falta > opc.length)
      return { erro: `Faltam dezenas: o jogo tem ${cfg.tamanho}, mas só há ${obrig.length} obrigatórias + ${opc.length} opcionais.` };
    const obrigMask = LF.maskDe(obrig);
    const total = LF.comb(opc.length, falta);
    const quantidade = Math.min(cfg.quantidade, total);
    const avisos = [];
    if (quantidade < cfg.quantidade)
      avisos.push(`Só existem ${total} combinações diferentes com essas dezenas; foram gerados ${quantidade} jogos.`);

    // 1) Candidatos
    const cand = new Map(); // mask -> score
    const sc = (mk) => {
      let s = 0;
      for (let n = 1; n <= 25; n++) if (mk & (1 << (n - 1))) s += cfg.scores[n] || 0;
      return s;
    };
    const filtrar = cfg.tamanho === 15 ? cfg.filtros : null;
    let reprovados = 0;
    const add = (lista) => {
      const mk = obrigMask | LF.maskDe(lista);
      if (cand.has(mk)) return;
      if (!passaFiltros(mk, filtrar, cfg.ultimoMask)) {
        reprovados++;
        return;
      }
      cand.set(mk, sc(mk));
    };
    const limite = cfg.amostras || 20000;
    if (total <= limite) combinacoes(opc, falta, add);
    else {
      const pesos = opc.map((n) => Math.exp(0.8 * (cfg.scores[n] || 0)));
      let tentativas = 0;
      while (cand.size < limite && tentativas < limite * 3) {
        add(amostraPonderada(opc, pesos, falta));
        tentativas++;
      }
    }
    // Se os filtros cortaram demais, completa sem filtro.
    let lista = [...cand.entries()];
    if (lista.length < quantidade) {
      avisos.push('Os filtros deixaram poucas combinações; alguns jogos foram gerados sem filtro.');
      const extra = [];
      const ja = new Set(lista.map((x) => x[0]));
      const sem = { cat: cfg.cat, scores: cfg.scores, tamanho: cfg.tamanho, quantidade, filtros: null, ultimoMask: cfg.ultimoMask, amostras: cfg.amostras };
      for (const mk of LF.gerarJogos(sem).jogos || []) if (!ja.has(mk)) extra.push([mk, sc(mk)]);
      lista = lista.concat(extra);
    } else if (reprovados && filtrar) {
      // nada a avisar: filtros funcionaram
    }

    // 2) Escolha: melhor pontuação, penalizando repetir sempre as mesmas opcionais (para variar).
    lista.sort((a, b) => b[1] - a[1]);
    const pool = lista.slice(0, Math.max(quantidade * 4, 3000));
    const numsPool = pool.map(([mk]) => LF.numsDe(mk & ~obrigMask));
    const uso = new Float64Array(26);
    const escolhidos = [];
    const usado = new Uint8Array(pool.length);
    const espSc = pool.length ? Math.abs(pool[0][1] - pool[pool.length - 1][1]) / Math.max(1, falta) + 0.5 : 1;
    for (let t = 0; t < quantidade; t++) {
      let melhor = -1, melhorV = -Infinity;
      const esperado = ((t + 1) * falta) / Math.max(1, opc.length);
      for (let i = 0; i < pool.length; i++) {
        if (usado[i]) continue;
        let pen = 0;
        for (const n of numsPool[i]) pen += Math.max(0, uso[n] + 1 - esperado);
        const v = pool[i][1] - pen * espSc * 0.6;
        if (v > melhorV) {
          melhorV = v;
          melhor = i;
        }
      }
      if (melhor < 0) break;
      usado[melhor] = 1;
      escolhidos.push(pool[melhor][0]);
      for (const n of numsPool[melhor]) uso[n]++;
    }
    return { jogos: escolhidos, avisos, combinacoes: total };
  };

  LF.jogosAleatorios = function (quantidade, tamanho) {
    const r = [];
    for (let i = 0; i < quantidade; i++) {
      const nums = Array.from({ length: 25 }, (_, k) => k + 1);
      for (let j = 24; j > 0; j--) {
        const x = Math.floor(LF.rand() * (j + 1));
        [nums[j], nums[x]] = [nums[x], nums[j]];
      }
      r.push(LF.maskDe(nums.slice(0, tamanho)));
    }
    return r;
  };

  // Valor de cada faixa (11..15) para um concurso; usa o rateio oficial quando houver.
  LF.valoresFaixa = function (draw) {
    const v = { ...LF.PREMIO_FIXO, 14: null, 15: null };
    if (draw && draw.r) {
      const r = draw.r; // [g15,v15,g14,v14,g13,v13,g12,v12,g11,v11]
      [15, 14, 13, 12, 11].forEach((fx, i) => {
        if (r[i * 2 + 1] > 0) v[fx] = r[i * 2 + 1];
      });
    }
    return v;
  };

  // Confere um jogo (de 15 a 20 dezenas) contra o resultado.
  LF.conferirJogo = function (mask, resultado, valores) {
    const tam = LF.pop(mask);
    const acertos = LF.pop(mask & resultado.m);
    const faixas = {};
    let premio = 0, pendente = false;
    for (let k = 11; k <= 15; k++) {
      const q = LF.comb(acertos, k) * LF.comb(tam - acertos, 15 - k);
      if (!q) continue;
      faixas[k] = q;
      if (valores[k] == null) pendente = true;
      else premio += q * valores[k];
    }
    return { acertos, faixas, premio, pendente };
  };

  // Resumo de uma lista de jogos contra um resultado.
  LF.conferirLista = function (masks, resultado) {
    const valores = LF.valoresFaixa(resultado);
    const jogos = masks.map((mk) => LF.conferirJogo(mk, resultado, valores));
    const dist = {};
    jogos.forEach((j) => (dist[j.acertos] = (dist[j.acertos] || 0) + 1));
    return {
      jogos,
      dist,
      media: LF.media(jogos.map((j) => j.acertos)),
      melhor: Math.max(0, ...jogos.map((j) => j.acertos)),
      premiados: jogos.filter((j) => j.premio > 0 || j.pendente).length,
      premio: jogos.reduce((s, j) => s + j.premio, 0),
      pendente: jogos.some((j) => j.pendente),
    };
  };

  /**
   * Validação histórica: para cada um dos últimos "concursos", faz a análise só com o passado,
   * gera os jogos e compara com o que saiu (e com jogos aleatórios).
   */
  LF.validarHistorico = async function (draws, opts, progresso) {
    const { concursos = 100, jogos = 10, tamanho = 15, nObrig = 5, nRecus = 5, pesos } = opts;
    const ini = draws.length - concursos;
    const estudo = LF.estudoMetricas(draws, ini);
    const filtros = LF.filtrosPadrao(estudo);
    const nos = [], alea = [];
    const distNos = {}, distAlea = {};
    for (let i = ini; i < draws.length; i++) {
      const a = LF.analisar(draws, i, pesos);
      const cat = LF.sugerirCategorias(a, nObrig, nRecus);
      const scores = {};
      a.nums.forEach((x) => (scores[x.n] = x.score));
      const g = LF.gerarJogos({ cat, scores, tamanho, quantidade: jogos, filtros, ultimoMask: draws[i - 1].m, amostras: 700 });
      const al = LF.jogosAleatorios(jogos, tamanho);
      const res = draws[i];
      for (const mk of g.jogos || []) {
        const h = LF.pop(mk & res.m);
        nos.push(h);
        distNos[h] = (distNos[h] || 0) + 1;
      }
      for (const mk of al) {
        const h = LF.pop(mk & res.m);
        alea.push(h);
        distAlea[h] = (distAlea[h] || 0) + 1;
      }
      // acerto das categorias: quantas obrigatórias saíram / quantas recusadas saíram
      if (progresso && (i - ini) % 5 === 4) {
        progresso((i - ini + 1) / concursos);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    const premiados = (arr) => arr.filter((h) => h >= 11).length;
    return {
      concursos, jogos, tamanho,
      nos: { media: LF.media(nos), dist: distNos, total: nos.length, premiados: premiados(nos) },
      alea: { media: LF.media(alea), dist: distAlea, total: alea.length, premiados: premiados(alea) },
    };
  };

  // Faixas padrão dos filtros: onde caiu ~70% dos concursos seguintes a um jogo parecido com o último.
  LF.filtrosPadrao = function (estudo) {
    const r = {};
    for (const md of LF.METRICAS) {
      if (!md.filtro) continue;
      const e = estudo[md.id];
      const lo = Math.min(e.depois.p15, e.p10), hi = Math.max(e.depois.p85, e.p90);
      r[md.id] = { ativo: true, min: lo, max: hi };
    }
    return r;
  };
})();
