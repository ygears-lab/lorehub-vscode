import math, zlib, struct, sys

W = H = 128
SS = 4  # supersampling per axis

def hexc(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4))

def sd_round_rect(px, py, x, y, w, h, r):
    cx, cy = x + w / 2.0, y + h / 2.0
    bx, by = w / 2.0 - r, h / 2.0 - r
    qx, qy = abs(px - cx) - bx, abs(py - cy) - by
    return math.hypot(max(qx, 0.0), max(qy, 0.0)) + min(max(qx, qy), 0.0) - r

def sd_capsule(px, py, ax, ay, bx, by, r):
    pax, pay = px - ax, py - ay
    bax, bay = bx - ax, by - ay
    denom = bax * bax + bay * bay
    t = 0.0 if denom == 0 else max(0.0, min(1.0, (pax * bax + pay * bay) / denom))
    return math.hypot(pax - bax * t, pay - bay * t) - r

PROMPT = hexc('#0F766E')
shapes = [
    (hexc('#22272E'), lambda x, y: sd_round_rect(x, y, 0, 0, 128, 128, 28)),
    (hexc('#3D4652'), lambda x, y: sd_round_rect(x, y, 24, 18, 68, 82, 10)),
    (hexc('#E8EBEF'), lambda x, y: sd_round_rect(x, y, 38, 30, 70, 84, 10)),
    (hexc('#2DD4BF'), lambda x, y: max(sd_round_rect(x, y, 38, 30, 10, 84, 0),
                                       sd_round_rect(x, y, 38, 30, 70, 84, 10))),
    (PROMPT, lambda x, y: min(sd_capsule(x, y, 60, 52, 74, 64, 4.5),
                              sd_capsule(x, y, 74, 64, 60, 76, 4.5))),
    (PROMPT, lambda x, y: sd_capsule(x, y, 82, 76, 96, 76, 4.5)),
    (hexc('#9AA5B1'), lambda x, y: sd_capsule(x, y, 60, 94, 96, 94, 3.0)),
]

buf = bytearray()
step = 1.0 / SS
off = step / 2.0
for py in range(H):
    buf.append(0)
    for px in range(W):
        r = g = b = a = 0.0
        for sy in range(SS):
            fy = py + off + sy * step
            for sx in range(SS):
                fx = px + off + sx * step
                cr = cg = cb = ca = 0.0
                for color, sdf in shapes:
                    if sdf(fx, fy) < 0.0:
                        cr, cg, cb, ca = color[0], color[1], color[2], 1.0
                r += cr; g += cg; b += cb; a += ca
        n = SS * SS
        r /= n; g /= n; b /= n; a /= n
        if a > 0:
            r, g, b = r / a, g / a, b / a
        buf += bytes((int(round(max(0.0, min(1.0, v)) * 255)) for v in (r, g, b, a)))

def chunk(tag, data):
    return (struct.pack('>I', len(data)) + tag + data
            + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))

png = (b'\x89PNG\r\n\x1a\n'
       + chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 6, 0, 0, 0))
       + chunk(b'IDAT', zlib.compress(bytes(buf), 9))
       + chunk(b'IEND', b''))
open(sys.argv[1], 'wb').write(png)
print('wrote', sys.argv[1], len(png), 'bytes')
