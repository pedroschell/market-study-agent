#!/usr/bin/env node
/**
 * Hook PreToolUse do Claude Code para o Bash. Bloqueia, antes de executar:
 *   - comando do opencli que escreve numa rede social (seguir, curtir, postar…)
 *   - commit e push no git, que são do dono do repositório
 * O Claude Code passa a chamada em JSON pela entrada padrão. Sair com código 2
 * cancela a chamada e devolve a mensagem de erro ao agente.
 */
const ESCRITA_NO_OPENCLI = [
    'follow', 'unfollow', 'like', 'unlike', 'comment', 'post', 'reel', 'story',
    'note', 'save', 'unsave', 'add-friend', 'join-group', 'send', 'reply',
    'delete', 'publish', 'upload', 'message', 'dm', 'collection-create',
    'collection-delete', 'retweet', 'repost', 'subscribe', 'unsubscribe',
];

const GIT_PROIBIDO = /\bgit\s+(commit|push|tag|rebase|reset\s+--hard)\b/;

/** Lê toda a entrada padrão. */
function lerEntrada() {
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
 * Em "opencli [--opção valor] <site> <subcomando> ...", devolve o subcomando.
 * Devolve null quando o trecho não é uma chamada ao opencli.
 */
function subcomandoDoOpencli(trecho) {
    const palavras = trecho.trim().split(/\s+/);
    const inicio = palavras.indexOf('opencli');

    if (inicio === -1) {
        return null;
    }

    const posicionais = [];
    let i = inicio + 1;
    while (i < palavras.length && posicionais.length < 2) {
        const palavra = palavras[i];
        if (palavra.startsWith('--') && !palavra.includes('=')) {
            i = i + 2;
            continue;
        }
        if (palavra.startsWith('-')) {
            i = i + 1;
            continue;
        }
        posicionais.push(palavra.toLowerCase());
        i = i + 1;
    }

    if (posicionais.length < 2) {
        return null;
    }

    return posicionais[1];
}

/** Devolve o motivo do bloqueio, ou null se o comando pode rodar. */
function motivoDoBloqueio(comando) {
    if (GIT_PROIBIDO.test(comando)) {
        return 'commit, push e reescrita de histórico são do dono do repositório.';
    }

    const trechos = comando.split(/;|&&|\|\||\|/);
    for (const trecho of trechos) {
        const subcomando = subcomandoDoOpencli(trecho);
        if (subcomando !== null && ESCRITA_NO_OPENCLI.includes(subcomando)) {
            return `"opencli ... ${subcomando}" escreve numa rede social. Este projeto só lê.`;
        }
    }

    return null;
}

async function main() {
    const entrada = await lerEntrada();

    let chamada = null;
    try {
        chamada = JSON.parse(entrada);
    } catch (erro) {
        process.exit(0);
    }

    let comando = '';
    if (chamada && chamada.tool_input && chamada.tool_input.command) {
        comando = chamada.tool_input.command;
    }

    const motivo = motivoDoBloqueio(comando);
    if (motivo !== null) {
        console.error(`Bloqueado pelo hook so-leitura: ${motivo}`);
        process.exit(2);
    }

    process.exit(0);
}

main();
