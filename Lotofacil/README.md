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
- **Dois modos de pontuação:** *Análise de tendência* (equilíbrio, tendência, atraso, compensação com pesos) e
  *Análise de acontecimento* (cada análise ligada dá 0,4 se a condição aconteceu no último concurso, +40% do que
  falta para 1 a cada concurso seguido antes, até quebrar; os pontos são somados).
- **Montar jogos:** a análise dá pontos a cada dezena e sugere obrigatórias, opcionais e recusadas
  (toque na dezena para mudar). Escolha vários jogos de 15 ou um jogo de 16 a 20 dezenas, pela quantidade
  ou por valor máximo em R$. Filtros pelos padrões do histórico. Pesos de cada métrica ajustáveis.
  Também "Todas as combinações" (até 1000 jogos) e **Fechamento**: com 16 a 20 dezenas, o menor número
  de jogos que garante X acertos se Y das suas dezenas saírem (ex.: 18 dezenas, 14 pontos se saírem 15 = 24 jogos).
- **Combinações populares:** marca e (opcionalmente) evita sequências longas, desenhos no volante e cópias
  de resultados recentes, que dividem o prêmio de 14/15 com mais gente.
- **Retorno esperado e risco:** antes de salvar, retorno médio (~45% do valor) e chances de algum 11+,
  13+, 14+, lucro e de não ganhar nada, por simulação, comparando com os aleatórios. Fica salvo na aposta.
- **Testes estatísticos e ciclo:** qui-quadrado das 25 dezenas e correlação entre concursos seguidos
  (existe "compensação"?), e o ciclo das dezenas.
- **Exportar:** .txt (uma linha por jogo), .csv ou copiar.
- **Jogos aleatórios de comparação:** cada aposta salva leva a mesma quantidade de jogos aleatórios.
- **Conferência:** quando o resultado sai, mostra acertos, prêmio e saldo dos seus jogos e dos aleatórios.
- **Desempenho:** soma de todas as apostas conferidas + validação histórica (refaz a análise nos últimos
  N concursos usando só o passado e compara com o acaso).

## Banco compartilhado do site público (Supabase)

1. Criar conta grátis em https://supabase.com e um projeto novo (região São Paulo).
2. No projeto: **SQL Editor** → colar o conteúdo de `supabase.sql` → **Run**.
3. Em **Project Settings → API** (ou "Connect"), copiar a **Project URL** e a chave **anon / publishable**.
4. Colocar as duas em `app/js/config.js` e publicar. A chave pública pode ficar no site; nunca use a
   chave `service_role` / secret.

Sem senha nos perfis (como pedido): qualquer pessoa com o endereço do site pode ver e mudar os dados.
Em Ajustes há um botão para enviar ao banco o que estava salvo só no navegador.

## Como funciona por dentro

- `app/` é o site (HTML/CSS/JS puro, sem build). `app/data/resultados.js` é o histórico.
- `tools/atualizar_resultados.py` busca concursos novos na API da Caixa (com espelho de reserva).
  `--xlsx Lotofacil.xlsx` recria tudo a partir da planilha. O GitHub Actions roda isso 2x por dia.
- `tools/gerar_artifact.py` monta `build/artifact/` para publicar no Claude.
- Testar local: preview "lotofacil" do `.claude/launch.json` (porta 5180).
