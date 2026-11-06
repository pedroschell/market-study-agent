#!/usr/bin/env python3
"""
Gera mapa SVG de municipios a partir da malha oficial do IBGE.

Uso:
    python3 gerar-mapa.py --uf NN --dados dados.json --saida mapa.svg

dados.json:
    {"<codigo IBGE do municipio>": <valor>, ...}

Saida: SVG com um <path> por municipio, classe `n0`..`n4` por faixa de valor
(quintil) e data-attributes com nome e valor. A cor vem do CSS do relatorio,
nao daqui — o tema continua sendo o do template.

Fontes (API aberta, sem chave):
  malha       https://servicodados.ibge.gov.br/api/v3/malhas/
  municipios  https://servicodados.ibge.gov.br/api/v1/localidades/
"""
import argparse, json, re, sys, urllib.request, unicodedata
from pathlib import Path

CACHE = Path(__file__).parent / ".cache"
MALHA = ("https://servicodados.ibge.gov.br/api/v3/malhas/estados/{uf}"
         "?formato=image/svg+xml&intrarregiao=municipio&qualidade=minima")
NOMES = "https://servicodados.ibge.gov.br/api/v1/localidades/estados/{uf}/municipios"


def baixar(url, nome):
    """Baixa e cacheia. O IBGE responde gzip mesmo sem Accept-Encoding."""
    CACHE.mkdir(exist_ok=True)
    f = CACHE / nome
    if not f.exists():
        req = urllib.request.Request(url, headers={"Accept-Encoding": "identity"})
        with urllib.request.urlopen(req, timeout=60) as r:
            dados = r.read()
        if dados[:2] == b"\x1f\x8b":
            import gzip
            dados = gzip.decompress(dados)
        f.write_bytes(dados)
    return f.read_text(encoding="utf-8")


def pontos(d):
    """Percorre o path (M absoluto + l relativos) e devolve os vertices."""
    out, x, y = [], 0.0, 0.0
    for cmd, corpo in re.findall(r"([MlL])([-\d,.\s]*)", d):
        nums = [float(n) for n in re.findall(r"-?\d+\.?\d*", corpo)]
        for i in range(0, len(nums) - 1, 2):
            dx, dy = nums[i], nums[i + 1]
            x, y = (dx, dy) if cmd in "ML" else (x + dx, y + dy)
            out.append((x, y))
    return out


