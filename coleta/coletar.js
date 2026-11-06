#!/usr/bin/env node
/**
 * ETAPA 1 — descoberta.
 * Lê praca.json, varre o Google Maps por cidade x termo e grava dados/concorrentes.json.
 * Não abre a página de cada empresa (isso é a etapa 2), então é rápido.
 *
 *   node coletar.js                        todos os segmentos
 *   node coletar.js clinicas               um segmento
 *   node coletar.js clinicas --limite 1    só a primeira cidade (teste)
 */
const fs = require('fs');
const path = require('path');
const { abrir, PAUSA, passarConsentimento } = require('./lib/navegador');
const { PRACA, DADOS } = require('./lib/caminhos');

const ARQ = path.join(DADOS, 'concorrentes.json');
const MAX_ROLAGENS = 25;

/** Chave estável do empresa na base: nome e cidade, sem acento e em minúsculas. */
function chave(nome, cidade) {
    const junto = `${nome}|${cidade}`.toLowerCase();
    const decomposto = junto.normalize('NFD');

    return decomposto.replace(/[̀-ͯ]/g, '');
}

/** Lê a base do disco. Devolve objeto vazio quando ainda não existe. */
function carregar() {
    if (!fs.existsSync(ARQ)) {
        return {};
    }

    const conteudo = fs.readFileSync(ARQ, 'utf8');

    return JSON.parse(conteudo);
}

/** Grava a base, criando a pasta se preciso. */
function salvar(base) {
    const pasta = path.dirname(ARQ);
    fs.mkdirSync(pasta, { recursive: true });

    const texto = JSON.stringify(base, null, 2) + '\n';
    fs.writeFileSync(ARQ, texto);
}

/**
 * Roda dentro da página do Maps.
 * Os nomes de classe são ofuscados e mudam, então ancora no link do lugar e lê
 * aria-label mais o texto do cartão. Precisa ser autocontida: é serializada e
 * injetada no navegador, não enxerga nada deste arquivo.
 */
function extrairCartoes() {
    const feed = document.querySelector('div[role="feed"]');
    if (!feed) {
        return [];
    }

    const encontrados = [];

    for (const link of feed.querySelectorAll('a[href*="/maps/place/"]')) {
        const nome = (link.getAttribute('aria-label') || '').trim();
        if (!nome) {
            continue;
        }

        // Sobe até o cartão, parando antes de englobar o cartão vizinho:
        // passar do limite faz a nota de uma empresa ir para a outra.
        let cartao = link;
        while (cartao.parentElement && cartao.parentElement !== feed) {
            const linksNoPai = cartao.parentElement.querySelectorAll('a[href*="/maps/place/"]').length;
            if (linksNoPai > 1) {
                break;
            }
            cartao = cartao.parentElement;
        }

        // Rótulo no formato "5,0 estrelas 43 comentários".
        let rotuloDeNota = '';
        for (const elemento of cartao.querySelectorAll('[aria-label]')) {
            const texto = elemento.getAttribute('aria-label') || '';
            if (/estrelas?\s+[\d.]+\s+coment/i.test(texto)) {
                rotuloDeNota = texto;
                break;
            }
        }

        const numeros = rotuloDeNota.match(/([\d,]+)\s+estrelas?\s+([\d.]+)\s+coment/i);

        let nota = null;
        let avaliacoes = 0;
        if (numeros) {
            nota = parseFloat(numeros[1].replace(',', '.'));
            avaliacoes = parseInt(numeros[2].replace(/\./g, ''), 10);
        }

        const linhas = [];
        for (const bruta of (cartao.innerText || '').split('\n')) {
            const linha = bruta.trim();
            if (linha) {
                linhas.push(linha);
            }
        }

        // Linha no formato "Categoria · ... · Rua X, 123".
        let linhaDeCategoria = '';
        for (const linha of linhas) {
            const temSeparador = linha.includes(' · ');
            const comecaComNumero = /^\d/.test(linha);
            const ehHorario = /Aberto|Fecha|Abre|Encerrado/i.test(linha);

            if (temSeparador && !comecaComNumero && !ehHorario) {
                linhaDeCategoria = linha;
                break;
            }
        }

        const partes = [];
        for (const bruta of linhaDeCategoria.split('·')) {
            const parte = bruta.trim();
            if (parte) {
                partes.push(parte);
            }
        }

        let categoria = null;
        if (partes.length > 0) {
            categoria = partes[0];
        }

        // Cartão de hospedagem não tem a linha com " · ": a categoria vem sozinha,
        // logo abaixo da nota, no formato "4,7(156)" seguido de "Hotel 3 estrelas".
        if (!categoria) {
            for (let i = 0; i < linhas.length - 1; i++) {
                const ehLinhaDeNota = /^\d,\d\s*\([\d.]+\)$/.test(linhas[i]);
                if (!ehLinhaDeNota) {
                    continue;
                }

                const seguinte = linhas[i + 1];
                const ehPrecoOuNumero = /^(R\$|\d)/.test(seguinte);
                if (!ehPrecoOuNumero) {
                    categoria = seguinte;
                }
                break;
            }
        }

        let endereco = null;
        if (partes.length > 1) {
            endereco = partes[partes.length - 1];
        }

        let telefone = null;
        for (const linha of linhas) {
            if (/\(\d{2}\)\s?\d/.test(linha)) {
                const achado = linha.match(/\(\d{2}\)\s?[\d\s-]{8,11}/);
                if (achado) {
                    telefone = achado[0].trim();
                }
                break;
            }
        }

        const linkDoSite = cartao.querySelector('a[aria-label^="Acessar o site"]');
        let site = null;
        if (linkDoSite) {
            site = linkDoSite.href;
        }

        encontrados.push({
            nome: nome,
            url_maps: link.href,
            nota: nota,
            avaliacoes: avaliacoes,
            categoria: categoria,
            endereco: endereco,
            telefone: telefone,
            site: site,
        });
    }

    return encontrados;
}

