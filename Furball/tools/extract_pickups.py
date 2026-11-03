"""Gera public/assets/pickups.png (frames de 48x48) com os coletáveis de inventário.

Ordem dos frames: 0 moeda, 1 bomba, 2 chave prateada, 3 chave dourada,
4 coração, 5 meio coração, 6 coração azul (escudo).
Moeda, bomba e chave vêm da folha 4; a chave dourada é a prateada recolorida.
"""
from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SHEET4 = ROOT / "art/references/sheet-04-salas-ui.webp"
OUT = ROOT / "public/assets/pickups.png"
FS = 48
FIT = 40

CROPS = {
    "coin": (1353, 26, 1394, 75),
    "bomb": (1282, 18, 1341, 76),
    "key": (1419, 22, 1453, 77),
}


def crop(box) -> Image.Image:
    img = np.array(Image.open(SHEET4).convert("RGBA").crop(box))
    img[img[:, :, 3] < 40] = 0
    return Image.fromarray(img)


def to_gold(img: Image.Image) -> Image.Image:
    """Troca o cinza da chave por dourado, mantendo o contorno escuro."""
    a = np.array(img).astype(float)
    lum = a[:, :, :3].mean(axis=2)
    dark = np.array([120, 70, 10], float)
    light = np.array([255, 225, 110], float)
    t = np.clip((lum - 45) / 180, 0, 1)[..., None]
    gold = dark + (light - dark) * t
    body = (lum > 45) & (a[:, :, 3] > 0)
    a[body, :3] = gold[body]
    return Image.fromarray(a.astype(np.uint8))


def fit(img: Image.Image) -> Image.Image:
    img = img.crop(img.getbbox())
    k = FIT / max(img.size)
    img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
    frame = Image.new("RGBA", (FS, FS), (0, 0, 0, 0))
    frame.alpha_composite(img, ((FS - img.width) // 2, FS - img.height - 3))
    return frame


key = crop(CROPS["key"])
frames = [crop(CROPS["coin"]), crop(CROPS["bomb"]), key, to_gold(key)]
sheet = Image.new("RGBA", (FS * len(frames), FS), (0, 0, 0, 0))
for i, f in enumerate(frames):
    sheet.alpha_composite(fit(f), (i * FS, 0))
sheet.save(OUT)
print("salvo", OUT, sheet.size)

# ---------- Corações no chão (frames 4, 5, 6) ----------
# Vêm de hearts.png (gere antes com tools/extract_ui.py): cheio, metade e azul.
HEARTS = ROOT / "public/assets/hearts.png"
hearts = Image.open(HEARTS).convert("RGBA")
HW, HH = 32, 30


def heart_frame(i: int) -> Image.Image:
    return hearts.crop((i * HW, 0, (i + 1) * HW, HH))


FIT = 34  # corações no chão um pouco menores que as moedas
def half_heart() -> Image.Image:
    """Metade esquerda do coração, com contorno escuro no corte."""
    h = np.array(heart_frame(0).crop((0, 0, 16, HH)))
    rows = h[:, 13, 3] > 0
    h[rows, 14:16] = (20, 10, 12, 255)
    return Image.fromarray(h)


extra = [heart_frame(0), half_heart(), heart_frame(3)]
sheet2 = Image.new("RGBA", (FS * (len(frames) + len(extra)), FS), (0, 0, 0, 0))
sheet2.alpha_composite(sheet, (0, 0))
for i, f in enumerate(extra):
    sheet2.alpha_composite(fit(f), ((len(frames) + i) * FS, 0))
sheet2.save(OUT)
print("salvo", OUT, sheet2.size)
