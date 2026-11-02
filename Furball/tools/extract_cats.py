"""Recorta os gatos das folhas de referência e gera public/assets/cat_<id>.png.

Cada folha tem 7 frames de 80x96:
  0 = frente, 1 = costas, 2 = esquerda, 3 = direita
  4 = frente, 5 = esquerda, 6 = direita  (boca aberta, usados ao atirar)
De costas não se vê a boca, então o tiro para cima usa o frame 1.

Uso: python tools/extract_cats.py [--grid]   (--grid salva rostos ampliados para ajustar bocas)
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / "art/references"
OUT_DIR = ROOT / "public/assets"
FW, FH = 80, 96

SHEET2 = "sheet-02-animacoes-mapa.webp"
SHEET3 = "sheet-03-inimigos-tiles.webp"

# Para cada gato: folha, caixas (frente, costas, esquerda, direita), escala e bocas.
# Uma caixa com "flip" é espelhada (o siamês e o laranja só têm uma vista lateral útil).
# Bocas: (centro x, centro y, largura, altura) no frame de 80x96, para frente/esquerda/direita.
CATS = {
    "black": dict(
        sheet=SHEET2,
        boxes=[(29, 30, 101, 118), (118, 30, 186, 118), (206, 27, 265, 117), (285, 30, 347, 117)],
        mouths=[(40, 60, 16, 12), (17, 59, 13, 11), (63, 59, 13, 11)],
    ),
    "orange": dict(
        sheet=SHEET2,
        boxes=[(380, 31, 449, 118), (463, 31, 531, 118), (554, 30, 614, 117), ((554, 30, 614, 117), "flip")],
        mouths=[(40, 60, 16, 12), (16, 60, 13, 11), (64, 60, 13, 11)],
    ),
    "calico": dict(
        sheet=SHEET2,
        boxes=[(30, 151, 100, 241), (120, 151, 186, 240), (206, 150, 265, 239), (287, 151, 347, 239)],
        mouths=[(40, 59, 15, 11), (14, 57, 13, 10), (64, 57, 12, 10)],
    ),
    "tuxedo": dict(
        sheet=SHEET2,
        boxes=[(380, 285, 451, 381), (464, 285, 531, 381), (554, 285, 614, 379), (641, 286, 702, 379)],
        mouths=[(40, 54, 15, 11), (15, 52, 12, 10), (64, 52, 12, 10)],
    ),
    "siamese": dict(
        sheet=SHEET3,
        boxes=[(419, 15, 484, 97), (508, 15, 572, 95), ((513, 190, 568, 262), "flip"), (513, 190, 568, 262)],
        scale=1.1,
        mouths=[(40, 59, 15, 11), (16, 57, 12, 10), (64, 57, 12, 10)],
    ),
    # Inimigo de teste (não aparece na seleção).
    "gray": dict(
        sheet=SHEET2,
        boxes=[(381, 151, 450, 240), (465, 150, 531, 240), (559, 148, 618, 238), (641, 149, 701, 238)],
        mouths=[(40, 57, 15, 11), (14, 56, 12, 10), (65, 56, 12, 10)],
    ),
}

OUTLINE = (24, 10, 12, 255)
INSIDE = (70, 20, 26, 255)
TONGUE = (205, 105, 115, 255)


def build_frame(sheet: Image.Image, box, scale: float) -> Image.Image:
    flip = isinstance(box[0], tuple)
    if flip:
        box = box[0]
    frame = np.array(sheet.crop(box))
    frame[frame[:, :, 3] < 40] = 0  # limpa o halo semitransparente
    img = Image.fromarray(frame)
    if flip:
        img = ImageOps.mirror(img)
    if scale != 1:
        img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    canvas = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
    canvas.paste(img, ((FW - img.width) // 2, FH - img.height - 2), img)  # alinhado pelos pés
    return canvas


def open_mouth(frame: Image.Image, cx: float, cy: float, w: float, h: float) -> Image.Image:
    # Desenha em 4x e reduz, para a borda ficar suave como o resto da arte.
    s = 4
    big = frame.resize((FW * s, FH * s), Image.NEAREST)
    d = ImageDraw.Draw(big)
    x0, y0, x1, y1 = (cx - w / 2) * s, (cy - h / 2) * s, (cx + w / 2) * s, (cy + h / 2) * s
    d.ellipse((x0, y0, x1, y1), fill=OUTLINE)
    d.ellipse((x0 + s * 1.3, y0 + s * 1.3, x1 - s * 1.3, y1 - s * 1.3), fill=INSIDE)
    d.ellipse((cx * s - w * s * 0.26, cy * s + h * s * 0.02, cx * s + w * s * 0.26, y1 - s * 1.5), fill=TONGUE)
    small = big.resize((FW, FH), Image.LANCZOS)
    # Mantém os pixels originais fora da boca.
    mask = Image.new("L", (FW, FH), 0)
    ImageDraw.Draw(mask).ellipse((cx - w / 2 - 1, cy - h / 2 - 1, cx + w / 2 + 1, cy + h / 2 + 1), fill=255)
    return Image.composite(small, frame, mask)


def build_cat(cfg) -> Image.Image:
    sheet = Image.open(REF / cfg["sheet"]).convert("RGBA")
    frames = [build_frame(sheet, b, cfg.get("scale", 1)) for b in cfg["boxes"]]
    frames += [open_mouth(frames[src], *m) for src, m in zip((0, 2, 3), cfg["mouths"])]
    out = Image.new("RGBA", (FW * len(frames), FH), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        out.paste(f, (i * FW, 0), f)
    return out


def face_grid(sheets: dict, path: Path, z: int = 4):
    """Rostos ampliados (frames 0, 2, 3) com grade, para posicionar as bocas."""
    rows = len(sheets)
    img = Image.new("RGBA", (3 * FW * z, rows * 60 * z), (110, 75, 51, 255))
    d = ImageDraw.Draw(img)
    for r, (name, sheet) in enumerate(sheets.items()):
        for c, fi in enumerate((0, 2, 3)):
            face = sheet.crop((fi * FW, 30, fi * FW + FW, 90)).resize((FW * z, 60 * z), Image.NEAREST)
            img.alpha_composite(face, (c * FW * z, r * 60 * z))
            for x in range(0, FW, 10):
                d.line([(c * FW * z + x * z, r * 60 * z), (c * FW * z + x * z, (r + 1) * 60 * z)], fill=(0, 255, 0, 80))
                d.text((c * FW * z + x * z + 2, r * 60 * z + 2), str(x), fill=(255, 255, 0, 255))
            for y in range(0, 60, 10):
                d.line([(c * FW * z, r * 60 * z + y * z), ((c + 1) * FW * z, r * 60 * z + y * z)], fill=(0, 255, 0, 80))
                d.text((c * FW * z + 2, r * 60 * z + y * z + 2), str(y + 30), fill=(0, 255, 0, 255))
        d.text((4, r * 60 * z + 50 * z), name, fill=(255, 255, 255, 255))
    img.save(path)


if __name__ == "__main__":
    built = {}
    for name, cfg in CATS.items():
        built[name] = build_cat(cfg)
        built[name].save(OUT_DIR / f"cat_{name}.png")
        print("salvo", f"cat_{name}.png")
    if "--grid" in sys.argv:
        # Versão sem boca, para ver onde fica a boca original.
        plain = {}
        for name, cfg in CATS.items():
            sheet = Image.open(REF / cfg["sheet"]).convert("RGBA")
            frames = [build_frame(sheet, b, cfg.get("scale", 1)) for b in cfg["boxes"]]
            strip = Image.new("RGBA", (FW * 4, FH))
            for i, f in enumerate(frames):
                strip.paste(f, (i * FW, 0), f)
            plain[name] = strip
        face_grid(plain, Path(sys.argv[-1]) if sys.argv[-1].endswith(".png") else ROOT / "faces.png")
