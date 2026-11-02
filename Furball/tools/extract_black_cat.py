"""Recorta as 4 poses do gato preto (folha 2) e gera public/assets/cat_black.png.

Ordem dos frames: 0 = frente (baixo), 1 = costas (cima), 2 = esquerda, 3 = direita.
"""
from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art/references/sheet-02-animacoes-mapa.webp"
OUT = ROOT / "public/assets/cat_black.png"

# Caixas (x0, y0, x1, y1) detectadas pelo canal alfa da folha.
BOXES = [(29, 30, 101, 118), (118, 30, 186, 118), (206, 27, 265, 117), (285, 30, 347, 117)]
FW, FH = 80, 96

sheet = Image.open(SRC).convert("RGBA")
out = Image.new("RGBA", (FW * len(BOXES), FH), (0, 0, 0, 0))
for i, box in enumerate(BOXES):
    frame = np.array(sheet.crop(box))
    frame[frame[:, :, 3] < 40] = 0  # limpa o halo semitransparente
    img = Image.fromarray(frame)
    x = i * FW + (FW - img.width) // 2
    y = FH - img.height - 2  # alinhado pelos pés
    out.paste(img, (x, y), img)
out.save(OUT)
print("salvo", OUT, out.size)
