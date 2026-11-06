#!/usr/bin/env node
/**
 * Comando único do estudo. Roda sempre da raiz do projeto.
 * Cada cliente ganha a própria pasta em estudos/, com documento, briefing e coleta.
 *
 *   node estudo.js                      pergunta os dados do cliente, coleta e monta
 *   node estudo.js --abrir              idem, e abre o documento ao terminar
 *   node estudo.js --montar <cliente>   só remonta o estudo daquele cliente, sem coletar
 *   node estudo.js --limpar <cliente>   apaga o estudo daquele cliente
 *   node estudo.js --lista              mostra os estudos já feitos
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const https = require('https');
const { execFileSync } = require('child_process');

const RAIZ = __dirname;
const ESTUDOS = path.join(RAIZ, 'estudos');
const COLETA = path.join(RAIZ, 'coleta');
const TEMPLATE = path.join(RAIZ, 'template');

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
               'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Nome de pasta: minúsculas, sem acento, com hífen. */
function slug(texto) {
    let saida = texto.toLowerCase().normalize('NFD');
    saida = saida.replace(/[̀-ͯ]/g, '');
    saida = saida.replace(/[^a-z0-9]+/g, '-');

    return saida.replace(/^-+|-+$/g, '');
}

const IBGE = 'https://servicodados.ibge.gov.br/api/v1/localidades';

/** Baixa um JSON do IBGE. */
function baixarJson(url) {
    return new Promise(function (resolver, rejeitar) {
        const requisicao = https.get(url, { timeout: 30000 }, function (resposta) {
            let corpo = '';
            resposta.setEncoding('utf8');
            resposta.on('data', function (pedaco) {
                corpo = corpo + pedaco;
            });
            resposta.on('end', function () {
                try {
                    resolver(JSON.parse(corpo));
                } catch (erro) {
                    rejeitar(erro);
                }
            });
        });

        requisicao.on('error', rejeitar);
        requisicao.on('timeout', function () {
            requisicao.destroy();
            rejeitar(new Error('IBGE não respondeu a tempo'));
        });
    });
}

/** Texto sem acento e em minúsculas, para comparar nomes. */
function semAcento(texto) {
    let saida = texto.toLowerCase().normalize('NFD');
    saida = saida.replace(/[̀-ͯ]/g, '');

    return saida.trim();
}

/**
 * Confere se cada cidade é município do IBGE.
 * Devolve a lista de problemas; vazia quando está tudo certo.
 * Se o IBGE não responder, não bloqueia: a coleta não depende dele.
 */
async function conferirCidades(cidades) {
    const problemas = [];
    const porUf = {};

    for (const cidade of cidades) {
        const comUf = cidade.match(/^(.*)\s+([A-Za-z]{2})$/);

        if (!comUf) {
            problemas.push(`"${cidade}" está sem a sigla do estado. Escreva "Cidade UF".`);
            continue;
        }

        const uf = comUf[2].toUpperCase();
        if (!porUf[uf]) {
            porUf[uf] = [];
        }
        porUf[uf].push(comUf[1].trim());
    }

    const ufs = Object.keys(porUf);

    if (ufs.length > 1) {
        problemas.push(`As cidades estão em mais de um estado (${ufs.join(', ')}). O mapa cobre um estado por vez.`);
    }

    if (problemas.length > 0) {
        return problemas;
    }

    let municipios = [];
    try {
        municipios = await baixarJson(`${IBGE}/estados/${ufs[0]}/municipios`);
    } catch (erro) {
        console.log(`   (não consegui conferir no IBGE: ${erro.message})`);
        return problemas;
    }

    if (!Array.isArray(municipios) || municipios.length === 0) {
        problemas.push(`"${ufs[0]}" não é sigla de estado.`);
        return problemas;
    }

    for (const nome of porUf[ufs[0]]) {
        const procurado = semAcento(nome);

        let existe = false;
        const parecidos = [];

        for (const municipio of municipios) {
            const nomeDoMunicipio = semAcento(municipio.nome);

            if (nomeDoMunicipio === procurado) {
                existe = true;
                break;
            }
            if (procurado.length >= 4 && nomeDoMunicipio.includes(procurado) && parecidos.length < 3) {
                parecidos.push(`${municipio.nome} ${ufs[0]}`);
            }
        }

        if (existe) {
            continue;
        }

        let aviso = `"${nome}" não é município de ${ufs[0]}.`;
        if (parecidos.length > 0) {
            aviso = aviso + ` Quis dizer: ${parecidos.join(' ou ')}?`;
        } else {
            aviso = aviso + ' Se for bairro, informe o município a que ele pertence, no formato Cidade UF.';
        }
        problemas.push(aviso);
    }

    return problemas;
}

