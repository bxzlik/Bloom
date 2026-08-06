"""Рендерит Solar SVG → многоразмерные .ico для thumbnail toolbar / jump list.

Источники: solar--skip-previous-bold.svg, solar--play-bold.svg,
solar--pause-bold.svg, solar--skip-next-bold.svg
Результат: prev.ico, play.ico, pause.ico, next.ico (белый глиф, alpha).

Внешних растеризаторов (cairosvg/resvg) в проекте нет, поэтому здесь мини-парсер
SVG path (M/L/H/V/C/S/Q/T/A/Z) + заливка полигонов PIL со суперсэмплингом.

Запуск:  python src-tauri/icons/thumb/make_ico.py
"""
import math
import os
import re

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))

SOURCES = {
    "prev": "solar--skip-previous-bold.svg",
    "play": "solar--play-bold.svg",
    "pause": "solar--pause-bold.svg",
    "next": "solar--skip-next-bold.svg",
}

SIZES = [16, 20, 24, 32, 40, 48, 64]
SS = 8            # суперсэмплинг для сглаживания
MARGIN = 0.06     # отступ от края иконки, доля стороны
COLOR = (255, 255, 255)

NUM_RE = re.compile(r"[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?")
CMD_RE = re.compile(r"([MmLlHhVvCcSsQqTtAaZz])")


# --------------------------------------------------------------------------
# парсер path
# --------------------------------------------------------------------------
def tokenize(d):
    """[(cmd, [числа]), ...]"""
    out = []
    for part in filter(None, (p.strip() for p in CMD_RE.split(d))):
        if part in "MmLlHhVvCcSsQqTtAaZz":
            out.append([part, []])
        elif out:
            out[-1][1].extend(float(n) for n in NUM_RE.findall(part))
    return out


def cubic(p0, p1, p2, p3, steps):
    for i in range(1, steps + 1):
        t = i / steps
        u = 1 - t
        yield (
            u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
            u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
        )


def arc(p0, rx, ry, rot_deg, large, sweep, p1, steps):
    """Endpoint → center параметризация (SVG spec F.6.5), затем сэмплинг."""
    if rx == 0 or ry == 0 or p0 == p1:
        yield p1
        return
    rx, ry = abs(rx), abs(ry)
    phi = math.radians(rot_deg)
    cosp, sinp = math.cos(phi), math.sin(phi)
    dx2, dy2 = (p0[0] - p1[0]) / 2, (p0[1] - p1[1]) / 2
    x1p, y1p = cosp * dx2 + sinp * dy2, -sinp * dx2 + cosp * dy2

    lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
    if lam > 1:
        s = math.sqrt(lam)
        rx, ry = rx * s, ry * s

    num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
    den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
    co = math.sqrt(max(num / den, 0.0))
    if large == sweep:
        co = -co
    cxp, cyp = co * rx * y1p / ry, -co * ry * x1p / rx
    cx = cosp * cxp - sinp * cyp + (p0[0] + p1[0]) / 2
    cy = sinp * cxp + cosp * cyp + (p0[1] + p1[1]) / 2

    def ang(ux, uy, vx, vy):
        dot = ux * vx + uy * vy
        n = math.hypot(ux, uy) * math.hypot(vx, vy)
        a = math.acos(max(-1.0, min(1.0, dot / n)))
        return -a if ux * vy - uy * vx < 0 else a

    th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
    dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
    if not sweep and dth > 0:
        dth -= 2 * math.pi
    elif sweep and dth < 0:
        dth += 2 * math.pi

    for i in range(1, steps + 1):
        th = th1 + dth * i / steps
        yield (
            cx + rx * math.cos(th) * cosp - ry * math.sin(th) * sinp,
            cy + rx * math.cos(th) * sinp + ry * math.sin(th) * cosp,
        )


