# Lotofácil – onde paramos

## Endereços
- Site público (GitHub Pages): https://fe-biaggio.github.io/stelar-projects/lotofacil/
- Link compartilhado (Claude, banco único para todos com acesso): https://claude.ai/artifact/7UuGzfkVqdBMJznzawSi4y
  - Para atualizar: `python Lotofacil/tools/atualizar_resultados.py`, `python Lotofacil/tools/gerar_artifact.py`
    e publicar `Lotofacil/build/artifact/index.html` (mesma URL) com `css/`, `js/` e `data/` em `files`,
    capabilities `{db: {}, downloads: true}`.
  - Coleções do banco: `perfis/{id}`, `apostas/{id}` (campo perfilId; jogos como máscara de bits),
    `resultados/{concurso}` (digitados à mão).

## Feito (09/11/2026)
- Perfis sem senha (Principal fixo), histórico, análise, montar jogos (obrigatórias/opcionais/recusadas,
  15 ou 16–20 dezenas, por quantidade ou orçamento, filtros, pesos), exportação .txt/.csv, jogos
  aleatórios de comparação, conferência com prêmio, desempenho e validação histórica.
- GitHub Actions busca resultados 2x por dia e publica o site.

## Limitações conhecidas
- No site público os dados ficam só no navegador (backup em Ajustes). Multiusuário de verdade = link do Claude.
- O link do Claude não consegue buscar na Caixa (bloqueado); ele usa o arquivo publicado + resultados digitados.
  Precisa republicar para receber concursos novos automaticamente.
- A Caixa não aceita importar arquivo de apostas; o .txt serve para copiar/marcar no app ou na lotérica.

## Ideias para depois
- Banco online gratuito (ex.: Supabase) para o site público ficar multiusuário sem o Claude.
- Marcar quais jogos foram realmente apostados (às vezes só parte da lista é jogada).
- Gráfico da evolução do desempenho (análise × aleatório) ao longo das apostas.
- Fechamentos/desdobramentos clássicos (garantia de 11+ acertos se X das opcionais saírem).
- Avisar quando sair o resultado de uma aposta salva.
