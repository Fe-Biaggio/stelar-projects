"""Gera os sprites de inimigos a partir da folha 3.

enemies.png (frames de 72x72): 0 mosca, 1 aranha, 2 bolota vermelha, 3 cabeça pálida.
boss_bat.png (160x128): morcego grande de olhos vermelhos (boss do nível 1).
"""
from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SHEET3 = ROOT / "art/references/sheet-03-inimigos-tiles.webp"
OUT = ROOT / "public/assets"

ENEMIES = [
    (20, 441, 70, 490),    # mosca
    (88, 444, 146, 478),   # aranha
    (204, 454, 251, 498),  # bolota vermelha
    (326, 439, 378, 495),  # cabeça pálida
]
BOSS = (1332, 505, 1440, 586)
FS = 72

sheet = Image.open(SHEET3).convert("RGBA")


def crop(box) -> Image.Image:
    a = np.array(sheet.crop(box))
    a[a[:, :, 3] < 40] = 0
    return Image.fromarray(a)


def place(img: Image.Image, w: int, h: int, scale: float) -> Image.Image:
    img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    frame = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    frame.alpha_composite(img, ((w - img.width) // 2, h - img.height - 2))  # apoiado embaixo
    return frame


out = Image.new("RGBA", (FS * len(ENEMIES), FS), (0, 0, 0, 0))
for i, box in enumerate(ENEMIES):
    img = crop(box)
    out.alpha_composite(place(img, FS, FS, min(1.15, (FS - 6) / max(img.size))), (i * FS, 0))
out.save(OUT / "enemies.png")

boss = crop(BOSS)
place(boss, 160, 128, 1.4).save(OUT / "boss_bat.png")
print("salvo enemies.png e boss_bat.png")
