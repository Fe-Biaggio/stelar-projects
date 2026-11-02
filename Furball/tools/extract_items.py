"""Gera public/assets/items.png (frames de 64x64) com os itens coletáveis.

Ordem dos frames: 0 lata, 1 catnip, 2 escovinha, 3 churu, 4 novelo, 5 peixe, 6 leite.
Lata, novelo, peixe e leite vêm da folha 4; catnip, escovinha e churu são desenhados aqui
no mesmo estilo (formas simples com contorno escuro grosso).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SHEET4 = ROOT / "art/references/sheet-04-salas-ui.webp"
OUT = ROOT / "public/assets/items.png"
FS = 64  # tamanho do frame
FIT = 54  # maior lado do item dentro do frame

CROPS = {
    "can": (1161, 98, 1203, 154),
    "yarn": (1378, 99, 1430, 151),
    "fish": (1072, 100, 1139, 152),
    "milk": (1455, 98, 1503, 159),
}
OUTLINE = (26, 18, 16, 255)
S = 4  # desenha em 4x e reduz


def crop(box) -> Image.Image:
    img = np.array(Image.open(SHEET4).convert("RGBA").crop(box))
    img[img[:, :, 3] < 40] = 0
    return Image.fromarray(img)


def with_outline(layer: Image.Image, width: int) -> Image.Image:
    """Adiciona contorno escuro em volta de tudo que não é transparente."""
    alpha = layer.getchannel("A").point(lambda a: 255 if a > 0 else 0)
    grown = alpha.filter(ImageFilter.MaxFilter(width * 2 + 1))
    out = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    out.paste(Image.new("RGBA", layer.size, OUTLINE), (0, 0), grown)
    out.alpha_composite(layer)
    return out


def draw_catnip() -> Image.Image:
    W = 60 * S
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.line([(30 * S, 56 * S), (30 * S, 14 * S)], fill=(70, 120, 50, 255), width=4 * S)
    leaves = [(30, 12, 0), (18, 24, -50), (42, 24, 50), (17, 40, -60), (43, 40, 60)]
    for cx, cy, ang in leaves:
        leaf = Image.new("RGBA", (W, W), (0, 0, 0, 0))
        ld = ImageDraw.Draw(leaf)
        ld.ellipse((W / 2 - 8 * S, W / 2 - 13 * S, W / 2 + 8 * S, W / 2 + 13 * S), fill=(96, 176, 72, 255))
        ld.ellipse((W / 2 - 5 * S, W / 2 - 11 * S, W / 2 + 2 * S, W / 2 + 4 * S), fill=(140, 210, 100, 255))
        ld.line([(W / 2, W / 2 - 11 * S), (W / 2, W / 2 + 11 * S)], fill=(52, 110, 44, 255), width=int(1.5 * S))
        leaf = leaf.rotate(-ang, resample=Image.BICUBIC)
        img.alpha_composite(leaf, (int(cx * S - W / 2), int(cy * S - W / 2)))
    return with_outline(img, 3 * S)


def draw_brush() -> Image.Image:
    W = 60 * S
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((25 * S, 34 * S, 35 * S, 58 * S), radius=5 * S, fill=(214, 82, 128, 255))  # cabo
    d.rounded_rectangle((27 * S, 36 * S, 30 * S, 54 * S), radius=2 * S, fill=(240, 140, 175, 255))
    d.rounded_rectangle((8 * S, 6 * S, 52 * S, 36 * S), radius=10 * S, fill=(214, 82, 128, 255))  # cabeça
    d.rounded_rectangle((12 * S, 9 * S, 48 * S, 32 * S), radius=8 * S, fill=(236, 226, 220, 255))  # base das cerdas
    for row in range(3):
        for col in range(6):
            x = (16 + col * 6) * S
            y = (13 + row * 6.5) * S
            d.ellipse((x - 1.6 * S, y - 1.6 * S, x + 1.6 * S, y + 1.6 * S), fill=(120, 110, 108, 255))
    d.rounded_rectangle((11 * S, 8 * S, 30 * S, 11 * S), radius=2 * S, fill=(245, 170, 200, 255))  # brilho
    return with_outline(img, 3 * S)


def draw_churu() -> Image.Image:
    W = 60 * S
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    body = (18 * S, 8 * S, 42 * S, 58 * S)
    d.rounded_rectangle(body, radius=5 * S, fill=(242, 178, 60, 255))
    # ponta rasgada em zigue-zague
    zig = [(18 * S, 10 * S)] + [((18 + i * 4) * S, (4 if i % 2 else 9) * S) for i in range(7)] + [(42 * S, 10 * S)]
    d.polygon(zig, fill=(242, 178, 60, 255))
    d.rectangle((18 * S, 20 * S, 42 * S, 26 * S), fill=(214, 64, 46, 255))  # faixa vermelha
    d.rounded_rectangle((22 * S, 30 * S, 38 * S, 48 * S), radius=3 * S, fill=(255, 246, 228, 255))  # rótulo
    # peixinho no rótulo
    d.ellipse((24 * S, 35 * S, 33 * S, 42 * S), fill=(90, 140, 190, 255))
    d.polygon([(33 * S, 38.5 * S), (37 * S, 35 * S), (37 * S, 42 * S)], fill=(90, 140, 190, 255))
    d.rectangle((20 * S, 12 * S, 23 * S, 54 * S), fill=(250, 210, 120, 255))  # brilho
    return with_outline(img, 3 * S)


def fit(img: Image.Image) -> Image.Image:
    bbox = img.getbbox()
    img = img.crop(bbox)
    k = FIT / max(img.size)
    img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
    frame = Image.new("RGBA", (FS, FS), (0, 0, 0, 0))
    frame.alpha_composite(img, ((FS - img.width) // 2, FS - img.height - 4))  # apoiado embaixo
    return frame


items = [crop(CROPS["can"]), draw_catnip(), draw_brush(), draw_churu(), crop(CROPS["yarn"]), crop(CROPS["fish"]), crop(CROPS["milk"])]
sheet = Image.new("RGBA", (FS * len(items), FS), (0, 0, 0, 0))
for i, it in enumerate(items):
    sheet.alpha_composite(fit(it), (i * FS, 0))
sheet.save(OUT)
print("salvo", OUT, sheet.size)
