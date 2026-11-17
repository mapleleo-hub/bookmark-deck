"""生成 Chrome Web Store 宣传图：小图 440x280，marquee 1400x560。

用法：python store/build-tiles.py
依赖：Pillow，微软雅黑字体。
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "store" / "shots"
ICON = ROOT / "icons" / "icon128.png"
FONT_B = "C:/Windows/Fonts/msyhbd.ttc"
FONT_R = "C:/Windows/Fonts/msyh.ttc"

BG_TOP = (238, 242, 255)
BG_BOTTOM = (248, 250, 252)
INK = (15, 23, 42)
MUTED = (71, 85, 105)


def gradient(w, h):
    im = Image.new("RGB", (w, h), BG_TOP)
    d = ImageDraw.Draw(im)
    for y in range(h):
        t = y / max(h - 1, 1)
        c = tuple(int(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3))
        d.line([(0, y), (w, y)], fill=c)
    return im


def rounded(icon_path, size, radius):
    src = Image.open(icon_path).convert("RGBA").resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(src, (0, 0), mask)
    return out


def build_small():
    w, h = 440, 280
    im = gradient(w, h).convert("RGBA")
    d = ImageDraw.Draw(im)
    ic = rounded(ICON, 76, 20)
    im.alpha_composite(ic, (40, 48))
    f_title = ImageFont.truetype(FONT_B, 34)
    f_sub = ImageFont.truetype(FONT_R, 18)
    d.text((40, 142), "Bookmark Deck", font=f_title, fill=INK)
    d.text((40, 192), "书签本身就是新标签页", font=f_sub, fill=MUTED)
    d.text((40, 220), "一份数据，不需要同步", font=f_sub, fill=MUTED)
    im.convert("RGB").save(OUT / "promo-440x280.png", quality=95)
    print("wrote", OUT / "promo-440x280.png")


def build_marquee():
    w, h = 1400, 560
    im = gradient(w, h).convert("RGBA")
    d = ImageDraw.Draw(im)
    ic = rounded(ICON, 108, 28)
    im.alpha_composite(ic, (86, 132))
    f_title = ImageFont.truetype(FONT_B, 66)
    f_sub = ImageFont.truetype(FONT_R, 30)
    d.text((86, 272), "Bookmark Deck", font=f_title, fill=INK)
    d.text((88, 364), "书签本身就是新标签页，拖拽排序直接写回浏览器", font=f_sub, fill=MUTED)
    d.text((88, 408), "没有第二份数据，不需要同步", font=f_sub, fill=MUTED)
    im.convert("RGB").save(OUT / "promo-1400x560.png", quality=95)
    print("wrote", OUT / "promo-1400x560.png")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    build_small()
    build_marquee()
