// Telas do Laboratório Lotofácil.
(function () {
  const LF = window.LF;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = LF.esc;

  const A = (LF.app = {
    store: null,
    perfil: null,
    perfis: [],
    apostas: [],
    analise: null,
    estudo: null,
    rota: 'resultados',
    preco15: LF.ls.get('lotofacil.preco15', 3.5),
    // Resultados
    hist: { mostrar: 60, aberto: null, numeros: LF.ls.get('lotofacil.mostraNum', true), busca: '' },
    // Análise
    jan: 25,
    ordem: 'n',
    // Montar
    m: null,
    gerado: null,
    // Apostas
    apostaAberta: null,
    confirmar: null,
    // Validação
    valid: { concursos: 100, jogos: 10, rodando: false, prog: 0, res: null },
  });

  // ---------- inicialização ----------
  async function iniciar() {
    LF.dados.montar(LF.dados.cacheCaixa());
    A.store = await LF.abrirStore();
    try {
      await recarregarResultadosManuais();
    } catch (e) {
      /* sem resultados manuais */
    }
    recalcular();
    try {
      A.perfis = await A.store.perfis();
    } catch (e) {
      A.perfis = [{ id: 'principal', nome: 'Principal' }];
      aviso(e.message);
    }
    const salvo = LF.ls.get('lotofacil.perfil', null);
    A.perfil = A.perfis.find((p) => p.id === salvo) || null;
    window.addEventListener('hashchange', rotear);
    rotear();
    if (A.perfil) carregarApostas();
    // Fora do Claude: tenta buscar concursos novos direto na Caixa.
    if (!(window.claude && window.claude.use)) {
      LF.dados
        .buscarCaixa()
        .then((novos) => {
          if (novos > 0) {
            LF.dados.montar([...LF.dados.cacheCaixa(), ...A.manuais]);
            recalcular();
            render();
            aviso(novos === 1 ? '1 concurso novo carregado da Caixa.' : `${novos} concursos novos carregados da Caixa.`);
          }
        })
        .catch(() => {});
    }
  }

  A.manuais = [];
  async function recarregarResultadosManuais() {
    A.manuais = (await A.store.resultados()).map((r) => ({ ...r, fonte: 'manual' }));
    LF.dados.montar([...LF.dados.cacheCaixa(), ...A.manuais]);
  }

  function recalcular() {
    const draws = LF.dados.draws;
    A.analise = LF.analisar(draws, undefined, A.m ? A.m.pesos : null, { completo: true });
    A.estudo = LF.estudoMetricas(draws);
    if (!A.m) novoMontar();
    else if (A.m.alvo <= LF.dados.ultimo().c) A.m.alvo = LF.dados.ultimo().c + 1;
  }

  function novoMontar(manter) {
    const ant = A.m;
    A.m = {
      pesos: ant ? ant.pesos : { ...LF.PESOS_PADRAO },
      nObrig: ant ? ant.nObrig : 5,
      nRecus: ant ? ant.nRecus : 5,
      cat: null,
      formato: ant ? ant.formato : 'varios',
      tamanho: ant ? ant.tamanho : 15,
      porOrcamento: ant ? ant.porOrcamento : false,
      quantidade: ant ? ant.quantidade : 20,
      orcamento: ant ? ant.orcamento : 100,
      filtros: manter && ant ? ant.filtros : LF.filtrosPadrao(A.estudo),
      alvo: LF.dados.ultimo().c + 1,
    };
    A.analise = LF.analisar(LF.dados.draws, undefined, A.m.pesos, { completo: true });
    A.m.cat = LF.sugerirCategorias(A.analise, A.m.nObrig, A.m.nRecus);
  }

  async function carregarApostas() {
    if (!A.perfil) return;
    try {
      A.apostas = (await A.store.apostas(A.perfil.id)).sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''));
    } catch (e) {
      aviso(e.message);
    }
    if (['apostas', 'desempenho'].includes(A.rota)) render();
  }

  // ---------- navegação ----------
  const ROTAS = ['resultados', 'analise', 'montar', 'apostas', 'desempenho', 'ajustes'];
  function rotear() {
    const h = (location.hash || '').replace('#', '');
    if (!A.perfil || h === 'perfis') A.rota = 'perfis';
    else A.rota = ROTAS.includes(h) ? h : 'resultados';
    render();
    window.scrollTo(0, 0);
  }
  function ir(rota) {
    if (location.hash === '#' + rota) rotear();
    else location.hash = rota;
  }

  function render() {
    const chip = $('#perfilChip'), abas = $('#abas');
    const logado = A.perfil && A.rota !== 'perfis';
    chip.hidden = !logado;
    abas.hidden = !logado;
    if (A.perfil) chip.innerHTML = `<span class="ini">${esc(A.perfil.nome.slice(0, 1).toUpperCase())}</span><span>${esc(A.perfil.nome)}</span>`;
    abas.querySelectorAll('a').forEach((a) => a.classList.toggle('ativa', a.dataset.rota === A.rota));
    const tela = $('#tela');
    tela.innerHTML = (TELAS[A.rota] || TELAS.resultados)();
  }

  let avisoT = null;
  function aviso(txt) {
    const el = $('#aviso');
    el.textContent = txt;
    el.hidden = false;
    clearTimeout(avisoT);
    avisoT = setTimeout(() => (el.hidden = true), 3800);
  }
  LF.aviso = aviso;

  // ---------- peças visuais ----------
  function bolas(mask, opt = {}) {
    let s = '';
    for (let n = 1; n <= 25; n++) {
      const b = 1 << (n - 1);
      let c = 'b';
      if (mask & b) c += ' on';
      if (opt.res != null) {
        if (opt.res & b) c += mask & b ? ' acerto' : ' sorteada';
      }
      s += `<span class="${c}">${LF.dd(n)}</span>`;
    }
    return `<div class="bolas${opt.num === false ? '' : ' mostra-num'}">${s}</div>`;
  }
  function volante(mask, cls = '') {
    let s = '';
    for (let n = 1; n <= 25; n++) s += `<span class="c${mask & (1 << (n - 1)) ? ' on' : ''}">${LF.dd(n)}</span>`;
    return `<div class="volante ${cls}">${s}</div>`;
  }
  function volanteComContagem(mask) {
    const f = LF.metricas(mask);
    return `<div class="vol-lado"><div>${volante(mask)}
      <div class="cont-c" style="margin-top:6px">${f.colunas.map((v) => `<span>${v}</span>`).join('')}</div></div>
      <div class="cont-l">${f.linhas.map((v) => `<span>${v}</span>`).join('')}</div></div>`;
  }
  function distComparada(dNos, dAlea, totNos, totAlea) {
    const chaves = new Set([...Object.keys(dNos), ...Object.keys(dAlea)].map(Number));
    const min = Math.min(...chaves, 7), max = Math.max(...chaves, 13);
    let maxP = 0.0001;
    for (let k = min; k <= max; k++) maxP = Math.max(maxP, (dNos[k] || 0) / totNos, (dAlea[k] || 0) / Math.max(1, totAlea));
    let s = '';
    for (let k = max; k >= min; k--) {
      const pn = (dNos[k] || 0) / Math.max(1, totNos), pa = (dAlea[k] || 0) / Math.max(1, totAlea);
      s += `<span class="num${k >= 11 ? ' pos' : ''}">${k}</span><div class="barras" title="${k} acertos: análise ${LF.num(pn * 100, 1)}% · aleatório ${LF.num(pa * 100, 1)}%">
        <div class="barra nos" style="width:${(pn / maxP) * 100}%"></div><div class="barra alea" style="width:${(pa / maxP) * 100}%"></div></div>`;
    }
    return `<div class="leg-dist"><span class="nos">Análise</span><span class="alea">Aleatório</span><span class="suave">(acertos por jogo)</span></div><div class="dist">${s}</div>`;
  }
  const iniciais = (n) => esc((n || '?').trim().slice(0, 1).toUpperCase());

  // ---------- telas ----------
  const TELAS = {};

  TELAS.perfis = () => {
    const modo =
      A.store.modo === 'compartilhado'
        ? 'Os perfis e jogos ficam salvos neste link e todo mundo que tem acesso vê os mesmos dados.'
        : 'Os perfis e jogos ficam salvos neste navegador. Use Ajustes → Backup para levar para outro aparelho.';
    return `
    <div class="cab"><div><h1>Quem vai jogar?</h1><p class="suave">Escolha um perfil. Tudo o que você montar fica guardado nele. ${modo}</p></div></div>
    <div class="perfis">
      ${A.perfis
        .sort((a, b) => (a.id === 'principal' ? -1 : b.id === 'principal' ? 1 : a.nome.localeCompare(b.nome)))
        .map(
          (p) => `<div class="perfil" data-acao="entrar" data-id="${esc(p.id)}" role="button" tabindex="0">
            <span class="ini">${iniciais(p.nome)}</span><span class="nome">${esc(p.nome)}</span>
            <span class="suave peq">${p.id === 'principal' ? 'Perfil principal' : 'Criado em ' + LF.dataBR(p.criadoEm)}</span>
            ${p.id !== 'principal' ? `<button class="btn peq perigo x" data-acao="pedir-excluir-perfil" data-id="${esc(p.id)}" aria-label="Excluir perfil">×</button>` : ''}
          </div>`
        )
        .join('')}
      <form class="perfil novo" data-form="criar-perfil">
        <span class="nome">Criar perfil</span>
        <input class="in" id="novoPerfil" maxlength="30" placeholder="Nome" required autocomplete="off">
        <button class="btn pri" type="submit">Criar e entrar</button>
      </form>
    </div>
    ${A.confirmar && A.confirmar.tipo === 'perfil' ? `<div class="confirma">Excluir o perfil <b>${esc(A.confirmar.nome)}</b> e todas as apostas dele? Não dá para desfazer.
      <button class="btn peq perigo" data-acao="excluir-perfil">Excluir</button><button class="btn peq" data-acao="cancelar">Cancelar</button></div>` : ''}`;
  };

  TELAS.resultados = () => {
    const draws = LF.dados.draws;
    const H = A.hist;
    let lista = [...draws].reverse();
    let titulo = `Últimos ${Math.min(H.mostrar, draws.length)} concursos`;
    if (H.busca) {
      const c = parseInt(H.busca, 10);
      const i = draws.findIndex((d) => d.c === c);
      if (i >= 0) {
        lista = draws.slice(Math.max(0, i - 10), Math.min(draws.length, i + 11)).reverse();
        titulo = `Concursos perto do ${c}`;
      } else lista = [];
    } else lista = lista.slice(0, H.mostrar);
    // frequência na faixa mostrada
    const cont = new Array(26).fill(0);
    lista.forEach((d) => d.n.forEach((n) => cont[n]++));
    const maxC = Math.max(1, ...cont);
    const ult = LF.dados.ultimo();
    const linhas = lista
      .map((d) => {
        const i = draws.indexOf(d);
        const f = LF.metricas(d.m, i ? draws[i - 1].m : 0);
        const aberto = H.aberto === d.c;
        return `<div class="hist-lin${aberto ? ' aberta' : ''}" data-acao="abrir-concurso" data-c="${d.c}">
          <span class="num"><b>${d.c}</b></span><span class="opt suave">${esc(d.d)}</span>${bolas(d.m, { num: H.numeros })}
          <span class="opt num">${f.pares}/${15 - f.pares}</span><span class="opt num">${f.soma}</span><span class="opt num">${f.repetidos ?? '–'}</span></div>
          ${aberto ? detalheConcurso(d, i) : ''}`;
      })
      .join('');
    return `
    <div class="cab">
      <div><h1>Resultados</h1><p class="suave">Concurso ${ult.c} de ${esc(ult.d)} é o mais recente. ${draws.length} concursos no histórico${
        LF.dados.online ? ', atualizado agora pela Caixa' : LF.dados.atualizadoEm ? ', arquivo de ' + esc(LF.dataBR(LF.dados.atualizadoEm)) : ''
      }.</p></div>
      <form class="linha" data-form="buscar-concurso">
        <input class="in curto" id="buscaConcurso" type="number" min="1" placeholder="Nº" value="${esc(H.busca)}">
        <button class="btn" type="submit">Ir ao concurso</button>
        ${H.busca ? '<button class="btn" type="button" data-acao="limpar-busca">Ver últimos</button>' : ''}
      </form>
    </div>
    <div class="bloco">
      <div class="linha entre"><h2>${titulo}</h2>
        <label class="linha peq"><input type="checkbox" id="mostraNum" ${H.numeros ? 'checked' : ''}> Mostrar números nas bolinhas</label></div>
      <div class="hist">
        <div class="hist-cab"><span class="rotulo">Conc.</span><span class="rotulo opt">Data</span>
          <div><div class="freq" title="Quantas vezes cada dezena saiu nos concursos desta lista">${cont
            .slice(1)
            .map((v, k) => `<i style="height:${(v / maxC) * 100}%" title="${LF.dd(k + 1)}: ${v}x"></i>`)
            .join('')}</div>
          <div class="bolas cab-bolas mostra-num" style="margin-top:3px">${Array.from({ length: 25 }, (_, k) => `<span class="b">${LF.dd(k + 1)}</span>`).join('')}</div></div>
          <span class="rotulo opt">Par/Ímp</span><span class="rotulo opt">Soma</span><span class="rotulo opt">Rep.</span></div>
        ${linhas || '<p class="suave" style="padding:16px 4px">Concurso não encontrado.</p>'}
      </div>
      ${!H.busca && H.mostrar < draws.length ? `<div class="linha"><button class="btn" data-acao="mais-concursos">Mostrar mais 100</button>
        <button class="btn" data-acao="todos-concursos">Mostrar todos (${draws.length})</button></div>` : ''}
    </div>`;
  };

  function detalheConcurso(d, i) {
    const draws = LF.dados.draws;
    const f = LF.metricas(d.m, i ? draws[i - 1].m : 0);
    const v = LF.valoresFaixa(d);
    const r = d.r || [];
    const faixas = [15, 14, 13, 12, 11]
      .map((fx, k) => `<tr><td>${fx} acertos</td><td class="num">${r.length ? LF.num(r[k * 2]) : '–'}</td><td class="num">${v[fx] != null ? LF.reais(v[fx]) : '–'}</td></tr>`)
      .join('');
    return `<div class="hist-det"><div class="grade2">
      <div class="linha" style="align-items:start;gap:18px">${volanteComContagem(d.m)}</div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="kpis">
          <div class="kpi"><div class="rotulo">Pares / ímpares</div><div class="v">${f.pares} / ${15 - f.pares}</div></div>
          <div class="kpi"><div class="rotulo">Baixas / altas</div><div class="v">${f.baixos} / ${15 - f.baixos}</div></div>
          <div class="kpi"><div class="rotulo">Soma</div><div class="v">${f.soma}</div></div>
          <div class="kpi"><div class="rotulo">Repetidas</div><div class="v">${f.repetidos ?? '–'}</div></div>
          <div class="kpi"><div class="rotulo">Moldura / miolo</div><div class="v">${f.moldura} / ${15 - f.moldura}</div></div>
          <div class="kpi"><div class="rotulo">Primos</div><div class="v">${f.primos}</div></div>
        </div>
        <div class="tabela-wrap"><table><thead><tr><th>Faixa</th><th>Ganhadores</th><th>Prêmio</th></tr></thead><tbody>${faixas}</tbody></table></div>
        <p class="suave peq">${d.fonte === 'manual' ? 'Resultado digitado à mão (sem rateio oficial).' : 'Fonte: Caixa.'} Os números à direita e abaixo do volante contam as dezenas de cada linha e coluna.</p>
      </div></div></div>`;
  }

  TELAS.analise = () => {
    const a = A.analise, e = A.estudo, draws = LF.dados.draws;
    const N = draws.length, jan = Math.min(A.jan, N);
    const cum = LF.acumulado(draws);
    const fj = (k, w) => cum[N * 25 + k] - cum[Math.max(0, N - w) * 25 + k];
    const linhas = a.nums.map((x) => ({ ...x, janela: fj(x.n - 1, jan) / jan, j100: fj(x.n - 1, 100) / 100, j500: fj(x.n - 1, 500) / 500, j1000: fj(x.n - 1, 1000) / 1000 }));
    const ord = {
      n: (p, q) => p.n - q.n,
      janela: (p, q) => q.janela - p.janela,
      pct: (p, q) => q.pct - p.pct,
      atraso: (p, q) => q.atraso - p.atraso,
      score: (p, q) => q.score - p.score,
    }[A.ordem];
    linhas.sort(ord);
    const barra = (p) => `<span class="mini" style="width:${Math.round(p * 60)}px"></span> ${LF.num(p * 100, 0)}%`;
    const dif = (p) => {
      const d = (p - 0.6) * 100;
      return `<span class="${d >= 2 ? 'pos' : d <= -2 ? 'neg' : 'suave'}">${d > 0 ? '+' : ''}${LF.num(d, 1)}</span>`;
    };
    const tabela = linhas
      .map(
        (x) => `<tr><td><span class="bola-p">${LF.dd(x.n)}</span></td><td>${barra(x.janela)}</td><td class="num">${LF.num(x.j100 * 100, 0)}%</td>
        <td class="num">${LF.num(x.j500 * 100, 0)}%</td><td class="num">${LF.num(x.j1000 * 100, 0)}%</td><td class="num">${LF.num(x.pct * 100, 1)}% ${dif(x.pct)}</td>
        <td class="num">${x.atraso} <span class="suave">/ ${x.maxAtraso}</span></td><td class="num"><b>${LF.num(x.score, 2)}</b></td></tr>`
      )
      .join('');
    const ult = a.ultimo;
    const cartoes = LF.METRICAS.map((md) => cartaoMetrica(md, e[md.id])).join('');
    const lc = (tipo) =>
      [0, 1, 2, 3, 4]
        .map((i) => {
          const s = e[tipo][i], v = e[tipo + 'Vazias'][i];
          const nome = tipo === 'linhas' ? `Linha ${i + 1} (${i * 5 + 1}–${i * 5 + 5})` : `Coluna ${i + 1}`;
          return `<tr><td>${nome}</td><td class="num"><b>${s.ultimo}</b></td><td class="num">${LF.num(s.media, 2)}</td><td class="num">${LF.num(s.depois.media, 2)}</td>
          <td class="num">${v.vazias}</td><td class="num">${v.vazias ? LF.num((v.depoisVazia / v.vazias) * 100, 0) + '%' : '–'}</td></tr>`;
        })
        .join('');
    const th = (id, txt) => `<th class="ord" data-acao="ordenar" data-ord="${id}">${txt}${A.ordem === id ? ' ↓' : ''}</th>`;
    return `
    <div class="cab"><div><h1>Análise</h1><p class="suave">Tudo calculado com os ${N} concursos até o ${ult.c}. A coluna Pontos é o que a montagem de jogos usa para sugerir as dezenas.</p></div></div>
    <div class="nota"><b>Para ter em mente:</b> cada sorteio é independente, então nenhuma métrica garante nada. A ideia aqui é testar as hipóteses com dados:
    cada cartão abaixo mostra o que de fato aconteceu no concurso seguinte a jogos parecidos com o último, e a aba Desempenho compara os seus jogos com jogos aleatórios.</div>
    <div class="bloco">
      <div class="linha entre"><h2>Frequência de cada dezena</h2>
        <div class="chips">${[10, 25, 50, 100, 200].map((j) => `<button class="chip${A.jan === j ? ' on' : ''}" data-acao="janela" data-j="${j}">Últ. ${j}</button>`).join('')}</div></div>
      <p class="suave peq">Em média cada dezena sai em 60% dos concursos (15 de 25). Compare a fase recente com o histórico longo: uma dezena que está saindo muito agora,
      mas que no histórico ficou abaixo dos 60%, pode só estar "compensando". Atraso = concursos sem sair (e o maior atraso da história).</p>
      <div class="tabela-wrap"><table><thead><tr>${th('n', 'Dezena')}${th('janela', 'Últ. ' + jan)}<th>Últ. 100</th><th>Últ. 500</th><th>Últ. 1000</th>${th('pct', 'Histórico')}${th('atraso', 'Atraso')}${th('score', 'Pontos')}</tr></thead>
      <tbody>${tabela}</tbody></table></div>
    </div>
    <div class="bloco">
      <h2>O último concurso (${ult.c}) e o que costuma vir depois</h2>
      <p class="suave peq">Barra roxa = valor do último concurso. Barras verdes = faixa onde caiu a maioria dos concursos seguintes a um jogo parecido.</p>
      <div class="metricas">${cartoes}</div>
    </div>
    <div class="bloco">
      <h2>Linhas e colunas do volante</h2>
      <div class="grade2">
        <div>${volanteComContagem(ult.m)}<p class="suave peq" style="margin-top:8px">Concurso ${ult.c}. Contagem por linha (direita) e por coluna (abaixo).</p></div>
        <div class="tabela-wrap"><table><thead><tr><th></th><th>Último</th><th>Média</th><th>Depois*</th><th>Vazia (vezes)</th><th>Voltou no seguinte</th></tr></thead>
        <tbody>${lc('linhas')}${lc('colunas')}</tbody></table>
        <p class="suave peq" style="margin-top:6px">*Média no concurso seguinte a jogos em que a linha/coluna teve a mesma quantidade do último.</p></div>
      </div>
    </div>`;
  };

  function cartaoMetrica(md, s) {
    const ks = Object.keys(s.dist).map(Number);
    const min = Math.min(...ks), max = Math.max(...ks);
    const passo = md.id === 'soma' ? 5 : 1;
    const baldes = [];
    for (let v = min - (min % passo); v <= max; v += passo) {
      let q = 0;
      for (let k = v; k < v + passo; k++) q += s.dist[k] || 0;
      baldes.push([v, q]);
    }
    const maxQ = Math.max(...baldes.map((b) => b[1]));
    const hist = baldes
      .map(([v, q]) => {
        const ult = s.ultimo >= v && s.ultimo < v + passo;
        const alvo = v + passo - 1 >= s.depois.p15 && v <= s.depois.p85;
        return `<i class="${ult ? 'ult' : alvo ? 'alvo' : ''}" style="height:${(q / maxQ) * 100}%" title="${v}${passo > 1 ? '–' + (v + passo - 1) : ''}: ${q} concursos"></i>`;
      })
      .join('');
    const dif = s.depois.media - s.media;
    return `<div class="met">
      <div class="linha entre"><span class="rotulo">${esc(md.nome)}</span><span class="suave peq">média ${LF.num(s.media, 1)}</span></div>
      <div class="val">${s.ultimo ?? '–'} <small>no último</small></div>
      <div class="hist-mini">${hist}</div>
      <p class="peq">Depois de jogos com ${s.depois.tol ? 'cerca de ' : ''}${s.ultimo}, o seguinte teve em média <b>${LF.num(s.depois.media, 1)}</b>
      (${s.depois.casos} casos${Math.abs(dif) >= 0.1 ? ', ' + (dif > 0 ? 'acima' : 'abaixo') + ' da média geral' : ', igual à média geral'}). Faixa comum: <b>${s.depois.p15}–${s.depois.p85}</b>.</p>
      <p class="suave peq">${esc(md.desc)}</p></div>`;
  }

  // ---------- Montar jogos ----------
  function contarCat() {
    const c = { obrig: 0, opc: 0, recus: 0 };
    for (let n = 1; n <= 25; n++) c[A.m.cat[n]]++;
    return c;
  }
  function quantidadeJogos() {
    const M = A.m;
    const preco = LF.precoAposta(M.tamanho, A.preco15);
    const q = M.porOrcamento ? Math.floor((M.orcamento + 1e-9) / preco) : M.quantidade;
    return { preco, q: Math.max(0, Math.min(q, 1000)), custo: Math.max(0, Math.min(q, 1000)) * preco };
  }

  TELAS.montar = () => {
    const M = A.m, a = A.analise;
    const c = contarCat();
    const sc = {};
    a.nums.forEach((x) => (sc[x.n] = x));
    let sel = '';
    for (let n = 1; n <= 25; n++)
      sel += `<button class="c ${M.cat[n]}" data-acao="ciclar" data-n="${n}" title="${esc(LF.motivos(sc[n], M.pesos).join('; ') || 'sem destaque')}" aria-label="Dezena ${n}: ${
        { obrig: 'obrigatória', opc: 'opcional', recus: 'recusada' }[M.cat[n]]
      }">${LF.dd(n)}<small>${LF.num(sc[n].score, 1)}</small></button>`;
    const porque = [...a.nums]
      .sort((p, q) => q.score - p.score)
      .map((x) => `<tr><td><span class="bola-p ${M.cat[x.n]}">${LF.dd(x.n)}</span></td><td class="num"><b>${LF.num(x.score, 2)}</b></td><td style="text-align:left;white-space:normal">${esc(LF.motivos(x, M.pesos).join('; ') || '–')}</td></tr>`)
      .join('');
    const pesos = Object.keys(LF.PESOS_PADRAO)
      .map(
        (p) => `<label class="peso"><span><b>${LF.NOMES_PESOS[p][0]}</b><br><span class="suave peq">${LF.NOMES_PESOS[p][1]}</span></span>
        <input type="range" min="0" max="2" step="0.1" value="${M.pesos[p]}" data-peso="${p}"><span class="num">${LF.num(M.pesos[p], 1)}</span></label>`
      )
      .join('');
    const { preco, q, custo } = quantidadeJogos();
    const falta = M.tamanho - c.obrig;
    const comb = falta >= 0 && falta <= c.opc ? LF.comb(c.opc, falta) : 0;
    const filtros = LF.METRICAS.filter((md) => md.filtro)
      .map((md) => {
        const f = M.filtros[md.id], e = A.estudo[md.id];
        return `<label class="filtro" title="Histórico: 80% dos concursos entre ${e.p10} e ${e.p90}. Depois de jogos parecidos com o último: ${e.depois.p15}–${e.depois.p85}.">
          <input type="checkbox" data-filtro="${md.id}" data-campo="ativo" ${f.ativo ? 'checked' : ''}><span>${esc(md.nome)}</span>
          <input type="number" data-filtro="${md.id}" data-campo="min" value="${f.min}"><input type="number" data-filtro="${md.id}" data-campo="max" value="${f.max}"></label>`;
      })
      .join('');
    return `
    <div class="cab"><div><h1>Montar jogos</h1><p class="suave">Para o concurso <b>${M.alvo}</b>. Toque numa dezena para trocar a categoria: obrigatória → opcional → recusada.</p></div></div>
    <div class="grade2">
      <div class="bloco">
        <div class="linha entre"><h2>1. Dezenas</h2><button class="btn peq" data-acao="refazer-sugestao">Refazer sugestão</button></div>
        <div class="volante sel">${sel}</div>
        <div class="legenda"><span class="l-obrig">Obrigatórias: <b>${c.obrig}</b></span><span class="l-opc">Opcionais: <b>${c.opc}</b></span><span class="l-recus">Recusadas: <b>${c.recus}</b></span></div>
        <div class="linha peq">
          <label class="linha">Sugerir <input class="in curto" type="number" min="0" max="15" id="nObrig" value="${M.nObrig}"> obrigatórias</label>
          <label class="linha">e <input class="in curto" type="number" min="0" max="10" id="nRecus" value="${M.nRecus}"> recusadas</label>
        </div>
        <p class="suave peq">O número pequeno é a pontuação da dezena. Passe o mouse (ou veja a lista abaixo) para saber o motivo.</p>
        <details><summary>Por que cada dezena</summary><div class="tabela-wrap"><table><tbody>${porque}</tbody></table></div></details>
        <details><summary>Pesos das métricas</summary><div class="pesos">${pesos}</div>
          <div class="linha" style="margin-top:10px"><button class="btn peq" data-acao="pesos-padrao">Voltar ao padrão</button></div></details>
      </div>
      <div class="bloco">
        <h2>2. Formato e quantidade</h2>
        <div class="seg" role="group"><button class="${M.formato === 'varios' ? 'on' : ''}" data-acao="formato" data-f="varios">Vários jogos de 15</button>
          <button class="${M.formato === 'grande' ? 'on' : ''}" data-acao="formato" data-f="grande">Jogo com mais dezenas</button></div>
        ${M.formato === 'grande' ? `<label class="linha">Dezenas por jogo <select class="in" id="tamanho">${[16, 17, 18, 19, 20].map((t) => `<option ${M.tamanho === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <span class="suave peq">${LF.comb(M.tamanho, 15)} apostas de 15 dentro de cada jogo</span></label>` : ''}
        <div class="seg" role="group"><button class="${!M.porOrcamento ? 'on' : ''}" data-acao="por-orc" data-v="0">Número de jogos</button>
          <button class="${M.porOrcamento ? 'on' : ''}" data-acao="por-orc" data-v="1">Valor máximo (R$)</button></div>
        ${M.porOrcamento
          ? `<label class="linha">Quero gastar até R$ <input class="in curto" type="number" min="0" step="0.5" id="orcamento" value="${M.orcamento}"></label>`
          : `<label class="linha">Quantos jogos <input class="in curto" type="number" min="1" max="1000" id="quantidade" value="${M.quantidade}"></label>`}
        <div class="kpis">
          <div class="kpi"><div class="rotulo">Preço por jogo</div><div class="v">${LF.reais(preco)}</div></div>
          <div class="kpi"><div class="rotulo">Jogos</div><div class="v">${q}</div></div>
          <div class="kpi"><div class="rotulo">Total</div><div class="v nos">${LF.reais(custo)}</div></div>
        </div>
        <p class="suave peq">${falta < 0 ? `<span class="neg">Há mais obrigatórias (${c.obrig}) do que dezenas no jogo (${M.tamanho}).</span>` : falta > c.opc ? `<span class="neg">Faltam opcionais: precisa de ${falta}, há ${c.opc}.</span>` : `Cada jogo leva as ${c.obrig} obrigatórias + ${falta} das ${c.opc} opcionais: ${LF.num(comb)} combinações possíveis.`}</p>
        <label class="linha peq">Concurso <input class="in curto" type="number" id="alvo" value="${M.alvo}"></label>
        ${M.tamanho === 15 ? `<details><summary>3. Filtros dos jogos (padrões do histórico)</summary>
          <p class="suave peq" style="margin-bottom:8px">Só entram jogos dentro dessas faixas. Os valores sugeridos vêm do que costuma sair depois de um concurso como o último.</p>
          <div class="filtros">${filtros}</div><div class="linha" style="margin-top:10px"><button class="btn peq" data-acao="filtros-padrao">Voltar ao padrão</button></div></details>` : ''}
        <button class="btn pri" data-acao="gerar" ${q < 1 || falta < 0 || falta > c.opc ? 'disabled' : ''}>Gerar ${q} ${q === 1 ? 'jogo' : 'jogos'}</button>
      </div>
    </div>
    ${A.gerado ? telaGerado() : ''}`;
  };

  function telaGerado() {
    const G = A.gerado;
    const uso = new Array(26).fill(0);
    G.jogos.forEach((mk) => LF.numsDe(mk).forEach((n) => uso[n]++));
    const maxU = Math.max(1, ...uso);
    const ultimo = LF.dados.ultimo().m;
    const lista = (arr, pref) =>
      arr
        .map((mk, i) => {
          const f = LF.metricas(mk, ultimo);
          return `<div class="jogo"><span class="tag">${pref}${i + 1}</span>${bolas(mk, { num: true })}<span class="info">${LF.pop(mk) === 15 ? `${f.pares}P · ${f.soma}` : LF.pop(mk) + ' dez.'}</span></div>`;
        })
        .join('');
    return `<div class="bloco" id="gerado">
      <div class="linha entre"><h2>Jogos gerados (${G.jogos.length})</h2><span class="suave">Concurso ${G.alvo} · ${LF.reais(G.custo)}</span></div>
      ${G.avisos.map((t) => `<div class="alerta">${esc(t)}</div>`).join('')}
      <div><div class="rotulo" style="margin-bottom:4px">Quantas vezes cada dezena aparece nos jogos</div>
        <div class="freq" style="height:40px">${uso.slice(1).map((v, k) => `<i style="height:${(v / maxU) * 100}%" title="${LF.dd(k + 1)}: ${v} jogos"></i>`).join('')}</div>
        <div class="bolas cab-bolas mostra-num" style="margin-top:3px">${Array.from({ length: 25 }, (_, k) => `<span class="b">${LF.dd(k + 1)}</span>`).join('')}</div></div>
      <div class="jogos">${lista(G.jogos, '')}</div>
      <details><summary>${G.aleatorios.length} jogos aleatórios para comparação</summary>
        <p class="suave peq" style="margin-bottom:8px">Gerados ao acaso, mesma quantidade e tamanho. Eles são salvos junto e conferidos no mesmo concurso para ver se a análise faz diferença. Você não precisa jogá-los.</p>
        <div class="jogos">${lista(G.aleatorios, 'A')}</div></details>
      <div class="linha">
        <button class="btn ok" data-acao="salvar-aposta">OK, salvar estes jogos</button>
        <button class="btn" data-acao="exportar" data-fmt="txt" data-de="gerado">Baixar .txt</button>
        <button class="btn" data-acao="exportar" data-fmt="csv" data-de="gerado">Baixar .csv</button>
        <button class="btn" data-acao="copiar" data-de="gerado">Copiar</button>
        <button class="btn" data-acao="gerar">Gerar de novo</button>
      </div>
      <textarea class="copia" id="copiaGerado" readonly hidden></textarea>
    </div>`;
  }

  function gerar() {
    const M = A.m;
    const { q, custo } = quantidadeJogos();
    const scores = {};
    A.analise.nums.forEach((x) => (scores[x.n] = x.score));
    const r = LF.gerarJogos({ cat: M.cat, scores, tamanho: M.tamanho, quantidade: q, filtros: M.filtros, ultimoMask: LF.dados.ultimo().m });
    if (r.erro) return aviso(r.erro);
    const qtd = r.jogos.length;
    A.gerado = {
      jogos: r.jogos,
      aleatorios: LF.jogosAleatorios(qtd, M.tamanho),
      avisos: r.avisos,
      alvo: M.alvo,
      tamanho: M.tamanho,
      custo: qtd * LF.precoAposta(M.tamanho, A.preco15),
      salvo: false,
    };
    render();
    const el = $('#gerado');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function salvarAposta() {
    const G = A.gerado, M = A.m;
    if (!G) return;
    if (G.salvo) return aviso('Estes jogos já foram salvos.');
    const masks = { obrig: 0, opc: 0, recus: 0 };
    for (let n = 1; n <= 25; n++) masks[M.cat[n]] |= 1 << (n - 1);
    const aposta = {
      id: LF.uid(),
      perfilId: A.perfil.id,
      criadoEm: new Date().toISOString(),
      concurso: G.alvo,
      tamanho: G.tamanho,
      preco15: A.preco15,
      custo: G.custo,
      jogos: G.jogos,
      aleatorios: G.aleatorios,
      obrig: masks.obrig,
      opc: masks.opc,
      recus: masks.recus,
      pesos: { ...M.pesos },
      baseConcurso: LF.dados.ultimo().c,
    };
    try {
      await A.store.salvarAposta(aposta);
      G.salvo = true;
      A.apostas.unshift(aposta);
      aviso(`Jogos salvos para o concurso ${G.alvo}.`);
      A.apostaAberta = aposta.id;
      A.gerado = null;
      ir('apostas');
    } catch (e) {
      aviso(e.message);
    }
  }

  // ---------- exportação ----------
  function textoJogos(masks, fmt, info) {
    if (fmt === 'csv') {
      const t = Math.max(...masks.map(LF.pop));
      const cab = ['jogo', ...Array.from({ length: t }, (_, i) => 'd' + (i + 1))].join(';');
      return cab + '\n' + masks.map((mk, i) => [i + 1, ...LF.numsDe(mk).map(LF.dd)].join(';')).join('\n') + '\n';
    }
    return `# Lotofácil · concurso ${info.alvo} · ${masks.length} jogos · perfil ${info.perfil}\n` + masks.map(LF.texto).join('\n') + '\n';
  }
  function fonteExport(de) {
    if (de === 'gerado') return { masks: A.gerado.jogos, alvo: A.gerado.alvo };
    const ap = A.apostas.find((x) => x.id === de);
    return { masks: ap.jogos, alvo: ap.concurso };
  }
  async function exportar(de, fmt) {
    const { masks, alvo } = fonteExport(de);
    const txt = textoJogos(masks, fmt, { alvo, perfil: A.perfil.nome });
    const nome = `lotofacil_${alvo}_${A.perfil.nome.replace(/[^\w-]+/g, '_')}_${masks.length}jogos.${fmt}`;
    try {
      await LF.baixarArquivo(nome, txt, fmt === 'csv' ? 'text/csv' : 'text/plain');
    } catch (e) {
      aviso(e.message);
    }
  }
  async function copiar(de, btn) {
    const { masks, alvo } = fonteExport(de);
    const txt = textoJogos(masks, 'txt', { alvo, perfil: A.perfil.nome });
    try {
      await navigator.clipboard.writeText(txt);
      aviso(`${masks.length} jogos copiados.`);
    } catch (e) {
      const ta = btn.closest('.bloco').querySelector('textarea.copia');
      if (ta) {
        ta.hidden = false;
        ta.value = txt;
        ta.select();
        aviso('Selecione o texto abaixo e copie.');
      }
    }
  }

  // ---------- Minhas apostas ----------
  function resumoAposta(ap) {
    const res = LF.dados.porConcurso(ap.concurso);
    if (!res) return { res: null };
    return { res, nos: LF.conferirLista(ap.jogos, res), alea: LF.conferirLista(ap.aleatorios || [], res) };
  }

  TELAS.apostas = () => {
    if (A.apostaAberta) {
      const ap = A.apostas.find((x) => x.id === A.apostaAberta);
      if (ap) return telaAposta(ap);
      A.apostaAberta = null;
    }
    const cards = A.apostas
      .map((ap) => {
        const r = resumoAposta(ap);
        let pill = `<span class="pill espera">Aguardando sorteio</span>`;
        let linha2 = `${ap.jogos.length} jogos de ${ap.tamanho} · ${LF.reais(ap.custo)}`;
        if (r.res) {
          pill = r.nos.premio > 0 || r.nos.pendente ? `<span class="pill premio">${r.nos.premio ? LF.reais(r.nos.premio) : 'Premiado'}</span>` : `<span class="pill ok">Conferido</span>`;
          linha2 += ` · melhor: <b>${r.nos.melhor}</b> acertos · média ${LF.num(r.nos.media, 1)} (aleatório ${LF.num(r.alea.media, 1)})`;
        }
        return `<button class="aposta" data-acao="abrir-aposta" data-id="${esc(ap.id)}"><div class="linha entre"><h3>Concurso ${ap.concurso}</h3>${pill}</div>
          <span class="peq">${linha2}</span><span class="suave peq">Criada em ${LF.dataBR(ap.criadoEm)}</span>${bolas(ap.obrig, { num: true })}
          <span class="suave peq">Acima: dezenas obrigatórias</span></button>`;
      })
      .join('');
    return `<div class="cab"><div><h1>Minhas apostas</h1><p class="suave">Jogos salvos no perfil ${esc(A.perfil.nome)}. Quando sai o resultado, a conferência aparece sozinha.</p></div>
      <a class="btn pri" href="#montar">Montar jogos</a></div>
      ${A.apostas.length ? `<div class="apostas">${cards}</div>` : `<div class="bloco"><h2>Nenhuma aposta salva ainda</h2><p class="suave">Vá em Montar jogos, gere a lista e toque em "OK, salvar estes jogos".</p></div>`}`;
  };

  function telaAposta(ap) {
    const r = resumoAposta(ap);
    const res = r.res;
    const lista = (arr, conf, pref) =>
      arr
        .map((mk, i) => {
          const c = conf && conf.jogos[i];
          return `<div class="jogo${c && (c.premio > 0 || c.pendente) ? ' premiado' : ''}"><span class="tag">${pref}${i + 1}</span>${bolas(mk, { num: true, res: res ? res.m : null })}
          <span class="info">${c ? `<b>${c.acertos}</b> ac.${c.premio ? '<br>' + LF.reais(c.premio) : c.pendente ? '<br>prêmio a definir' : ''}` : ''}</span></div>`;
        })
        .join('');
    let conferencia = '';
    if (res) {
      const n = r.nos, a = r.alea;
      const saldo = (p) => `<span class="${p - ap.custo >= 0 ? 'pos' : 'neg'}">${LF.reais(p - ap.custo)}</span>`;
      conferencia = `<div class="bloco"><h2>Resultado do concurso ${res.c} (${esc(res.d)})</h2>${bolas(res.m, { num: true })}
        <div class="tabela-wrap"><table><thead><tr><th></th><th>Média de acertos</th><th>Melhor jogo</th><th>Jogos premiados</th><th>Prêmio</th><th>Saldo</th></tr></thead><tbody>
        <tr><td><b>Seus jogos</b></td><td class="num"><b>${LF.num(n.media, 2)}</b></td><td class="num">${n.melhor}</td><td class="num">${n.premiados}</td><td class="num">${LF.reais(n.premio)}${n.pendente ? '*' : ''}</td><td class="num">${saldo(n.premio)}</td></tr>
        <tr><td>Aleatórios</td><td class="num">${LF.num(a.media, 2)}</td><td class="num">${a.melhor}</td><td class="num">${a.premiados}</td><td class="num">${LF.reais(a.premio)}${a.pendente ? '*' : ''}</td><td class="num">${saldo(a.premio)}</td></tr>
        </tbody></table></div>
        ${n.pendente || a.pendente ? '<p class="suave peq">*Prêmio de 14 ou 15 acertos ainda sem valor (resultado digitado à mão). Ele entra quando o rateio oficial chegar.</p>' : ''}
        ${distComparada(n.dist, a.dist, ap.jogos.length, (ap.aleatorios || []).length)}
        <p class="suave peq">Amarelo = dezena acertada. Contorno amarelo = dezena sorteada que o jogo não tinha.</p></div>`;
    } else {
      conferencia = `<div class="bloco"><h2>Aguardando o concurso ${ap.concurso}</h2>
        <p class="suave">O resultado entra sozinho quando o site for atualizado. Se já saiu e ainda não apareceu, digite as 15 dezenas:</p>
        ${formResultado(ap.concurso)}</div>`;
    }
    const cats = `<div class="linha peq"><span class="bola-p obrig">${LF.pop(ap.obrig)}</span> obrigatórias: ${LF.texto(ap.obrig) || '–'}</div>
      <div class="linha peq"><span class="bola-p recus">${LF.pop(ap.recus)}</span> recusadas: ${LF.texto(ap.recus) || '–'}</div>`;
    return `<div class="cab"><div><button class="btn peq" data-acao="fechar-aposta">← Minhas apostas</button>
      <h1 style="margin-top:10px">Concurso ${ap.concurso}</h1><p class="suave">${ap.jogos.length} jogos de ${ap.tamanho} dezenas · ${LF.reais(ap.custo)} · criada em ${LF.dataBR(ap.criadoEm)} com dados até o concurso ${ap.baseConcurso}</p></div></div>
      ${conferencia}
      <div class="bloco"><div class="linha entre"><h2>Seus jogos</h2><div class="linha">
        <button class="btn peq" data-acao="exportar" data-fmt="txt" data-de="${esc(ap.id)}">Baixar .txt</button>
        <button class="btn peq" data-acao="exportar" data-fmt="csv" data-de="${esc(ap.id)}">Baixar .csv</button>
        <button class="btn peq" data-acao="copiar" data-de="${esc(ap.id)}">Copiar</button></div></div>
        ${cats}<textarea class="copia" readonly hidden></textarea>
        <div class="jogos">${lista(ap.jogos, r.nos, '')}</div></div>
      <div class="bloco"><details><summary>Jogos aleatórios de comparação (${(ap.aleatorios || []).length})</summary>
        <div class="jogos">${lista(ap.aleatorios || [], r.alea, 'A')}</div></details></div>
      <div class="linha">${
        A.confirmar && A.confirmar.tipo === 'aposta'
          ? `<div class="confirma">Excluir esta aposta? Não dá para desfazer. <button class="btn peq perigo" data-acao="excluir-aposta" data-id="${esc(ap.id)}">Excluir</button><button class="btn peq" data-acao="cancelar">Cancelar</button></div>`
          : `<button class="btn perigo" data-acao="pedir-excluir-aposta">Excluir aposta</button>`
      }</div>`;
  }

  function formResultado(c) {
    return `<form class="linha" data-form="resultado">
      <input class="in curto" type="number" id="resC" value="${c || LF.dados.ultimo().c + 1}" aria-label="Concurso">
      <input class="in" id="resN" style="flex:1;min-width:220px" placeholder="15 dezenas, ex.: 01 02 05 07 ..." autocomplete="off">
      <button class="btn pri" type="submit">Salvar resultado</button></form>`;
  }

  // ---------- Desempenho ----------
  TELAS.desempenho = () => {
    const conferidas = A.apostas.map((ap) => ({ ap, r: resumoAposta(ap) })).filter((x) => x.r.res);
    let blocoReal;
    if (conferidas.length) {
      const dN = {}, dA = {};
      let jn = 0, ja = 0, sn = 0, sa = 0, pn = 0, pa = 0, gasto = 0, prn = 0, pra = 0;
      conferidas.forEach(({ ap, r }) => {
        gasto += ap.custo;
        r.nos.jogos.forEach((j) => {
          dN[j.acertos] = (dN[j.acertos] || 0) + 1;
          jn++;
          sn += j.acertos;
          if (j.premio > 0 || j.pendente) pn++;
        });
        r.alea.jogos.forEach((j) => {
          dA[j.acertos] = (dA[j.acertos] || 0) + 1;
          ja++;
          sa += j.acertos;
          if (j.premio > 0 || j.pendente) pa++;
        });
        prn += r.nos.premio;
        pra += r.alea.premio;
      });
      const linhas = conferidas
        .map(
          ({ ap, r }) => `<tr><td><a href="#apostas" data-acao="abrir-aposta" data-id="${esc(ap.id)}">Concurso ${ap.concurso}</a></td><td class="num">${ap.jogos.length}×${ap.tamanho}</td>
          <td class="num"><b>${LF.num(r.nos.media, 2)}</b></td><td class="num">${LF.num(r.alea.media, 2)}</td><td class="num">${r.nos.melhor} / ${r.alea.melhor}</td>
          <td class="num">${LF.reais(ap.custo)}</td><td class="num">${LF.reais(r.nos.premio)}</td><td class="num">${LF.reais(r.alea.premio)}</td></tr>`
        )
        .join('');
      blocoReal = `<div class="kpis">
          <div class="kpi"><div class="rotulo">Apostas conferidas</div><div class="v">${conferidas.length}</div></div>
          <div class="kpi"><div class="rotulo">Média de acertos (seus)</div><div class="v nos">${LF.num(sn / jn, 2)}</div></div>
          <div class="kpi"><div class="rotulo">Média (aleatórios)</div><div class="v">${LF.num(sa / Math.max(1, ja), 2)}</div></div>
          <div class="kpi"><div class="rotulo">Premiados seus / aleat.</div><div class="v">${pn} / ${pa}</div></div>
          <div class="kpi"><div class="rotulo">Gasto</div><div class="v">${LF.reais(gasto)}</div></div>
          <div class="kpi"><div class="rotulo">Prêmios seus / aleat.</div><div class="v">${LF.reais(prn)}<br><span class="suave peq">${LF.reais(pra)}</span></div></div>
        </div>
        ${distComparada(dN, dA, jn, ja)}
        <div class="tabela-wrap"><table><thead><tr><th>Aposta</th><th>Jogos</th><th>Média seus</th><th>Média aleat.</th><th>Melhor</th><th>Custo</th><th>Prêmio seus</th><th>Prêmio aleat.</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
    } else {
      blocoReal = `<p class="suave">Assim que uma aposta salva tiver o resultado do concurso, a comparação entre seus jogos e os aleatórios aparece aqui.</p>`;
    }
    const V = A.valid;
    let blocoValid = '';
    if (V.res) {
      const R = V.res;
      const dif = R.nos.media - R.alea.media;
      blocoValid = `<div class="kpis">
        <div class="kpi"><div class="rotulo">Média análise</div><div class="v nos">${LF.num(R.nos.media, 3)}</div></div>
        <div class="kpi"><div class="rotulo">Média aleatório</div><div class="v">${LF.num(R.alea.media, 3)}</div></div>
        <div class="kpi"><div class="rotulo">11+ acertos análise</div><div class="v">${LF.num((R.nos.premiados / R.nos.total) * 100, 1)}%</div></div>
        <div class="kpi"><div class="rotulo">11+ acertos aleatório</div><div class="v">${LF.num((R.alea.premiados / R.alea.total) * 100, 1)}%</div></div></div>
        ${distComparada(R.nos.dist, R.alea.dist, R.nos.total, R.alea.total)}
        <p class="peq">Nos últimos ${R.concursos} concursos, com ${R.jogos} jogos por concurso, a análise teve ${dif >= 0 ? 'em média ' + LF.num(dif, 3) + ' acerto a mais' : 'em média ' + LF.num(-dif, 3) + ' acerto a menos'} por jogo que o aleatório.
        Diferenças menores que uns 0,1 acerto costumam ser só sorte: rode de novo e veja se se repete. O esperado ao acaso é 9 acertos por jogo.</p>`;
    }
    return `<div class="cab"><div><h1>Desempenho</h1><p class="suave">A análise está fazendo diferença? Aqui seus jogos são comparados com os aleatórios gerados junto com eles.</p></div></div>
      <div class="bloco"><h2>Suas apostas conferidas</h2>${blocoReal}</div>
      <div class="bloco"><h2>Validação histórica</h2>
        <p class="suave peq">Volta no tempo: para cada um dos últimos concursos, faz a análise só com os concursos anteriores, gera os jogos com as configurações atuais
        (pesos, ${A.m.nObrig} obrigatórias, ${A.m.nRecus} recusadas, filtros padrão) e confere com o que saiu, junto com o mesmo número de jogos aleatórios.</p>
        <div class="linha">
          <label class="linha peq">Concursos <select class="in" id="vConc">${[50, 100, 200, 400].map((v) => `<option ${V.concursos === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label class="linha peq">Jogos por concurso <select class="in" id="vJogos">${[5, 10, 20, 50].map((v) => `<option ${V.jogos === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <button class="btn pri" data-acao="validar" ${V.rodando ? 'disabled' : ''}>${V.rodando ? 'Calculando…' : 'Rodar validação'}</button>
        </div>
        ${V.rodando ? `<div class="progresso"><i id="vProg" style="width:${V.prog * 100}%"></i></div>` : ''}
        ${blocoValid}
      </div>`;
  };

  async function validar() {
    const V = A.valid;
    V.rodando = true;
    V.prog = 0;
    render();
    try {
      V.res = await LF.validarHistorico(
        LF.dados.draws,
        { concursos: V.concursos, jogos: V.jogos, tamanho: 15, nObrig: A.m.nObrig, nRecus: A.m.nRecus, pesos: A.m.pesos },
        (p) => {
          V.prog = p;
          const b = $('#vProg');
          if (b) b.style.width = p * 100 + '%';
        }
      );
    } catch (e) {
      aviso('Falha na validação: ' + e.message);
    }
    V.rodando = false;
    if (A.rota === 'desempenho') render();
  }

  // ---------- Ajustes ----------
  TELAS.ajustes = () => {
    const comp = A.store.modo === 'compartilhado';
    return `<div class="cab"><div><h1>Ajustes</h1></div></div>
    <div class="grade2">
      <div class="bloco"><h2>Preço da aposta</h2>
        <label class="linha">Aposta simples (15 dezenas): R$ <input class="in curto" type="number" step="0.5" min="0.5" id="preco15" value="${A.preco15}"></label>
        <p class="suave peq">Jogos com mais dezenas custam o número de combinações de 15 vezes esse valor: 16 = ${LF.reais(LF.precoAposta(16, A.preco15))},
        17 = ${LF.reais(LF.precoAposta(17, A.preco15))}, 18 = ${LF.reais(LF.precoAposta(18, A.preco15))}, 19 = ${LF.reais(LF.precoAposta(19, A.preco15))}, 20 = ${LF.reais(LF.precoAposta(20, A.preco15))}.</p></div>
      <div class="bloco"><h2>Resultados</h2>
        <p class="suave peq">Último concurso: ${LF.dados.ultimo().c} (${esc(LF.dados.ultimo().d)}). O site é atualizado todo dia com os resultados da Caixa.
        ${comp ? 'Neste link a busca direta na Caixa não funciona; use o site público para o resultado na hora, ou digite abaixo.' : ''}</p>
        ${comp ? '' : '<div class="linha"><button class="btn" data-acao="buscar-caixa">Buscar agora na Caixa</button></div>'}
        <h3>Digitar resultado</h3>${formResultado()}
        <p class="suave peq">Útil para conferir na hora. Um resultado digitado ${comp ? 'fica visível para todos deste link e ' : ''}é trocado pelo oficial quando ele chegar.</p></div>
      <div class="bloco"><h2>Onde os dados ficam</h2>
        <p>${comp ? '<b>Compartilhado.</b> Perfis e apostas ficam neste link do Claude; quem tem acesso vê e usa os mesmos perfis.' : '<b>Neste navegador.</b> Perfis e apostas ficam guardados só neste aparelho. Faça backup para levar para outro.'}</p>
        <div class="linha"><button class="btn" data-acao="backup">Baixar backup (.json)</button>
          ${comp ? '' : '<label class="btn">Restaurar backup<input type="file" id="restaurar" accept=".json,application/json" hidden></label>'}</div>
        <p class="suave peq">O backup tem os perfis, as apostas e os resultados digitados.</p></div>
      <div class="bloco"><h2>Perfil</h2><p>Você está como <b>${esc(A.perfil.nome)}</b>.</p><div class="linha"><button class="btn" data-acao="trocar-perfil">Trocar de perfil</button></div></div>
    </div>`;
  };

  async function backup() {
    let dados;
    if (A.store.exportar) dados = A.store.exportar();
    else {
      dados = { perfis: {}, apostas: {}, resultados: {} };
      for (const p of await A.store.perfis()) {
        dados.perfis[p.id] = p;
        for (const ap of await A.store.apostas(p.id)) dados.apostas[ap.id] = ap;
      }
      for (const r of await A.store.resultados()) dados.resultados[r.c] = r;
    }
    try {
      await LF.baixarArquivo(`lotofacil_backup_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(dados, null, 1), 'application/json');
    } catch (e) {
      aviso(e.message);
    }
  }

  // ---------- eventos ----------
  const ACOES = {
    'trocar-perfil': () => ir('perfis'),
    entrar: (el) => {
      A.perfil = A.perfis.find((p) => p.id === el.dataset.id);
      LF.ls.set('lotofacil.perfil', A.perfil.id);
      A.apostas = [];
      A.apostaAberta = null;
      A.gerado = null;
      A.confirmar = null;
      carregarApostas();
      ir('montar');
    },
    'pedir-excluir-perfil': (el, ev) => {
      ev.stopPropagation();
      const p = A.perfis.find((x) => x.id === el.dataset.id);
      A.confirmar = { tipo: 'perfil', id: p.id, nome: p.nome };
      render();
    },
    'excluir-perfil': async () => {
      const id = A.confirmar.id;
      A.confirmar = null;
      try {
        await A.store.excluirPerfil(id);
        A.perfis = A.perfis.filter((p) => p.id !== id);
        if (A.perfil && A.perfil.id === id) A.perfil = null;
        aviso('Perfil excluído.');
      } catch (e) {
        aviso(e.message);
      }
      render();
    },
    cancelar: () => {
      A.confirmar = null;
      render();
    },
    'abrir-concurso': (el) => {
      const c = +el.dataset.c;
      A.hist.aberto = A.hist.aberto === c ? null : c;
      render();
    },
    'mais-concursos': () => {
      A.hist.mostrar += 100;
      render();
    },
    'todos-concursos': () => {
      A.hist.mostrar = LF.dados.draws.length;
      render();
    },
    'limpar-busca': () => {
      A.hist.busca = '';
      render();
    },
    janela: (el) => {
      A.jan = +el.dataset.j;
      render();
    },
    ordenar: (el) => {
      A.ordem = el.dataset.ord;
      render();
    },
    ciclar: (el) => {
      const n = +el.dataset.n;
      A.m.cat[n] = { obrig: 'opc', opc: 'recus', recus: 'obrig' }[A.m.cat[n]];
      A.gerado = null;
      render();
    },
    'refazer-sugestao': () => {
      A.m.cat = LF.sugerirCategorias(A.analise, A.m.nObrig, A.m.nRecus);
      A.gerado = null;
      render();
    },
    'pesos-padrao': () => {
      A.m.pesos = { ...LF.PESOS_PADRAO };
      reanalisar();
    },
    'filtros-padrao': () => {
      A.m.filtros = LF.filtrosPadrao(A.estudo);
      render();
    },
    formato: (el) => {
      A.m.formato = el.dataset.f;
      if (A.m.formato === 'varios') A.m.tamanho = 15;
      else {
        if (A.m.tamanho === 15) A.m.tamanho = 17;
        if (!A.m.porOrcamento) A.m.quantidade = 1;
      }
      A.gerado = null;
      render();
    },
    'por-orc': (el) => {
      A.m.porOrcamento = el.dataset.v === '1';
      render();
    },
    gerar: () => gerar(),
    'salvar-aposta': () => salvarAposta(),
    exportar: (el) => exportar(el.dataset.de, el.dataset.fmt),
    copiar: (el) => copiar(el.dataset.de, el),
    'abrir-aposta': (el, ev) => {
      ev.preventDefault();
      A.apostaAberta = el.dataset.id;
      A.confirmar = null;
      if (A.rota !== 'apostas') ir('apostas');
      else render();
      window.scrollTo(0, 0);
    },
    'fechar-aposta': () => {
      A.apostaAberta = null;
      A.confirmar = null;
      render();
    },
    'pedir-excluir-aposta': () => {
      A.confirmar = { tipo: 'aposta' };
      render();
    },
    'excluir-aposta': async (el) => {
      try {
        await A.store.excluirAposta(el.dataset.id);
        A.apostas = A.apostas.filter((x) => x.id !== el.dataset.id);
        A.apostaAberta = null;
        A.confirmar = null;
        aviso('Aposta excluída.');
      } catch (e) {
        aviso(e.message);
      }
      render();
    },
    validar: () => validar(),
    backup: () => backup(),
    'buscar-caixa': async (el) => {
      el.disabled = true;
      try {
        const n = await LF.dados.buscarCaixa();
        LF.dados.montar([...LF.dados.cacheCaixa(), ...A.manuais]);
        recalcular();
        aviso(n ? `${n} concurso(s) novo(s).` : 'Já está tudo atualizado.');
      } catch (e) {
        aviso('Não consegui falar com a Caixa agora.');
      }
      render();
    },
  };

  function reanalisar() {
    A.analise = LF.analisar(LF.dados.draws, undefined, A.m.pesos, { completo: true });
    A.m.cat = LF.sugerirCategorias(A.analise, A.m.nObrig, A.m.nRecus);
    A.gerado = null;
    render();
  }

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-acao]');
    if (!el) return;
    const fn = ACOES[el.dataset.acao];
    if (fn) fn(el, ev);
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target.matches('.perfil[role=button]')) ACOES.entrar(ev.target);
  });

  document.addEventListener('submit', async (ev) => {
    const f = ev.target.dataset.form;
    if (!f) return;
    ev.preventDefault();
    if (f === 'criar-perfil') {
      const nome = $('#novoPerfil').value.trim();
      if (!nome) return;
      const p = { id: 'p' + LF.uid(), nome, criadoEm: new Date().toISOString() };
      try {
        await A.store.salvarPerfil(p);
        A.perfis.push(p);
        ACOES.entrar({ dataset: { id: p.id } });
      } catch (e) {
        aviso(e.message);
      }
    } else if (f === 'buscar-concurso') {
      A.hist.busca = $('#buscaConcurso').value.trim();
      A.hist.aberto = +A.hist.busca || null;
      render();
    } else if (f === 'resultado') {
      const c = parseInt($('#resC').value, 10);
      const n = [...new Set(($('#resN').value.match(/\d+/g) || []).map(Number))].filter((x) => x >= 1 && x <= 25).sort((a, b) => a - b);
      if (!c || n.length !== 15) return aviso(`Digite 15 dezenas diferentes de 1 a 25 (você digitou ${n.length}).`);
      const oficial = LF.dados.porConcurso(c);
      if (oficial && oficial.fonte !== 'manual') return aviso(`O concurso ${c} já tem resultado oficial.`);
      const r = { c, d: new Date().toLocaleDateString('pt-BR'), n, r: null, fonte: 'manual' };
      try {
        await A.store.salvarResultado(r);
        await recarregarResultadosManuais();
        recalcular();
        aviso(`Resultado do concurso ${c} salvo.`);
        render();
      } catch (e) {
        aviso(e.message);
      }
    }
  });

  document.addEventListener('change', async (ev) => {
    const t = ev.target;
    const M = A.m;
    if (t.id === 'mostraNum') {
      A.hist.numeros = t.checked;
      LF.ls.set('lotofacil.mostraNum', t.checked);
      render();
    } else if (t.id === 'nObrig' || t.id === 'nRecus') {
      M[t.id] = LF.clamp(parseInt(t.value, 10) || 0, 0, t.id === 'nObrig' ? 15 : 10);
      M.cat = LF.sugerirCategorias(A.analise, M.nObrig, M.nRecus);
      A.gerado = null;
      render();
    } else if (t.id === 'tamanho') {
      M.tamanho = +t.value;
      A.gerado = null;
      render();
    } else if (t.id === 'quantidade') {
      M.quantidade = LF.clamp(parseInt(t.value, 10) || 1, 1, 1000);
      render();
    } else if (t.id === 'orcamento') {
      M.orcamento = Math.max(0, parseFloat(t.value) || 0);
      render();
    } else if (t.id === 'alvo') {
      M.alvo = parseInt(t.value, 10) || M.alvo;
      if (A.gerado) A.gerado.alvo = M.alvo;
      render();
    } else if (t.dataset.filtro) {
      const f = M.filtros[t.dataset.filtro];
      if (t.dataset.campo === 'ativo') f.ativo = t.checked;
      else f[t.dataset.campo] = parseInt(t.value, 10) || 0;
      A.gerado = null;
    } else if (t.dataset.peso) {
      M.pesos[t.dataset.peso] = parseFloat(t.value);
      reanalisar();
    } else if (t.id === 'preco15') {
      A.preco15 = Math.max(0.5, parseFloat(t.value) || 3.5);
      LF.ls.set('lotofacil.preco15', A.preco15);
      render();
    } else if (t.id === 'vConc') A.valid.concursos = +t.value;
    else if (t.id === 'vJogos') A.valid.jogos = +t.value;
    else if (t.id === 'restaurar' && t.files[0]) {
      try {
        const json = JSON.parse(await t.files[0].text());
        A.store.importar(json);
        A.perfis = await A.store.perfis();
        await recarregarResultadosManuais();
        recalcular();
        await carregarApostas();
        aviso('Backup restaurado.');
        render();
      } catch (e) {
        aviso('Arquivo de backup inválido.');
      }
    }
  });
  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.dataset.peso) t.nextElementSibling.textContent = LF.num(parseFloat(t.value), 1);
  });

  iniciar().catch((e) => {
    $('#tela').innerHTML = `<div class="bloco"><h2>Não deu para abrir</h2><p>${esc(e.message)}</p></div>`;
    console.error(e);
  });
})();
