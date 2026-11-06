#!/usr/bin/env node
/**
 * ETAPA 2 — medição.
 * Para cada concorrente baixa o HTML do site (pixel, GTM, GA) e consulta a
 * Biblioteca de Anúncios da Meta: quantos anúncios no ar e desde quando.
 * Escreve dados/concorrentes.md. Não usa o Maps: a etapa 1 já trouxe o site.
 *
 *   node medir.js                         só os ainda não medidas
 *   node medir.js --tudo                  refaz todos
 *   node medir.js --segmento clinicas
 *   node medir.js --empresa "Clinica X"   um empresa só (aceita parte do nome)
 *   node medir.js --limite 5
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { abrir, PAUSA } = require('./lib/navegador');
const { semAcento, consulta, escolher } = require('./lib/casar');
const { PRACA, DADOS } = require('./lib/caminhos');

const ARQ = path.join(DADOS, 'concorrentes.json');
const RESUMO = path.join(DADOS, 'concorrentes.md');

const TAMANHO_MAXIMO_DO_HTML = 400000;
const LIMITE_PADRAO = 40;
const REDIRECIONAMENTOS = [301, 302, 307, 308];

/** Valor de um argumento nomeado da linha de comando. */
function arg(nome, padrao) {
    const posicao = process.argv.indexOf(nome);

    if (posicao > -1) {
        return process.argv[posicao + 1];
    }
    if (padrao === undefined) {
        return null;
    }

    return padrao;
}

/** Verdadeiro se a flag foi passada. */
function tem(nome) {
    return process.argv.includes(nome);
}

/** Remove a sigla da UF do fim do nome da cidade. */
function semUf(cidade) {
    return cidade.replace(/\s+[A-Za-z]{2}$/, '');
}

/**
 * Baixa o HTML de uma URL, seguindo redirecionamentos.
 * Devolve string vazia em qualquer falha — site fora do ar é informação, não erro.
 */
function baixar(url, redirects) {
    let restantes = redirects;
    if (restantes === undefined) {
        restantes = 3;
    }

    return new Promise(function (resolve) {
        let respondido = false;

        function terminar(valor) {
            if (!respondido) {
                respondido = true;
                resolve(valor);
            }
        }

        let modulo = https;
        if (url.startsWith('http://')) {
            modulo = http;
        }

        const opcoes = {
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
        };

        let requisicao = null;

        try {
            requisicao = modulo.get(url, opcoes, function (res) {
                const ehRedirecionamento = REDIRECIONAMENTOS.includes(res.statusCode);

                if (ehRedirecionamento && res.headers.location && restantes > 0) {
                    res.resume();
                    const proxima = new URL(res.headers.location, url).href;
                    terminar(baixar(proxima, restantes - 1));
                    return;
                }

                let corpo = '';
                res.setEncoding('utf8');

                res.on('data', function (pedaco) {
                    if (corpo.length < TAMANHO_MAXIMO_DO_HTML) {
                        corpo = corpo + pedaco;
                    }
                });

                res.on('end', function () {
                    terminar(corpo);
                });
            });
        } catch (erro) {
            terminar('');
            return;
        }

        requisicao.on('error', function () {
            terminar('');
        });

        requisicao.on('timeout', function () {
            requisicao.destroy();
            terminar('');
        });
    });
}

