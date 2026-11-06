#!/usr/bin/env node
/**
 * Preenche o estudo com os dados que vêm de API.
 * Lê a praça do briefing, busca população no IBGE, gera o mapa e escreve
 * tudo dentro do estudo.html. O que exige julgamento continua em branco.
 *
 *   node montar.js                      usa a única pasta em estudos/ (com várias, peça qual)
 *   node montar.js nome-da-pasta        escolhe a pasta
 *   node montar.js --abrir              abre o documento no navegador ao terminar
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const RAIZ = __dirname;
const ESTUDOS = path.join(RAIZ, 'estudos');
const GERAR_MAPA = path.join(RAIZ, 'mapa', 'gerar-mapa.py');

const IBGE = 'https://servicodados.ibge.gov.br';
const VARIAVEL_POPULACAO = '9324';
const TABELA_POPULACAO = '6579';

/** Minúsculas sem acento. */
function semAcento(texto) {
    const minusculo = (texto || '').toLowerCase();
    const decomposto = minusculo.normalize('NFD');

    return decomposto.replace(/[̀-ͯ]/g, '');
}

/** Baixa uma URL e devolve o JSON. */
function baixarJson(url) {
    return new Promise(function (resolve, reject) {
        const opcoes = { timeout: 30000, headers: { Accept: 'application/json' } };

        const requisicao = https.get(url, opcoes, function (res) {
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`IBGE respondeu ${res.statusCode} em ${url}`));
                return;
            }

            let corpo = '';
            res.setEncoding('utf8');

            res.on('data', function (pedaco) {
                corpo = corpo + pedaco;
            });

            res.on('end', function () {
                try {
                    resolve(JSON.parse(corpo));
                } catch (erro) {
                    reject(new Error('IBGE devolveu resposta inválida'));
                }
            });
        });

        requisicao.on('error', reject);
        requisicao.on('timeout', function () {
            requisicao.destroy();
            reject(new Error('IBGE não respondeu a tempo'));
        });
    });
}

/** Escolhe a pasta do estudo. */
function escolherPasta() {
    let pedida = null;

    for (const arg of process.argv.slice(2)) {
        if (!arg.startsWith('--')) {
            pedida = arg;
            break;
        }
    }

    if (pedida) {
        const caminho = path.join(ESTUDOS, pedida);
        if (!fs.existsSync(caminho)) {
            console.error(`A pasta estudos/${pedida} não existe.`);
            process.exit(1);
        }
        return caminho;
    }

    if (!fs.existsSync(ESTUDOS)) {
        console.error('Nenhum estudo criado ainda. Rode: node estudo.js');
        process.exit(1);
    }

    const pastas = [];
    for (const item of fs.readdirSync(ESTUDOS, { withFileTypes: true })) {
        if (item.isDirectory()) {
            pastas.push(item.name);
        }
    }

    if (pastas.length === 0) {
        console.error('Nenhum estudo criado ainda. Rode: node estudo.js');
        process.exit(1);
    }
    if (pastas.length > 1) {
        console.error('Existe mais de um estudo. Diga qual:');
        for (const nome of pastas) {
            console.error(`  node montar.js ${nome}`);
        }
        process.exit(1);
    }

    return path.join(ESTUDOS, pastas[0]);
}

/**
 * Lê um campo do briefing. Aceita o rótulo com explicação entre parênteses,
 * como em "Praça (onde VENDE, não onde fica): ...".
 */
function campoDoBriefing(texto, campo) {
    const linhas = texto.split('\n');
    const rotulo = new RegExp('^' + campo + '(\\s*\\([^)]*\\))?:\\s*');

    for (const linha of linhas) {
        const achado = linha.match(rotulo);
        if (achado !== null) {
            return linha.slice(achado[0].length).trim();
        }
    }

    return '';
}

/** Separa "Cidade UF, Outra Cidade UF" em cidade e sigla. */
function lerPraca(texto) {
    const cidades = [];

    for (const bruta of texto.split(',')) {
        const item = bruta.trim();
        if (!item) {
            continue;
        }

        const comUf = item.match(/^(.*)\s+([A-Za-z]{2})$/);
        if (!comUf) {
            console.error(`Cidade sem UF no briefing: "${item}". Escreva "Cidade UF".`);
            process.exit(1);
        }

        cidades.push({ nome: comUf[1].trim(), uf: comUf[2].toUpperCase() });
    }

    return cidades;
}