/** Conta quantos resultados o feed já carregou. */
async function contarResultados(page) {
    return page.evaluate(function () {
        return document.querySelectorAll('div[role="feed"] a[href*="/maps/place/"]').length;
    });
}

/** Rola o feed até a lista parar de crescer. */
async function rolarFeed(page) {
    const feed = page.locator('div[role="feed"]');
    let anterior = -1;

    for (let tentativa = 0; tentativa < MAX_ROLAGENS; tentativa++) {
        const quantos = await contarResultados(page);

        if (quantos === anterior) {
            break;
        }
        anterior = quantos;

        try {
            await feed.evaluate(function (elemento) {
                elemento.scrollBy(0, elemento.scrollHeight);
            });
        } catch (erro) {
            // feed saiu da tela entre a contagem e a rolagem
        }

        await PAUSA(1200, 2200);
    }
}

const RAIO_MAXIMO_KM = 40;

/** Latitude e longitude gravadas no link do Maps (!3d...!4d...), ou null. */
function coordenadasDoLink(link) {
    const achado = (link || '').match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);

    if (achado === null) {
        return null;
    }

    return { lat: Number(achado[1]), lng: Number(achado[2]) };
}

/** Distância em km entre dois pontos (fórmula de haversine). */
function distanciaKm(a, b) {
    const raioDaTerra = 6371;
    const paraRadiano = Math.PI / 180;
    const dLat = (b.lat - a.lat) * paraRadiano;
    const dLng = (b.lng - a.lng) * paraRadiano;
    const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(a.lat * paraRadiano) * Math.cos(b.lat * paraRadiano) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);

    return 2 * raioDaTerra * Math.asin(Math.sqrt(h));
}

/** Mediana de uma lista de números. */
function mediana(numeros) {
    const ordenados = numeros.slice();
    ordenados.sort(function (a, b) {
        return a - b;
    });

    return ordenados[Math.floor(ordenados.length / 2)];
}

/**
 * O centro da busca. Primeiro o ponto que o Maps pôs na URL ao enquadrar a
 * cidade; sem ele, a mediana das coordenadas dos resultados.
 */
function centroDaBusca(urlDaPagina, achados) {
    const daUrl = (urlDaPagina || '').match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (daUrl !== null) {
        return { lat: Number(daUrl[1]), lng: Number(daUrl[2]) };
    }

    const latitudes = [];
    const longitudes = [];
    for (const achado of achados) {
        const ponto = coordenadasDoLink(achado.url_maps);
        if (ponto !== null) {
            latitudes.push(ponto.lat);
            longitudes.push(ponto.lng);
        }
    }

    if (latitudes.length === 0) {
        return null;
    }

    return { lat: mediana(latitudes), lng: mediana(longitudes) };
}

/** Busca um termo numa cidade e devolve os cartões encontrados. */
async function buscar(page, termo, cidade) {
    const consulta = encodeURIComponent(`${termo} ${cidade}`);
    const url = `https://www.google.com/maps/search/${consulta}?hl=pt-BR`;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await passarConsentimento(page);

    try {
        await page.waitForSelector('div[role="feed"]', { timeout: 25000 });
    } catch (erro) {
        // busca sem resultado não renderiza o feed
    }

    await rolarFeed(page);

    const achados = await page.evaluate(extrairCartoes);
    const centro = centroDaBusca(page.url(), achados);

    return { achados: achados, centro: centro };
}

