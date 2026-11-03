"""Gera public/assets/actives.png (frames de 64x64) com os itens usáveis.

Frames: 0 coleira (tira vermelha com o sininho da folha 4), 1 patinha (folha 4).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SHEET4 = ROOT / "art/references/sheet-04-salas-ui.webp"
OUT = ROOT / "public/assets/actives.png"
S = 4
FS = 64


def crop(box):
    a = np.array(Image.open(SHEET4).convert("RGBA").crop(box))
    a[a[:, :, 3] < 40] = 0
    return Image.fromarray(a)


def fit(img, size):
    img = img.crop(img.getbbox())
    k = size / max(img.size)
    return img.resize((round(img.width * k), round(img.height * k)), Image.LANCZOS)


# Coleira: anel vermelho visto de frente, com fivela e o sininho pendurado
big = Image.new("RGBA", (FS * S, FS * S), (0, 0, 0, 0))
d = ImageDraw.Draw(big)
d.ellipse([c * S for c in (6, 6, 58, 44)], outline=(24, 14, 12, 255), width=12 * S)
d.ellipse([c * S for c in (7, 7, 57, 43)], outline=(206, 40, 48, 255), width=8 * S)
d.arc([c * S for c in (9, 9, 55, 41)], 200, 320, fill=(250, 110, 110, 255), width=2 * S)
d.rounded_rectangle([c * S for c in (26, 2, 38, 14)], radius=2 * S, fill=(24, 14, 12, 255))
d.rounded_rectangle([c * S for c in (28, 4, 36, 12)], radius=2 * S, fill=(220, 200, 120, 255))
collar = big.resize((FS, FS), Image.LANCZOS)
bell = fit(crop((1229, 98, 1279, 152)), 26)
collar.alpha_composite(bell, ((FS - bell.width) // 2, FS - bell.height - 2))

paw = fit(crop((1081, 26, 1141, 80)), 54)
paw_frame = Image.new("RGBA", (FS, FS), (0, 0, 0, 0))
paw_frame.alpha_composite(paw, ((FS - paw.width) // 2, FS - paw.height - 4))

out = Image.new("RGBA", (FS * 2, FS), (0, 0, 0, 0))
out.alpha_composite(collar, (0, 0))
out.alpha_composite(paw_frame, (FS, 0))
out.save(OUT)
print("salvo", OUT)


# ---------- Capa de vampiro + 2 dentinhos (item passivo escondido): vampire.png 64x64 ----------
big = Image.new("RGBA", (FS * S, FS * S), (0, 0, 0, 0))
d = ImageDraw.Draw(big)
d.polygon([c * S for c in (6, 12, 58, 12, 50, 58, 32, 50, 14, 58)], fill=(26, 10, 14, 255))
d.polygon([c * S for c in (14, 16, 50, 16, 44, 50, 32, 44, 20, 50)], fill=(150, 18, 34, 255))
d.polygon([c * S for c in (2, 4, 22, 14, 10, 22)], fill=(26, 10, 14, 255))
d.polygon([c * S for c in (62, 4, 42, 14, 54, 22)], fill=(26, 10, 14, 255))
for x in (25, 39):  # dentinhos
    d.polygon([c * S for c in (x - 5, 22, x + 5, 22, x, 38)], fill=(250, 248, 240, 255))
alpha = big.getchannel("A").point(lambda a: 255 if a > 0 else 0).filter(ImageFilter.MaxFilter(3 * S * 2 + 1))
outlined = Image.new("RGBA", big.size, (0, 0, 0, 0))
outlined.paste(Image.new("RGBA", big.size, (24, 14, 12, 255)), (0, 0), alpha)
outlined.alpha_composite(big)
outlined.resize((FS, FS), Image.LANCZOS).save(ROOT / "public/assets/vampire.png")
print("salvo vampire.png")