/** Descobre o código IBGE de cada cidade da praça. */
async function resolverMunicipios(cidades) {
    const ufs = new Set();
    for (const cidade of cidades) {
        ufs.add(cidade.uf);
    }

    if (ufs.size > 1) {
        console.error('A praça tem cidades de mais de uma UF. O mapa cobre uma UF por vez.');
        process.exit(1);
    }

    const sigla = [...ufs][0];

    const estados = await baixarJson(`${IBGE}/api/v1/localidades/estados`);

    let idDaUf = null;
    for (const estado of estados) {
        if (estado.sigla === sigla) {
            idDaUf = estado.id;
            break;
        }
    }

    if (idDaUf === null) {
        console.error(`UF desconhecida: ${sigla}`);
        process.exit(1);
    }

    const municipios = await baixarJson(
        `${IBGE}/api/v1/localidades/estados/${idDaUf}/municipios`
    );

    const resolvidos = [];

    for (const cidade of cidades) {
        const procurado = semAcento(cidade.nome);

        let encontrado = null;
        for (const municipio of municipios) {
            if (semAcento(municipio.nome) === procurado) {
                encontrado = municipio;
                break;
            }
        }

        if (!encontrado) {
            console.error(`Município não encontrado em ${sigla}: "${cidade.nome}"`);
            process.exit(1);
        }

        resolvidos.push({
            codigo: String(encontrado.id),
            nome: encontrado.nome,
            uf: sigla,
        });
    }

    return { uf: sigla, idDaUf: idDaUf, municipios: resolvidos };
}

/** Último período disponível da tabela de população. */
async function ultimoPeriodo() {
    const periodos = await baixarJson(`${IBGE}/api/v3/agregados/${TABELA_POPULACAO}/periodos`);
    const ultimo = periodos[periodos.length - 1];

    return ultimo.id;
}

/** Busca a população de cada município da praça. */
async function buscarPopulacao(municipios, periodo) {
    const codigos = [];
    for (const municipio of municipios) {
        codigos.push(municipio.codigo);
    }

    const lista = encodeURIComponent(`N6[${codigos.join(',')}]`);
    const url =
        `${IBGE}/api/v3/agregados/${TABELA_POPULACAO}/periodos/${periodo}` +
        `/variaveis/${VARIAVEL_POPULACAO}?localidades=${lista}`;

    const resposta = await baixarJson(url);

    const porCodigo = {};

    for (const variavel of resposta) {
        for (const resultado of variavel.resultados) {
            for (const serie of resultado.series) {
                const codigo = serie.localidade.id;
                const valor = parseInt(serie.serie[periodo], 10);

                if (!isNaN(valor)) {
                    porCodigo[codigo] = valor;
                }
            }
        }
    }

    return porCodigo;
}

/** Número com separador de milhar. */
function comPonto(numero) {
    return numero.toLocaleString('pt-BR');
}

/** Gera o mapa e devolve o HTML pronto para colar. */
function gerarMapa(pasta, idDaUf, populacao) {
    const arquivoDeDados = path.join(pasta, 'mapa-dados.json');
    const arquivoDoMapa = path.join(pasta, 'mapa.html');

    fs.writeFileSync(arquivoDeDados, JSON.stringify(populacao) + '\n');

    execFileSync('python3', [
        GERAR_MAPA,
        '--uf', String(idDaUf),
        '--dados', arquivoDeDados,
        '--saida', arquivoDoMapa,
        '--rotulos', 'auto',
    ], { stdio: 'pipe' });

    return fs.readFileSync(arquivoDoMapa, 'utf8');
}

/** Monta os quatro números da faixa de estatísticas. */
function montarEstatisticas(municipios, populacao) {
    let total = 0;
    let maior = null;

    for (const municipio of municipios) {
        const gente = populacao[municipio.codigo];
        if (gente === undefined) {
            continue;
        }

        total = total + gente;

        if (maior === null || gente > populacao[maior.codigo]) {
            maior = municipio;
        }
    }

    const cartoes = [];

    cartoes.push({ numero: comPonto(total), rotulo: 'habitantes na praça' });
    cartoes.push({ numero: String(municipios.length), rotulo: 'municípios analisados' });

    if (maior) {
        cartoes.push({
            numero: comPonto(populacao[maior.codigo]),
            rotulo: `em ${maior.nome}, o maior`,
        });

        const fatia = Math.round((populacao[maior.codigo] / total) * 100);
        cartoes.push({ numero: `${fatia}%`, rotulo: 'da praça no maior município' });
    }

    return cartoes;
}

