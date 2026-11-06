/**
 * Casa um empresa do Google Maps com o anunciante correspondente na Biblioteca
 * de Anúncios. Vive separado porque a regra muda com o que se descobre
 * rodando, e precisa ser reaplicada sobre base já coletada.
 */

/** Minúsculas sem acento. */
function semAcento(texto) {
    if (!texto) {
        return '';
    }

    const minusculo = texto.toLowerCase();
    const decomposto = minusculo.normalize('NFD');

    return decomposto.replace(/[̀-ͯ]/g, '');
}

// Palavras que abrem o nome sem identificar a empresa.
const RUIDO = new Set([
    'dr', 'dra', 'drs', 'clinica', 'clinicas', 'consultorio', 'studio',
    'espaco', 'centro', 'instituto', 'odontologia', 'odontologica',
    'odontologicas', 'odontologico', 'odonto', 'estetica', 'esteticas',
    'estetico', 'dental', 'academia', 'imobiliaria', 'pousada', 'hotel',
]);

// Termos de categoria. Não contam como coincidência entre dois nomes, senão
// "Odontologia" casaria com qualquer clínica.
const GENERICO = new Set([
    'odontologia', 'odontologica', 'odontologicas', 'odonto', 'odontologico',
    'estetica', 'esteticas', 'estetico', 'clinica', 'clinicas', 'dental',
    'dentista', 'dentistas', 'integrada', 'integrado', 'avancada', 'avancado',
    'sorriso', 'sorrisos', 'implantes', 'implante', 'academia', 'fitness',
    'musculacao', 'pilates', 'imobiliaria', 'imoveis', 'corretor', 'pousada',
    'hotel', 'hospedagem', 'moveis', 'planejados', 'decoracao', 'centro',
    'espaco', 'studio',
]);

/**
 * Encurta o nome para consultar a Biblioteca de Anúncios.
 * O nome completo do Maps quase nunca acha nada.
 */