/** Separa uma lista digitada com vírgulas. */
function lista(texto) {
    const itens = [];

    for (const bruto of (texto || '').split(',')) {
        const item = bruto.trim();
        if (item) {
            itens.push(item);
        }
    }

    return itens;
}

/** Raízes de categoria a partir dos termos, com limite de palavra. */
function regexDeCategorias(termos) {
    const raizes = new Set();

    for (const termo of termos) {
        for (const palavra of termo.split(/\s+/)) {
            let limpa = palavra.toLowerCase().normalize('NFD');
            limpa = limpa.replace(/[̀-ͯ]/g, '');
            limpa = limpa.replace(/[^a-z]/g, '');

            if (limpa.length >= 5) {
                // \b no início: sem ele "mercad" casa dentro de "Supermercado".
                raizes.add('\\b' + limpa.slice(0, 6));
            }
        }
    }

    if (raizes.size === 0) {
        return '.';
    }

    return [...raizes].sort().join('|');
}

/** Os estudos já feitos, um por pasta. */
function estudosFeitos() {
    const nomes = [];

    if (!fs.existsSync(ESTUDOS)) {
        return nomes;
    }

    for (const item of fs.readdirSync(ESTUDOS, { withFileTypes: true })) {
        if (item.isDirectory()) {
            nomes.push(item.name);
        }
    }

    return nomes.sort();
}

/** O nome do cliente passado depois de uma opção, como em --montar nome. */
function clienteDaOpcao(opcao) {
    const posicao = process.argv.indexOf(opcao);
    const valor = process.argv[posicao + 1];

    if (!valor || valor.startsWith('--')) {
        return null;
    }

    return slug(valor);
}

/** Para com erro se o cliente não tiver estudo. */
function exigirEstudo(nome, opcao) {
    if (!nome) {
        console.error(`Diga qual cliente: node estudo.js ${opcao} <cliente>`);
        listar();
        process.exit(1);
    }

    if (!fs.existsSync(path.join(ESTUDOS, nome))) {
        console.error(`Não existe estudo de "${nome}".`);
        listar();
        process.exit(1);
    }
}

/** Mostra os estudos já feitos. */
function listar() {
    const nomes = estudosFeitos();

    if (nomes.length === 0) {
        console.log('Nenhum estudo feito ainda.');
        return;
    }

    console.log('\nEstudos em estudos/:');
    for (const nome of nomes) {
        console.log(`  ${nome}`);
    }
}

/** Copia uma pasta inteira. */
function copiarPasta(origem, destino) {
    fs.mkdirSync(destino, { recursive: true });

    for (const item of fs.readdirSync(origem, { withFileTypes: true })) {
        const de = path.join(origem, item.name);
        const para = path.join(destino, item.name);

        if (item.isDirectory()) {
            copiarPasta(de, para);
        } else {
            fs.copyFileSync(de, para);
        }
    }
}

/** Lê a entrada padrão inteira. */
function lerTudoDaEntrada() {
    return new Promise(function (resolver) {
        let texto = '';

        process.stdin.setEncoding('utf8');
        process.stdin.on('data', function (pedaco) {
            texto = texto + pedaco;
        });
        process.stdin.on('end', function () {
            resolver(texto);
        });
    });
}

/**
 * Em terminal, pergunta. Fora dele, lê as respostas de uma vez:
 *   node estudo.js < respostas.txt
 */
