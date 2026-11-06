#!/usr/bin/env node
/**
 * Acha o @ do Instagram de cada empresa. Quatro fontes, nesta ordem:
 *   1. o campo "site" do Maps, quando já é um link do Instagram
 *   2. o código do site da empresa, que quase sempre linka o perfil
 *   3. o site renderizado, para quem só monta os ícones com JavaScript
 *   4. o texto dos anúncios ativos
 * Sem login e sem abrir o Instagram: só leitura de HTML público.
 *
 *   node instagram.js                 os que ainda não têm @
 *   node instagram.js --tudo
 *   node instagram.js --so-anunciantes
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const { abrir, PAUSA } = require('./lib/navegador');
const { consulta } = require('./lib/casar');
const { PRACA, DADOS } = require('./lib/caminhos');

const ARQ = path.join(DADOS, 'concorrentes.json');

const TAMANHO_MAXIMO_DO_HTML = 500000;
const REDIRECIONAMENTOS = [301, 302, 307, 308];
const TRECHO = 6;

// Caminhos do próprio Instagram que não são perfil de empresa.
const NAO_PERFIL = /^(p|reel|reels|explore|accounts|stories|tv|direct|about|legal|developer|privacy)$/i;
// Perfis de plataforma que aparecem em botão de compartilhar.
const NAO_EMPRESA = /^(whatsapp|facebook|meta|instagram|google|youtube|tiktok|twitter|x|linkedin|wa|share)$/i;
// Encurtador e agregador: renderizar a página deles devolve o @ deles.
const INTERMEDIARIO = /^(bitly|bit|linktree|linktr|beacons|campsite|linkme|lnk|tinyurl|hotmart)$/i;

/** Verdadeiro se a flag foi passada. */
function tem(flag) {
    return process.argv.includes(flag);
}

/** Minúsculas, sem acento e só letras e números. */
function enxuto(texto) {
    let saida = texto || '';
    saida = saida.toLowerCase().normalize('NFD');
    saida = saida.replace(/[̀-ͯ]/g, '');

    return saida.replace(/[^a-z0-9]/g, '');
}

/** Remove a sigla da UF do fim do nome da cidade. */
function semUf(cidade) {
    return (cidade || '').replace(/\s+[A-Za-z]{2}$/, '');
}

/** Verdadeiro se o handle não é perfil de empresa. */
function handleDescartavel(handle) {
    if (NAO_PERFIL.test(handle)) {
        return true;
    }
    if (NAO_EMPRESA.test(handle)) {
        return true;
    }

    return INTERMEDIARIO.test(handle);
}

/**
 * Baixa uma URL seguindo redirecionamentos.
 * Devolve o HTML e a URL final — o encurtador às vezes termina no Instagram.
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
                    terminar({ html: corpo, url: url });
                });
            });
        } catch (erro) {
            terminar({ html: '', url: url });
            return;
        }

        requisicao.on('error', function () {
            terminar({ html: '', url: url });
        });

        requisicao.on('timeout', function () {
            requisicao.destroy();
            terminar({ html: '', url: url });
        });
    });
}

/** Extrai o handle de uma URL do Instagram. Devolve null quando não serve. */
function doUrl(url) {
    const achado = (url || '').match(/instagram\.com\/([A-Za-z0-9._]{2,30})/);

    if (!achado) {
        return null;
    }

    const handle = achado[1];
    if (handleDescartavel(handle)) {
        return null;
    }

    return handle.toLowerCase();
}

/** Verdadeiro se handle e nome compartilham um trecho de 6 caracteres. */
function compartilhaTrecho(handle, nome) {
    if (handle.length < 5 || nome.length < 5) {
        return false;
    }

    for (let i = 0; i + TRECHO <= handle.length; i++) {
        if (nome.includes(handle.slice(i, i + TRECHO))) {
            return true;
        }
    }
    for (let i = 0; i + TRECHO <= nome.length; i++) {
        if (handle.includes(nome.slice(i, i + TRECHO))) {
            return true;
        }
    }

    return false;
}

