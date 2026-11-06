# Template

Modelo único de relatório. **Os arquivos aqui são seus para editar.**

## Arquivos

| Arquivo | O que é | Quem edita |
|---|---|---|
| `estudo.html` | Esqueleto com a ordem fixa das seções | Você (estrutura) · eu (conteúdo) |
| `tema.css` | Paleta, tipografia e regras de impressão | **Você** |
| `briefing.md` | Modelo de briefing por cliente | Você preenche por cliente |
| `assets/logo.png` | Logo do cabeçalho, 600px — troque pela sua | **Você** |

Direção **Painel**, aprovada em 23/08/2026: neutro frio, borda de 1px em cada bloco,
raio pequeno, numeral monoespaçado. IBM Plex Sans no texto, IBM Plex Mono nos números,
teal como único acento.

## Fluxo por estudo

```
/estudo <briefing>    no Claude Code: coleta, pesquisa, análise, escrita e revisão
```

O passo a passo está em `.claude/commands/estudo.md`. Sem o Claude Code,
`node estudo.js` faz só a coleta e o esqueleto.

O template é **copiado** para a pasta do cliente, nunca editado de lá. Assim
ajuste de paleta para um cliente específico não contamina os outros. Copie a pasta
`assets/` junto — sem ela a logo do cabeçalho vem quebrada.

## A marca no documento

A logo entra uma vez, no alto à direita, alinhada com o eyebrow (`.brandline` no
`estudo.html`). Fica em 30px na tela e 8mm no papel — pequena de propósito: nesse
tamanho o contorno e o gradiente da logo somem e ela não briga com o título.

Da segunda página em diante a assinatura é só texto, no rodapé: `.rodape`, que existe
apenas na impressão e se repete em todas as páginas via `position:fixed`. Ele mora
dentro da margem inferior do `@page`, que por isso subiu de 15mm para 19mm. **Não
existe número de página** — o Chrome roda com `--no-pdf-header-footer` e CSS puro não
consegue contar páginas nele.

## Sobre o briefing

**Praça é o campo que mais muda o trabalho.** O endereço diz onde a empresa *está*;
a praça diz onde ela *vende*. Só a cidade? A região? O estado? Isso define quais
concorrentes importam e qual município puxar no IBGE.

**Concorrentes que o cliente cita** não é a lista final — a coleta acha os reais.
Serve para cruzar: se ele nomeia alguém que não aparece em busca nenhuma, isso é
achado.

**Não preencha** Google Meu Negócio, TikTok, YouTube, WhatsApp, página na Biblioteca
de Anúncios, CNPJ ou termos de busca. Tudo isso se deriva do nome + endereço + site.

Confirme os **termos de busca** antes de coletar. Um minuto de conferência evita
coleta no mercado errado.

## Regras que mantêm o modelo

**A ordem das seções é fixa.** Segue o `CATALOGO.md`. Mudar aqui exige mudar o
catálogo junto — é o que garante que todo cliente receba o mesmo produto.

**Seção sem dado se apaga.** Nunca entregar documento com `{{placeholder}}`.

**Nenhum gráfico usa biblioteca.** Barra, linha do tempo e comparativo são HTML e
CSS; o mapa é SVG. Chart.js e Recharts precisam executar antes da impressão, o timing
é frágil, e você só descobre que quebrou olhando o PDF pronto.

**A linha do cliente na tabela usa `class="mark"`.** É o que torna o relatório
comparativo em vez de um mapa de mercado onde ele não aparece.

## Os gráficos

Quatro componentes, todos no `tema.css`:

| Componente | Serve para |
|---|---|
| `.mapa-box` | Mapa por município — gerado, ver abaixo |
| `.bars` | Barras horizontais: share of voice, seguidores, avaliações |
| `ul.tline` | Linha do tempo: há quanto tempo cada concorrente veicula |
| `.vs` | Comparativo lado a lado: cliente contra o maior concorrente |

Nas barras e na linha do tempo o tamanho vem de variável CSS inline:
`--w` é a largura, `--x` é onde começa. Ambos em porcentagem.

A linha do CLIENTE leva `class="own"`. É o que o torna comparativo.

## O mapa

```bash
cd ../mapa
python3 gerar-mapa.py --uf NN --dados dados.json --saida m.html --rotulos auto
```

O padrão usa a malha do **estado inteiro** e enquadra no espaço que cobre as
cidades — um zoom. Os municípios vizinhos entram em cinza, então a região nunca
vira ilha solta.

| Opção | Para quê |
|---|---|
| `--margem 0.2` | Mais folga em volta da praça (padrão 0.12) |
| `--sem-contexto` | Só os municípios com dado, sem os vizinhos |
| `--enquadramento estado` | UF inteira. **Só vale se a praça cobrir boa parte dela** — com poucas cidades elas viram manchas ilegíveis |
| `--localizador` | Silhueta da UF ao lado, marcando onde a praça fica |

`dados.json` é `código IBGE do município → valor`. Serve para qualquer indicador:
população, renda, frota, clientes por cidade. O script recorta o enquadramento na
praça, divide em cinco faixas e escreve a legenda com os intervalos reais.

Cole a saída dentro da `<figure>` marcada com `@@COLE_O_MAPA_AQUI@@` no
`estudo.html`. A cor vem de `--n0` a `--n4` no tema.

Um viés a conhecer: município grande parece importante mesmo com pouca gente.

## Se você mexer no tema

Editar `:root` (a paleta) e a tipografia é seguro — o documento inteiro acompanha.

O bloco `IMPRESSÃO / PDF` no fim do `tema.css` é o que impede conteúdo cortado,
tabela com scroll no papel e bloco partido ao meio. **Depois de mexer nele, gere
o PDF e olhe página a página.**

## Fontes

IBM Plex Sans (texto) e IBM Plex Mono (números) vêm do Google Fonts, carregadas no
`<head>` do `estudo.html`. Trocar de fonte é trocar o `<link>` e as referências
`font-family` no `tema.css`.
