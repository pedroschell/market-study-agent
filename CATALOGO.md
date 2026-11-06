# Catálogo — o que se vende

Documento comercial. Define o que entra na entrega, o que não entra e o que fica
para o produto seguinte.

O **como fazer** cada análise está em
um checklist técnico próprio, mantido fora deste repositório.
Os IDs abaixo apontam para lá. Uma lista só, duas visões.

## Regra que define o produto

**Tudo é coletado de fora. O comprador não fornece nada.**

O próprio cliente entra na análise como qualquer outra empresa — site, redes, preço,
anúncios ativos e Google Meu Negócio dele são públicos. Não é preciso pedir acesso a
nada para posicioná-lo contra os concorrentes.

## As 18 análises

### A. Território e demanda

| | Análise | Responde | IDs |
|---|---|---|---|
| A1 | Tamanho e perfil do município — população, renda, faixa etária | Tem gente suficiente, e com o dinheiro certo? | 1.1, 1.8 |
| A2 | Sazonalidade e volume de busca | Quando o mercado aquece, e quanta gente procura | 1.3, 1.4 |
| A3 | Contexto de mercado — regulação, tributo, evento datado | O que mudou no jogo, com fonte | 1.6 |

### B. Mapa da concorrência

| | Análise | Responde | IDs |
|---|---|---|---|
| B1 | Quem são os concorrentes — diretos, indiretos e os que só existem em mídia paga | Contra quem se briga de verdade | 2.1–2.4 |
| B2 | Quem não anuncia | Quem vive de indicação e quem está dormindo | 3.17 |

### C. Mídia paga

| | Análise | Responde | IDs |
|---|---|---|---|
| C1 | Anúncios ativos no Meta — volume, tempo de veiculação, formato, oferta | Há quanto tempo cada um investe | 3.1–3.8 |
| C2 | Anúncios ativos no Google — Search, YouTube, Display | Em quais superfícies eles aparecem | 3.9–3.11 |
| C3 | Share of voice por termo | Quantos disputam cada palavra | 3.15 |
| C4 | Termos disputados × ignorados | Onde há espaço vazio | 3.16 |

### D. Presença digital

| | Análise | Responde | IDs |
|---|---|---|---|
| D1 | Seguidores, canais e cadência — cliente × concorrentes | Onde o público está e quem não aparece lá | 4.1–4.5 |
| D2 | Posição orgânica nos termos comerciais | Precisa pagar por tudo? | 4.7 |

### E. Site e conversão

| | Análise | Responde | IDs |
|---|---|---|---|
| E1 | Fluxo, comunicação e gatilhos — gaps do cliente | Onde o interessado desiste | 7.1, 7.3 |
| E2 | Infraestrutura de mídia — pixel, GTM, tags | O concorrente otimiza ou está no escuro | 7.4 |
| E3 | Velocidade do site (PageSpeed) | Quanto se perde antes de carregar | 4.6 |

### F. Reputação local

| | Análise | Responde | IDs |
|---|---|---|---|
| F1 | Avaliações e perfil do Google Meu Negócio | Quem tem prova social e perfil completo | 5.1, 5.2, 5.5 |
| F2 | Temas das críticas negativas dos concorrentes | A dor da categoria nas palavras de quem comprou | 5.3 |

### G. Preço e atendimento

| | Análise | Responde | IDs |
|---|---|---|---|
| G1 | Preço, escopo e condição de entrada | Onde o cliente está no mapa de valor | 6.1–6.5 |
| G2 | Tempo de resposta no WhatsApp | Quem atende rápido e quem some | 7.2 |

### Fechamento (sempre)

Achado central em uma frase com número · mapa de posicionamento · 3 movimentos
priorizados por esforço × impacto · o que **não** fazer · limites do levantamento ·
fontes com link. IDs 8.1–8.6.

## Parte visual

Gráficos em SVG e HTML/CSS, linguagem única definida em `template/tema.css`:

- Mapa de posicionamento — preço × entrega, cliente destacado
- Share of voice — barras por termo
- Linha do tempo de anúncios — quem entrou quando, quem parou
- Comparativo de presença — seguidores e canais
- Pirâmide etária e distribuição de renda do município, com a faixa do ticket marcada
- Reputação e PageSpeed lado a lado

## Escopo

Este bloco protege em contestação de pagamento. Escreva na proposta, não só aqui.

**Entra:** as 18 análises acima, sobre **o cliente e até 4 concorrentes**, na praça
geográfica definida no aceite. Entrega em PDF.

**Não entra:**

| Fora | Por quê |
|---|---|
| Tráfego estimado do concorrente | Exige ferramenta paga; estimativa imprecisa em negócio pequeno |
| Investimento em R$ do concorrente | Não é público. Chutar destrói a credibilidade do relatório inteiro |
| Parcela de impressões | Só existe dentro da conta de anúncios — produto 2 |
| Pesquisa primária com consumidor | Outro produto, outro preço |
| Execução — criar campanha, site ou criativo | É diagnóstico, não implementação |
| Revisão ilimitada | Uma rodada de ajuste inclusa |

**Prazo:** definir e escrever na proposta. Hoje a produção é majoritariamente manual
— não prometa prazo que dependa de automação que ainda não existe.

## Produto 2 — exige acesso

Vendido depois, a quem já comprou o primeiro. Cada linha aqui é uma linha da seção
"limites do levantamento" do produto 1 — **o primeiro relatório vende o segundo
sozinho**, sem precisar de pitch.

| Análise | O que exige |
|---|---|
| Parcela de impressões e Auction Insights | Conta do Google Ads |
| Demografia de quem realmente converteu | Contas de anúncio |
| Tamanho de público por segmentação | Gerenciador de Anúncios |
| Perfil de quem já compra — CEP × setor censitário | Base de clientes com CEP |
| Motivos de perda e consistência do CRM | Acesso ao CRM |
| Auditoria de conta — estrutura, negativação, rastreamento | Contas de anúncio |

## Terceiro nível — monitoramento

As mesmas coletas do produto 1, repetidas no tempo. O produto 1 é a foto; o
monitoramento é o filme: *"seu concorrente foi de 3 para 14 anúncios em dois meses"*.

Também é 100% externo — mesma ausência de atrito. Depende do `coletor/` existir.

Análises que se repetem bem: C1, C2, C3, F1, G1.
