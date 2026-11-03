"""Gera dist/furball.html: a página que é publicada como Artifact (link para jogar no celular).

Rode depois de `npm run build`. A página usa o mesmo JS e as mesmas imagens de dist/assets/.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"

built = (DIST / "index.html").read_text(encoding="utf-8")
script = re.search(r'src="\./(assets/index-[^"]+\.js)"', built).group(1)

page = f"""<title>Furball Roguelike</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
  /* Tela única de jogo, sempre escura (o visual do porão) */
  :root {{ --bg: #0d0b0a; --fg: #e8d9c4; --muted: #8a7a6a; color-scheme: dark; }}
  html, body {{ height: 100%; overflow: hidden; overscroll-behavior: none; }}
  body {{
    margin: 0; background: var(--bg); color: var(--fg);
    padding-left: max(16px, env(safe-area-inset-left, 0px));
    padding-right: max(16px, env(safe-area-inset-right, 0px));
    padding-block: 0; box-sizing: border-box;
    touch-action: none; -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent;
  }}
  #game {{ width: 100%; height: 100%; }}
  #rotate {{
    display: none; position: fixed; inset: 0; z-index: 10; background: var(--bg); color: var(--fg);
    font: 18px/1.5 ui-monospace, Menlo, Consolas, monospace; text-align: center;
    align-items: center; justify-content: center; flex-direction: column; gap: 8px;
    padding: 24px max(16px, env(safe-area-inset-right, 0px)) 24px max(16px, env(safe-area-inset-left, 0px));
  }}
  #rotate small {{ color: var(--muted); font-size: 14px; }}
  @media (orientation: portrait) and (pointer: coarse) {{ #rotate {{ display: flex; }} }}
</style>
<div id="game"></div>
<div id="rotate">Gire o celular para jogar na horizontal ↻<small>Furball funciona melhor deitado.</small></div>
<script type="module" src="./{script}"></script>
"""
out = DIST / "furball.html"
out.write_text(page, encoding="utf-8")
print("salvo", out, "script:", script)
