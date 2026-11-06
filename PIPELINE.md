# Pipeline — como o relatório é produzido

Mapa honesto do que é máquina e do que é gente. Serve para saber onde intervir
quando algo sai errado, e para não confundir "automatizado" com "eu fazendo à mão".

O fluxograma completo, com os subagentes, está no `README.md`. As decisões
estão em `docs/arquitetura.md`.

## Visão geral

```
1. COLETA          público, sem login                    ← script
        ↓
2. PESQUISA        perfil, site, contexto do setor       ← subagentes
        ↓
3. ANÁLISE         julgamento: tese, achados, cruzamento ← agente principal
        ↓
4. ESCRITA         HTML com gráficos SVG inline          ← agente principal
        ↓
5. REVISÃO         portão + leitura visual + revisor     ← script + agentes
        ↓
6. FECHAMENTO      Chrome headless → PDF                 ← script
```

**Script nunca analisa.** A análise é julgamento e fica com o agente principal,
seguindo `metodo/ANALISE.md`. Quem entrega ao cliente lê o PDF antes.

## 1. Coleta

| Fonte | Ferramenta | Estado |
|---|---|---|
| Meta Ad Library | Playwright MCP + `extrair.js` | Funciona, manual |
| Google Ads Transparency | — | A construir |
| Google Maps / avaliações / GMN | Playwright MCP | A construir |
| IBGE (população, renda, idade) | API aberta, sem chave | A construir |
| Google Trends | manual | Manual |
| Pixel / GTM no site | fetch + regex | A construir |
| PageSpeed | API do Google | A construir |
| Perfis sociais | Playwright / `agent-reach` | Parcial |
| WhatsApp (tempo de resposta) | **você, manualmente** | Manual, e fica assim |

Sobre o WhatsApp: uma mensagem por concorrente, como cliente interessado, é
**cliente oculto** — prática padrão de pesquisa. Automatizar em volume vira disparo
abusivo contra o comercial dos concorrentes, e derruba o número. Fica manual por
decisão, não por limitação.

O `coletor/` (Java) existe para tirar as linhas "A construir" da mão e dar
**histórico** — a mesma coleta repetida no tempo.

## 2. Análise

Nenhum script analisa. O achado que sustenta um relatório vem de julgamento
aplicado ao dado coletado, como uma cidade pequena concentrar mais público que
duas maiores somadas. Nenhum script encontra isso, porque a pergunta não estava
escrita em lugar nenhum.

Quem faz esse julgamento é o agente principal do Claude Code, seguindo as oito
perguntas de `metodo/ANALISE.md`. Cada número precisa ter fonte em `dados/` ou
em `pesquisa/`, e o subagente `revisor` confere isso antes da entrega.

## 3. Escrita

HTML direto, com `@media print` embutido. Gráficos em **SVG inline**.

A restrição que decide o formato: o PDF sai de Chrome headless. Chart.js e Recharts
precisam executar antes da impressão e o timing é frágil — você descobre que quebrou
olhando o PDF pronto. SVG renderiza igual nos dois.

Linguagem visual única em `template/tema.css`, para os gráficos não terem cinco caras
diferentes.

## 4. Fechamento

Chrome headless `--print-to-pdf`, com inspeção página a página.

As regras de impressão que evitam conteúdo cortado e bloco partido ao meio estão
no bloco `IMPRESSÃO / PDF` de `template/tema.css`.

Cuidado conhecido: o Chrome headless às vezes não encerra sozinho depois de gerar o
PDF. O arquivo já foi escrito antes do travamento — basta matar o processo.

## Onde o dinheiro entra

```
disparo frio  →  call rápida  →  fecha  →  link do Stripe  →  produz e entrega
```

Antes da call, roda-se a coleta do segmento do prospect e leva-se **2 ou 3 achados**
do mercado dele. Custa ~20 minutos e muda a conversa de "me explica o serviço" para
"como eu resolvo isso".

Infraestrutura comercial hoje: **um link de pagamento do Stripe.** Sem loja, sem
mensalidade. LP entra quando houver escopo fechado, casos reais e depoimento.
