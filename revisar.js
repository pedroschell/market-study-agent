#!/usr/bin/env node
/**
 * Portão de qualidade do estudo. Reprova o documento que não pode ir para o
 * cliente e gera o material para a revisão visual:
 *   - capturas da página inteira, em trechos, em estudos/<cliente>/revisao/
 *   - o PDF final em estudos/<cliente>/estudo.pdf
 *
 *   node revisar.js <cliente>
 *   node revisar.js <cliente> --sem-capturas    só o portão de texto
 */
const fs = require('fs');
const path = require('path');

const RAIZ = __dirname;
const ESTUDOS = path.join(RAIZ, 'estudos');

const MINIMO_PALAVRAS_TOTAL = 1200;
const MINIMO_PALAVRAS_SECAO = 40;
const MINIMO_LINKS_FONTES = 5;
const ALTURA_DO_TRECHO = 1600;
const LARGURA_DA_TELA = 1240;

/** Texto visível de um trecho de HTML, sem tabela, gráfico nem mapa. */
function prosa(html) {
    let texto = html;
    texto = texto.replace(/<!--[\s\S]*?-->/g, ' ');
    texto = texto.replace(/<style[\s\S]*?<\/style>/g, ' ');
    texto = texto.replace(/<script[\s\S]*?<\/script>/g, ' ');
    texto = texto.replace(/<svg[\s\S]*?<\/svg>/g, ' ');
    texto = texto.replace(/<table[\s\S]*?<\/table>/g, ' ');
    texto = texto.replace(/<ul class="(bars|tline)"[\s\S]*?<\/ul>/g, ' ');
    texto = texto.replace(/<div class="(stats|vs)"[\s\S]*?<\/div>\s*<\/div>/g, ' ');
    texto = texto.replace(/<[^>]+>/g, ' ');
    texto = texto.replace(/&nbsp;/g, ' ');
    texto = texto.replace(/\s+/g, ' ');

    return texto.trim();
}

/** Quantidade de palavras de um texto. */
function contarPalavras(texto) {
    if (texto === '') {
        return 0;
    }

    return texto.split(' ').length;
}

/** O título h2 de uma seção, para a mensagem de erro. */
function tituloDaSecao(html) {
    const achado = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);

    if (achado === null) {
        return '(seção sem título)';
    }

    return achado[1].replace(/<[^>]+>/g, '').trim();
}

/** Confere o texto do documento. Devolve a lista de problemas. */
function conferirTexto(pasta) {
    const problemas = [];
    const avisos = [];
    const html = fs.readFileSync(path.join(pasta, 'estudo.html'), 'utf8');

    const lacunas = html.match(/\{\{[^}]*\}\}/g);
    if (lacunas !== null) {
        const exemplos = lacunas.slice(0, 5).join('  ');
        problemas.push(`${lacunas.length} lacuna(s) {{…}} no documento. Ex.: ${exemplos}`);
    }

    if (html.includes('@@COLE')) {
        problemas.push('marcador @@COLE…@@ ainda no documento (mapa não colado)');
    }

    const secoes = html.match(/<section[\s\S]*?<\/section>/g);
    if (secoes === null) {
        problemas.push('nenhuma <section> encontrada');
        return { problemas: problemas, avisos: avisos, palavras: 0 };
    }

    let total = 0;
    for (const secao of secoes) {
        const ehFontes = secao.startsWith('<section class="src"');
        const palavras = contarPalavras(prosa(secao));

        if (!ehFontes) {
            total = total + palavras;
        }

        if (!ehFontes && palavras < MINIMO_PALAVRAS_SECAO) {
            problemas.push(`seção "${tituloDaSecao(secao)}" tem ${palavras} palavras de texto — falta a leitura do dado`);
        }

        if (ehFontes) {
            const links = secao.match(/href="https?:\/\/[^"]+"/g);
            let quantos = 0;
            if (links !== null) {
                quantos = links.length;
            }
            if (quantos < MINIMO_LINKS_FONTES) {
                problemas.push(`Fontes tem ${quantos} link(s); o mínimo é ${MINIMO_LINKS_FONTES}`);
            }
        }
    }

    if (total < MINIMO_PALAVRAS_TOTAL) {
        problemas.push(`o documento tem ${total} palavras de texto corrido; o mínimo é ${MINIMO_PALAVRAS_TOTAL}`);
    }

    if (!fs.existsSync(path.join(pasta, 'analise.md'))) {
        problemas.push('analise.md não existe — a escrita precisa sair de uma análise registrada');
    }

    const pastaPesquisa = path.join(pasta, 'pesquisa');
    let jsons = 0;
    if (fs.existsSync(pastaPesquisa)) {
        for (const arquivo of fs.readdirSync(pastaPesquisa)) {
            if (arquivo.endsWith('.json')) {
                jsons = jsons + 1;
            }
        }
    }
    if (jsons === 0) {
        problemas.push('pesquisa/ está vazia — rode os subagentes do passo 3');
    }

    const jargao = prosa(html).match(/\b(CPL|CPA|CTR|CPM|ROAS|remarketing|retargeting|funil|lookalike)\b/gi);
    if (jargao !== null) {
        const unicos = [];
        for (const termo of jargao) {
            if (!unicos.includes(termo)) {
                unicos.push(termo);
            }
        }
        avisos.push(`termos técnicos no texto: ${unicos.join(', ')} — explique ou troque`);
    }

    return { problemas: problemas, avisos: avisos, palavras: total };
}