/** Escreve os quatro cartões dentro do bloco .stats. */
function preencherEstatisticas(html, cartoes) {
    const bloco = html.match(/<div class="stats">[\s\S]*?<\/div>\s*<\/div>/);
    if (!bloco) {
        return html;
    }

    let novo = '<div class="stats">';

    for (let i = 0; i < cartoes.length; i++) {
        const cartao = cartoes[i];

        let classe = 'stat';
        if (i === 0) {
            classe = 'stat hi';
        }

        novo = novo +
            `\n    <div class="${classe}"><span class="n">${cartao.numero}</span>` +
            `<span class="l">${cartao.rotulo}</span></div>`;
    }

    novo = novo + '\n  </div>';

    return html.replace(bloco[0], novo);
}

/** Lê a coleta do estudo, se ela já foi rodada. */
function lerConcorrentes(pasta) {
    const arquivo = path.join(pasta, 'dados', 'concorrentes.json');

    if (!fs.existsSync(arquivo)) {
        return [];
    }

    const base = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    const medidas = [];

    for (const empresa of Object.values(base)) {
        if (empresa.medido_em) {
            medidas.push(empresa);
        }
    }

    return medidas;
}

/** Só quem tem anúncio no ar, do maior para o menor. */
function anunciantes(empresas) {
    const ativos = [];

    for (const empresa of empresas) {
        // Casamento de baixa certeza fica de fora: é nome parecido, não a empresa.
        // A lista para conferir à mão está em dados/concorrentes.md.
        if (empresa.anuncios_ativos > 0 && empresa.match === 'alta') {
            ativos.push(empresa);
        }
    }

    ativos.sort(function (a, b) {
        return b.anuncios_ativos - a.anuncios_ativos;
    });

    return ativos;
}

