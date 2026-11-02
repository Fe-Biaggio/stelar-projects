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