/** Procura pixel do Meta, GTM e Google Analytics no site do empresa. */
async function medirSite(url) {
    if (!url) {
        return {
            tem_site: false,
            tem_pixel: false,
            tem_gtm: false,
            tem_ga: false,
        };
    }

    const html = await baixar(url);

    if (!html) {
        return {
            tem_site: true,
            site_respondeu: false,
            tem_pixel: false,
            tem_gtm: false,
            tem_ga: false,
        };
    }

    const temPixel = /fbq\(|connect\.facebook\.net\/[^"']*fbevents/i.test(html);
    const temGtm = /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{5,}/i.test(html);
    const temGa = /gtag\(|google-analytics\.com|G-[A-Z0-9]{8,}/i.test(html);

    return {
        tem_site: true,
        site_respondeu: true,
        tem_pixel: temPixel,
        tem_gtm: temGtm,
        tem_ga: temGa,
    };
}

/**
 * Roda dentro da Biblioteca de Anúncios.
 * Agrupa por anunciante, deduplica pelo ID da biblioteca e guarda a data de
 * veiculação mais antiga. Precisa ser autocontida: é injetada no navegador.
 */
function extrairAnuncios() {
    const MESES = {
        jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
        jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
    };
    const PALAVRAS_DE_BOTAO =
        /^(Ver|Abrir|Saiba|Cadastre|Enviar|Comprar|Reservar|Biblioteca|API|Cookies|Entrar|Criar|Relat)/i;

    const idsVistos = {};
    const porAnunciante = {};

    for (const link of document.querySelectorAll('a[href*="facebook.com/"]')) {
        const nome = (link.innerText || '').trim();

        if (!nome || nome.length < 3 || nome.length > 60) {
            continue;
        }
        if (PALAVRAS_DE_BOTAO.test(nome)) {
            continue;
        }

        // Sobe até o cartão do anúncio, que é quem carrega o ID da biblioteca.
        let cartao = null;
        let atual = link;
        for (let nivel = 0; nivel < 12 && atual; nivel++) {
            if (atual.innerText && /Identificação da biblioteca/.test(atual.innerText)) {
                cartao = atual;
                break;
            }
            atual = atual.parentElement;
        }
        if (!cartao) {
            continue;
        }

        const comId = cartao.innerText.match(/Identificação da biblioteca:\s*(\d+)/);
        if (!comId) {
            continue;
        }

        const id = comId[1];
        if (idsVistos[id]) {
            continue;
        }
        idsVistos[id] = true;

        const comData = cartao.innerText.match(
            /Veiculação iniciada em (\d{1,2}) de ([a-zç]+)\.? de (\d{4})/i
        );

        let iso = null;
        if (comData) {
            const dia = String(comData[1]).padStart(2, '0');
            const abreviacao = comData[2].slice(0, 3);

            let numeroDoMes = MESES[abreviacao];
            if (!numeroDoMes) {
                numeroDoMes = 0;
            }
            const mes = String(numeroDoMes).padStart(2, '0');

            iso = `${comData[3]}-${mes}-${dia}`;
        }

        if (!porAnunciante[nome]) {
            porAnunciante[nome] = {
                anuncios: 0,
                desde: null,
                url: link.getAttribute('href'),
            };
        }

        porAnunciante[nome].anuncios = porAnunciante[nome].anuncios + 1;

        if (iso) {
            const aindaSemData = porAnunciante[nome].desde === null;
            let ehMaisAntigo = false;
            if (!aindaSemData) {
                ehMaisAntigo = iso < porAnunciante[nome].desde;
            }
            if (aindaSemData || ehMaisAntigo) {
                porAnunciante[nome].desde = iso;
            }
        }
    }

    const resultado = [];
    for (const nome of Object.keys(porAnunciante)) {
        const dados = porAnunciante[nome];
        resultado.push({
            nome: nome,
            anuncios: dados.anuncios,
            desde: dados.desde,
            url: dados.url,
        });
    }

    return resultado;
}

/** Consulta a Biblioteca de Anúncios e escolhe o anunciante do empresa. */
async function anuncios(page, nome, cidade, cidades) {
    const termo = consulta(nome);
    if (termo.length < 4) {
        return null;
    }

    const url =
        'https://www.facebook.com/ads/library/?active_status=active&ad_type=all' +
        '&country=BR&search_type=keyword_unordered&media_type=all&q=' +
        encodeURIComponent(termo);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await PAUSA(4500, 6000);

    try {
        await page.evaluate(function () {
            window.scrollBy(0, 3000);
        });
    } catch (erro) {
        // página ainda montando
    }
    await PAUSA(2500, 3500);

    let lista = [];
    try {
        lista = await page.evaluate(extrairAnuncios);
    } catch (erro) {
        lista = [];
    }

    return escolher(lista, nome, cidade, cidades);
}

/** Descreve o rastreamento encontrado no site do empresa. */
function descreverSite(empresa) {
    if (!empresa.tem_site) {
        return 'não tem';
    }

    const tags = [];
    if (empresa.tem_pixel) {
        tags.push('pixel');
    }
    if (empresa.tem_gtm) {
        tags.push('GTM');
    }
    if (empresa.tem_ga) {
        tags.push('GA');
    }

    if (tags.length === 0) {
        return 'sem tag';
    }

    return tags.join('+');
}

/** Descreve a nota e o número de avaliações do Google Meu Negócio. */
function descreverGmn(empresa) {
    if (!empresa.avaliacoes) {
        return '—';
    }

    let nota = empresa.nota;
    if (nota === null || nota === undefined) {
        nota = '—';
    }

    return `${nota} (${empresa.avaliacoes})`;
}

/** Ordena por quantidade de anúncios e, no empate, por avaliações. */
function compararEmpresas(a, b) {
    let anunciosDeA = a.anuncios_ativos;
    let anunciosDeB = b.anuncios_ativos;
    if (!anunciosDeA) {
        anunciosDeA = 0;
    }
    if (!anunciosDeB) {
        anunciosDeB = 0;
    }

    if (anunciosDeB !== anunciosDeA) {
        return anunciosDeB - anunciosDeA;
    }

    return b.avaliacoes - a.avaliacoes;
}

/** Escreve dados/concorrentes.md com os empresas medidas, agrupados por segmento. */
function escreverResumo(base) {
    const medidas = [];
    for (const empresa of Object.values(base)) {
        if (empresa.medido_em) {
            medidas.push(empresa);
        }
    }
    medidas.sort(compararEmpresas);

    const porSegmento = {};
    for (const empresa of medidas) {
        if (!porSegmento[empresa.segmento]) {
            porSegmento[empresa.segmento] = [];
        }
        porSegmento[empresa.segmento].push(empresa);
    }

    const hoje = new Date().toISOString().slice(0, 10);
    const naBase = Object.values(base).length;

    let md = `# Concorrentes medidos\n\n`;
    md = md + `Coleta: ${hoje} · ${medidas.length} empresas · ${naBase} na base\n`;

    for (const segmento of Object.keys(porSegmento)) {
        const lista = porSegmento[segmento];

        md = md + `\n## ${segmento} (${lista.length})\n\n`;
        md = md + '| # | Empresa | Cidade | Google | Anúncios | Desde | Rastreamento |\n';
        md = md + '|---|---|---|---|---|---|---|\n';

        for (let i = 0; i < lista.length; i++) {
            const empresa = lista[i];

            let marca = '';
            if (empresa.match === 'baixa') {
                marca = ' ⚠';
            }

            const nome = empresa.nome.replace(/\|/g, '·').slice(0, 52);
            const cidade = semUf(empresa.cidade);
            const gmn = descreverGmn(empresa);
            const site = descreverSite(empresa);

            let ativos = empresa.anuncios_ativos;
            if (!ativos) {
                ativos = 0;
            }

            let desde = empresa.desde;
            if (!desde) {
                desde = '—';
            }

            md = md +
                `| ${i + 1} | ${nome}${marca} | ${cidade} | ${gmn} | ` +
                `${ativos} | ${desde} | ${site} |\n`;
        }
    }

    md = md + `\n---\n⚠ = anunciante casado com baixa certeza, conferir antes de citar.\n`;
    md = md + `Detalhe completo (telefone, site, link do Maps): \`dados/concorrentes.json\`\n`;

    fs.writeFileSync(RESUMO, md);
}

/** Monta a fila de empresas a qualificar, aplicando os filtros da linha de comando. */
function montarFila(base) {
    const filtroDeSegmento = arg('--segmento');
    const filtroDeEmpresa = arg('--empresa');
    // Mede só os maiores: cada empresa custa ~10 s na Biblioteca de Anúncios.
    const limite = parseInt(arg('--limite', String(LIMITE_PADRAO)), 10);

    let fila = Object.entries(base);

    if (filtroDeSegmento) {
        const filtrada = [];
        for (const par of fila) {
            if (par[1].segmento === filtroDeSegmento) {
                filtrada.push(par);
            }
        }
        fila = filtrada;
    }

    if (filtroDeEmpresa) {
        const procurado = semAcento(filtroDeEmpresa);
        const filtrada = [];
        for (const par of fila) {
            if (semAcento(par[1].nome).includes(procurado)) {
                filtrada.push(par);
            }
        }
        fila = filtrada;
    }

    if (!tem('--tudo') && !filtroDeEmpresa) {
        const filtrada = [];
        for (const par of fila) {
            if (!par[1].medido_em) {
                filtrada.push(par);
            }
        }
        fila = filtrada;
    }

    // Os mais avaliados primeiro: são os concorrentes que o cliente de fato enfrenta.
    fila.sort(function (a, b) {
        let avaliacoesDeA = a[1].avaliacoes;
        let avaliacoesDeB = b[1].avaliacoes;
        if (!avaliacoesDeA) {
            avaliacoesDeA = 0;
        }
        if (!avaliacoesDeB) {
            avaliacoesDeB = 0;
        }
        return avaliacoesDeB - avaliacoesDeA;
    });

    if (limite) {
        fila = fila.slice(0, limite);
    }

    return fila;
}

async function main() {
    if (!fs.existsSync(ARQ)) {
        console.error('rode coletar.js antes');
        process.exit(1);
    }

    const base = JSON.parse(fs.readFileSync(ARQ, 'utf8'));

    const caminhoDaConfig = PRACA;
    const cfg = JSON.parse(fs.readFileSync(caminhoDaConfig, 'utf8'));
    const cidades = cfg.cidades;

    const fila = montarFila(base);

    if (fila.length === 0) {
        console.log('nada a medir');
        escreverResumo(base);
        return;
    }

    console.log(`medindo ${fila.length} de ${Object.keys(base).length}\n`);

    const { browser, ctx } = await abrir();
    const page = await ctx.newPage();

    for (const par of fila) {
        const empresa = par[1];

        try {
            const sinaisDoSite = await medirSite(empresa.site);
            Object.assign(empresa, sinaisDoSite);

            const anunciante = await anuncios(page, empresa.nome, empresa.cidade, cidades);

            if (anunciante) {
                empresa.anuncios_ativos = anunciante.anuncios;
                empresa.desde = anunciante.desde;
                empresa.pagina_meta = anunciante.url;
                empresa.anunciante_meta = anunciante.nome;
                empresa.match = anunciante.certeza;
            } else {
                empresa.anuncios_ativos = 0;
                empresa.desde = null;
                empresa.pagina_meta = null;
                empresa.anunciante_meta = null;
                empresa.match = null;
            }

            empresa.medido_em = new Date().toISOString().slice(0, 10);

            let ativos = empresa.anuncios_ativos;
            if (!ativos) {
                ativos = 0;
            }
            console.log(`${String(ativos).padStart(3)} anúncios · ${empresa.nome} (${empresa.cidade})`);
        } catch (erro) {
            empresa.erro = erro.message;
            console.error(`  ! ${empresa.nome}: ${erro.message}`);
        }

        fs.writeFileSync(ARQ, JSON.stringify(base, null, 2) + '\n');
        await PAUSA(3000, 6000);
    }

    await browser.close();
    escreverResumo(base);
    console.log(`\n→ ${RESUMO}`);
}

main();
