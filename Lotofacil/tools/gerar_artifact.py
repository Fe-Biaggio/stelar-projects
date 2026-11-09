"""Monta a versão do Laboratório Lotofácil para o link do Claude (Artifact).

O Artifact já coloca <!doctype>, <html>, <head> e <body>; então tiramos esse esqueleto do index.html.
Gera `Lotofacil/build/artifact/index.html` e copia css/, js/ e data/.
"""
import pathlib
import re
import shutil

RAIZ = pathlib.Path(__file__).resolve().parents[1]
APP = RAIZ / "app"
SAIDA = RAIZ / "build" / "artifact"


def main():
    html = (APP / "index.html").read_text(encoding="utf-8")
    cabeca = html.split("<!-- conteudo -->", 1)[1].split("<!-- /conteudo-head -->", 1)[0]
    corpo = re.search(r"<body>(.*)</body>", html, re.S).group(1)
    if SAIDA.exists():
        shutil.rmtree(SAIDA)
    SAIDA.mkdir(parents=True)
    (SAIDA / "index.html").write_text(cabeca.strip() + "\n" + corpo.strip() + "\n", encoding="utf-8")
    for pasta in ("css", "js", "data"):
        shutil.copytree(APP / pasta, SAIDA / pasta)
    print("Pronto:", SAIDA)


if __name__ == "__main__":
    main()