function abrirEntrada(fila) {
    if (process.stdin.isTTY) {
        const entrada = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        return {
            question: async function (texto) {
                const resposta = await entrada.question(texto);
                return resposta.trim();
            },
            close: function () {
                entrada.close();
            },
        };
    }

    return {
        question: async function (texto) {
            let resposta = fila.shift();
            if (resposta === undefined) {
                resposta = '';
            }
            resposta = resposta.trim();
            console.log(texto + resposta);
            return resposta;
        },
        close: function () {},
    };
}

/** Três perguntas. O resto do briefing se preenche no arquivo. */
async function perguntar() {
    let fila = [];
    if (!process.stdin.isTTY) {
        fila = (await lerTudoDaEntrada()).split('\n');
    }
    const entrada = abrirEntrada(fila);

    console.log('\nEstudo novo. Três perguntas.\n');

    let empresa = '';
    while (!empresa) {
        empresa = await entrada.question('1. Nome da empresa: ');
        if (!empresa && !process.stdin.isTTY) {
            console.error('Faltou o nome da empresa.');
            process.exit(1);
        }
    }

    console.log('\n   Cidades onde ela VENDE, com a sigla do estado. Município, não bairro.');
    console.log('   Exemplo: Cidade UF, Outra Cidade UF\n');

    let cidades = [];
    while (cidades.length === 0) {
        cidades = lista(await entrada.question('2. Cidades: '));

        if (cidades.length === 0) {
            if (!process.stdin.isTTY) {
                console.error('Faltaram as cidades.');
                process.exit(1);
            }
            continue;
        }

        const problemas = await conferirCidades(cidades);

        if (problemas.length > 0) {
            for (const problema of problemas) {
                console.log(`   ✗ ${problema}`);
            }
            if (!process.stdin.isTTY) {
                process.exit(1);
            }
            console.log('');
            cidades = [];
        }
    }

    console.log('\n   Que TIPO DE NEGÓCIO são os concorrentes? É como o Google Maps');
    console.log('   classifica a empresa (aparece embaixo do nome dela no Maps).');
    console.log('   Não é palavra-chave nem o serviço que ela vende.');
    console.log('   Funciona: agência de marketing, clínica odontológica, imobiliária');
    console.log('   Não funciona: inteligência artificial, tráfego pago, estudo de mercado\n');

    let termos = [];
    while (termos.length === 0) {
        termos = lista(await entrada.question('3. Tipo de negócio dos concorrentes: '));
        if (termos.length === 0 && !process.stdin.isTTY) {
            console.error('Faltaram os termos de busca.');
            process.exit(1);
        }
    }

    entrada.close();

    return { empresa: empresa, cidades: cidades, termos: termos };
}

/**
 * Cria a pasta do cliente, o briefing e a praça.
 * Se o cliente já tem estudo, mantém o documento e o briefing editados
 * e só atualiza a praça para a nova coleta.
 */
function criar(respostas) {
    const nome = slug(respostas.empresa);
    const pasta = path.join(ESTUDOS, nome);
    const jaExistia = fs.existsSync(path.join(pasta, 'estudo.html'));

    if (jaExistia) {
        console.log(`\nO cliente já tem estudo em estudos/${nome}/.`);
        console.log('Mantenho o documento e o briefing; refaço a coleta.');
        escreverPraca(pasta, respostas);
        return nome;
    }

    copiarPasta(TEMPLATE, pasta);
    fs.rmSync(path.join(pasta, 'LEIA-ME.md'), { force: true });

    const agora = new Date();
    const valores = {
        EMPRESA: respostas.empresa,
        CLIENTE: respostas.empresa,
        TITULO: respostas.empresa,
        MES: MESES[agora.getMonth()],
        ANO: String(agora.getFullYear()),
    };

    const arquivo = path.join(pasta, 'estudo.html');
    let html = fs.readFileSync(arquivo, 'utf8');
    for (const chave of Object.keys(valores)) {
        html = html.split(`{{${chave}}}`).join(valores[chave]);
    }
    fs.writeFileSync(arquivo, html);

    const briefing =
`# Briefing — ${respostas.empresa}

Preencha o que souber. O que ficar em branco não quebra nada.

\`\`\`
Empresa: ${respostas.empresa}
Praça: ${respostas.cidades.join(', ')}
Vende:
Site:
Instagram (@):
Preço:
Concorrentes que ela citou:
\`\`\`

**Observações da call**

---
`;
    fs.writeFileSync(path.join(pasta, 'briefing.md'), briefing);

    escreverPraca(pasta, respostas);

    return nome;
}

