"""Gera os elementos das salas e o baú comum.

  rock.png (64x64)    pedra (folha 3)
  rubble.png (64x64)  restos da pedra depois da bomba (folha 3)
  chair.png (64x80)   cadeira de madeira vista de cima/frente (desenhada)
  table.png (128x96)  mesa de madeira de 2 tiles (desenhada)
  chest_wood.png      baú comum (sem chave): o baú dourado recolorido em madeira, 2 frames de 80x80
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import colorsys
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public/assets"
SHEET3 = ROOT / "art/references/sheet-03-inimigos-tiles.webp"
OUTLINE = (24, 14, 12, 255)
S = 4


def crop(box):
    a = np.array(Image.open(SHEET3).convert("RGBA").crop(box))
    a[a[:, :, 3] < 40] = 0
    return Image.fromarray(a)


def fit_into(img, w, h, max_w, max_h):
    k = min(max_w / img.width, max_h / img.height)
    img = img.resize((round(img.width * k), round(img.height * k)), Image.LANCZOS)
    frame = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    frame.alpha_composite(img, ((w - img.width) // 2, h - img.height - 2))
    return frame


def outlined(img, width):
    alpha = img.getchannel("A").point(lambda a: 255 if a > 0 else 0)
    grown = alpha.filter(ImageFilter.MaxFilter(width * 2 + 1))
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(Image.new("RGBA", img.size, OUTLINE), (0, 0), grown)
    out.alpha_composite(img)
    return out


# ---------- Pedras ----------
fit_into(crop((344, 522, 402, 586)), 64, 64, 60, 60).save(OUT / "rock.png")
fit_into(crop((750, 529, 805, 583)), 64, 64, 46, 34).save(OUT / "rubble.png")

# ---------- Cadeira (64x80): assento + encosto, vista 3/4 de cima ----------
img = Image.new("RGBA", (64 * S, 80 * S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
wood, dark, light = (150, 96, 52, 255), (104, 64, 34, 255), (186, 128, 76, 255)
for x in (14, 46):  # pernas da frente
    d.rectangle([c * S for c in (x - 3, 56, x + 3, 74)], fill=dark)
d.rounded_rectangle([c * S for c in (10, 4, 54, 40)], radius=5 * S, fill=wood)  # encosto
for x in (20, 32, 44):
    d.rectangle([c * S for c in (x - 2, 10, x + 2, 34)], fill=dark)
d.rounded_rectangle([c * S for c in (6, 36, 58, 62)], radius=6 * S, fill=light)  # assento
d.rectangle([c * S for c in (10, 40, 54, 44)], fill=(214, 160, 104, 255))
outlined(img, 3 * S).resize((64, 80), Image.LANCZOS).save(OUT / "chair.png")

# ---------- Mesa (128x96): tampo grande + pernas ----------
img = Image.new("RGBA", (128 * S, 96 * S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
for x in (14, 114):
    d.rectangle([c * S for c in (x - 5, 58, x + 5, 92)], fill=dark)
d.rounded_rectangle([c * S for c in (4, 18, 124, 66)], radius=6 * S, fill=wood)  # tampo
d.rounded_rectangle([c * S for c in (4, 58, 124, 72)], radius=4 * S, fill=dark)  # borda da frente
for y in (30, 44):
    d.line([c * S for c in (10, y, 118, y)], fill=(130, 82, 44, 255), width=2 * S)
d.rectangle([c * S for c in (10, 22, 118, 25)], fill=light)
# toalhinha e uma xícara em cima
d.rounded_rectangle([c * S for c in (44, 26, 84, 54)], radius=3 * S, fill=(236, 226, 206, 255))
d.ellipse([c * S for c in (56, 30, 72, 44)], fill=(240, 240, 236, 255))
d.ellipse([c * S for c in (59, 33, 69, 41)], fill=(110, 70, 40, 255))
outlined(img, 3 * S).resize((128, 96), Image.LANCZOS).save(OUT / "table.png")

# ---------- Baú comum: o dourado com o metal virando ferro e a madeira mais clara ----------
gold = np.array(Image.open(OUT / "chest.png").convert("RGBA")).astype(float) / 255
out = gold.copy()
for y in range(gold.shape[0]):
    for x in range(gold.shape[1]):
        r, g, b, a = gold[y, x]
        if a == 0:
            continue
        h, s, v = colorsys.rgb_to_hsv(r, g, b)
        if 0.10 < h < 0.19 and s > 0.45 and v > 0.45:  # dourado -> ferro
            r, g, b = colorsys.hsv_to_rgb(0.08, 0.10, v * 0.75)
        elif h < 0.10 and v > 0.2:  # madeira avermelhada -> madeira clara
            r, g, b = colorsys.hsv_to_rgb(0.075, min(s, 0.55), min(v * 1.15, 1))
        out[y, x] = (r, g, b, a)
Image.fromarray((out * 255).astype(np.uint8)).save(OUT / "chest_wood.png")
print("salvo rock, rubble, chair, table, chest_wood")


# ---------- Cadeira e mesa destruídas (destroços no chão, dá para passar por cima) ----------
def debris(w, h, planks, seed):
    rng = np.random.default_rng(seed)
    img = Image.new("RGBA", (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # mancha de poeira/queimado embaixo
    d.ellipse([c * S for c in (4, h - 30, w - 4, h - 4)], fill=(40, 26, 18, 120))
    for length, thick, cx, cy, ang in planks:
        tile = Image.new("RGBA", (length * S, thick * S), (0, 0, 0, 0))
        td = ImageDraw.Draw(tile)
        td.rounded_rectangle([0, 0, length * S - 1, thick * S - 1], radius=2 * S, fill=wood)
        td.line([S, thick * S // 2, length * S - S, thick * S // 2], fill=dark, width=S)
        # ponta lascada
        td.polygon([(length * S - 4 * S, 0), (length * S, thick * S // 2), (length * S - 4 * S, thick * S)], fill=(0, 0, 0, 0))
        tile = tile.rotate(ang, expand=True, resample=Image.BICUBIC)
        img.alpha_composite(tile, (int(cx * S - tile.width / 2), int(cy * S - tile.height / 2)))
    # lascas
    for _ in range(8):
        x, y = rng.integers(8, w - 8), rng.integers(h - 28, h - 8)
        d.rectangle([c * S for c in (x, y, x + 3, y + 2)], fill=light)
    return outlined(img, 2 * S).resize((w, h), Image.LANCZOS)


debris(64, 80, [(30, 7, 24, 62, 25), (26, 6, 40, 66, -35), (20, 5, 32, 56, 80), (16, 5, 46, 58, 10)], 1).save(OUT / "chair_broken.png")
debris(128, 96, [(56, 10, 40, 74, 12), (50, 10, 84, 80, -18), (30, 7, 64, 64, 70), (24, 6, 104, 70, 35),
                 (26, 6, 22, 82, -50)], 2).save(OUT / "table_broken.png")
print("salvo chair_broken, table_broken")
