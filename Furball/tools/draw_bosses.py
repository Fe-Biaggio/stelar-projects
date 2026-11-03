"""Desenha os bosses que não existem nas folhas: rato, cachorro, pássaro e humano.

Cada um vira public/assets/boss_<nome>.png (160x128), no mesmo estilo do jogo: formas simples,
cores chapadas com brilho e contorno escuro grosso. O morcego (boss_bat.png) vem da folha 3,
via tools/extract_enemies.py.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public/assets"
W, H = 160, 128
S = 4  # desenha em 4x e reduz
OUTLINE = (24, 14, 12, 255)


def canvas():
    img = Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def p(*v):
    """Converte coordenadas do frame (160x128) para a tela em 4x."""
    return [c * S for c in v]


def finish(img: Image.Image, name: str):
    alpha = img.getchannel("A").point(lambda a: 255 if a > 0 else 0)
    grown = alpha.filter(ImageFilter.MaxFilter(4 * S + 1))
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(Image.new("RGBA", img.size, OUTLINE), (0, 0), grown)
    out.alpha_composite(img)
    out = out.resize((W, H), Image.LANCZOS)
    out.save(OUT / f"boss_{name}.png")
    print("salvo", f"boss_{name}.png")


def angry_eyes(d, cx, cy, gap, r, iris=(200, 30, 30, 255)):
    for side in (-1, 1):
        x = cx + side * gap
        d.ellipse(p(x - r, cy - r, x + r, cy + r), fill=(250, 240, 220, 255))
        d.ellipse(p(x - r * 0.55, cy - r * 0.4, x + r * 0.55, cy + r * 0.7), fill=iris)
        d.ellipse(p(x - r * 0.25, cy - r * 0.1, x + r * 0.25, cy + r * 0.4), fill=(20, 8, 8, 255))
        # sobrancelha brava
        d.polygon(p(x - r * 1.2, cy - r * 1.3 - (side * -r * 0.5), x + r * 1.2, cy - r * 1.3 + (side * -r * 0.5),
                    x + r * 1.2, cy - r * 0.9 + (side * -r * 0.5), x - r * 1.2, cy - r * 0.9 - (side * -r * 0.5)),
                  fill=OUTLINE)


# ---------- Rato ----------
def rat():
    img, d = canvas()
    gray, dark, light, pink = (128, 124, 130, 255), (88, 84, 92, 255), (170, 166, 172, 255), (232, 150, 160, 255)
    # rabo enrolado
    d.arc(p(98, 70, 150, 122), 200, 80, fill=pink, width=5 * S)
    # corpo
    d.ellipse(p(38, 58, 122, 124), fill=gray)
    d.ellipse(p(56, 78, 104, 120), fill=light)
    # orelhas
    for x in (40, 120):
        d.ellipse(p(x - 22, 6, x + 22, 50), fill=gray)
        d.ellipse(p(x - 14, 14, x + 14, 44), fill=pink)
    # cabeça
    d.ellipse(p(36, 20, 124, 92), fill=gray)
    d.ellipse(p(44, 26, 92, 50), fill=light)
    # focinho
    d.ellipse(p(60, 58, 100, 90), fill=light)
    d.ellipse(p(73, 58, 87, 68), fill=(210, 90, 110, 255))
    # dentes
    d.rectangle(p(74, 80, 79, 90), fill=(250, 245, 225, 255))
    d.rectangle(p(81, 80, 86, 90), fill=(250, 245, 225, 255))
    # bigodes
    for side in (-1, 1):
        for k in (-1, 0, 1):
            d.line(p(80 + side * 14, 72 + k * 4, 80 + side * 40, 66 + k * 8), fill=dark, width=S)
    angry_eyes(d, 80, 46, 18, 9)
    # patinhas
    for x in (54, 106):
        d.ellipse(p(x - 10, 112, x + 10, 126), fill=pink)
    finish(img, "rat")


# ---------- Cachorro ----------
def dog():
    img, d = canvas()
    brown, dark, cream = (160, 100, 56, 255), (104, 62, 34, 255), (238, 214, 176, 255)
    # corpo
    d.ellipse(p(34, 70, 126, 126), fill=brown)
    d.ellipse(p(58, 84, 102, 124), fill=cream)
    # orelhas caídas
    d.ellipse(p(14, 18, 50, 84), fill=dark)
    d.ellipse(p(110, 18, 146, 84), fill=dark)
    # cabeça
    d.ellipse(p(30, 8, 130, 92), fill=brown)
    d.ellipse(p(42, 12, 86, 36), fill=(186, 124, 74, 255))
    # focinho
    d.ellipse(p(52, 50, 108, 92), fill=cream)
    d.ellipse(p(70, 50, 90, 64), fill=(30, 20, 18, 255))
    # boca aberta com presas
    d.chord(p(62, 66, 98, 92), 0, 180, fill=(120, 24, 30, 255))
    d.polygon(p(66, 72, 71, 72, 68.5, 82), fill=(250, 245, 225, 255))
    d.polygon(p(89, 72, 94, 72, 91.5, 82), fill=(250, 245, 225, 255))
    angry_eyes(d, 80, 38, 20, 9)
    # coleira com medalha
    d.rounded_rectangle(p(46, 88, 114, 98), radius=4 * S, fill=(200, 40, 40, 255))
    d.ellipse(p(74, 92, 86, 106), fill=(232, 180, 50, 255))
    finish(img, "dog")


# ---------- Pássaro ----------
def bird():
    img, d = canvas()
    body, dark, belly = (96, 112, 150, 255), (60, 72, 104, 255), (214, 220, 232, 255)
    beak = (244, 176, 40, 255)
    # asas abertas
    d.polygon(p(54, 50, 4, 30, 10, 60, 2, 78, 22, 84, 14, 102, 52, 96), fill=dark)
    d.polygon(p(106, 50, 156, 30, 150, 60, 158, 78, 138, 84, 146, 102, 108, 96), fill=dark)
    for k in range(3):
        d.line(p(46 - k * 12, 58 + k * 10, 22 - k * 4, 54 + k * 14), fill=body, width=2 * S)
        d.line(p(114 + k * 12, 58 + k * 10, 138 + k * 4, 54 + k * 14), fill=body, width=2 * S)
    # corpo e barriga
    d.ellipse(p(46, 34, 114, 118), fill=body)
    d.ellipse(p(60, 62, 100, 114), fill=belly)
    # cabeça com topete
    d.polygon(p(70, 14, 76, 0, 82, 12, 90, 2, 90, 18), fill=dark)
    d.ellipse(p(50, 10, 110, 66), fill=body)
    # bico
    d.polygon(p(70, 42, 90, 42, 80, 62), fill=beak)
    d.line(p(72, 48, 88, 48), fill=(180, 110, 20, 255), width=S)
    angry_eyes(d, 80, 32, 14, 8, iris=(230, 160, 20, 255))
    # garras
    for x in (66, 94):
        for k in (-4, 0, 4):
            d.line(p(x, 114, x + k, 126), fill=beak, width=2 * S)
    finish(img, "bird")


# ---------- Humano ----------
def human():
    img, d = canvas()
    skin, shade = (236, 190, 150, 255), (206, 152, 116, 255)
    hair = (84, 52, 30, 255)
    shirt = (70, 110, 170, 255)
    # ombros/camisa
    d.rounded_rectangle(p(20, 88, 140, 128), radius=18 * S, fill=shirt)
    d.polygon(p(66, 88, 94, 88, 80, 104), fill=(240, 236, 228, 255))
    # mãos gigantes abertas nos lados
    for cx in (16, 144):
        d.ellipse(p(cx - 16, 40, cx + 16, 76), fill=skin)
        for k in range(4):
            fx = cx - 12 + k * 8
            d.rounded_rectangle(p(fx - 3, 22 + abs(k - 1.5) * 3, fx + 3, 50), radius=3 * S, fill=skin)
    # pescoço e cabeça
    d.rectangle(p(68, 74, 92, 92), fill=shade)
    d.ellipse(p(38, 10, 122, 90), fill=skin)
    # orelhas
    d.ellipse(p(32, 42, 46, 62), fill=shade)
    d.ellipse(p(114, 42, 128, 62), fill=shade)
    # cabelo
    d.chord(p(36, 4, 124, 62), 180, 360, fill=hair)
    d.polygon(p(40, 34, 56, 18, 60, 36), fill=hair)
    d.polygon(p(120, 34, 104, 18, 100, 36), fill=hair)
    # rosto bravo
    angry_eyes(d, 80, 48, 16, 8, iris=(70, 110, 60, 255))
    d.polygon(p(76, 52, 84, 52, 86, 64, 74, 64), fill=shade)  # nariz
    d.chord(p(62, 66, 98, 84), 180, 360, fill=(140, 40, 40, 255))  # boca gritando
    d.rectangle(p(66, 74, 94, 76), fill=(140, 40, 40, 255))
    finish(img, "human")


if __name__ == "__main__":
    rat()
    dog()
    bird()
    human()