/**
 * Escolhe entre os @ encontrados num site.
 * Vários aparecem no mesmo lugar: o da agência que fez, o do dono, o da empresa.
 */
function melhorPerfil(html, nome, cidade, cidades) {
    const ocorrencias = {};

    for (const achado of html.matchAll(/instagram\.com\/([A-Za-z0-9._]{2,30})/g)) {
        const handle = achado[1].toLowerCase();

        if (handleDescartavel(handle)) {
            continue;
        }

        if (!ocorrencias[handle]) {
            ocorrencias[handle] = 0;
        }
        ocorrencias[handle] = ocorrencias[handle] + 1;
    }

    const handles = Object.keys(ocorrencias);
    if (handles.length === 0) {
        return null;
    }

    const minhaCidade = enxuto(semUf(cidade));

    const outrasCidades = [];
    for (const outra of cidades) {
        const limpa = enxuto(semUf(outra));
        if (limpa !== minhaCidade) {
            outrasCidades.push(limpa);
        }
    }

    // Site de rede lista todas as unidades: o @ mais repetido pode ser de outra
    // cidade. Descarta quem cita cidade diferente.
    const validos = [];
    for (const handle of handles) {
        let citaOutra = false;
        for (const outra of outrasCidades) {
            if (enxuto(handle).includes(outra)) {
                citaOutra = true;
                break;
            }
        }
        if (!citaOutra) {
            validos.push(handle);
        }
    }

    if (validos.length === 0) {
        return null;
    }

    const alvo = enxuto(nome);

    function citaACidade(handle) {
        if (minhaCidade && enxuto(handle).includes(minhaCidade)) {
            return 1;
        }

        return 0;
    }

    function pareceComONome(handle) {
        const limpo = enxuto(handle);
        const inicioDoHandle = limpo.slice(0, TRECHO);
        const inicioDoNome = alvo.slice(0, TRECHO);

        if (alvo.includes(inicioDoHandle) || limpo.includes(inicioDoNome)) {
            return 1;
        }

        return 0;
    }

    validos.sort(function (a, b) {
        const porCidade = citaACidade(b) - citaACidade(a);
        if (porCidade !== 0) {
            return porCidade;
        }

        const porRepeticao = ocorrencias[b] - ocorrencias[a];
        if (porRepeticao !== 0) {
            return porRepeticao;
        }

        return pareceComONome(b) - pareceComONome(a);
    });

    return validos[0];
}

/**
 * Verdadeiro se o handle parece ser da empresa.
 * Tira o nome da cidade dos dois lados: sem isso, um @ que termina com o
 * município casa com qualquer empresa que cite a mesma cidade.
 */
function pareceEmpresa(handle, nome, cidade) {
    const nomeDaCidade = enxuto(semUf(cidade));

    function tirarCidade(texto) {
        const limpo = enxuto(texto);
        if (!nomeDaCidade) {
            return limpo;
        }

        return limpo.split(nomeDaCidade).join('');
    }

    return compartilhaTrecho(tirarCidade(handle), tirarCidade(nome));
}

/** Quarta fonte: procura o @ no texto dos anúncios ativos. */
async function noAnuncio(page, nome, cidade) {
    const url =
        'https://www.facebook.com/ads/library/?active_status=active&ad_type=all' +
        '&country=BR&search_type=keyword_unordered&media_type=all&q=' +
        encodeURIComponent(consulta(nome));

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await PAUSA(4500, 6000);

    try {
        await page.evaluate(function () {
            window.scrollBy(0, 2500);
        });
    } catch (erro) {
        // página ainda montando
    }
    await PAUSA(2500, 3500);

    let achados = [];
    try {
        achados = await page.evaluate(function () {
            const encontrados = document.body.innerText.match(/@[A-Za-z0-9._]{3,30}/g) || [];
            const unicos = new Set();

            for (const bruto of encontrados) {
                unicos.add(bruto.slice(1).toLowerCase());
            }

            return [...unicos];
        });
    } catch (erro) {
        achados = [];
    }

    // No anúncio também aparece @ de parceiro e de paciente.
    for (const handle of achados) {
        if (NAO_PERFIL.test(handle) || NAO_EMPRESA.test(handle)) {
            continue;
        }
        if (pareceEmpresa(handle, nome, cidade)) {
            return handle;
        }
    }

    return null;
}

