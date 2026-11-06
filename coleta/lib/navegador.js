/**
 * Abre o navegador. Usa o Google Chrome já instalado na máquina, porque o
 * playwright-core não baixa navegador nenhum.
 * Navegador limpo: sem perfil, sem sessão, sem login.
 */
const { chromium } = require('playwright-core');

const USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

// Seletores da página de consentimento que o Google às vezes intercala.
const BOTOES_DE_CONSENTIMENTO = [
    'button:has-text("Aceitar tudo")',
    'button:has-text("Aceitar")',
    'form[action*="consent"] button',
];

/**
 * Espera um intervalo aleatório entre dois limites, em milissegundos.
 */
function PAUSA(minimo, maximo) {
    const intervalo = maximo - minimo;
    const espera = minimo + Math.random() * intervalo;

    return new Promise(function (resolver) {
        setTimeout(resolver, espera);
    });
}

/**
 * Abre o navegador e devolve o browser e o contexto já configurados.
 */
async function abrir(opcoes) {
    let headless = true;
    if (opcoes && opcoes.headless === false) {
        headless = false;
    }

    let browser = null;

    // Primeiro o Chrome do sistema: não exige download e não prende a uma
    // versão específica do Playwright.
    try {
        browser = await chromium.launch({ headless: headless, channel: 'chrome' });
    } catch (erro) {
        browser = null;
    }

    // Depois o Chromium que o Playwright tenha baixado em algum momento.
    if (browser === null) {
        try {
            browser = await chromium.launch({ headless: headless });
        } catch (erro) {
            browser = null;
        }
    }

    if (browser === null) {
        console.error('Nenhum navegador disponível.');
        console.error('Instale o Google Chrome, ou baixe o Chromium do Playwright com:');
        console.error('  npx playwright install chromium');
        process.exit(1);
    }

    const ctx = await browser.newContext({
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
        viewport: { width: 1366, height: 900 },
        userAgent: USER_AGENT,
    });

    return { browser: browser, ctx: ctx };
}

/**
 * Clica no botão de consentimento, se a página estiver mostrando um.
 * Devolve true quando clicou.
 */
async function passarConsentimento(page) {
    for (const seletor of BOTOES_DE_CONSENTIMENTO) {
        const botao = page.locator(seletor).first();

        let quantos = 0;
        try {
            quantos = await botao.count();
        } catch (erro) {
            quantos = 0;
        }

        if (quantos > 0) {
            try {
                await botao.click({ timeout: 3000 });
            } catch (erro) {
                // botão sumiu entre a contagem e o clique
            }

            try {
                await page.waitForLoadState('domcontentloaded');
            } catch (erro) {
                // navegação já concluída
            }

            return true;
        }
    }

    return false;
}

module.exports = { abrir, PAUSA, passarConsentimento };
