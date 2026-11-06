#!/usr/bin/env node
/**
 * Confere o que iria num commit antes de ele existir.
 * Lê a sua configuração local — que nunca é versionada — e procura por ela
 * dentro dos arquivos versionados. Também procura chave, telefone e CPF.
 *
 *   node verificar.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = __dirname;

// Usado só antes do git init, quando não dá para perguntar ao git.
// Precisa acompanhar o .gitignore.
const IGNORADOS = [
    'node_modules', '.git', '.cache', 'estudos', 'saida', 'dados', 'target',
    '__pycache__', 'revisao',
];
const ARQUIVOS_IGNORADOS = [
    'praca.json', 'package-lock.json', '.DS_Store', 'credentials.json',
    'settings.local.json', '.sensivel.local',
];

// Lista local de termos proibidos: clientes, marcas e outros projetos.
const LISTA_LOCAL = path.join(RAIZ, '.sensivel.local');

// Arquivo grande no repositório quase sempre é dado bruto ou captura.
const TAMANHO_MAXIMO_BYTES = 300 * 1024;

// Imagem e PDF só entram no repositório nestas pastas. Fora delas, quase
// sempre é captura de estudo de cliente esquecida.
const BINARIOS_PERMITIDOS = ['template/assets/', 'docs/'];
const EXTENSOES_BINARIAS = ['.png', '.jpg', '.jpeg', '.pdf', '.webp', '.gif'];

const SEGREDOS = [
    { nome: 'chave da Anthropic', re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
    { nome: 'chave da OpenAI', re: /sk-[A-Za-z0-9]{32,}/ },
    { nome: 'token do GitHub', re: /gh[pousr]_[A-Za-z0-9]{30,}/ },
    { nome: 'token da Meta', re: /EAA[A-Za-z0-9]{40,}/ },
    { nome: 'chave do Google', re: /AIza[A-Za-z0-9_-]{30,}/ },
    { nome: 'chave privada', re: /BEGIN [A-Z ]*PRIVATE KEY/ },
    { nome: 'telefone brasileiro', re: /\(\d{2}\)\s?9\d{4}-?\d{4}/ },
    { nome: 'CPF', re: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/ },
    { nome: 'e-mail pessoal', re: /[A-Za-z0-9._%+-]+@(gmail|hotmail|outlook|yahoo)\./i },
    { nome: 'chave da AWS', re: /AKIA[0-9A-Z]{16}/ },
    { nome: 'token do Slack', re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
    { nome: 'token Bearer', re: /Bearer\s+[A-Za-z0-9._-]{30,}/ },
    { nome: 'segredo OAuth', re: /(client_secret|refresh_token)["']?\s*[:=]\s*["'][^"']{10,}/i },
    { nome: 'caminho com nome de usuário', re: /\/(Users|home)\/(?!<|\$|\{)[A-Za-z0-9._-]+\// },
];

/** Lista os arquivos que seriam versionados. */
function arquivosVersionados() {
    try {
        const saida = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
            cwd: RAIZ,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        const lista = [];
        for (const linha of saida.split('\n')) {
            if (linha.trim()) {
                lista.push(linha.trim());
            }
        }

        return lista;
    } catch (erro) {
        // Sem repositório ainda: aproxima pela árvore de arquivos.
        return varrer(RAIZ, '');
    }
}

/** Percorre a pasta pulando o que nunca é versionado. */
function varrer(base, prefixo) {
    const encontrados = [];

    for (const item of fs.readdirSync(base, { withFileTypes: true })) {
        if (IGNORADOS.includes(item.name)) {
            continue;
        }
        if (ARQUIVOS_IGNORADOS.includes(item.name)) {
            continue;
        }
        if (item.name.startsWith('.env') || item.name.endsWith('.pem') || item.name.endsWith('.key')) {
            continue;
        }

        const relativo = prefixo ? `${prefixo}/${item.name}` : item.name;

        if (item.isDirectory()) {
            for (const achado of varrer(path.join(base, item.name), relativo)) {
                encontrados.push(achado);
            }
        } else {
            encontrados.push(relativo);
        }
    }

    return encontrados;
}