def parse_path(d, steps=48):
    """→ список subpath'ов, каждый = список точек (уже flat)."""
    subs, cur = [], []
    x = y = sx = sy = 0.0
    prev_ctrl = None       # для S/s
    prev_qctrl = None      # для T/t
    for cmd, a in tokenize(d):
        rel = cmd.islower()
        c = cmd.upper()
        i = 0
        if c == "Z":
            if cur:
                cur.append((sx, sy))
                subs.append(cur)
                cur = []
            x, y = sx, sy
            prev_ctrl = prev_qctrl = None
            continue
        while True:
            if c == "M":
                nx, ny = a[i] + (x if rel else 0), a[i + 1] + (y if rel else 0)
                i += 2
                if cur:
                    subs.append(cur)
                cur = [(nx, ny)]
                x, y, sx, sy = nx, ny, nx, ny
                c = "L"  # последующие пары в M трактуются как L
            elif c in ("L", "T"):
                if c == "L":
                    nx, ny = a[i] + (x if rel else 0), a[i + 1] + (y if rel else 0)
                    i += 2
                    cur.append((nx, ny))
                    x, y = nx, ny
                    prev_ctrl = prev_qctrl = None
                else:
                    qx, qy = (2 * x - prev_qctrl[0], 2 * y - prev_qctrl[1]) if prev_qctrl else (x, y)
                    nx, ny = a[i] + (x if rel else 0), a[i + 1] + (y if rel else 0)
                    i += 2
                    c1 = (x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y))
                    c2 = (nx + 2 / 3 * (qx - nx), ny + 2 / 3 * (qy - ny))
                    cur.extend(cubic((x, y), c1, c2, (nx, ny), steps))
                    prev_qctrl, prev_ctrl = (qx, qy), None
                    x, y = nx, ny
            elif c == "H":
                nx = a[i] + (x if rel else 0)
                i += 1
                cur.append((nx, y))
                x = nx
                prev_ctrl = prev_qctrl = None
            elif c == "V":
                ny = a[i] + (y if rel else 0)
                i += 1
                cur.append((x, ny))
                y = ny
                prev_ctrl = prev_qctrl = None
            elif c in ("C", "S"):
                if c == "C":
                    c1 = (a[i] + (x if rel else 0), a[i + 1] + (y if rel else 0))
                    c2 = (a[i + 2] + (x if rel else 0), a[i + 3] + (y if rel else 0))
                    nx, ny = a[i + 4] + (x if rel else 0), a[i + 5] + (y if rel else 0)
                    i += 6
                else:
                    c1 = (2 * x - prev_ctrl[0], 2 * y - prev_ctrl[1]) if prev_ctrl else (x, y)
                    c2 = (a[i] + (x if rel else 0), a[i + 1] + (y if rel else 0))
                    nx, ny = a[i + 2] + (x if rel else 0), a[i + 3] + (y if rel else 0)
                    i += 4
                cur.extend(cubic((x, y), c1, c2, (nx, ny), steps))
                prev_ctrl, prev_qctrl = c2, None
                x, y = nx, ny
            elif c == "Q":
                qx, qy = a[i] + (x if rel else 0), a[i + 1] + (y if rel else 0)
                nx, ny = a[i + 2] + (x if rel else 0), a[i + 3] + (y if rel else 0)
                i += 4
                c1 = (x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y))
                c2 = (nx + 2 / 3 * (qx - nx), ny + 2 / 3 * (qy - ny))
                cur.extend(cubic((x, y), c1, c2, (nx, ny), steps))
                prev_qctrl, prev_ctrl = (qx, qy), None
                x, y = nx, ny
            elif c == "A":
                rx, ry, rot, large, sweep = a[i], a[i + 1], a[i + 2], int(a[i + 3]), int(a[i + 4])
                nx, ny = a[i + 5] + (x if rel else 0), a[i + 6] + (y if rel else 0)
                i += 7
                cur.extend(arc((x, y), rx, ry, rot, large, sweep, (nx, ny), steps))
                prev_ctrl = prev_qctrl = None
                x, y = nx, ny
            else:
                raise ValueError(f"unsupported command {cmd}")
            if i >= len(a):
                break
    if cur:
        subs.append(cur)
    return subs


def read_svg(path):
    src = open(path, encoding="utf-8").read()
    vb = re.search(r'viewBox="([^"]+)"', src)
    vx, vy, vw, vh = (float(n) for n in re.split(r"[ ,]+", vb.group(1).strip()))
    subs = []
    for d in re.findall(r'\sd="([^"]+)"', src):
        subs.extend(parse_path(d))
    return (vx, vy, vw, vh), subs


# --------------------------------------------------------------------------
# растеризация
# --------------------------------------------------------------------------
def render(vbox, subs, size):
    vx, vy, vw, vh = vbox
    box = size * SS
    inner = box * (1 - 2 * MARGIN)
    scale = inner / max(vw, vh)
    ox = (box - vw * scale) / 2 - vx * scale
    oy = (box - vh * scale) / 2 - vy * scale

    mask = Image.new("L", (box, box), 0)
    drw = ImageDraw.Draw(mask)
    for pts in subs:
        if len(pts) < 3:
            continue
        drw.polygon([(p[0] * scale + ox, p[1] * scale + oy) for p in pts], fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)

    img = Image.new("RGBA", (size, size), COLOR + (0,))
    img.putalpha(mask)
    return img


def main():
    for name, svg in SOURCES.items():
        vbox, subs = read_svg(os.path.join(HERE, svg))
        frames = [render(vbox, subs, s) for s in SIZES]
        out = os.path.join(HERE, name + ".ico")
        frames[-1].save(out, format="ICO", sizes=[(s, s) for s in SIZES],
                        append_images=frames[:-1])
        print(f"{name}: {svg} -> {os.path.basename(out)} "
              f"[{', '.join(str(s) for s in SIZES)}] {os.path.getsize(out)} B")


if __name__ == "__main__":
    main()