/** Data ISO para DD/MM/AAAA. */
function dataBr(iso) {
    if (!iso) {
        return '—';
    }

    const partes = iso.split('-');

    return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

/** "1 mês" ou "N meses". */
function escreverMeses(meses) {
    if (meses === 1) {
        return '1 mês';
    }

    return `${meses} meses`;
}

/** Meses entre a data e hoje. */
function mesesDesde(iso) {
    if (!iso) {
        return 0;
    }

    const MILISSEGUNDOS_POR_DIA = 86400000;
    const dias = (Date.now() - new Date(iso).getTime()) / MILISSEGUNDOS_POR_DIA;

    return Math.floor(dias / 30);
}

/**
 * O que o site da empresa tem instalado para medir visita e anúncio.
 * Ter a tag do Google não quer dizer que a empresa anuncia no Google.
 */
function rastreamento(empresa) {
    const encontrados = [];

    if (empresa.tem_pixel) {
        encontrados.push('pixel da Meta');
    }
    if (empresa.tem_gtm) {
        encontrados.push('Tag Manager');
    }
    if (empresa.tem_ga) {
        encontrados.push('Analytics');
    }

    if (encontrados.length === 0) {
        return '—';
    }

    return encontrados.join(', ');
}

/** Escapa texto para HTML. */
function esc(valor) {
    const mapa = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

    return String(valor === null || valor === undefined ? '' : valor)
        .replace(/[&<>"]/g, function (c) {
            return mapa[c];
        });
}

/** Palavras com mais de 3 letras, sem acento. */
function palavrasDoNome(nome) {
    const palavras = [];
    for (const palavra of semAcento(nome).split(/[^a-z0-9]+/)) {
        if (palavra.length > 3) {
            palavras.push(palavra);
        }
    }

    return palavras;
}

/** Verdadeiro quando todas as palavras do nome do cliente estão no nome da empresa. */
function ehOCliente(nomeDaEmpresa, nomeDoCliente) {
    const doCliente = palavrasDoNome(nomeDoCliente);
    if (doCliente.length === 0) {
        return false;
    }

    const daEmpresa = palavrasDoNome(nomeDaEmpresa);
    for (const palavra of doCliente) {
        if (!daEmpresa.includes(palavra)) {
            return false;
        }
    }

    return true;
}

/** Tabela de anunciantes ativos. A linha do cliente ganha class="mark". */
function preencherAnunciantes(html, ativos, nomeDoCliente) {
    const tabela = html.match(
        /(<caption>Anunciantes ativos[\s\S]*?<tbody>)([\s\S]*?)(<\/tbody>)/
    );
    if (!tabela || ativos.length === 0) {
        return html;
    }

    let total = 0;
    for (const empresa of ativos) {
        total = total + empresa.anuncios_ativos;
    }

    let linhas = '';

    for (const empresa of ativos.slice(0, 8)) {
        let abertura = '<tr>';
        if (ehOCliente(empresa.nome, nomeDoCliente)) {
            abertura = '<tr class="mark">';
        }

        linhas = linhas +
            `\n        ${abertura}<td>${esc(empresa.nome)}</td>` +
            `<td>${empresa.anuncios_ativos}</td>` +
            `<td>${dataBr(empresa.desde)}</td>` +
            `<td>${rastreamento(empresa)}</td></tr>`;
    }

    linhas = linhas +
        `\n        <tr class="tot"><td>Total do mercado (${ativos.length} anunciantes)</td>` +
        `<td>${total}</td><td>—</td><td>—</td></tr>\n      `;

    return html.replace(tabela[0], tabela[1] + linhas + tabela[3]);
}

/** Barras de anúncios por termo buscado. */
function preencherBarras(html, ativos) {
    const bloco = html.match(/(<ul class="bars">)([\s\S]*?)(<\/ul>)/);
    if (!bloco || ativos.length === 0) {
        return html;
    }

    const porTermo = {};
    for (const empresa of ativos) {
        const termo = empresa.termo_busca || 'sem termo';
        if (!porTermo[termo]) {
            porTermo[termo] = 0;
        }
        porTermo[termo] = porTermo[termo] + empresa.anuncios_ativos;
    }

    const termos = Object.keys(porTermo);
    termos.sort(function (a, b) {
        return porTermo[b] - porTermo[a];
    });

    const maior = porTermo[termos[0]];
    let linhas = '';

    for (const termo of termos) {
        const largura = Math.round((porTermo[termo] / maior) * 100);

        linhas = linhas +
            `\n      <li><span class="bl">${esc(termo)}</span>` +
            `\n          <span class="bt"><i style="--w:${largura}%"></i></span>` +
            `<span class="bv">${porTermo[termo]}</span></li>`;
    }

    return html.replace(bloco[0], bloco[1] + linhas + '\n    ' + bloco[3]);
}

/** Linha do tempo de veiculação. */
function preencherLinhaDoTempo(html, ativos) {
    const bloco = html.match(/(<ul class="tline">)([\s\S]*?)(<\/ul>)/);
    if (!bloco) {
        return html;
    }

    const comData = [];
    for (const empresa of ativos) {
        if (empresa.desde) {
            comData.push(empresa);
        }
    }
    if (comData.length === 0) {
        return html;
    }

    comData.sort(function (a, b) {
        return a.desde.localeCompare(b.desde);
    });

    const maisAntigo = mesesDesde(comData[0].desde);
    let linhas = '';

    for (const empresa of comData.slice(0, 6)) {
        const meses = mesesDesde(empresa.desde);

        let largura = Math.round((meses / maisAntigo) * 100);
        if (largura < 4) {
            largura = 4;
        }
        const inicio = 100 - largura;

        linhas = linhas +
            `\n      <li><span class="tll">${esc(empresa.nome)}</span>` +
            `\n          <span class="tlt"><i style="--x:${inicio}%;--w:${largura}%"></i></span>` +
            `<span class="tlv">${escreverMeses(meses)}</span></li>`;
    }

    return html.replace(bloco[0], bloco[1] + linhas + '\n    ' + bloco[3]);
}

/** Cartões dos dois maiores anunciantes. */
function preencherCartoes(html, ativos) {
    let saida = html;

    for (let i = 0; i < 2; i++) {
        const empresa = ativos[i];
        if (!empresa) {
            break;
        }

        let perfil = empresa.site;
        if (empresa.instagram) {
            perfil = '@' + empresa.instagram;
        }
        if (!perfil) {
            perfil = '—';
        }

        let nota = '—';
        if (empresa.avaliacoes) {
            const notaBr = String(empresa.nota).replace('.', ',');
            nota = `${notaBr} — ${empresa.avaliacoes} avaliações`;
        }

        saida = saida.replace('{{Concorrente}}', esc(empresa.nome));
        saida = saida.replace(/\{\{@perfil[^}]*\}\}/, esc(perfil));
        saida = saida.replace(/\{\{n ativos\}\}|\{\{rótulo\}\}/, `${empresa.anuncios_ativos} ativos`);
        saida = saida.replace('{{DD/MM/AAAA}}', dataBr(empresa.desde));
        saida = saida.replace('{{x,x — n avaliações}}', esc(nota));
    }

    return saida;
}

