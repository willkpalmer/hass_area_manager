"""Generate the 'Area Manager' icon: a glossy tile with a floor plan of
three rooms, one highlighted, and a map pin on it.

Run with Pillow installed; writes custom_components/area_manager/brand/
icon.png (256x256) and icon@2x.png (512x512), per Home Assistant's brand
image spec: https://developers.home-assistant.io/docs/core/integration/brand_images
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

BRAND_DIR = (
    Path(__file__).resolve().parent.parent
    / "custom_components" / "area_manager" / "brand"
)

S = 512

NAVY_DARK = (16, 38, 68, 255)
BLUE_LIGHT = (86, 150, 210, 255)
PAPER = (248, 245, 236, 255)
WALL = (60, 72, 88, 255)
GREEN = (76, 175, 80, 255)
GREEN_LIGHT = (200, 230, 201, 255)
RED = (199, 62, 62, 255)


def tile() -> Image.Image:
    # Diagonal, light top-left to dark bottom-right: rotate a gradient
    # twice the size and crop the middle, so no corner is left unfilled.
    big = Image.linear_gradient("L").resize((S * 2, S * 2)).rotate(45)
    grad = big.crop((S // 2, S // 2, S // 2 + S, S // 2 + S))
    base = Image.composite(
        Image.new("RGBA", (S, S), NAVY_DARK), Image.new("RGBA", (S, S), BLUE_LIGHT), grad
    )
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle((16, 16, S - 16, S - 16), radius=96, fill=255)
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    out.paste(base, (0, 0), mask)
    # Gloss on the top half.
    gloss = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(gloss).rounded_rectangle((40, 32, S - 40, S // 2), radius=80, fill=(255, 255, 255, 38))
    return Image.alpha_composite(out, gloss)


def plan(img: Image.Image) -> None:
    # Shadow under the sheet.
    shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rectangle((104, 124, 416, 420), fill=(0, 0, 0, 110))
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(12)))
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = 96, 108, 416, 404
    d.rectangle((x0, y0, x1, y1), fill=PAPER)
    # The highlighted room (top right).
    d.rectangle((272, y0, x1, 250), fill=GREEN_LIGHT)
    w = 12
    d.rectangle((x0, y0, x1, y1), outline=WALL, width=w)
    # Inner walls, with door gaps.
    d.rectangle((266, y0, 266 + w, 190), fill=WALL)
    d.rectangle((266, 226, 266 + w, y1), fill=WALL)
    d.rectangle((272, 244, 330, 244 + w), fill=WALL)
    d.rectangle((370, 244, x1, 244 + w), fill=WALL)
    d.rectangle((x0, 280, 170, 280 + w), fill=WALL)
    d.rectangle((210, 280, 266, 280 + w), fill=WALL)
    # Map pin in the highlighted room.
    cx, cy, r = 344, 168, 34
    d.ellipse((cx - r, cy - r - 30, cx + r, cy + r - 30), fill=RED)
    d.polygon([(cx - r + 4, cy - 18), (cx + r - 4, cy - 18), (cx, cy + 44)], fill=RED)
    d.ellipse((cx - 13, cy - 43, cx + 13, cy - 17), fill=PAPER)


def main() -> None:
    img = tile()
    plan(img)
    BRAND_DIR.mkdir(parents=True, exist_ok=True)
    img.save(BRAND_DIR / "icon@2x.png")
    img.resize((256, 256), Image.LANCZOS).save(BRAND_DIR / "icon.png")


if __name__ == "__main__":
    main()
