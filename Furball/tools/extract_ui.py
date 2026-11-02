"""Recorta os corações do HUD (folha 2) e gera public/assets/hearts.png.

Frames: 0 = coração cheio, 1 = coração vazio.
"""
from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art/references/sheet-02-animacoes-mapa.webp"
OUT = ROOT / "public/assets/hearts.png"

BOXES = [(110, 466, 142, 496), (245, 466, 277, 496)]
FW, FH = 32, 30

sheet = Image.open(SRC).convert("RGBA")
out = Image.new("RGBA", (FW * len(BOXES), FH), (0, 0, 0, 0))
for i, box in enumerate(BOXES):
    frame = np.array(sheet.crop(box))
    frame[frame[:, :, 3] < 60] = 0
    img = Image.fromarray(frame)
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
