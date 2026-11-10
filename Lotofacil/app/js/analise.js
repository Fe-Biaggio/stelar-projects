// Métricas dos concursos e pontuação de cada dezena (1–25).
(function () {
  const LF = window.LF;
  const m = LF.maskDe;
  const faixa = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

  const G = (LF.GRUPOS = {
    pares: m(faixa(1, 25).filter((n) => n % 2 === 0)),
    baixos: m(faixa(1, 13)),
    primos: m([2, 3, 5, 7, 11, 13, 17, 19, 23]),
    moldura: m([1, 2, 3, 4, 5, 6, 10, 11, 15, 16, 20, 21, 22, 23, 24, 25]),
    fibonacci: m([1, 2, 3, 5, 8, 13, 21]),
    mult3: m([3, 6, 9, 12, 15, 18, 21, 24]),
    linhas: [0, 1, 2, 3, 4].map((r) => m(faixa(r * 5 + 1, r * 5 + 5))),
    colunas: [0, 1, 2, 3, 4].map((c) => m([1, 6, 11, 16, 21].map((n) => n + c))),
  });
  LF.linhaDe = (n) => Math.floor((n - 1) / 5);
  LF.colunaDe = (n) => (n - 1) % 5;

  // Métricas de um jogo de 15 dezenas (prev = jogo anterior, para "repetidos").
  LF.metricas = function (mask, prev) {
    const nums = LF.numsDe(mask);
    let soma = 0, consecutivos = 0, maiorGap = 0;
    for (let i = 0; i < nums.length; i++) {
      soma += nums[i];
      if (i) {
        const d = nums[i] - nums[i - 1];
        if (d === 1) consecutivos++;
        if (d > maiorGap) maiorGap = d;
      }
    }
    return {
      pares: LF.pop(mask & G.pares),
      baixos: LF.pop(mask & G.baixos),
      soma,
      repetidos: prev ? LF.pop(mask & prev) : null,
      moldura: LF.pop(mask & G.moldura),
      primos: LF.pop(mask & G.primos),
      fibonacci: LF.pop(mask & G.fibonacci),
      mult3: LF.pop(mask & G.mult3),
      consecutivos,
      maiorGap,
      linhas: G.linhas.map((l) => LF.pop(mask & l)),
      colunas: G.colunas.map((c) => LF.pop(mask & c)),
    };
  };

  // Métricas exibidas nos cartões de análise e usadas como filtros dos jogos.
  LF.METRICAS = [
    { id: 'pares', nome: 'Pares', desc: 'Quantas dezenas pares (ímpares = 15 − pares).', filtro: true },
    { id: 'baixos', nome: 'Baixas (1–13)', desc: 'Dezenas de 1 a 13 (altas = 15 − baixas).', filtro: true },
    { id: 'soma', nome: 'Soma das dezenas', desc: 'Soma das 15 dezenas sorteadas.', filtro: true },
    { id: 'repetidos', nome: 'Repetidas do anterior', desc: 'Dezenas que repetiram do concurso anterior.', filtro: true },
    { id: 'moldura', nome: 'Na moldura', desc: 'Dezenas na borda do volante (16 das 25).', filtro: true },
    { id: 'primos', nome: 'Primos', desc: '2, 3, 5, 7, 11, 13, 17, 19, 23.', filtro: true },
    { id: 'consecutivos', nome: 'Vizinhas', desc: 'Pares de dezenas seguidas (ex.: 7 e 8).', filtro: true },
    { id: 'maiorGap', nome: 'Maior espaço', desc: 'Maior distância entre duas dezenas seguidas do jogo.', filtro: true },
    { id: 'fibonacci', nome: 'Fibonacci', desc: '1, 2, 3, 5, 8, 13, 21.', filtro: false },
    { id: 'mult3', nome: 'Múltiplos de 3', desc: '3, 6, 9, 12, 15, 18, 21, 24.', filtro: false },
  ];

  // Contagens acumuladas por dezena (para frequência em qualquer janela sem repetir laços).
  let cumCache = null;
  LF.acumulado = function (draws) {
    if (cumCache && cumCache.len === draws.length && cumCache.ult === draws[draws.length - 1].c) return cumCache.cum;
    const cum = new Int32Array((draws.length + 1) * 25);
    for (let i = 0; i < draws.length; i++) {
      const mk = draws[i].m;
      for (let k = 0; k < 25; k++) cum[(i + 1) * 25 + k] = cum[i * 25 + k] + ((mk >>> k) & 1);
    }
    cumCache = { len: draws.length, ult: draws[draws.length - 1].c, cum };
    return cum;
  };

  // Série histórica de cada métrica + "o que veio depois" de valores parecidos com o último.
  LF.estudoMetricas = function (draws, upto) {
    upto = upto ?? draws.length;
    const series = {};
    for (const md of LF.METRICAS) series[md.id] = [];
    const linhas = [[], [], [], [], []], colunas = [[], [], [], [], []];
    for (let i = 0; i < upto; i++) {
      const f = LF.metricas(draws[i].m, i ? draws[i - 1].m : 0);
      for (const md of LF.METRICAS) series[md.id].push(md.id === 'repetidos' && !i ? null : f[md.id]);
      f.linhas.forEach((v, r) => linhas[r].push(v));
      f.colunas.forEach((v, c) => colunas[c].push(v));
    }
    const estudar = (serie) => {
      const vals = serie.filter((v) => v != null);
      const ord = [...vals].sort((a, b) => a - b);
      const ultimo = serie[serie.length - 1];
      // Próximos valores depois de concursos com valor igual ao último (ou parecido, se houver poucos casos).
      let tol = 0, prox = [];
      while (tol < 30) {
        prox = [];
        for (let i = 0; i < serie.length - 1; i++)
          if (serie[i] != null && serie[i + 1] != null && Math.abs(serie[i] - ultimo) <= tol) prox.push(serie[i + 1]);
        if (prox.length >= 60 || tol >= 25) break;
        tol += serie === series.soma ? 3 : 1;
      }
      const ordP = [...prox].sort((a, b) => a - b);
      const dist = {};
      vals.forEach((v) => (dist[v] = (dist[v] || 0) + 1));
      return {
        ultimo,
        media: LF.media(vals),
        p10: LF.percentil(ord, 0.1),
        p90: LF.percentil(ord, 0.9),
        moda: +Object.entries(dist).sort((a, b) => b[1] - a[1])[0][0],
        dist,
        total: vals.length,
        depois: { casos: prox.length, tol, media: LF.media(prox), p15: LF.percentil(ordP, 0.15), p85: LF.percentil(ordP, 0.85) },
      };
    };
    const r = {};
    for (const md of LF.METRICAS) r[md.id] = estudar(series[md.id]);
    r.linhas = linhas.map((s) => estudar(s));
    r.colunas = colunas.map((s) => estudar(s));
    // Quantas vezes uma linha/coluna ficou vazia e o que aconteceu no concurso seguinte.
    const vazio = (s) => {
      let vazias = 0, depoisVazia = 0;
      for (let i = 0; i < s.length; i++)
        if (s[i] === 0) {
          vazias++;
          if (i + 1 < s.length && s[i + 1] > 0) depoisVazia++;
        }
      return { vazias, depoisVazia };
    };
    r.linhasVazias = linhas.map(vazio);
    r.colunasVazias = colunas.map(vazio);
    return r;
  };

  LF.PESOS_PADRAO = { equilibrio: 1, tendencia: 0.5, atraso: 0.7, compensacao: 0.8 };
  LF.NOMES_PESOS = {
    equilibrio: ['Equilíbrio de longo prazo', 'Dezenas que saíram menos que a média em todo o histórico ganham pontos.'],
    tendencia: ['Tendência recente', 'Dezenas que estão saindo muito nos últimos 25 concursos ganham pontos.'],
    atraso: ['Atraso', 'Dezenas que não saem há alguns concursos ganham pontos.'],
    compensacao: ['Compensação do último jogo', 'Se o último teve muitas pares, baixas ou uma linha/coluna cheia, o lado oposto ganha pontos.'],
  };

  // Pontua as 25 dezenas usando só os concursos até "upto" (exclusivo).
  LF.analisar = function (draws, upto, pesos, opts = {}) {
    upto = upto ?? draws.length;
    pesos = Object.assign({}, LF.PESOS_PADRAO, pesos || {});
    const cum = LF.acumulado(draws);
    const N = upto;
    const freq = (k, w) => cum[N * 25 + k] - cum[Math.max(0, N - w) * 25 + k];
    const ult = draws[N - 1].m;
    const f = LF.metricas(ult);
    const nums = [];
    for (let k = 0; k < 25; k++) {
      const n = k + 1;
      const total = freq(k, N);
      const zLongo = (total - N * 0.6) / Math.sqrt(N * 0.24);
      const curto = freq(k, 25);
      const zCurto = (curto - Math.min(25, N) * 0.6) / Math.sqrt(Math.min(25, N) * 0.24);
      let atraso = 0;
      while (atraso < N && !((draws[N - 1 - atraso].m >>> k) & 1)) atraso++;
      let maxAtraso = null;
      if (opts.completo) {
        maxAtraso = 0;
        let run = 0;
        for (let i = 0; i < N; i++) {
          if ((draws[i].m >>> k) & 1) run = 0;
          else if (++run > maxAtraso) maxAtraso = run;
        }
      }
      const par = n % 2 === 0, baixo = n <= 13;
      const dPar = (f.pares - 7.2) / 2, dBaixo = (f.baixos - 7.8) / 2;
      const comp =
        ((par ? -dPar : dPar) + (baixo ? -dBaixo : dBaixo) + (3 - f.linhas[LF.linhaDe(n)]) / 2 + (3 - f.colunas[LF.colunaDe(n)]) / 2) / 2;
      const c = {
        equilibrio: LF.clamp(-zLongo / 2, -1.5, 1.5),
        tendencia: LF.clamp(zCurto / 2, -1.5, 1.5),
        atraso: Math.min(atraso, 5) / 2.5 - 0.4,
        compensacao: LF.clamp(comp, -1.5, 1.5),
      };
      let score = 0;
      for (const p in c) score += (pesos[p] || 0) * c[p];
      nums.push({
        n, total, pct: total / N, curto, jan100: freq(k, 100), jan500: freq(k, 500),
        zLongo, zCurto, atraso, maxAtraso, comp: c, score,
      });
    }
    return { N, ultimo: draws[N - 1], metricasUltimo: f, nums, pesos };
  };

  // Frases curtas explicando a pontuação de uma dezena.
  LF.motivos = function (x, pesos) {
    const r = [];
    if (x.zLongo <= -1) r.push(`saiu menos que a média no histórico (${LF.num(x.pct * 100, 1)}%)`);
    if (x.zLongo >= 1) r.push(`saiu mais que a média no histórico (${LF.num(x.pct * 100, 1)}%)`);
    if (x.curto >= 18) r.push(`quente: ${x.curto} vezes nos últimos 25`);
    if (x.curto <= 12) r.push(`fria: só ${x.curto} vezes nos últimos 25`);
    if (x.atraso >= 2) r.push(`atrasada há ${x.atraso} concursos`);
    if (x.atraso === 0) r.push('saiu no último concurso');
    if ((pesos.compensacao || 0) * x.comp.compensacao >= 0.4) r.push('lado do volante que veio fraco no último');
    if ((pesos.compensacao || 0) * x.comp.compensacao <= -0.4) r.push('lado do volante que veio forte no último');
    return r;
  };

  // ---------- Análise de acontecimento ----------
  // Cada análise olha os concursos de trás para frente. Se a condição vale no último concurso, a dezena
  // ganha 0,4; se vale também no anterior, ganha 40% do que falta para 1 (0,4 + 0,6×0,4 = 0,64), e assim
  // por diante até a sequência quebrar. A pontuação final da dezena é a soma das análises ligadas.
  const PRIMOS = [2, 3, 5, 7, 11, 13, 17, 19, 23];
  const fDe = (d) => d._f || (d._f = LF.metricas(d.m));
  LF.ACONTECIMENTOS = [
    {
      id: 'ausencia', nome: 'Não saiu', padrao: true,
      desc: 'A dezena não saiu no concurso. Cada concurso seguido sem ela soma mais pontos.',
      cond: (n, d) => !(d.m & (1 << (n - 1))),
    },
    {
      id: 'paridade', nome: 'Paridade oposta', padrao: true,
      desc: 'Dezenas ímpares pontuam quando o concurso teve maioria de pares (8 ou mais), e pares pontuam quando teve maioria de ímpares.',
      cond: (n, d) => (n % 2 === 0 ? fDe(d).pares <= 7 : fDe(d).pares >= 8),
    },
    {
      id: 'altura', nome: 'Baixas × altas', padrao: true,
      desc: 'Dezenas altas (14–25) pontuam quando o concurso teve maioria de baixas (8 ou mais de 1–13), e baixas pontuam quando teve maioria de altas.',
      cond: (n, d) => (n <= 13 ? fDe(d).baixos <= 7 : fDe(d).baixos >= 8),
    },
    {
      id: 'linha', nome: 'Linha fraca', padrao: true,
      desc: 'A linha da dezena no volante teve 2 ou menos dezenas sorteadas (a média é 3).',
      cond: (n, d) => fDe(d).linhas[LF.linhaDe(n)] <= 2,
    },
    {
      id: 'coluna', nome: 'Coluna fraca', padrao: true,
      desc: 'A coluna da dezena no volante teve 2 ou menos dezenas sorteadas (a média é 3).',
      cond: (n, d) => fDe(d).colunas[LF.colunaDe(n)] <= 2,
    },
    {
      id: 'moldura', nome: 'Moldura × miolo', padrao: true,
      desc: 'Dezenas da borda pontuam quando a moldura veio abaixo da média (9 ou menos das 16); dezenas do miolo pontuam quando o miolo veio abaixo da média (5 ou menos das 9).',
      cond: (n, d) => (LF.GRUPOS.moldura & (1 << (n - 1)) ? fDe(d).moldura <= 9 : 15 - fDe(d).moldura <= 5),
    },
    {
      id: 'primos', nome: 'Primos', padrao: true,
      desc: 'Primos pontuam quando o concurso teve poucos primos (4 ou menos; a média é 5,4); os não primos pontuam quando teve muitos (6 ou mais).',
      cond: (n, d) => (PRIMOS.includes(n) ? fDe(d).primos <= 4 : fDe(d).primos >= 6),
    },
    {
      id: 'buraco', nome: 'Dentro de um buraco', padrao: true,
      desc: 'Quando o concurso teve dezenas muito espaçadas, as que ficaram num buraco de 4 ou mais números sem sorteio pontuam (a ideia de que depois vêm mais juntas).',
      cond: (n, d) => {
        if (d.m & (1 << (n - 1))) return false;
        let a = n, b = n;
        while (a > 1 && !(d.m & (1 << (a - 2)))) a--;
        while (b < 25 && !(d.m & (1 << b))) b++;
        return b - a + 1 >= 4;
      },
    },
    {
      id: 'repetiu', nome: 'Saiu no anterior', padrao: false,
      desc: 'Em média 9 das 15 dezenas repetem do concurso anterior. Pontua quem saiu (o oposto de "Não saiu"; ligue só um dos dois).',
      cond: (n, d) => !!(d.m & (1 << (n - 1))),
    },
  ];
  LF.ATIVOS_PADRAO = Object.fromEntries(LF.ACONTECIMENTOS.map((x) => [x.id, x.padrao]));

  // Sequência de uma condição: quantos concursos seguidos (do último para trás) e os pontos.
  function sequencia(cond, n, draws, upto) {
    let k = 0, pts = 0;
    for (let i = upto - 1; i >= 0 && k < 60; i--) {
      if (!cond(n, draws[i])) break;
      pts += (1 - pts) * 0.4;
      k++;
    }
    return { k, pts };
  }

  // Troca a pontuação da análise de tendência pela de acontecimento (mantém frequências e atrasos).
  LF.aplicarAcontecimento = function (analise, draws, upto, ativos) {
    upto = upto ?? draws.length;
    ativos = ativos || LF.ATIVOS_PADRAO;
    const nums = analise.nums.map((x) => {
      const partes = {};
      let score = 0;
      const motivos = [];
      for (const ac of LF.ACONTECIMENTOS) {
        if (!ativos[ac.id]) continue;
        const s = sequencia(ac.cond, x.n, draws, upto);
        partes[ac.id] = s;
        score += s.pts;
        if (s.k) motivos.push(`${ac.nome}: ${s.k} ${s.k === 1 ? 'concurso' : 'seguidos'} (+${LF.num(s.pts, 2)})`);
      }
      return { ...x, desempate: x.score, score, partes, motivos };
    });
    return { ...analise, nums, modo: 'acontecimento' };
  };

  // Divide as dezenas em obrigatórias / opcionais / recusadas pela pontuação.
  LF.sugerirCategorias = function (analise, nObrig, nRecus) {
    const ord = [...analise.nums].sort((a, b) => b.score - a.score || (b.desempate || 0) - (a.desempate || 0));
    const cat = {};
    ord.forEach((x, i) => (cat[x.n] = i < nObrig ? 'obrig' : i >= 25 - nRecus ? 'recus' : 'opc'));
    return cat;
  };
})();
