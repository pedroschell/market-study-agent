---
description: Gera um estudo de mercado completo — coleta, pesquisa, análise, escrita e revisão
argument-hint: "[briefing do cliente em texto livre]"
---

# /estudo

Você vai produzir um estudo de mercado no nível descrito em `metodo/ANALISE.md`.
Leia esse arquivo inteiro antes do passo 1.

Entrada do usuário: $ARGUMENTS

Trabalhe sem parar entre os passos. Só pergunte ao usuário se faltar algum
campo obrigatório do briefing.

## Passo 0. Briefing

Campos obrigatórios:
- **empresa:** o nome;
- **praça:** cidades no formato `Cidade UF`, todas da mesma UF;
- **tipo de negócio:** a categoria que o Google Maps usa, por exemplo
  `clínica odontológica`, e não `implante dentário`.

Campos opcionais: o que vende, site, Instagram, preço, concorrentes citados e
observações. Se faltar algum obrigatório, faça uma única pergunta com todos os
que faltam. Os opcionais que o usuário não souber você descobre na pesquisa.

## Passo 1. Coleta (script)

```bash
printf '%s\n' "<empresa>" "<Cidade UF, Cidade UF>" "<tipo1, tipo2>" | node estudo.js
```

Leva de 5 a 15 minutos. Rode em segundo plano e acompanhe a saída.

- Se a coleta voltar vazia, leia a lista "Categorias que o Maps devolveu e
  ficaram de fora" e rode de novo com a categoria certa.
- Depois, grave os campos opcionais em `estudos/<cliente>/briefing.md`.

Resultado: `estudos/<cliente>/dados/concorrentes.json`, `concorrentes.md` e o
`estudo.html` com mapa, tabelas e barras.

## Passo 2. Escolha quem pesquisar

Leia `dados/concorrentes.md`. Escolha de 4 a 6 empresas:
- o próprio cliente;
- os concorrentes citados no briefing;
- os maiores em avaliações;
- os que mais anunciam.

Grave a lista em `estudos/<cliente>/pesquisa/alvos.json`.

## Passo 3. Pesquisa (subagentes em paralelo)

Dispare tudo **na mesma mensagem**:

- Um subagente `pesquisador` por empresa da lista. Cada um grava
  `pesquisa/<slug>.json`.
- Um subagente `contexto` para o setor e a praça. Ele grava
  `pesquisa/contexto.json`.

Passe a cada subagente o caminho absoluto da pasta do estudo. Não traga para o
seu contexto a saída bruta deles: leia só os JSON gravados.

## Passo 4. Análise (você)

Com `dados/` e `pesquisa/` em mãos, responda às oito perguntas do método.
Escreva `estudos/<cliente>/analise.md` com:

1. a tese em uma frase;
2. de 3 a 4 achados, cada um com número, fonte e consequência;
3. o cruzamento que ninguém fez (pergunta 7);
4. a ordem de entrada e o que não fazer;
5. de 3 a 4 ideias de mensagem para anúncio, cada uma ligada a um achado;
6. o que depende do cliente.

Esta é a parte que vale dinheiro. Se nenhum achado reposicionar o problema,
volte ao passo 3 com uma pergunta mais específica para o subagente `contexto`.

## Passo 5. Escrita

Preencha `estudos/<cliente>/estudo.html` a partir do `analise.md`:

- Substitua cada `{{…}}` restante por texto real.
- Apague a seção inteira quando não houver dado para ela. Nunca deixe lacuna.
- As tabelas e os gráficos que o `montar.js` já preencheu ficam. Escreva a
  leitura deles antes de cada um.
- Em Fontes, coloque todos os links usados em `pesquisa/*.json`.

## Passo 6. Revisão (obrigatória)

```bash
node revisar.js <cliente>
```

1. Se o portão reprovar, corrija e rode de novo.
2. Abra **cada** captura em `estudos/<cliente>/revisao/` com a ferramenta de
   leitura de imagem. Confira corte, sobreposição, gráfico vazio e texto que não
   faz sentido para o dono do negócio.
3. Dispare o subagente `revisor` com o caminho da pasta. Ele confere cada número
   do documento contra `dados/` e `pesquisa/`.
4. Corrija tudo que ele apontar e rode `revisar.js` de novo.

## Passo 7. Entrega

Responda ao usuário em no máximo 10 linhas, com:
- a tese;
- os achados;
- o caminho do HTML e do PDF;
- o que ficou pendente com o cliente.
