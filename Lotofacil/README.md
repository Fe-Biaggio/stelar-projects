# Laboratório Lotofácil

Site para analisar os concursos anteriores da Lotofácil, sugerir dezenas, montar jogos e
comparar o resultado com jogos aleatórios.

- **Site público:** https://fe-biaggio.github.io/stelar-projects/lotofacil/
  (dados salvos no navegador de cada pessoa; busca resultados novos direto na Caixa)
- **Link compartilhado no Claude:** perfis e apostas ficam num banco único para todos que têm acesso
  ao link (ver `PENDENCIAS.md` para o endereço).

## O que tem

- **Perfis sem senha:** escolher ou criar um perfil; "Principal" já vem criado. Tudo fica salvo no perfil.
- **Resultados:** todos os concursos em fileiras de 25 bolinhas (marcadas = sorteadas), frequência no topo,
  busca por número e detalhe de cada concurso (volante 5×5, métricas, rateio).
- **Análise:** frequência de cada dezena nos últimos 10/25/50/100/200, 500, 1000 e no histórico todo;
  atraso atual e máximo; e cartões que mostram o que de fato veio no concurso seguinte a jogos parecidos
  com o último (pares/ímpares, baixas/altas, soma, repetidas, moldura, primos, vizinhas, maior espaço,
  Fibonacci, múltiplos de 3, linhas e colunas do volante).
- **Montar jogos:** a análise dá pontos a cada dezena e sugere obrigatórias, opcionais e recusadas
  (toque na dezena para mudar). Escolha vários jogos de 15 ou um jogo de 16 a 20 dezenas, pela quantidade
  ou por valor máximo em R$. Filtros pelos padrões do histórico. Pesos de cada métrica ajustáveis.
- **Exportar:** .txt (uma linha por jogo), .csv ou copiar.
- **Jogos aleatórios de comparação:** cada aposta salva leva a mesma quantidade de jogos aleatórios.
- **Conferência:** quando o resultado sai, mostra acertos, prêmio e saldo dos seus jogos e dos aleatórios.
- **Desempenho:** soma de todas as apostas conferidas + validação histórica (refaz a análise nos últimos
  N concursos usando só o passado e compara com o acaso).

## Como funciona por dentro

- `app/` é o site (HTML/CSS/JS puro, sem build). `app/data/resultados.js` é o histórico.
- `tools/atualizar_resultados.py` busca concursos novos na API da Caixa (com espelho de reserva).
  `--xlsx Lotofacil.xlsx` recria tudo a partir da planilha. O GitHub Actions roda isso 2x por dia.
- `tools/gerar_artifact.py` monta `build/artifact/` para publicar no Claude.
- Testar local: preview "lotofacil" do `.claude/launch.json` (porta 5180).
