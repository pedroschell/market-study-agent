/**
 * Onde a coleta lê a praça e grava os dados.
 * O estudo.js aponta ESTUDO_PASTA para a pasta do cliente; sem ela, usa coleta/.
 */
const path = require('path');

const COLETA = path.join(__dirname, '..');

/** A pasta do estudo em andamento, ou a própria coleta quando roda avulsa. */
function pastaBase() {
    const pasta = process.env.ESTUDO_PASTA;

    if (pasta) {
        return pasta;
    }

    return COLETA;
}

const BASE = pastaBase();

module.exports = {
    PRACA: path.join(BASE, 'praca.json'),
    DADOS: path.join(BASE, 'dados'),
};
