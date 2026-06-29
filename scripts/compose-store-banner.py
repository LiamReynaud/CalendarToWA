#!/usr/bin/env python3
"""Compose Calendar → WhatsApp banner with arrow for Chrome Web Store."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = Path(
    "/Users/renaud/.cursor/projects/Users-renaud-Documents-GitHub-CalendarToWA/assets"
)
CALENDAR = ASSETS / "image-46fdf8cf-8fa1-402f-b101-80da9dfce877.png"
WHATSAPP = ASSETS / "image-b3c57c25-9476-462a-9060-191c96a1c2bd.png"
OUT_DIR = ROOT / "store" / "assets"
OUT = OUT_DIR / "calendar-to-whatsapp-flow-1280x800.png"

W, H = 1280, 800
ICON = 260
BG = (248, 249, 251)
GREEN = (37, 211, 102)
DARK = (32, 33, 36)


def load_icon(path: Path, size: int) -> Image.Image:
    img = Image.open(path).convert("RGBA")
    img.thumbnail((size, size), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ox = (size - img.width) // 2
    oy = (size - img.height) // 2
    canvas.paste(img, (ox, oy), img)
    return canvas


def draw_arrow(draw: ImageDraw.ImageDraw, x1: int, y: int, x2: int, color, width: int = 10):
    draw.line((x1, y, x2 - 28, y), fill=color, width=width)
    draw.polygon(
        [(x2, y), (x2 - 36, y - 22), (x2 - 36, y + 22)],
        fill=color,
    )


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    canvas = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(canvas)

    cal = load_icon(CALENDAR, ICON)
    wa = load_icon(WHATSAPP, ICON)

    left_x = 220
    right_x = W - 220 - ICON
    icon_y = 290

    canvas.paste(cal, (left_x, icon_y), cal)
    canvas.paste(wa, (right_x, icon_y), wa)

    arrow_y = icon_y + ICON // 2
    draw_arrow(draw, left_x + ICON + 40, arrow_y, right_x - 40, GREEN, 12)

    try:
        title_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 42)
        sub_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 28)
        label_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 22)
    except OSError:
        title_font = ImageFont.load_default()
        sub_font = title_font
        label_font = title_font

    title = "Calendar to WhatsApp"
    sub = "Génération automatique de contact"

    tb = draw.textbbox((0, 0), title, font=title_font)
    draw.text(((W - tb[2]) // 2, 80), title, fill=DARK, font=title_font)

    sb = draw.textbbox((0, 0), sub, font=sub_font)
    draw.text(((W - sb[2]) // 2, 140), sub, fill=(95, 99, 104), font=sub_font)

    cal_label = "Google Calendar"
    wa_label = "WhatsApp Web"
    clb = draw.textbbox((0, 0), cal_label, font=label_font)
    wlb = draw.textbbox((0, 0), wa_label, font=label_font)
    draw.text((left_x + (ICON - clb[2]) // 2, icon_y + ICON + 24), cal_label, fill=(95, 99, 104), font=label_font)
    draw.text((right_x + (ICON - wlb[2]) // 2, icon_y + ICON + 24), wa_label, fill=(95, 99, 104), font=label_font)

    canvas.save(OUT, "PNG", optimize=True)
    print(f"Saved: {OUT}")


if __name__ == "__main__":
    main()