/** Termos que saem da sua configuração local e não podem vazar. */
function termosSensiveis() {
    const termos = [];

    const pracas = [path.join(RAIZ, 'coleta', 'praca.json')];

    const estudos = path.join(RAIZ, 'estudos');
    if (fs.existsSync(estudos)) {
        for (const item of fs.readdirSync(estudos, { withFileTypes: true })) {
            if (!item.isDirectory()) {
                continue;
            }
            if (item.name.length >= 4) {
                termos.push({ texto: item.name.replace(/-/g, ' '), origem: 'estudo em estudos/' });
            }
            pracas.push(path.join(estudos, item.name, 'praca.json'));
        }
    }

    if (fs.existsSync(LISTA_LOCAL)) {
        for (const linha of fs.readFileSync(LISTA_LOCAL, 'utf8').split('\n')) {
            const termo = linha.trim();
            if (termo === '' || termo.startsWith('#')) {
                continue;
            }
            termos.push({ texto: termo, origem: '.sensivel.local' });
        }
    }

    for (const praca of pracas) {
        if (!fs.existsSync(praca)) {
            continue;
        }

        const cfg = JSON.parse(fs.readFileSync(praca, 'utf8'));
        const origem = 'cidade em ' + path.relative(RAIZ, praca);

        for (const cidade of cfg.cidades || []) {
            const semUf = cidade.replace(/\s+[A-Za-z]{2}$/, '').trim();
            if (semUf.length >= 4) {
                termos.push({ texto: semUf, origem: origem });
            }
        }
    }

    return termos;
}

function main() {
    const arquivos = arquivosVersionados();
    const termos = termosSensiveis();
    const problemas = [];

    for (const relativo of arquivos) {
        const completo = path.join(RAIZ, relativo);

        let tamanho = 0;
        try {
            tamanho = fs.statSync(completo).size;
        } catch (erro) {
            tamanho = 0;
        }
        if (tamanho > TAMANHO_MAXIMO_BYTES) {
            problemas.push(`${relativo}: ${Math.round(tamanho / 1024)} KB — grande demais para ser código; confira se é dado`);
        }

        const nomeDoArquivo = path.basename(relativo).toLowerCase();
        if (nomeDoArquivo.startsWith('.env') || nomeDoArquivo.includes('credential') ||
            nomeDoArquivo.includes('token') || nomeDoArquivo.endsWith('.pem') || nomeDoArquivo.endsWith('.key')) {
            if (nomeDoArquivo !== '.env.example') {
                problemas.push(`${relativo}: nome de arquivo de credencial`);
            }
        }

        const extensao = path.extname(relativo).toLowerCase();
        if (EXTENSOES_BINARIAS.includes(extensao)) {
            let permitido = false;
            for (const pasta of BINARIOS_PERMITIDOS) {
                if (relativo.startsWith(pasta)) {
                    permitido = true;
                }
            }
            if (!permitido) {
                problemas.push(`${relativo}: imagem ou PDF fora de ${BINARIOS_PERMITIDOS.join(' e ')}`);
            }
            continue;
        }

        let conteudo = '';
        try {
            conteudo = fs.readFileSync(completo, 'utf8');
        } catch (erro) {
            continue;
        }

        for (const segredo of SEGREDOS) {
            const achado = conteudo.match(segredo.re);
            if (achado) {
                problemas.push(`${relativo}: ${segredo.nome} — "${achado[0].slice(0, 24)}"`);
            }
        }

        for (const termo of termos) {
            if (conteudo.toLowerCase().includes(termo.texto.toLowerCase())) {
                problemas.push(`${relativo}: "${termo.texto}" (${termo.origem})`);
            }
        }
    }

    console.log(`${arquivos.length} arquivos seriam versionados.`);

    if (termos.length > 0) {
        console.log(`${termos.length} termo(s) da sua configuração local conferidos.`);
    } else {
        console.log('AVISO: nenhuma lista local de termos (.sensivel.local) nem estudo para conferir.');
    }

    if (problemas.length === 0) {
        console.log('\nNada sensível encontrado. Pode commitar.');
        return;
    }

    console.error(`\n${problemas.length} PROBLEMA(S):\n`);
    for (const problema of problemas) {
        console.error(`  ${problema}`);
    }
    console.error('\nNÃO commite antes de resolver.');
    process.exit(1);
}

main();
