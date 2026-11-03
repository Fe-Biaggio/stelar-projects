"""Desenha a marca de cavar (rachadura sutil no chão) e o buraco já cavado e tampado.

Saídas em public/assets/:
  crack.png -> 64x64, rachadura escura e fina (meio transparente, para ser sutil)
  dug.png   -> 64x64, terra remexida (depois que o gato cavou)
Desenho em 4x e reduzido, para ficar suave.
"""
import os
import random
from PIL import Image, ImageDraw

S = 4
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets')


def canvas():
    img = Image.new('RGBA', (64 * S, 64 * S), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def P(*pts):
    return [(x * S, y * S) for x, y in pts]


def B(x0, y0, x1, y1):
    return (x0 * S, y0 * S, x1 * S, y1 * S)


def crack():
    img, d = canvas()
    dark = (30, 18, 10, 150)
    light = (190, 150, 110, 70)
    # Rachadura principal em zigue-zague com dois galhos
    main = [(12, 40), (20, 35), (26, 38), (33, 30), (40, 32), (46, 25), (53, 27)]
    d.line(P(*[(x, y + 1) for x, y in main]), fill=light, width=2 * S)
    d.line(P(*main), fill=dark, width=2 * S)
    d.line(P((26, 38), (28, 46), (25, 51)), fill=dark, width=1 * S + 2)
    d.line(P((40, 32), (44, 39)), fill=dark, width=1 * S + 2)
    d.line(P((20, 35), (17, 29)), fill=dark, width=1 * S)
    return img.resize((64, 64), Image.LANCZOS)


def dug():
    img, d = canvas()
    rnd = random.Random(7)
    d.ellipse(B(14, 28, 50, 48), fill=(78, 52, 32, 200))
    d.ellipse(B(18, 30, 46, 44), fill=(98, 66, 40, 220))
    for _ in range(26):
        x = rnd.uniform(16, 48)
        y = rnd.uniform(28, 46)
        r = rnd.uniform(1, 2.6)
        c = rnd.choice([(120, 84, 52, 230), (70, 46, 28, 230), (140, 100, 64, 220)])
        d.ellipse(B(x - r, y - r, x + r, y + r), fill=c)
    return img.resize((64, 64), Image.LANCZOS)


def main():
    crack().save(os.path.join(OUT, 'crack.png'))
    dug().save(os.path.join(OUT, 'dug.png'))
    print('ok')


if __name__ == '__main__':
    main()