/** Gera as capturas em trechos e o PDF. Devolve a lista de capturas. */
async function capturar(pasta) {
    const { abrir } = require('./coleta/lib/navegador');
    const { browser, ctx } = await abrir();

    const destino = path.join(pasta, 'revisao');
    fs.rmSync(destino, { recursive: true, force: true });
    fs.mkdirSync(destino, { recursive: true });

    const page = await ctx.newPage();
    await page.setViewportSize({ width: LARGURA_DA_TELA, height: ALTURA_DO_TRECHO });

    const endereco = 'file://' + path.join(pasta, 'estudo.html');
    await page.goto(endereco, { waitUntil: 'networkidle' });

    const altura = await page.evaluate(function () {
        return document.documentElement.scrollHeight;
    });

    const capturas = [];
    let inicio = 0;
    let numero = 1;

    while (inicio < altura) {
        let alturaDoTrecho = ALTURA_DO_TRECHO;
        if (inicio + alturaDoTrecho > altura) {
            alturaDoTrecho = altura - inicio;
        }

        let nome = String(numero);
        if (numero < 10) {
            nome = '0' + nome;
        }

        const arquivo = path.join(destino, `pagina-${nome}.png`);
        await page.screenshot({
            path: arquivo,
            fullPage: true,
            clip: { x: 0, y: inicio, width: LARGURA_DA_TELA, height: alturaDoTrecho },
        });

        capturas.push(arquivo);
        inicio = inicio + ALTURA_DO_TRECHO;
        numero = numero + 1;
    }

    await page.emulateMedia({ media: 'print' });
    const pdf = path.join(pasta, 'estudo.pdf');
    await page.pdf({ path: pdf, format: 'A4', printBackground: true, preferCSSPageSize: true });

    await browser.close();

    const bytes = fs.readFileSync(pdf, 'latin1');
    const paginas = bytes.match(/\/Type\s*\/Page[^s]/g);
    let quantasPaginas = 0;
    if (paginas !== null) {
        quantasPaginas = paginas.length;
    }

    return { capturas: capturas, pdf: pdf, paginas: quantasPaginas };
}

async function main() {
    const nome = process.argv[2];

    if (!nome || nome.startsWith('--')) {
        console.error('Uso: node revisar.js <cliente>');
        process.exit(1);
    }

    const pasta = path.join(ESTUDOS, nome);
    if (!fs.existsSync(path.join(pasta, 'estudo.html'))) {
        console.error(`Não existe estudos/${nome}/estudo.html`);
        process.exit(1);
    }

    const resultado = conferirTexto(pasta);

    console.log(`Texto corrido: ${resultado.palavras} palavras`);

    for (const aviso of resultado.avisos) {
        console.log(`  aviso: ${aviso}`);
    }

    if (resultado.problemas.length > 0) {
        console.error(`\nREPROVADO — ${resultado.problemas.length} problema(s):`);
        for (const problema of resultado.problemas) {
            console.error(`  ✗ ${problema}`);
        }
    } else {
        console.log('Portão de texto: aprovado.');
    }

    if (!process.argv.includes('--sem-capturas')) {
        const saida = await capturar(pasta);
        console.log(`\n${saida.capturas.length} captura(s) para ler, uma a uma:`);
        for (const captura of saida.capturas) {
            console.log(`  ${path.relative(RAIZ, captura)}`);
        }
        console.log(`\nPDF: ${path.relative(RAIZ, saida.pdf)} (${saida.paginas} páginas)`);
    }

    if (resultado.problemas.length > 0) {
        process.exit(1);
    }
}

main().catch(function (erro) {
    console.error('✗ revisar.js parou:', erro.message);
    process.exit(1);
});
