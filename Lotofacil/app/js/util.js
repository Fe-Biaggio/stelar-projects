// Utilidades gerais. Os jogos são guardados como "máscara de bits": o bit (n-1) ligado = dezena n marcada.
(function () {
  const LF = (window.LF = window.LF || {});

  LF.bit = (n) => 1 << (n - 1);
  LF.maskDe = (arr) => arr.reduce((m, n) => m | (1 << (n - 1)), 0);
  LF.numsDe = (m) => {
    const r = [];
    for (let k = 1; k <= 25; k++) if (m & (1 << (k - 1))) r.push(k);
    return r;
  };
  LF.pop = (m) => {
    m = m - ((m >>> 1) & 0x55555555);
    m = (m & 0x33333333) + ((m >>> 2) & 0x33333333);
    return (((m + (m >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
  };
  const combCache = {};
  LF.comb = (n, k) => {
    if (k < 0 || k > n) return 0;
    const key = n * 100 + k;
    if (combCache[key] !== undefined) return combCache[key];
    let r = 1;
    for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
    return (combCache[key] = Math.round(r));
  };

  LF.dd = (n) => String(n).padStart(2, '0');
  LF.texto = (m) => LF.numsDe(m).map(LF.dd).join(' ');
  LF.esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  LF.reais = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  LF.num = (v, casas = 0) => (v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  LF.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  LF.dataBR = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  // Aleatório de verdade (crypto) para os jogos de comparação.
  LF.rand = () => {
    try {
      const a = new Uint32Array(1);
      crypto.getRandomValues(a);
      return a[0] / 4294967296;
    } catch (e) {
      return Math.random();
    }
  };

  LF.percentil = (ordenado, p) => {
    if (!ordenado.length) return 0;
    const i = Math.min(ordenado.length - 1, Math.max(0, Math.round(p * (ordenado.length - 1))));
    return ordenado[i];
  };
  LF.media = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  LF.clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Preço de uma aposta com n dezenas = combinações de 15 dentro dela × preço da aposta simples.
  LF.precoAposta = (tamanho, preco15) => LF.comb(tamanho, 15) * preco15;

  // localStorage pode falhar (aba anônima, etc.): sempre com try/catch.
  LF.ls = {
    get(k, padrao) {
      try {
        const v = localStorage.getItem(k);
        return v == null ? padrao : JSON.parse(v);
      } catch (e) {
        return padrao;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
        return true;
      } catch (e) {
        return false;
      }
    },
  };
})();