def faixa(v, cortes):
    for i, c in enumerate(cortes):
        if v <= c:
            return i
    return len(cortes)


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--uf", required=True, help="codigo IBGE da UF (2 digitos)")
    p.add_argument("--dados", required=True, help="JSON codigo->valor")
    p.add_argument("--saida", default="mapa.svg")
    p.add_argument("--largura", type=int, default=760)
    p.add_argument("--enquadramento", choices=("praca", "estado"), default="praca",
                   help="praca (padrao): usa a malha do estado inteiro mas enquadra "
                        "no espaco que cobre as cidades — um zoom. estado: UF inteira; "
                        "so vale quando a praca cobre boa parte dela, senao os "
                        "municipios viram manchas ilegiveis")
    p.add_argument("--sem-contexto", dest="contexto", action="store_false",
                   help="nao desenha os vizinhos em cinza (por padrao desenha)")
    p.add_argument("--margem", type=float, default=.12,
                   help="folga em volta da praca, fracao do lado maior (padrao 0.12)")
    p.add_argument("--localizador", action="store_true",
                   help="so com --enquadramento praca: acrescenta a silhueta da UF "
                        "mostrando onde a praca fica. Da o contexto do estado sem "
                        "encolher os municipios ate a ilegibilidade")
    p.add_argument("--rotulos", nargs="?", const="auto", default=None,
               help="auto (5 maiores) ou lista de codigos separada por virgula")
    a = p.parse_args()

    dados = {str(k): v for k, v in json.loads(Path(a.dados).read_text()).items()}
    svg = baixar(MALHA.format(uf=a.uf), f"malha-{a.uf}.svg")
    nomes = {str(m["id"]): m["nome"]
             for m in json.loads(baixar(NOMES.format(uf=a.uf), f"mun-{a.uf}.json"))}

    paths = dict(re.findall(r'<path id="(\d+)" d="([^"]+)"', svg))
    faltando = [c for c in dados if c not in paths]
    if faltando:
        sys.exit(f"codigos ausentes na malha da UF {a.uf}: {faltando}")

    # bbox: coordenadas em 1e-4 grau, y invertido pelo transform do IBGE
    alvo = paths.keys() if a.enquadramento == "estado" else dados.keys()
    todos = [pt for c in alvo for pt in pontos(paths[c])]
    xs, ys = [p[0] for p in todos], [p[1] for p in todos]
    pad = max(max(xs) - min(xs), max(ys) - min(ys)) * a.margem
    x0, y0 = min(xs) - pad, min(ys) - pad
    w, h = (max(xs) - min(xs)) + 2 * pad, (max(ys) - min(ys)) + 2 * pad

    vals = sorted(dados.values())
    distintos = sorted(set(vals))
    if len(distintos) >= 5:
        # Quintis: cada faixa recebe a mesma quantidade de municipios.
        cortes = [vals[int(len(vals) * q)] for q in (.2, .4, .6, .8)]
    else:
        # Praca pequena. Quintil degenera e pinta tudo igual, entao cada valor
        # distinto vira sua propria faixa.
        cortes = distintos[:-1]

    alt = round(a.largura * h / w)
    out = [f'<div class="mapa-box">',
           f'<svg class="mapa" viewBox="{x0:.0f} {-y0-h:.0f} {w:.0f} {h:.0f}" '
           f'xmlns="http://www.w3.org/2000/svg" '
           f'role="img" aria-label="Mapa dos municipios analisados">',
           '  <g transform="scale(1,-1)">']

    if a.contexto or a.enquadramento == "estado":
        # qualquer municipio cujo centroide caia no enquadramento entra como
        # fundo neutro. Sem isso, praca com buraco geografico vira ilha solta.
        for c, d in paths.items():
            if c in dados:
                continue
            pts = pontos(d)
            cx = sum(q[0] for q in pts) / len(pts)
            cy = sum(q[1] for q in pts) / len(pts)
            if x0 <= cx <= x0 + w and y0 <= cy <= y0 + h:
                out.append(f'    <path class="mun ctx" d="{d}">'
                           f'<title>{nomes.get(c, c)}</title></path>')

    for c, v in sorted(dados.items(), key=lambda kv: -kv[1]):
        n = faixa(v, cortes)
        # o numero formatado sai separado: aplicar replace no path corromperia
        # as virgulas que separam as coordenadas
        rotulo = f"{v:,}".replace(",", ".")
        out.append(f'    <path id="m{c}" class="mun n{n}" d="{paths[c]}" '
                   f'data-nome="{nomes.get(c, c)}" data-valor="{v}">'
                   f'<title>{nomes.get(c, c)}: {rotulo}</title></path>')
    out.append("  </g>")

    if a.rotulos:
        # rotular tudo vira sopa de letras. Se --rotulos vier sem lista,
        # rotula so os 5 maiores.
        alvos = a.rotulos.split(",") if a.rotulos != "auto" else \
            [c for c, _ in sorted(dados.items(), key=lambda kv: -kv[1])[:5]]
        corpo = max(w, h) / 42          # ~2.4% do lado maior
        out.append(f'  <g class="rotulos" font-size="{corpo:.0f}">')
        for c in alvos:
            if c not in paths:
                continue
            pts = pontos(paths[c])
            cx = sum(p[0] for p in pts) / len(pts)
            cy = sum(p[1] for p in pts) / len(pts)
            out.append(f'    <text x="{cx:.0f}" y="{-cy:.0f}" '
                       f'class="rot {slug(nomes.get(c, c))}">{nomes.get(c, c)}</text>')
        out.append("  </g>")

    out.append("</svg>")

    if a.localizador and a.enquadramento == "praca":
        # silhueta da UF inteira com a praca marcada. Resolve o contexto
        # geografico sem reduzir os municipios a manchas de 3px.
        tudo = [pt for c in paths for pt in pontos(paths[c])]
        ex, ey = [q[0] for q in tudo], [q[1] for q in tudo]
        bx, by = min(ex), min(ey)
        bw, bh = max(ex) - bx, max(ey) - by
        out.append(f'<svg class="localizador" viewBox="{bx:.0f} {-by-bh:.0f} '
                   f'{bw:.0f} {bh:.0f}" xmlns="http://www.w3.org/2000/svg" '
                   f'role="img" aria-label="Onde a praca fica no estado">')
        out.append('  <g transform="scale(1,-1)">')
        for c, d in paths.items():
            cls = "loc-alvo" if c in dados else "loc-uf"
            out.append(f'    <path class="{cls}" d="{d}"/>')
        out.append("  </g>")
        out.append("</svg>")

    # Legenda: rotula cada faixa pelo que ela DE FATO contem.
    # Usar os cortes direto degenera quando ha poucos municipios — com 5,
    # cada um cai numa faixa e o rotulo virava "1,6 mil-1,6 mil".
    def curto(n):
        if n >= 1_000_000:
            return f"{n/1_000_000:.1f} mi".replace(".", ",")
        if n >= 10_000:
            return f"{n/1000:.0f} mil"
        return f"{n:,}".replace(",", ".")

    baldes = {}
    for v in dados.values():
        baldes.setdefault(faixa(v, cortes), []).append(v)

    out.append('<ul class="ramp">')
    for i in range(5):
        vs = baldes.get(i)
        if not vs:
            continue                      # faixa vazia nao entra na legenda
        lo, hi = min(vs), max(vs)
        r = curto(lo) if lo == hi else f"{curto(lo)}\u2013{curto(hi)}"
        out.append(f'  <li><i class="sw n{i}"></i><span>{r}</span></li>')
    out.append("</ul>")
    out.append("</div>")

    Path(a.saida).write_text("\n".join(out), encoding="utf-8")
    print(f"{len(dados)} municipios destacados -> {a.saida}  "
          f"[{a.enquadramento}] {w:.0f}x{h:.0f} unidades")


if __name__ == "__main__":
    main()