/** Grava a praça da coleta dentro da pasta do cliente. */
function escreverPraca(pasta, respostas) {
    const praca = {
        _leia: 'cidades = onde buscar. termos = o que buscar no Maps. ' +
               'categorias = filtro da categoria do resultado, gerado dos termos.',
        cidades: respostas.cidades,
        segmentos: {},
    };
    praca.segmentos[slug(respostas.termos[0]).slice(0, 20)] = {
        termos: respostas.termos,
        categorias: regexDeCategorias(respostas.termos),
    };
    fs.writeFileSync(path.join(pasta, 'praca.json'), JSON.stringify(praca, null, 2) + '\n');
}

/** Instala as dependências da coleta se faltarem. */
function garantirDependencias() {
    if (fs.existsSync(path.join(COLETA, 'node_modules'))) {
        return;
    }

    console.log('\nInstalando a dependência da coleta (playwright-core)...');
    execFileSync('npm', ['install', '--silent'], { cwd: COLETA, stdio: 'inherit' });
}

/** Avisa quando o Maps não devolveu nenhuma empresa do segmento. */
function avisarSeColetaVazia(pasta, termos) {
    const arquivo = path.join(pasta, 'dados', 'concorrentes.json');
    let quantidade = 0;

    if (fs.existsSync(arquivo)) {
        const base = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
        quantidade = Object.keys(base).length;
    }

    if (quantidade > 0) {
        return;
    }

    console.log('\n⚠ Nenhum concorrente encontrado para: ' + termos.join(', '));
    console.log('  Sem concorrente, as tabelas e cartões do documento ficam vazios.');
    console.log('  Veja acima as categorias que o Maps devolveu e rode de novo com uma delas.');
}

/** Roda um script e deixa a saída aparecer. A coleta lê e grava na pasta do cliente. */
function rodar(titulo, script, pasta, extras, pastaDoEstudo) {
    console.log(`\n${titulo}`);
    console.log('─'.repeat(titulo.length));

    let argumentos = [script];
    if (extras) {
        argumentos = argumentos.concat(extras);
    }

    const ambiente = Object.assign({}, process.env, { ESTUDO_PASTA: pastaDoEstudo });

    try {
        execFileSync('node', argumentos, { cwd: pasta, stdio: 'inherit', env: ambiente });
    } catch (erro) {
        console.error(`\n✗ A etapa "${titulo}" parou. O motivo está na mensagem acima.`);
        process.exit(1);
    }
}

async function main() {
    if (process.argv.includes('--lista')) {
        listar();
        return;
    }

    if (process.argv.includes('--limpar')) {
        const nome = clienteDaOpcao('--limpar');
        exigirEstudo(nome, '--limpar');
        fs.rmSync(path.join(ESTUDOS, nome), { recursive: true, force: true });
        console.log(`Estudo de "${nome}" apagado.`);
        return;
    }

    let extras = [];
    if (process.argv.includes('--abrir')) {
        extras = ['--abrir'];
    }

    if (process.argv.includes('--montar')) {
        const nome = clienteDaOpcao('--montar');
        exigirEstudo(nome, '--montar');
        const pasta = path.join(ESTUDOS, nome);
        rodar('Montando o documento', 'montar.js', RAIZ, [nome].concat(extras), pasta);
        return;
    }

    const respostas = await perguntar();
    const nome = criar(respostas);
    const pasta = path.join(ESTUDOS, nome);
    console.log(`\nEstudo em estudos/${nome}/`);

    garantirDependencias();
    rodar('Coletando os concorrentes', 'coletar.js', COLETA, null, pasta);
    avisarSeColetaVazia(pasta, respostas.termos);
    rodar('Medindo quem anuncia', 'medir.js', COLETA, null, pasta);
    rodar('Montando o documento', 'montar.js', RAIZ, [nome].concat(extras), pasta);
}

main();
