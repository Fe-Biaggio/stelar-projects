"""Recorta o gato preto (folha 2) e gera public/assets/cat_black.png.

Frames:
  0 = frente, 1 = costas, 2 = esquerda, 3 = direita
  4 = frente, 5 = esquerda, 6 = direita  (boca aberta, usados ao atirar)
De costas não se vê a boca, então o tiro para cima usa o frame 1.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art/references/sheet-02-animacoes-mapa.webp"
OUT = ROOT / "public/assets/cat_black.png"

# Caixas (x0, y0, x1, y1) detectadas pelo canal alfa da folha.
BOXES = [(29, 30, 101, 118), (118, 30, 186, 118), (206, 27, 265, 117), (285, 30, 347, 117)]
FW, FH = 80, 96

# Boca aberta: (frame de origem, centro x, centro y, largura, altura) em coordenadas do frame.
MOUTHS = [(0, 40, 59, 13, 10), (2, 18, 59, 11, 9), (3, 62, 59, 11, 9)]

OUTLINE = (24, 10, 12, 255)
INSIDE = (70, 20, 26, 255)
TONGUE = (205, 105, 115, 255)


def build_frame(sheet: Image.Image, box) -> Image.Image:
    frame = np.array(sheet.crop(box))
    frame[frame[:, :, 3] < 40] = 0  # limpa o halo semitransparente
    img = Image.fromarray(frame)
    canvas = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
    canvas.paste(img, ((FW - img.width) // 2, FH - img.height - 2), img)  # alinhado pelos pés
    return canvas


def open_mouth(frame: Image.Image, cx: int, cy: int, w: int, h: int) -> Image.Image:
    # Desenha em 4x e reduz, para a borda ficar suave como o resto da arte.
    s = 4
    big = frame.resize((FW * s, FH * s), Image.NEAREST)
    d = ImageDraw.Draw(big)
    x0, y0, x1, y1 = (cx - w / 2) * s, (cy - h / 2) * s, (cx + w / 2) * s, (cy + h / 2) * s
    d.ellipse((x0, y0, x1, y1), fill=OUTLINE)
    d.ellipse((x0 + s * 1.2, y0 + s * 1.2, x1 - s * 1.2, y1 - s * 1.2), fill=INSIDE)
    d.ellipse((cx * s - w * s * 0.25, cy * s + h * s * 0.05, cx * s + w * s * 0.25, y1 - s * 1.4), fill=TONGUE)
    small = big.resize((FW, FH), Image.LANCZOS)
    # Mantém os pixels originais fora da boca.
    mask = Image.new("L", (FW, FH), 0)
    ImageDraw.Draw(mask).ellipse((cx - w / 2 - 1, cy - h / 2 - 1, cx + w / 2 + 1, cy + h / 2 + 1), fill=255)
    return Image.composite(small, frame, mask)


sheet = Image.open(SRC).convert("RGBA")
frames = [build_frame(sheet, b) for b in BOXES]
frames += [open_mouth(frames[i], cx, cy, w, h) for i, cx, cy, w, h in MOUTHS]

out = Image.new("RGBA", (FW * len(frames), FH), (0, 0, 0, 0))
for i, f in enumerate(frames):
    out.paste(f, (i * FW, 0), f)
out.save(OUT)
print("salvo", OUT, out.size)
