# CLAUDE.md

Instruções para o Claude Code dentro deste repositório. Leia este arquivo antes
de tocar em qualquer coisa.

Responda em **português (BR)**, inclusive nos comentários de código.

## O que este projeto é

Este projeto gera um estudo de mercado e concorrência para uma empresa local,
usando só dados públicos. O trabalho tem duas camadas:

| Camada | Quem faz | Onde está |
|---|---|---|
| Coleta: Google Maps, Biblioteca de Anúncios da Meta, IBGE, mapa | scripts Node e Python, sem IA | `estudo.js`, `coleta/`, `montar.js`, `mapa/` |
| Pesquisa, análise, escrita e revisão | você e os subagentes | `.claude/commands/estudo.md`, `.claude/agents/`, `metodo/` |

O fluxo completo é o comando `/estudo`. Siga o arquivo
`.claude/commands/estudo.md` passo a passo, sem pular a revisão.

## Divisão de trabalho

O valor do estudo vem do julgamento, não da coleta. Por isso o trabalho vai
sempre para o nível mais barato que resolve:

1. **Script.** Raspagem, contagem, agregação e formatação. Se o resultado é
   determinístico, é script. Saída grande vai para arquivo e é filtrada antes
   de entrar no contexto.
2. **Subagente barato.** Coleta de perfil, site e notícia de cada empresa, uma
   empresa por subagente e em paralelo. Só o resumo em JSON volta para você.
3. **Você.** Tese, achados, cruzamentos, recomendação e redação final. Não
   delegue essa parte.

## Regras inegociáveis

- **Todo número tem fonte.** A fonte é um arquivo em `estudos/<cliente>/dados/`,
  um arquivo em `estudos/<cliente>/pesquisa/` ou um link público citado em
  Fontes. Se não houver fonte, o número não entra.
- **Só leitura na internet.** Com o `opencli`, use apenas comandos de leitura
  (`profile`, `user`, `search`, `news`). Nunca curta, siga, comente ou publique.
  O `.claude/settings.json` bloqueia esses comandos, e esse bloqueio não deve
  ser contornado.
- **Nunca contate concorrentes.** Nada de WhatsApp, formulário ou e-mail.
- **Dado de cliente nunca sai de `estudos/`.** Essa pasta é ignorada pelo git.
  Não copie nome de cliente, cidade ou número de estudo para arquivos
  versionados: README, exemplos, testes, comentários e mensagens de commit.
- **Não termine sem abrir o resultado.** `node revisar.js <cliente>` gera
  capturas de cada página. Abra todas com a ferramenta de leitura de imagem e
  leia como o cliente leria. Um estudo só com gráficos e sem texto está
  reprovado.
- **Git é do dono do repositório.** Não faça commit, push nem crie branch.

## Comandos

```bash
node estudo.js --lista                  # estudos existentes
printf '%s\n' "<empresa>" "<Cidade UF, Cidade UF>" "<tipo1, tipo2>" | node estudo.js
                                         # coleta + montagem sem perguntas
node estudo.js --montar <cliente>       # remonta sem coletar
node revisar.js <cliente>               # portão de qualidade + capturas + PDF
node verificar.js                       # procura dado sensível antes de commit
```

## Estilo de código

Código explícito: `if` e `for` sempre com chaves e corpo em linhas próprias,
sem operador ternário e sem cadeias de `map`/`filter`. Variáveis com nome que
explica o passo. Comentário só no topo da função, dizendo o que ela faz.

## Mapa de arquivos

```
estudo.js            comando único da coleta (pergunta, coleta, monta)
coleta/              Maps, Biblioteca de Anúncios, Instagram público
montar.js            IBGE + mapa + tabelas dentro do estudo.html
revisar.js           portão de qualidade, capturas de página e PDF
verificar.js         varredura de segredo e de dado de cliente
metodo/ANALISE.md    como pensar e escrever a análise
template/            documento-modelo e tema visual
.claude/commands/    /estudo, o orquestrador
.claude/agents/      pesquisador, contexto, revisor
estudos/             um diretório por cliente (ignorado pelo git)
```