async function main() {
    const pasta = escolherPasta();
    const nomeDoEstudo = path.basename(pasta);

    const caminhoDoBriefing = path.join(pasta, 'briefing.md');
    if (!fs.existsSync(caminhoDoBriefing)) {
        console.error(`Falta o briefing em estudos/${nomeDoEstudo}/briefing.md`);
        process.exit(1);
    }

    const briefing = fs.readFileSync(caminhoDoBriefing, 'utf8');
    const textoDaPraca = campoDoBriefing(briefing, 'Praça');

    if (!textoDaPraca) {
        console.error('O briefing não tem a linha "Praça:".');
        process.exit(1);
    }

    const cidades = lerPraca(textoDaPraca);
    console.log(`praça: ${cidades.length} cidade(s)`);

    const resolvido = await resolverMunicipios(cidades);
    console.log(`UF ${resolvido.uf} · códigos IBGE resolvidos`);

    const periodo = await ultimoPeriodo();
    const populacao = await buscarPopulacao(resolvido.municipios, periodo);
    console.log(`população de ${periodo} obtida`);

    const mapa = gerarMapa(pasta, resolvido.idDaUf, populacao);
    console.log('mapa gerado');

    const caminhoDoEstudo = path.join(pasta, 'estudo.html');
    let html = fs.readFileSync(caminhoDoEstudo, 'utf8');

    html = html.replace('<!-- @@COLE_O_MAPA_AQUI@@ -->', mapa);

    const cartoes = montarEstatisticas(resolvido.municipios, populacao);
    html = preencherEstatisticas(html, cartoes);

    const nomesDasCidades = [];
    for (const municipio of resolvido.municipios) {
        nomesDasCidades.push(municipio.nome);
    }

    // A legenda do mapa é reescrita inteira: os nomes do IBGE vêm com acento
    // e sem a sigla da UF, que o briefing carrega.
    const legenda =
        `<figcaption>População por município · ${nomesDasCidades.join(', ')}` +
        ` · IBGE ${periodo}</figcaption>`;
    html = html.replace(/<figcaption>[^<]*por município[^<]*<\/figcaption>/, legenda);

    html = html.split('{{CIDADE/REGIÃO}}').join(`${nomesDasCidades.join(', ')} · ${resolvido.uf}`);
    html = html.replace(/{{Indicador}}/g, 'População');
    html = html.replace(/{{ano}}/g, periodo);

    const empresas = lerConcorrentes(pasta);
    const ativos = anunciantes(empresas);

    // O cabeçalho tem o mesmo {{DD/MM/AAAA}} dos cartões. Preenche primeiro,
    // senão a data da coleta consome o lugar do primeiro concorrente.
    const hoje = new Date();
    const dia = String(hoje.getDate()).padStart(2, '0');
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    html = html.replace('{{DD/MM/AAAA}}', `${dia}/${mes}/${hoje.getFullYear()}`);

    const fonteDosAnuncios = `Biblioteca de Anúncios da Meta, ${dia}/${mes}/${hoje.getFullYear()}`;
    html = html.replace('{{fonte e data}}', fonteDosAnuncios);
    html = html.replace('Anúncios ativos por termo buscado · {{fonte}}', 'Anúncios ativos por termo buscado · ' + fonteDosAnuncios);
    html = html.replace('Há quanto tempo cada concorrente veicula · {{periodo}}', 'Há quanto tempo cada concorrente veicula · meses desde o anúncio ativo mais antigo');

    if (ativos.length > 0) {
        html = preencherCartoes(html, ativos);
        html = preencherAnunciantes(html, ativos, campoDoBriefing(briefing, 'Empresa'));
        html = preencherBarras(html, ativos);
        html = preencherLinhaDoTempo(html, ativos);
    }

    fs.writeFileSync(caminhoDoEstudo, html);

    console.log(`\nestudos/${nomeDoEstudo}/estudo.html atualizado`);
    for (const cartao of cartoes) {
        console.log(`  ${cartao.numero.padStart(10)}  ${cartao.rotulo}`);
    }
    if (ativos.length > 0) {
        console.log(`\n  ${ativos.length} anunciantes ativos nas tabelas`);
    } else {
        console.log(`\n  sem coleta ainda`);
    }

    const restantes = (html.match(/{{/g) || []).length;
    console.log(`\nFonte: IBGE, estimativa de ${periodo}.`);
    console.log(`Faltam ${restantes} lacunas — são as de redação e julgamento.`);

    console.log(`\n${caminhoDoEstudo}`);

    if (process.argv.includes('--abrir')) {
        try {
            execFileSync('open', [caminhoDoEstudo]);
        } catch (erro) {
            console.error('Não consegui abrir. Abra o caminho acima no navegador.');
        }
    } else {
        console.log(`\nPara abrir:  node estudo.js --montar ${nomeDoEstudo} --abrir`);
    }
}

main();
