# Arquitetura: decisões e trade-offs

Este documento registra por que o projeto é como é. Cada decisão traz a
alternativa descartada e o motivo.

## 1. O Claude Code como runtime, sem chave de API

**Decisão:** o agente é o próprio Claude Code. O repositório traz só
instruções (`CLAUDE.md`, um comando, três subagentes, um hook) e scripts
determinísticos.

**Alternativa descartada:** um orquestrador próprio sobre a API da Anthropic,
com tool use.

**Por quê:**
- Sem chave no projeto, não há o que vazar num repositório público.
- O Claude Code já resolve o laço de ferramentas, os subagentes com modelo
  próprio, as permissões, os hooks e a leitura de imagem, que a revisão visual
  exige.
- Quem roda paga com a própria assinatura. O projeto não precisa de servidor
  nem de cobrança.

**Custo:** quem não usa Claude Code não roda a camada de análise. O README
deixa isso explícito.

## 2. Script antes de modelo

**Decisão:** tudo que tem resultado determinístico é script. Isso vale para a
raspagem do Maps, a medição na Biblioteca de Anúncios, a população do IBGE, o
mapa, as tabelas e o portão de qualidade.

**Por quê:** o custo de token está na saída de ferramenta, não no raciocínio.
Um snapshot da Biblioteca de Anúncios tem cerca de 90 mil caracteres. Filtrado
por script, vira um JSON de poucas linhas. O modelo só vê o que precisa para
julgar.

## 3. Um subagente por empresa, em paralelo, com modelo barato

**Decisão:** o `pesquisador` roda em Haiku, um por empresa, todos disparados na
mesma mensagem. Cada um grava um JSON em `pesquisa/` e devolve só o caminho.

**Alternativa descartada:** o agente principal pesquisar todas as empresas em
sequência.

**Por quê:**
- A leitura de perfil e site é braçal.
- Em paralelo, o tempo cai de N × 2 minutos para cerca de 2 minutos.
- A saída bruta (HTML de site, JSON de Instagram) nunca entra no contexto do
  agente que escreve a análise. O contexto dele fica para o julgamento.

**Contrato:** todo campo do JSON tem a URL de onde saiu. O que não foi
encontrado vai para `lacunas`, nunca para uma estimativa.

## 4. Contexto do setor em Sonnet, não em Haiku

**Decisão:** o subagente `contexto` usa um modelo mais forte.

**Por quê:** é ele que encontra o dado setorial por município, como frota no
Detran, estabelecimentos no CNES ou escolas no INEP, e é desse dado que sai o
achado central. Escolher entre um órgão oficial e um blog de marketing exige
critério. Um erro aqui contamina o estudo inteiro.

## 5. A análise vira arquivo antes de virar documento

**Decisão:** o agente escreve `analise.md`, com tese, achados, cruzamentos e
recomendações, antes de mexer no HTML.

**Por quê:**
- Separa pensar de diagramar.
- Dá ao revisor um texto curto para confrontar com as fontes.
- O portão (`revisar.js`) exige esse arquivo: sem análise registrada, o
  documento não passa.

## 6. Portão mecânico + revisão visual + revisor independente

**Decisão:** a revisão tem três camadas, e todas são obrigatórias.

1. **`revisar.js`**, que é determinístico. Ele reprova lacuna `{{…}}`, seção com
   menos de 40 palavras de texto, documento com menos de 1.200 palavras, Fontes
   com menos de 5 links, `analise.md` ausente e `pesquisa/` vazia. Também
   avisa quando há jargão.
2. **Leitura das capturas.** O `revisar.js` gera capturas da página inteira e o
   agente lê cada uma com visão.
3. **O subagente `revisor`.** Ele procura cada número do documento em `dados/`
   e em `pesquisa/` e refaz as contas.

**Por quê:** a versão anterior do projeto passava em "monta sem erro" e
entregava um documento só de gráficos. Ela foi reprovada pelo próprio autor. O
portão transforma "o estudo está bom?" em critérios verificáveis. A leitura
visual pega o que o texto não mostra, e o revisor pega o pior erro possível: um
número sem fonte.

## 7. Só leitura, garantido por hook e não por instrução

**Decisão:** o `.claude/hooks/so-leitura.js` intercepta todo comando Bash. Ele
bloqueia subcomandos do opencli que escrevem em rede social, além de
`git commit` e `git push`.

**Por quê:** uma instrução no prompt pode ser ignorada; um hook não pode. O
opencli roda no navegador logado do usuário, então um `follow` ou `comment`
acidental sairia com a identidade dele. O hook analisa o comando, pega o
subcomando depois do site e decide.

## 8. Segurança para publicar o repositório

**Decisão:** quatro camadas.

1. **`.gitignore`:** `estudos/`, `praca.json`, `.env`, `settings.local.json` e PDF.
2. **`verificar.js`:** procura padrões de segredo, caminhos com nome de usuário,
   imagens fora das pastas permitidas e, principalmente, **os termos dos
   estudos locais**. Ele lê o nome e as cidades de cada estudo em `estudos/` e
   procura esses termos nos arquivos versionados.
3. **O gancho de pre-commit** (`.githooks/pre-commit`) roda o `verificar.js` em
   todo commit.
4. **Nenhuma credencial é necessária.** A Biblioteca de Anúncios, o Maps e o IBGE
   são públicos.

**Limite conhecido:** o `verificar.js` só conhece os clientes que existem na
máquina. Um estudo apagado de `estudos/` deixa de ser procurado.

## 9. Gráficos sem biblioteca

**Decisão:** barras, linha do tempo e comparativo são feitos em HTML e CSS. O
mapa é SVG gerado em Python a partir da malha oficial do IBGE.

**Por quê:** o PDF sai de Chrome headless. Chart.js e Recharts precisam
executar antes da impressão, e a falha é silenciosa: só aparece no PDF pronto.
