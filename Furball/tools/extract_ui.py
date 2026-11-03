"""Gera os sprites de interface: corações do HUD (folha 2) e o baú (folha 4).

hearts.png, frames de 32x30:
  0 = coração vermelho cheio, 1 = vazio, 2 = metade vermelha,
  3 = coração azul (escudo) cheio, 4 = metade azul.
"""
from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art/references/sheet-02-animacoes-mapa.webp"
OUT = ROOT / "public/assets/hearts.png"

BOXES = [(110, 466, 142, 496), (245, 466, 277, 496)]  # cheio, vazio
FW, FH = 32, 30
HALF_X = 16  # onde o coração é cortado ao meio

sheet = Image.open(SRC).convert("RGBA")


def crop(box) -> Image.Image:
    frame = np.array(sheet.crop(box))
    frame[frame[:, :, 3] < 60] = 0
    return Image.fromarray(frame)


def to_blue(img: Image.Image) -> Image.Image:
    """Troca o vermelho por azul escuro, mantendo o contorno e o brilho."""
    a = np.array(img).astype(float)
    bright = a[:, :, :3].max(axis=2)
    t = np.clip((bright - 60) / 195, 0, 1)[..., None]
    dark = np.array([8, 12, 45], float)
    light = np.array([45, 70, 155], float)
    blue = dark + (light - dark) * t
    body = (bright > 60) & (a[:, :, 3] > 0)
    a[body, :3] = blue[body]
    return Image.fromarray(a.astype(np.uint8))


def left_half(img: Image.Image, edge: bool = False) -> Image.Image:
    """Metade esquerda do coração. Com `edge`, fecha o corte com contorno escuro."""
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(img.crop((0, 0, HALF_X, img.height)), (0, 0))
    if edge:
        a = np.array(out)
        rows = a[:, HALF_X - 3, 3] > 0
        a[rows, HALF_X - 2 : HALF_X] = (20, 10, 12, 255)
        out = Image.fromarray(a)
    return out


full, empty = crop(BOXES[0]), crop(BOXES[1])
half = empty.copy()
half.alpha_composite(left_half(full))
blue = to_blue(full)
frames = [full, empty, half, blue, left_half(blue, edge=True)]

out = Image.new("RGBA", (FW * len(frames), FH), (0, 0, 0, 0))
for i, img in enumerate(frames):
    out.paste(img, (i * FW, 0), img)
out.save(OUT)
print("salvo", OUT, out.size)


# ---------- Baú (folha 4): frame 0 fechado, frame 1 aberto ----------
from PIL import ImageDraw, ImageEnhance  # noqa: E402

SHEET4 = ROOT / "art/references/sheet-04-salas-ui.webp"
CHEST_OUT = ROOT / "public/assets/chest.png"
CHEST_BOX = (1300, 168, 1366, 225)
LID_H = 27  # altura da tampa dentro do recorte
CF = 80  # tamanho do frame

chest = np.array(Image.open(SHEET4).convert("RGBA").crop(CHEST_BOX))
chest[chest[:, :, 3] < 40] = 0
chest = Image.fromarray(chest)
cw, ch = chest.size
lid = chest.crop((0, 0, cw, LID_H))
body = chest.crop((0, LID_H - 3, cw, ch))

frames = Image.new("RGBA", (CF * 2, CF), (0, 0, 0, 0))
ox = (CF - cw) // 2
oy = CF - ch - 2
frames.alpha_composite(chest, (ox, oy))  # fechado

# Aberto: a parte de dentro da tampa aparece atrás (madeira escura com borda dourada)
# e o interior escuro do baú aparece no topo do corpo.
opened = Image.new("RGBA", (CF, CF), (0, 0, 0, 0))
body_y = oy + LID_H - 3
d = ImageDraw.Draw(opened)
OUT = (26, 14, 10, 255)
GOLD = (214, 158, 46, 255)
WOOD = (96, 50, 28, 255)
lx0, lx1 = ox + 1, ox + cw - 2
ly0, ly1 = body_y - 24, body_y + 4
d.rounded_rectangle((lx0, ly0, lx1, ly1), radius=6, fill=OUT)
d.rounded_rectangle((lx0 + 3, ly0 + 3, lx1 - 3, ly1), radius=4, fill=GOLD)
d.rectangle((lx0 + 8, ly0 + 8, lx1 - 8, ly1), fill=WOOD)
cx = (lx0 + lx1) // 2
d.rectangle((cx - 6, ly0 + 3, cx + 6, ly1), fill=GOLD)  # faixa central
d.line((cx - 6, ly0 + 8, cx - 6, ly1), fill=OUT, width=1)
d.line((cx + 6, ly0 + 8, cx + 6, ly1), fill=OUT, width=1)
opened.alpha_composite(body, (ox, body_y))
d = ImageDraw.Draw(opened)
d.rounded_rectangle((ox + 4, body_y - 1, ox + cw - 5, body_y + 10), radius=3, fill=OUT)
d.rounded_rectangle((ox + 7, body_y + 2, ox + cw - 8, body_y + 8), radius=2, fill=(52, 26, 16, 255))
frames.alpha_composite(opened, (CF, 0))
frames.save(CHEST_OUT)
print("salvo", CHEST_OUT, frames.size)
