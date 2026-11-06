# Método de análise

Este é o padrão que o agente segue para transformar a coleta num estudo que o
cliente lê e consegue usar. A coleta responde **o quê**. A análise responde
**e daí**.

O tipo de achado que se procura: um dado setorial oficial mostra que a cidade
pequena da praça concentra um público fora do padrão, maior que o de duas
vizinhas maiores somadas. Isso troca o público, a oferta e a ordem de expansão
do plano. Nenhum script encontraria esse achado, porque a pergunta não estava
escrita em lugar nenhum.

---

## 1. Princípios

1. **Um número inventado destrói o documento inteiro.** O cliente leva o estudo
   para uma reunião em que alguém pode checar. Por isso, todo número tem uma
   fonte: um arquivo em `dados/`, um arquivo em `pesquisa/` ou um link público.
   Quando o dado não existe, o estudo diz isso. Estimar não é permitido.
2. **Achado é número com consequência.** "Há 12 concorrentes" é inventário.
   "Dos 12 concorrentes, só 2 anunciam, e os dois entraram há menos de 60 dias"
   é achado.
3. **A pergunta óbvia costuma estar errada.** Antes de escrever, procure o dado
   que derruba a leitura mais óbvia da praça. Se encontrar, ele vira o achado
   central.
4. **Escreva para o dono do negócio.** O leitor não sabe o que é CPL, pixel,
   funil, CTR ou remarketing. Explique o efeito ("quem viu o vídeo vira público
   da próxima fase"), não o termo técnico.
5. **Não aponte defeito do cliente.** O documento é entregue a ele. Diga o que
   o dado implica, por exemplo: "começar do zero muda o plano: o primeiro mês
   constrói presença". Não diga o que está errado.
6. **Nada de slogan.** Os títulos dizem o achado ("A Cidade A tem mais
   clínicas que as Cidades B e C somadas"), não frases de efeito.

## 2. Perguntas que a análise precisa responder

Faça estas perguntas na ordem. Cada resposta precisa de evidência.

| # | Pergunta | Onde procurar |
|---|---|---|
| 1 | Qual é o tamanho real do público na praça? Quem é ele? | IBGE, dado setorial público (frota, matrículas, CNES, Cadastur…) |
| 2 | O que mudou no mercado nos últimos 24 meses? | lei, regulação, tributo, notícia datada |
| 3 | Quem disputa o cliente de verdade, e quem só aparece na busca? | `dados/concorrentes.md` e perfis |
| 4 | Quem compra mídia, há quanto tempo e com que oferta? | Biblioteca de Anúncios (`dados/`) e criativos |
| 5 | Onde o cliente já sai na frente, de forma verificável? | certificação, tempo de mercado, cobertura, nota |
| 6 | Onde não vale brigar? | preço do concorrente, volume de seguidores |
| 7 | Que público ou território ninguém está atendendo? | cruzar a pergunta 1 com as perguntas 3 e 4 |
| 8 | Por onde começar, e em que ordem expandir? | consequência das perguntas 5 a 7 |

A pergunta 7 costuma dar o achado central. Ele quase sempre sai de um cruzamento
de dados, e não de uma fonte sozinha.

## 3. Estrutura do documento

A ordem das seções é fixa e está em `template/estudo.html`. Uma seção sem dado
é apagada inteira. Lacuna vazia nunca vai para o cliente.

| Seção | O que precisa ter |
|---|---|
| Título | A tese em uma linha. O nome da empresa não é título. |
| Em resumo | Um parágrafo com a tese e 3 ou 4 achados. Cada achado tem um número no título e uma ou duas frases. |
| Mercado | Contexto datado e com fonte. Os números do território. Um parágrafo "por que isso importa" que traduz o dado em consequência comercial. |
| Concorrentes | De 3 a 5 cards: cliente e principais concorrentes. Depois, a leitura: onde cada um é forte e onde não vale brigar. |
| Quem anuncia | A tabela vem da coleta. O parágrafo de leitura vem antes dela e diz o que a tabela significa. |
| Presença digital | Seguidores e cadência de postagem. A comparação com o maior concorrente, com a consequência para o plano. |
| Site e conversão | Só o que se observa de fora: caminho até o contato, oferta visível, rastreamento. |
| Reputação | Nota e volume de avaliações. Temas das críticas, se houver. |
| Preço | O que é público. Preço desconhecido aparece como "não divulga". |
| O que dizer nos anúncios | De 3 a 4 ideias, cada uma derivada de um achado do próprio estudo. |
| O que fazer | Fases em ordem, com a primeira ação mais barata e de maior impacto. Inclui também o que não fazer. |
| O que falta | Pendências que dependem do cliente, como plano, margem ou conversão. Sem elas, qualquer meta seria chute. |
| Fontes | Todos os links, agrupados por tema. |

O tamanho de referência fica entre 1.500 e 3.000 palavras de texto corrido.
Um estudo só com gráficos não é estudo.

## 4. Contexto externo que sempre vale procurar

- **Tributo sobre anúncios:** o repasse de tributos da Meta no Brasil vale desde
  01/01/2026. Confira o percentual vigente na fonte antes de citar.
- **Regulação do setor:** conselho de classe, agência reguladora, lei nova,
  restrição de publicidade (saúde, financeiro, bebida).
- **Sazonalidade:** férias, safra, calendário escolar, evento da cidade.
- **Dado setorial público:** cada setor tem o seu. Por exemplo, Detran (frota),
  CNES (saúde), INEP (ensino), Cadastur (turismo), Anvisa e Receita (CNPJ e
  CNAE).

## 5. Cores e componentes

Use só os componentes de `template/tema.css`: `.stats`, `.cards`, `.tw table`,
`.bars`, `.tline`, `.vs`, `.note`, `.steps` e `.clean`. A linha do cliente leva
`class="mark"` nas tabelas e `class="own"` nos gráficos.

## 6. Antes de entregar

- [ ] `node revisar.js <cliente>` passou sem erro.
- [ ] Cada página da revisão foi aberta e lida (`estudos/<cliente>/revisao/`).
- [ ] O subagente revisor conferiu cada número contra a fonte.
- [ ] Nenhum termo técnico ficou sem explicação.
- [ ] Nenhuma frase aponta defeito do cliente.
- [ ] A seção "O que falta" lista o que depende do cliente.
