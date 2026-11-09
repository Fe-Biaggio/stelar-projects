"""Atualiza o histórico da Lotofácil usado pelo site.

Gera `Lotofacil/app/data/resultados.js` (window.LOTO_DADOS = {...}).

Uso:
    python Lotofacil/tools/atualizar_resultados.py              # só busca concursos novos na Caixa
    python Lotofacil/tools/atualizar_resultados.py --xlsx Lotofacil/Lotofacil.xlsx   # recria a partir da planilha

O GitHub Actions roda este script todo dia (ver .github/workflows/site-pages.yml).
"""
import argparse
import datetime as dt
import json
import pathlib
import re
import sys
import time
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parents[1]
SAIDA = RAIZ / "app" / "data" / "resultados.js"
API = "https://servicebus2.caixa.gov.br/portaldeloterias/api/lotofacil"
ESPELHO = "https://loteriascaixa-api.herokuapp.com/api/lotofacil"
PREFIXO = "window.LOTO_DADOS = "


def dinheiro(txt):
    if txt is None:
        return 0
    if isinstance(txt, (int, float)):
        return float(txt)
    s = re.sub(r"[^\d,]", "", str(txt)).replace(",", ".")
    try:
        return float(s) if s else 0
    except ValueError:
        return 0


def ler_planilha(caminho):
    import openpyxl

    wb = openpyxl.load_workbook(caminho, read_only=False)
    ws = wb.worksheets[0]
    concursos = []
    for i, r in enumerate(ws.iter_rows(values_only=True)):
        if i == 0 or r[0] is None:
            continue
        nums = sorted(int(x) for x in r[2:17])
        # ganhadores/rateio 15, 14, 13, 12, 11
        g = [r[17], dinheiro(r[19]), r[20], dinheiro(r[21]), r[22], dinheiro(r[23]),
             r[24], dinheiro(r[25]), r[26], dinheiro(r[27])]
        g = [int(x or 0) if k % 2 == 0 else round(float(x or 0), 2) for k, x in enumerate(g)]
        data = r[1] if isinstance(r[1], str) else r[1].strftime("%d/%m/%Y")
        concursos.append([int(r[0]), data, nums, g])
    return concursos


def ler_existente():
    if not SAIDA.exists():
        return []
    txt = SAIDA.read_text(encoding="utf-8").strip()
    txt = txt[len(PREFIXO):].rstrip(";")
    return json.loads(txt)["concursos"]


def baixar(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (lotofacil-analise)",
                                               "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def converter_caixa(j):
    rateio = {f["faixa"]: f for f in j.get("listaRateioPremio") or []}
    g = []
    for faixa in (1, 2, 3, 4, 5):
        f = rateio.get(faixa, {})
        g += [int(f.get("numeroDeGanhadores") or 0), round(float(f.get("valorPremio") or 0), 2)]
    return [int(j["numero"]), j["dataApuracao"], sorted(int(x) for x in j["listaDezenas"]), g]


def converter_espelho(j):
    prem = {p.get("faixa"): p for p in j.get("premiacoes") or []}
    g = []
    for faixa in (1, 2, 3, 4, 5):
        p = prem.get(faixa, {})
        g += [int(p.get("ganhadores") or 0), round(float(p.get("valorPremio") or 0), 2)]
    return [int(j["concurso"]), j["data"], sorted(int(x) for x in j["dezenas"]), g]


def buscar(numero=None):
    """Busca um concurso (ou o último) na Caixa; se falhar, tenta o espelho público."""
    try:
        return converter_caixa(baixar(API + (f"/{numero}" if numero else "")))
    except Exception as e:  # noqa: BLE001
        print(f"  Caixa falhou ({e}); tentando espelho", file=sys.stderr)
        return converter_espelho(baixar(ESPELHO + (f"/{numero}" if numero else "/latest")))


def salvar(concursos):
    concursos = sorted({c[0]: c for c in concursos}.values(), key=lambda c: c[0])
    dados = {"atualizadoEm": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
             "concursos": concursos}
    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    corpo = ",\n".join(json.dumps(c, separators=(",", ":"), ensure_ascii=False) for c in concursos)
    SAIDA.write_text(f'{PREFIXO}{{"atualizadoEm":"{dados["atualizadoEm"]}","concursos":[\n{corpo}\n]}};\n',
                     encoding="utf-8")
    print(f"{len(concursos)} concursos salvos (último: {concursos[-1][0]}) em {SAIDA}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", help="planilha da Caixa para recriar o histórico")
    ap.add_argument("--offline", action="store_true", help="não busca na internet")
    a = ap.parse_args()

    concursos = ler_planilha(a.xlsx) if a.xlsx else ler_existente()
    antes = concursos[-1][0] if concursos else 0
    if not a.offline:
        try:
            ultimo = buscar()
            novos = {ultimo[0]: ultimo}
            for n in range(antes + 1, ultimo[0]):
                novos[n] = buscar(n)
                time.sleep(0.4)
            concursos += [novos[k] for k in sorted(novos) if k > antes]
        except Exception as e:  # noqa: BLE001
            print(f"Não consegui buscar concursos novos: {e}", file=sys.stderr)
    if not concursos:
        sys.exit("Nenhum concurso para salvar.")
    salvar(concursos)


if __name__ == "__main__":
    main()
