// Onde ficam perfis, apostas e resultados digitados à mão.
// - Dentro do Claude (Artifact): banco compartilhado entre todo mundo que abre o link.
// - No GitHub Pages: neste navegador (localStorage), com backup em arquivo.
(function () {
  const LF = window.LF;
  const CHAVE = 'lotofacil.dados.v1';
  const PRINCIPAL = { id: 'principal', nome: 'Principal', criadoEm: '2026-11-09T00:00:00.000Z' };

  function local() {
    const ler = () => {
      const d = LF.ls.get(CHAVE, null) || {};
      d.perfis = d.perfis || {};
      d.apostas = d.apostas || {};
      d.resultados = d.resultados || {};
      if (!d.perfis.principal) d.perfis.principal = PRINCIPAL;
      return d;
    };
    const gravar = (d) => {
      if (!LF.ls.set(CHAVE, d)) throw new Error('Não consegui salvar neste navegador (armazenamento cheio ou bloqueado).');
    };
    return {
      modo: 'local',
      async perfis() {
        return Object.values(ler().perfis);
      },
      async salvarPerfil(p) {
        const d = ler();
        d.perfis[p.id] = p;
        gravar(d);
      },
      async excluirPerfil(id) {
        const d = ler();
        delete d.perfis[id];
        for (const k in d.apostas) if (d.apostas[k].perfilId === id) delete d.apostas[k];
        gravar(d);
      },
      async apostas(perfilId) {
        return Object.values(ler().apostas).filter((a) => a.perfilId === perfilId);
      },
      async salvarAposta(a) {
        const d = ler();
        d.apostas[a.id] = a;
        gravar(d);
      },
      async excluirAposta(id) {
        const d = ler();
        delete d.apostas[id];
        gravar(d);
      },
      async resultados() {
        return Object.values(ler().resultados);
      },
      async salvarResultado(r) {
        const d = ler();
        d.resultados[r.c] = r;
        gravar(d);
      },
      exportar() {
        return ler();
      },
      importar(json) {
        const atual = ler();
        for (const k of ['perfis', 'apostas', 'resultados']) Object.assign(atual[k], json[k] || {});
        gravar(atual);
      },
    };
  }

  function compartilhado(db) {
    const lista = async (col, campo, valor) => {
      let q = db.collection(col);
      if (campo) q = q.where(campo, '==', valor);
      const s = await q.get();
      return s.docs.map((d) => d.data());
    };
    const tentar = async (fn) => {
      try {
        return await fn();
      } catch (e) {
        if (e && e.code === 'unavailable') {
          await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));
          return fn();
        }
        throw traduzir(e);
      }
    };
    const traduzir = (e) => {
      const c = e && e.code;
      if (c === 'invalid_argument') return new Error('Você só tem acesso de leitura neste link: peça para o dono te dar acesso de colaborador.');
      if (c === 'quota_exceeded') return new Error('O espaço compartilhado está cheio. Exclua apostas antigas para liberar.');
      return new Error((e && e.message) || 'Falha ao salvar.');
    };
    return {
      modo: 'compartilhado',
      async perfis() {
        const ps = await tentar(() => lista('perfis'));
        if (!ps.find((p) => p.id === 'principal')) {
          ps.push(PRINCIPAL);
          db.doc('perfis/principal').set(PRINCIPAL).catch(() => {});
        }
        return ps;
      },
      salvarPerfil: (p) => tentar(() => db.doc('perfis/' + p.id).set(p)),
      async excluirPerfil(id) {
        const aps = await lista('apostas', 'perfilId', id);
        for (const a of aps) await tentar(() => db.doc('apostas/' + a.id).delete());
        await tentar(() => db.doc('perfis/' + id).delete());
      },
      apostas: (perfilId) => tentar(() => lista('apostas', 'perfilId', perfilId)),
      salvarAposta: (a) => tentar(() => db.doc('apostas/' + a.id).set(a)),
      excluirAposta: (id) => tentar(() => db.doc('apostas/' + id).delete()),
      resultados: () => tentar(() => lista('resultados')),
      salvarResultado: (r) => tentar(() => db.doc('resultados/' + r.c).set(r)),
    };
  }

  // Dentro do Claude, espera o banco compartilhado responder; fora dele, usa o navegador.
  LF.abrirStore = async function () {
    const claude = window.claude;
    if (claude && typeof claude.use === 'function') {
      try {
        const db = await Promise.race([claude.use('db'), new Promise((r) => setTimeout(() => r(null), 10000))]);
        if (db) return compartilhado(db);
      } catch (e) {
        /* cai para o modo local */
      }
    }
    return local();
  };

  // Baixar arquivo: no Claude usa a permissão de download; fora dele, um link normal.
  LF.baixarArquivo = async function (nome, conteudo, tipo = 'text/plain') {
    const claude = window.claude;
    if (claude && typeof claude.use === 'function') {
      const dl = await claude.use('downloads');
      if (!dl) throw new Error('Download indisponível aqui. Use o botão Copiar.');
      try {
        await dl.save({ filename: nome, data: conteudo });
        return;
      } catch (e) {
        if (e && e.code === 'declined') return;
        throw new Error('Não deu para baixar (' + ((e && e.code) || 'erro') + '). Use o botão Copiar.');
      }
    }
    const blob = new Blob([conteudo], { type: tipo + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  };
})();