/**
 * Terceira fonte: site em Wix ou Elementor só monta os ícones de rede depois
 * que o JavaScript roda, então o HTML cru vem sem o link.
 */
async function noSiteRenderizado(page, site, nome, cidade, cidades) {
    await page.goto(site, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await PAUSA(2500, 4000);

    let html = '';
    try {
        html = await page.content();
    } catch (erro) {
        html = '';
    }

    if (!html) {
        return null;
    }

    return melhorPerfil(html, nome, cidade, cidades);
}

/** Monta a fila de empresas a procurar. */
function montarFila(base) {
    let fila = Object.values(base);

    if (tem('--so-anunciantes')) {
        const filtrada = [];
        for (const empresa of fila) {
            if (empresa.anuncios_ativos > 0 && empresa.match === 'alta') {
                filtrada.push(empresa);
            }
        }
        fila = filtrada;
    }

    if (!tem('--tudo')) {
        const filtrada = [];
        for (const empresa of fila) {
            if (empresa.instagram === undefined) {
                filtrada.push(empresa);
            }
        }
        fila = filtrada;
    }

    return fila;
}

async function main() {
    const base = JSON.parse(fs.readFileSync(ARQ, 'utf8'));

    const caminhoDaConfig = PRACA;
    const cfg = JSON.parse(fs.readFileSync(caminhoDaConfig, 'utf8'));
    const cidades = cfg.cidades;

    const fila = montarFila(base);

    let achou = 0;
    let sem = 0;
    let navegador = null;
    let pagina = null;

    for (const empresa of fila) {
        let handle = doUrl(empresa.site);
        let fonte = null;
        if (handle) {
            fonte = 'maps';
        }

        if (!handle && empresa.site) {
            const resposta = await baixar(empresa.site);

            handle = doUrl(resposta.url);
            if (handle) {
                fonte = 'site';
            }

            if (!handle && resposta.html) {
                handle = melhorPerfil(resposta.html, empresa.nome, empresa.cidade, cidades);
                if (handle) {
                    fonte = 'site';
                }
            }
        }

        if (!handle && empresa.site) {
            if (!navegador) {
                navegador = await abrir();
                pagina = await navegador.ctx.newPage();
            }

            try {
                handle = await noSiteRenderizado(pagina, empresa.site, empresa.nome, empresa.cidade, cidades);
            } catch (erro) {
                handle = null;
            }

            if (handle) {
                fonte = 'site-js';
            }
        }

        if (!handle && empresa.anuncios_ativos > 0) {
            if (!navegador) {
                navegador = await abrir();
                pagina = await navegador.ctx.newPage();
            }

            try {
                handle = await noAnuncio(pagina, empresa.nome, empresa.cidade);
            } catch (erro) {
                handle = null;
            }

            if (handle) {
                fonte = 'anuncio';
            }
        }

        if (handle) {
            empresa.instagram = handle;
        } else {
            empresa.instagram = null;
        }
        empresa.instagram_fonte = fonte;

        if (handle) {
            achou = achou + 1;
            const arroba = `@${handle}`.padEnd(32);
            console.log(`${arroba} ${fonte.padEnd(7)} ${empresa.nome.slice(0, 40)}`);
        } else {
            sem = sem + 1;
        }

        fs.writeFileSync(ARQ, JSON.stringify(base, null, 2) + '\n');
    }

    if (navegador) {
        await navegador.browser.close();
    }

    console.log(`\nachados: ${achou} · sem perfil: ${sem}`);
}

main();