function consulta(nome) {
    const antesDoSeparador = nome.split(/[|\/(]/)[0];
    const soLetrasENumeros = antesDoSeparador.replace(/[^\p{L}\p{N}\s&]/gu, ' ');

    const palavras = [];
    for (const palavra of soLetrasENumeros.split(/\s+/)) {
        if (palavra.length > 0) {
            palavras.push(palavra);
        }
    }

    const distintivas = [];
    for (const palavra of palavras) {
        const limpa = semAcento(palavra).replace(/^[-\s]+|[-.\s]+$/g, '');
        if (!RUIDO.has(limpa)) {
            distintivas.push(palavra);
        }
    }

    let escolhidas = distintivas;
    if (escolhidas.length === 0) {
        escolhidas = palavras;
    }

    return escolhidas.slice(0, 3).join(' ');
}

/**
 * Extrai a sigla da UF do fim do nome da cidade ("Cidade UF" -> "uf").
 */
function ufDaCidade(cidade) {
    const encontrado = semAcento(cidade).match(/\b([a-z]{2})$/);

    if (encontrado) {
        return encontrado[1];
    }

    return '';
}

/**
 * Grafias possíveis de uma cidade, sem a UF no fim.
 */
function variantes(cidade) {
    const uf = ufDaCidade(cidade);
    let base = semAcento(cidade);

    if (uf) {
        base = base.replace(new RegExp(`\\s*${uf}$`), '');
    }
    base = base.trim();

    const lista = [base];
    if (base.startsWith('tres ')) {
        lista.push(base.replace('tres ', '3 '));
    }

    return lista;
}

/**
 * Termos distintivos de um nome: sem acento, 3 letras ou mais, sem genéricos.
 */
function termos(nome) {
    const encontrados = new Set();

    for (const palavra of semAcento(nome).split(/[^a-z0-9]+/)) {
        if (palavra.length > 2 && !GENERICO.has(palavra)) {
            encontrados.add(palavra);
        }
    }

    return [...encontrados];
}

/**
 * Variantes de todas as cidades da praça exceto a do empresa.
 */
function variantesDasOutras(cidade, cidades) {
    const resultado = [];

    for (const outra of cidades) {
        if (semAcento(outra) !== semAcento(cidade)) {
            for (const variante of variantes(outra)) {
                resultado.push(variante);
            }
        }
    }

    return resultado;
}

/** Verdadeiro se o nome contém alguma das cidades da lista. */
function citaAlgumaCidade(nome, listaDeCidades) {
    for (const cidade of listaDeCidades) {
        if (nome.includes(cidade)) {
            return true;
        }
    }

    return false;
}

/**
 * Verdadeiro se o nome traz sufixo de outro estado ("Integrada Goianinha/RN").
 */
function citaOutroEstado(nome, ufDaPraca) {
    const comSufixo = nome.match(/\/([a-z]{2})\b/);

    if (!comSufixo) {
        return false;
    }

    return comSufixo[1] !== ufDaPraca;
}

/** Palavras dos nomes das cidades da praça. Não identificam empresa nenhuma. */
function palavrasDasCidades(cidades) {
    const palavras = new Set();

    for (const cidade of cidades) {
        for (const variante of variantes(cidade)) {
            for (const palavra of variante.split(/[^a-z0-9]+/)) {
                if (palavra) {
                    palavras.add(palavra);
                }
            }
        }
    }

    return palavras;
}

/** Termos distintivos de um nome, sem as palavras das cidades. */
function termosSemCidade(nome, palavrasDeCidade) {
    const resultado = [];

    for (const termo of termos(nome)) {
        if (!palavrasDeCidade.has(termo)) {
            resultado.push(termo);
        }
    }

    return resultado;
}

/**
 * Escolhe, entre os anunciantes encontrados, o que corresponde à empresa.
 * Regra: TODO termo distintivo da empresa precisa estar no nome do anunciante.
 * Um termo só em comum ("Santo Antônio", "Vanessa") não basta.
 * Certeza alta quando o anunciante também não traz termo a mais.
 * Devolve null quando nenhum passa.
 */
function escolher(lista, nome, cidade, cidades) {
    const palavrasDeCidade = palavrasDasCidades(cidades);
    const termosDaEmpresa = termosSemCidade(nome, palavrasDeCidade);

    if (termosDaEmpresa.length === 0) {
        return null;
    }

    const uf = ufDaCidade(cidade);
    const cidadesVizinhas = variantesDasOutras(cidade, cidades);

    let melhor = null;

    for (const anunciante of lista) {
        const nomeNormalizado = semAcento(anunciante.nome);

        if (citaAlgumaCidade(nomeNormalizado, cidadesVizinhas)) {
            continue;
        }
        if (citaOutroEstado(nomeNormalizado, uf)) {
            continue;
        }

        const termosDoAnunciante = termosSemCidade(anunciante.nome, palavrasDeCidade);

        let todosPresentes = true;
        for (const termo of termosDaEmpresa) {
            if (!termosDoAnunciante.includes(termo)) {
                todosPresentes = false;
                break;
            }
        }

        if (!todosPresentes) {
            continue;
        }

        let extras = 0;
        for (const termo of termosDoAnunciante) {
            if (!termosDaEmpresa.includes(termo)) {
                extras = extras + 1;
            }
        }

        const ehPrimeiro = melhor === null;
        let venceuOAnterior = false;
        if (!ehPrimeiro) {
            venceuOAnterior = extras < melhor.extras;
        }

        if (ehPrimeiro || venceuOAnterior) {
            melhor = Object.assign({}, anunciante);
            melhor.extras = extras;
        }
    }

    if (melhor === null) {
        return null;
    }

    if (melhor.extras === 0) {
        melhor.certeza = 'alta';
    } else {
        melhor.certeza = 'baixa';
    }

    return melhor;
}

/**
 * Confiança no casamento, independente do score.
 * Vale sozinha para ser reaplicada sobre base já coletada.
 */
function certeza(anunciante, empresa, cidade, cidades) {
    const termosDoAnunciante = termos(anunciante);
    const termosDaEmpresa = termos(empresa);

    if (termosDoAnunciante.length === 0 || termosDaEmpresa.length === 0) {
        return 'baixa';
    }

    const uf = ufDaCidade(cidade);
    const nomeNormalizado = semAcento(anunciante);
    const cidadesDaPraca = variantes(cidade);
    const cidadesVizinhas = variantesDasOutras(cidade, cidades);

    if (citaAlgumaCidade(nomeNormalizado, cidadesVizinhas)) {
        return 'baixa';
    }
    if (citaOutroEstado(nomeNormalizado, uf)) {
        return 'baixa';
    }

    // Empresa se identifica pela cidade e o anunciante não: provavelmente é a
    // página nacional da rede, não a unidade daqui.
    const empresaCitaACidade = citaAlgumaCidade(semAcento(empresa), cidadesDaPraca);
    const anuncianteCitaACidade = citaAlgumaCidade(nomeNormalizado, cidadesDaPraca);

    if (empresaCitaACidade && !anuncianteCitaACidade) {
        return 'baixa';
    }

    // Todo termo distintivo do anunciante precisa aparecer no empresa. Só nesse
    // sentido: o contrário aceitaria "Innovare Denim" como "Innovare Odontologia".
    for (const termo of termosDoAnunciante) {
        if (!termosDaEmpresa.includes(termo)) {
            return 'baixa';
        }
    }

    return 'alta';
}

module.exports = { semAcento, consulta, escolher, certeza, GENERICO };