/** Lê os argumentos de linha de comando. */
function lerArgumentos() {
    const args = process.argv.slice(2);

    let segmento = null;
    for (const arg of args) {
        if (!arg.startsWith('--')) {
            segmento = arg;
            break;
        }
    }

    let limite = null;
    const posicao = args.indexOf('--limite');
    if (posicao > -1) {
        limite = parseInt(args[posicao + 1], 10);
    }

    return { segmento: segmento, limite: limite };
}

async function main() {
    const opcoes = lerArgumentos();

    const caminhoDaConfig = PRACA;
    const cfg = JSON.parse(fs.readFileSync(caminhoDaConfig, 'utf8'));

    if (opcoes.segmento && !cfg.segmentos[opcoes.segmento]) {
        console.error(`segmento "${opcoes.segmento}" nao existe no praca.json`);
        process.exit(1);
    }

    let cidades = cfg.cidades;
    if (opcoes.limite) {
        cidades = cidades.slice(0, opcoes.limite);
    }

    let segmentos = cfg.segmentos;
    if (opcoes.segmento) {
        segmentos = {};
        segmentos[opcoes.segmento] = cfg.segmentos[opcoes.segmento];
    }

    const base = carregar();
    const { browser, ctx } = await abrir();
    const page = await ctx.newPage();

    let novos = 0;
    let vistos = 0;
    const categoriasCortadas = {};

    for (const nomeDoSegmento of Object.keys(segmentos)) {
        const cfgDoSegmento = segmentos[nomeDoSegmento];
        const filtroDeCategoria = new RegExp(cfgDoSegmento.categorias, 'i');

        for (const cidade of cidades) {
            for (const termo of cfgDoSegmento.termos) {
                let achados = [];
                let centro = null;
                try {
                    const resultado = await buscar(page, termo, cidade);
                    achados = resultado.achados;
                    centro = resultado.centro;
                } catch (erro) {
                    console.error(`  ! falhou "${termo}" em ${cidade}: ${erro.message}`);
                }

                let cortados = 0;
                let longe = 0;

                for (const achado of achados) {
                    vistos = vistos + 1;

                    // Quando a cidade tem poucos resultados, o Maps completa a
                    // lista com lugares de outras regiões e até de outro estado.
                    const ponto = coordenadasDoLink(achado.url_maps);
                    if (centro !== null && ponto !== null) {
                        const distancia = distanciaKm(centro, ponto);
                        if (distancia > RAIO_MAXIMO_KM) {
                            longe = longe + 1;
                            continue;
                        }
                    }

                    // O Maps amplia a busca quando esgota o relevante: numa busca
                    // de clínica voltam barbearia e supermercado.
                    let pertenceAoSegmento = false;
                    if (achado.categoria) {
                        pertenceAoSegmento = filtroDeCategoria.test(achado.categoria);
                    }

                    if (!pertenceAoSegmento) {
                        cortados = cortados + 1;

                        let categoria = achado.categoria;
                        if (!categoria) {
                            categoria = '(sem categoria)';
                        }
                        if (!categoriasCortadas[categoria]) {
                            categoriasCortadas[categoria] = 0;
                        }
                        categoriasCortadas[categoria] = categoriasCortadas[categoria] + 1;
                        continue;
                    }

                    const k = chave(achado.nome, cidade);

                    if (base[k]) {
                        base[k].nota = achado.nota;
                        base[k].avaliacoes = achado.avaliacoes;
                        base[k].url_maps = achado.url_maps;
                        continue;
                    }

                    const registro = Object.assign({}, achado);
                    registro.cidade = cidade;
                    registro.segmento = nomeDoSegmento;
                    registro.termo_busca = termo;
                    registro.visto_em = new Date().toISOString().slice(0, 10);

                    base[k] = registro;
                    novos = novos + 1;
                }

                const aproveitados = achados.length - cortados - longe;
                console.log(
                    `${nomeDoSegmento} · ${cidade} · "${termo}" → ${aproveitados}` +
                    ` (${cortados} fora do segmento, ${longe} a mais de ${RAIO_MAXIMO_KM} km)`
                );

                salvar(base);
                await PAUSA(2500, 5000);
            }
        }
    }

    await browser.close();

    const total = Object.keys(base).length;
    console.log(`\nresultados lidos: ${vistos} · novos: ${novos} · base: ${total}`);
    console.log(`→ ${ARQ}`);

    const nomesCortados = Object.keys(categoriasCortadas);
    nomesCortados.sort(function (a, b) {
        return categoriasCortadas[b] - categoriasCortadas[a];
    });

    if (nomesCortados.length > 0) {
        console.log('\nCategorias que o Maps devolveu e ficaram de fora:');
        for (const nome of nomesCortados.slice(0, 10)) {
            console.log(`  ${String(categoriasCortadas[nome]).padStart(3)}  ${nome}`);
        }
        console.log('Se o concorrente do cliente está aí, use essa categoria como tipo de negócio.');
    }
}

main();
