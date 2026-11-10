// Fechamentos com garantia, combinações populares, testes estatísticos, ciclo das dezenas e
// simulação de retorno/risco de uma aposta.
(function () {
  const LF = window.LF;

  // ---------- Fechamento ----------
  // Com v dezenas escolhidas: "se m delas forem sorteadas, pelo menos um jogo faz t acertos".
  // Cada jogo = as v dezenas menos um grupo E de (v-15) excluídas. Se N são as (v-m) dezenas
  // escolhidas que NÃO saíram, um jogo garante t acertos quando |E ∩ N| >= (v-15) - m + t.
  // Montamos os jogos de forma gulosa (o que cobre mais casos primeiro).
  function subconjuntos(v, k) {
    const r = [];
    const rec = (ini, prof, mk) => {
      if (prof === k) return r.push(mk);
      for (let i = ini; i <= v - (k - prof); i++) rec(i + 1, prof + 1, mk | (1 << i));
    };
    rec(0, 0, 0);
    return r;
  }

  LF.custoFechamento = (v, m) => LF.comb(v, v - 15) * LF.comb(v, v - m);

  LF.fechamento = async function (dezenas, m, t, progresso) {
    // dezenas: ordenadas da melhor para a pior pontuação (as piores são excluídas primeiro nos empates)
    const v = dezenas.length, e = v - 15, n = v - m, r = e - m + t;
    if (v < 15) throw new Error('Escolha pelo menos 15 dezenas.');
    if (t > m) throw new Error('A garantia não pode ser maior que as dezenas sorteadas.');
    const mapa = (E) => {
      let mk = 0;
      dezenas.forEach((d, i) => {
        if (!(E & (1 << i))) mk |= 1 << (d - 1);
      });
      return mk;
    };
    if (r <= 0 || e === 0) return [mapa(subconjuntos(v, e)[subconjuntos(v, e).length - 1] || 0)];
    if (LF.custoFechamento(v, m) > 4e8) throw new Error('Conta grande demais: use até 20 dezenas.');
    const cands = subconjuntos(v, e);
    const Ns = subconjuntos(v, n);
    // desempate: excluir as dezenas de pior pontuação (índices altos)
    const desemp = cands.map((E) => {
      let s = 0;
      for (let i = 0; i < v; i++) if (E & (1 << i)) s += i;
      return s;
    });
    const ganho = new Int32Array(cands.length);
    const pop = LF.pop;
    for (let j = 0; j < Ns.length; j++) {
      const N = Ns[j];
      for (let i = 0; i < cands.length; i++) if (pop(cands[i] & N) >= r) ganho[i]++;
      if (progresso && j % 400 === 399) {
        progresso((0.5 * j) / Ns.length);
        await new Promise((ok) => setTimeout(ok, 0));
      }
    }
    const coberto = new Uint8Array(Ns.length);
    let faltam = Ns.length;
    const escolhidos = [];
    while (faltam > 0) {
      let best = -1;
      for (let i = 0; i < cands.length; i++)
        if (ganho[i] > 0 && (best < 0 || ganho[i] > ganho[best] || (ganho[i] === ganho[best] && desemp[i] > desemp[best]))) best = i;
      if (best < 0) break;
      const E = cands[best];
      escolhidos.push(E);
      for (let j = 0; j < Ns.length; j++) {
        if (coberto[j] || pop(E & Ns[j]) < r) continue;
        coberto[j] = 1;
        faltam--;
        const N = Ns[j];
        for (let i = 0; i < cands.length; i++) if (pop(cands[i] & N) >= r) ganho[i]--;
      }
      if (progresso) {
        progresso(0.5 + 0.5 * (1 - faltam / Ns.length));
        await new Promise((ok) => setTimeout(ok, 0));
      }
    }
    return escolhidos.map(mapa);
  };

  // ---------- Combinações populares ----------
  // Padrões que muita gente joga. Não mudam a chance de acertar, mas se o jogo fizer 14 ou 15
  // o prêmio é dividido com mais pessoas.
  LF.popularidade = function (mask, draws) {
    const motivos = [];
    const nums = LF.numsDe(mask);
    let seq = 1, maxSeq = 1;
    for (let i = 1; i < nums.length; i++) {
      seq = nums[i] === nums[i - 1] + 1 ? seq + 1 : 1;
      if (seq > maxSeq) maxSeq = seq;
    }
    if (maxSeq >= 9) motivos.push(`${maxSeq} dezenas seguidas`);
    const f = LF.metricas(mask);
    const linhas = f.linhas.filter((x) => x === 5).length, colunas = f.colunas.filter((x) => x === 5).length;
    if (linhas >= 3) motivos.push(`${linhas} linhas completas no volante`);
    if (colunas >= 3) motivos.push(`${colunas} colunas completas no volante`);
    if (f.moldura >= 14) motivos.push('quase só a moldura do volante');
    if (f.moldura <= 5) motivos.push('quase todo o miolo do volante');
    if (draws) {
      for (let i = draws.length - 1; i >= Math.max(0, draws.length - 30); i--)
        if (LF.pop(mask & draws[i].m) >= 14) {
          motivos.push(`igual ou quase igual ao concurso ${draws[i].c}`);
          break;
        }
    }
    return motivos;
  };

  // ---------- Estatística ----------
  // Gama incompleta regularizada (Numerical Recipes) para o p-valor do qui-quadrado.
  function lnGama(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (const cj of c) ser += cj / ++y;
    return -tmp + Math.log((2.5066282746310005 * ser) / x);
  }
  function gamaP(a, x) {
    if (x <= 0) return 0;
    if (x < a + 1) {
      let ap = a, soma = 1 / a, del = soma;
      for (let i = 0; i < 300; i++) {
        del *= x / ++ap;
        soma += del;
        if (Math.abs(del) < Math.abs(soma) * 1e-12) break;
      }
      return soma * Math.exp(-x + a * Math.log(x) - lnGama(a));
    }
    let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
    for (let i = 1; i < 300; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b;
      if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c;
      if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-12) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - lnGama(a)) * h;
  }
  const pQui = (x, gl) => 1 - gamaP(gl / 2, x / 2);
  const pNormal2 = (z) => {
    // p-valor bilateral
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp((-z * z) / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return 2 * p;
  };

  // Qui-quadrado das 25 dezenas: em sorteios de 15 sem reposição, Σ(obs−esp)²/(0,25·N) ~ χ² com 24 g.l.
  function quiFrequencia(draws, ini) {
    const N = draws.length - ini;
    const c = new Array(26).fill(0);
    for (let i = ini; i < draws.length; i++) draws[i].n.forEach((x) => c[x]++);
    let X = 0;
    for (let k = 1; k <= 25; k++) X += (c[k] - 0.6 * N) ** 2 / (0.25 * N);
    return { N, X, p: pQui(X, 24) };
  }

  // Correlação entre o valor de uma métrica num concurso e no seguinte.
  function autocorrelacao(serie) {
    const a = serie.slice(0, -1), b = serie.slice(1);
    const ma = LF.media(a), mb = LF.media(b);
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < a.length; i++) {
      sab += (a[i] - ma) * (b[i] - mb);
      saa += (a[i] - ma) ** 2;
      sbb += (b[i] - mb) ** 2;
    }
    const r = sab / Math.sqrt(saa * sbb);
    return { r, p: pNormal2(r * Math.sqrt(a.length)) };
  }

  LF.testesEstatisticos = function (draws) {
    const series = { pares: [], baixos: [], soma: [], moldura: [], primos: [] };
    for (const d of draws) {
      const f = LF.metricas(d.m);
      for (const k in series) series[k].push(f[k]);
    }
    const rep = [];
    for (let i = 1; i < draws.length; i++) rep.push(LF.pop(draws[i].m & draws[i - 1].m));
    const auto = {};
    for (const k in series) auto[k] = autocorrelacao(series[k]);
    return {
      total: quiFrequencia(draws, 0),
      ult500: quiFrequencia(draws, Math.max(0, draws.length - 500)),
      ult100: quiFrequencia(draws, Math.max(0, draws.length - 100)),
      auto,
      repetidas: { media: LF.media(rep), esperado: 9 },
    };
  };

  // Ciclo das dezenas: quantos concursos até todas as 25 saírem pelo menos uma vez.
  LF.ciclos = function (draws) {
    const tamanhos = [];
    let vistas = 0, ini = 0;
    for (let i = 0; i < draws.length; i++) {
      vistas |= draws[i].m;
      if (vistas === (1 << 25) - 1) {
        tamanhos.push(i - ini + 1);
        vistas = 0;
        ini = i + 1;
      }
    }
    const dist = {};
    tamanhos.forEach((t) => (dist[t] = (dist[t] || 0) + 1));
    const faltam = [];
    for (let n = 1; n <= 25; n++) if (!(vistas & (1 << (n - 1)))) faltam.push(n);
    return { tamanhos, dist, media: LF.media(tamanhos), atual: draws.length - ini, faltam, inicio: draws[ini] ? draws[ini].c : null };
  };

  // ---------- Retorno esperado e risco ----------
  // Valor médio de 14 e 15 acertos nos últimos 100 concursos (os de 11 a 13 são fixos).
  LF.valoresMedios = function (draws) {
    const ult = draws.slice(-100).filter((d) => d.r);
    const media = (i) => LF.media(ult.map((d) => d.r[i]).filter((x) => x > 0));
    return { ...LF.PREMIO_FIXO, 14: media(3) || 1500, 15: media(1) || 1500000 };
  };

  function premioTabela(tamanho, valores) {
    // prêmio de um jogo de "tamanho" dezenas que acertou h
    const t = [];
    for (let h = 0; h <= 15; h++) {
      let p = 0;
      for (let k = 11; k <= 15; k++) p += LF.comb(h, k) * LF.comb(tamanho - h, 15 - k) * valores[k];
      t[h] = p;
    }
    return t;
  }

  LF.simularAposta = function (masks, preco15, valores) {
    if (!masks.length) return null;
    const total = LF.comb(25, 15);
    const tabs = {};
    let custo = 0, ev = 0;
    for (const mk of masks) {
      const s = LF.pop(mk);
      if (!tabs[s]) {
        tabs[s] = premioTabela(s, valores);
        tabs[s].ev = 0;
        for (let h = 0; h <= 15; h++) tabs[s].ev += ((LF.comb(s, h) * LF.comb(25 - s, 15 - h)) / total) * tabs[s][h];
      }
      custo += LF.precoAposta(s, preco15);
      ev += tabs[s].ev;
    }
    const sims = Math.max(2000, Math.min(20000, Math.floor(2e7 / masks.length)));
    const tam = masks.map(LF.pop);
    let c11 = 0, c13 = 0, c14 = 0, lucro = 0, semRetorno = 0;
    const base = Array.from({ length: 25 }, (_, k) => k + 1);
    for (let s = 0; s < sims; s++) {
      for (let j = 0; j < 15; j++) {
        const x = j + Math.floor(Math.random() * (25 - j));
        [base[j], base[x]] = [base[x], base[j]];
      }
      let d = 0;
      for (let j = 0; j < 15; j++) d |= 1 << (base[j] - 1);
      let melhor = 0, premio = 0;
      for (let i = 0; i < masks.length; i++) {
        const h = LF.pop(masks[i] & d);
        if (h > melhor) melhor = h;
        if (h >= 11) premio += tabs[tam[i]][h];
      }
      if (melhor >= 11) c11++;
      if (melhor >= 13) c13++;
      if (melhor >= 14) c14++;
      if (premio >= custo) lucro++;
      if (premio === 0) semRetorno++;
    }
    return { custo, ev, retorno: ev / custo, p11: c11 / sims, p13: c13 / sims, p14: c14 / sims, pLucro: lucro / sims, pNada: semRetorno / sims, sims };
  };
})();
