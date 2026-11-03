"""Desenha os itens elementais (pimenta, cubo de gelo, catavento, pedra) e a fogueira.

Saídas em public/assets/:
  elements.png  -> 4 frames de 64x64 (pimenta, gelo, catavento, pedra)
  campfire.png  -> 3 frames de 64x80 (fogueira acesa, chamas animadas)
  campfire_out.png -> fogueira apagada (cinzas), 64x80
Desenho em 4x e reduzido, para ficar suave.
"""
import math
import os
from PIL import Image, ImageDraw

S = 4
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets')
INK = (26, 18, 16, 255)


def canvas(w, h):
    img = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def P(*pts):
    return [(x * S, y * S) for x, y in pts]


def ell(d, box, fill, outline=INK, width=2):
    x0, y0, x1, y1 = box
    d.ellipse((x0 * S, y0 * S, x1 * S, y1 * S), fill=fill, outline=outline, width=width * S)


def done(img, w, h):
    return img.resize((w, h), Image.LANCZOS)


def pepper():
    img, d = canvas(64, 64)
    # Corpo curvado da pimenta
    body = P((20, 22), (30, 18), (40, 20), (46, 30), (48, 42), (44, 54), (38, 58), (36, 52), (38, 42), (34, 32), (26, 28), (20, 26))
    d.polygon(body, fill=(214, 40, 32, 255), outline=INK, width=2 * S)
    d.line(P((30, 22), (38, 26), (42, 36)), fill=(255, 140, 110, 255), width=3 * S)
    # Cabinho verde
    d.polygon(P((16, 20), (24, 16), (28, 22), (20, 27)), fill=(70, 150, 60, 255), outline=INK, width=2 * S)
    d.line(P((18, 18), (14, 10)), fill=(70, 150, 60, 255), width=4 * S)
    d.line(P((18, 18), (14, 10)), fill=INK, width=1 * S)
    return done(img, 64, 64)


def ice():
    img, d = canvas(64, 64)
    # Cubo em perspectiva
    d.polygon(P((14, 24), (34, 16), (52, 24), (32, 32)), fill=(214, 244, 255, 255), outline=INK, width=2 * S)
    d.polygon(P((14, 24), (32, 32), (32, 54), (14, 46)), fill=(140, 200, 240, 255), outline=INK, width=2 * S)
    d.polygon(P((32, 32), (52, 24), (52, 46), (32, 54)), fill=(100, 170, 225, 255), outline=INK, width=2 * S)
    d.line(P((18, 30), (18, 40)), fill=(240, 252, 255, 255), width=2 * S)
    d.line(P((24, 22), (34, 19)), fill=(255, 255, 255, 255), width=2 * S)
    return done(img, 64, 64)


def pinwheel():
    img, d = canvas(64, 64)
    # Cabo
    d.line(P((32, 32), (32, 60)), fill=(150, 100, 60, 255), width=4 * S)
    d.line(P((32, 32), (32, 60)), fill=INK, width=1 * S)
    colors = [(230, 70, 60, 255), (250, 200, 60, 255), (70, 160, 230, 255), (90, 190, 90, 255)]
    for i, c in enumerate(colors):
        a = math.radians(i * 90 - 45)
        tip = (32 + math.cos(a) * 22, 26 + math.sin(a) * 22)
        side = (32 + math.cos(a + 0.9) * 13, 26 + math.sin(a + 0.9) * 13)
        d.polygon(P((32, 26), tip, side), fill=c, outline=INK, width=2 * S)
    ell(d, (29, 23, 35, 29), (240, 240, 240, 255))
    return done(img, 64, 64)


def stone():
    img, d = canvas(64, 64)
    d.polygon(P((12, 44), (16, 28), (28, 18), (44, 20), (54, 32), (52, 48), (36, 54), (20, 52)), fill=(150, 140, 130, 255), outline=INK, width=2 * S)
    d.polygon(P((20, 30), (28, 22), (40, 23), (34, 30)), fill=(195, 186, 175, 255))
    d.line(P((30, 38), (40, 44)), fill=(100, 92, 86, 255), width=2 * S)
    # Grãozinhos de areia
    for x, y in [(14, 56), (22, 58), (48, 56), (54, 54), (40, 58)]:
        ell(d, (x - 1.5, y - 1.5, x + 1.5, y + 1.5), (220, 190, 120, 255), outline=None, width=0)
    return done(img, 64, 64)


def logs(d):
    # Pedras em volta e lenha cruzada
    for x in [10, 20, 32, 44, 54]:
        ell(d, (x - 6, 66, x + 6, 76), (120, 112, 104, 255))
    d.line(P((14, 70), (50, 60)), fill=(110, 70, 40, 255), width=7 * S)
    d.line(P((14, 60), (50, 70)), fill=(130, 84, 48, 255), width=7 * S)


def campfire(frame):
    img, d = canvas(64, 80)
    logs(d)
    # Chamas (cada frame balança um pouco)
    sway = [-2, 0, 2][frame]
    tall = [0, 3, 1][frame]
    d.polygon(P((16, 64), (20 + sway, 34 - tall), (28, 46), (32 + sway, 18 - tall), (38, 44), (44 + sway, 30 - tall), (48, 64)), fill=(240, 110, 30, 255), outline=(120, 30, 10, 255), width=2 * S)
    d.polygon(P((22, 64), (26 + sway, 44 - tall), (32 + sway, 32 - tall), (38 + sway, 44), (42, 64)), fill=(255, 200, 60, 255))
    d.polygon(P((28, 64), (32 + sway, 48 - tall), (36, 64)), fill=(255, 245, 190, 255))
    return done(img, 64, 80)


def campfire_out():
    img, d = canvas(64, 80)
    logs(d)
    ell(d, (14, 58, 50, 70), (60, 56, 54, 255), outline=None, width=0)
    for x, y in [(24, 62), (34, 60), (40, 64)]:
        ell(d, (x - 2, y - 2, x + 2, y + 2), (200, 80, 30, 255), outline=None, width=0)
    return done(img, 64, 80)


def main():
    sheet = Image.new('RGBA', (64 * 4, 64), (0, 0, 0, 0))
    for i, f in enumerate([pepper, ice, pinwheel, stone]):
        sheet.paste(f(), (i * 64, 0))
    sheet.save(os.path.join(OUT, 'elements.png'))
    fire = Image.new('RGBA', (64 * 3, 80), (0, 0, 0, 0))
    for i in range(3):
        fire.paste(campfire(i), (i * 64, 0))
    fire.save(os.path.join(OUT, 'campfire.png'))
    campfire_out().save(os.path.join(OUT, 'campfire_out.png'))
    print('ok')


if __name__ == '__main__':
    main()
