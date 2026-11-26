"""Draw the four sample site photos used by the demo's photo review.

They are drawings, not photographs, and each says so in the corner, so nobody mistakes
them for evidence. Run: python scripts/render_sample_site_photos.py
"""

import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path(__file__).resolve().parents[1] / "frontend" / "public" / "demo"
W, H = 1200, 900
GROUND = 620


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for p in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ):
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()


def scene(seed: int) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    rnd = random.Random(seed)
    im = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(im)
    for y in range(GROUND):  # morning sky
        t = y / GROUND
        d.line([(0, y), (W, y)], fill=(int(168 + 60 * t), int(198 + 40 * t), int(224 + 14 * t)))
    d.polygon(
        [
            (0, 560),
            (180, 470),
            (360, 540),
            (560, 455),
            (760, 530),
            (980, 470),
            (1200, 540),
            (1200, GROUND),
            (0, GROUND),
        ],
        fill=(122, 140, 104),
    )
    for x in (90, 1040, 1130):  # coconut palms
        d.line([(x, GROUND), (x + 14, 380)], fill=(98, 78, 56), width=12)
        for dx, dy in ((-90, 30), (90, 20), (-60, -30), (70, -40), (0, -60)):
            d.line([(x + 14, 380), (x + 14 + dx, 380 + dy)], fill=(58, 96, 52), width=9)
    for y in range(GROUND, H):  # red laterite soil
        t = (y - GROUND) / (H - GROUND)
        d.line([(0, y), (W, y)], fill=(int(176 - 30 * t), int(104 - 22 * t), int(70 - 14 * t)))
    for _ in range(900):
        x, y = rnd.randrange(W), rnd.randrange(GROUND, H)
        c = rnd.randrange(-22, 22)
        d.point((x, y), fill=(150 + c, 88 + c, 60 + c))
    return im, d


def bricks(d: ImageDraw.ImageDraw, x0: int, y0: int, x1: int, y1: int, rnd: random.Random) -> None:
    bh, bw = 22, 60
    for row, y in enumerate(range(y1 - bh, y0 - 1, -bh)):
        off = (row % 2) * bw // 2
        for x in range(x0 - off, x1, bw):
            a, b = max(x, x0), min(x + bw - 3, x1)
            if b <= a:
                continue
            c = rnd.randrange(-14, 14)
            d.rectangle([a, y, b, y + bh - 3], fill=(178 + c, 92 + c, 62 + c))
        d.line([(x0, y + bh - 2), (x1, y + bh - 2)], fill=(206, 196, 178), width=2)


def plinth(d: ImageDraw.ImageDraw, rnd: random.Random) -> None:
    d.polygon([(260, 650), (940, 650), (980, 700), (220, 700)], fill=(126, 120, 112))
    for _ in range(260):
        x, y = rnd.randrange(230, 970), rnd.randrange(652, 698)
        d.ellipse([x, y, x + 9, y + 6], fill=(96 + rnd.randrange(30),) * 3)
    d.rectangle([262, 630, 938, 652], fill=(168, 162, 150))
    for x in range(280, 940, 85):  # column rebar left for the walls
        d.line([(x, 632), (x, 470)], fill=(70, 62, 58), width=4)
        d.line([(x + 8, 632), (x + 8, 470)], fill=(70, 62, 58), width=4)
    d.rectangle([1000, 640, 1090, 700], fill=(200, 196, 188))  # cement bags
    d.rectangle([1010, 600, 1080, 640], fill=(212, 208, 198))


def walls(d: ImageDraw.ImageDraw, rnd: random.Random, scaffold: bool = True) -> None:
    d.rectangle([250, 620, 950, 660], fill=(150, 144, 134))
    bricks(d, 270, 360, 930, 620, rnd)
    d.rectangle([540, 450, 640, 620], fill=(70, 54, 44))  # door opening
    for x in (340, 760):
        d.rectangle([x, 440, x + 100, 530], fill=(64, 50, 42))
    d.rectangle([262, 410, 938, 432], fill=(176, 172, 162))  # lintel band
    if scaffold:
        for x in (230, 960):  # bamboo scaffold
            d.line([(x, 660), (x, 330)], fill=(150, 118, 70), width=8)
        d.line([(230, 480), (960, 480)], fill=(150, 118, 70), width=6)


def roof(d: ImageDraw.ImageDraw) -> None:
    d.rectangle([236, 330, 964, 362], fill=(170, 166, 156))  # RCC slab
    d.polygon([(220, 334), (600, 170), (980, 334)], fill=(170, 74, 48))
    for i in range(1, 9):
        y = 334 - i * 18
        span = (334 - y) * 380 / 164
        d.line([(600 - (380 - span), y), (600 + (380 - span), y)], fill=(140, 58, 38), width=3)


def finish(d: ImageDraw.ImageDraw) -> None:
    d.rectangle([270, 360, 930, 620], fill=(238, 222, 186))  # plastered and painted
    d.rectangle([250, 600, 950, 660], fill=(132, 64, 52))
    d.rectangle([548, 452, 632, 620], fill=(46, 82, 58))
    d.ellipse([614, 532, 624, 542], fill=(200, 170, 80))
    for x in (340, 760):
        d.rectangle([x, 440, x + 100, 530], fill=(46, 82, 58))
        d.line([(x + 50, 440), (x + 50, 530)], fill=(238, 222, 186), width=4)
    d.rectangle([520, 380, 680, 412], fill=(255, 250, 240))  # name board
    d.text((532, 384), "PMAY-G", fill=(40, 40, 40), font=font(24))
    for x in range(560, 650, 14):  # mango-leaf toran over the door
        d.polygon([(x, 448), (x + 7, 470), (x + 14, 448)], fill=(70, 120, 50))


def label(im: Image.Image, stage: str) -> Image.Image:
    im = im.filter(ImageFilter.GaussianBlur(0.6))
    d = ImageDraw.Draw(im, "RGBA")
    text = f"SAMPLE · drawn, not a photo · {stage}"
    d.rectangle([0, 0, int(d.textlength(text, font=font(22))) + 40, 58], fill=(34, 33, 30, 215))
    d.text((20, 15), text, fill=(244, 239, 228), font=font(22))
    return im


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for seed, (code, stage, layers) in enumerate(
        [
            ("plinth", "Plinth", [plinth]),
            ("walls", "Walls to lintel", [walls]),
            ("roof", "Roof", [walls, roof]),
            ("finishing", "Finishing and keys", [lambda d, r: walls(d, r, scaffold=False), roof, finish]),
        ]
    ):
        rnd = random.Random(seed)
        im, d = scene(seed)
        for f in layers:
            f(d) if f in (roof, finish) else f(d, rnd)
        label(im, stage).save(OUT / f"site-{code}.jpg", quality=82, optimize=True, progressive=True)
        print("wrote", OUT / f"site-{code}.jpg")


if __name__ == "__main__":
    main()
