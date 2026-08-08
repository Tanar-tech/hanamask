"""hanamask のアプリアイコンを生成する。

外部ライブラリを使わず、PNG（zlib）とICOのバイト列を標準ライブラリだけで組み立てる。
意匠: 承認済みのデザイントークンに合わせ、利用者＝アクア／エージェント＝ピンクの
2色が重なる形。アプリの中心にある「ふたりで使う」という考え方をそのまま図にする。
"""
import struct, zlib, math

AQUA = (0x00, 0xB3, 0xC8)
PINK = (0xFF, 0x3D, 0x8B)
PAPER = (0xF7, 0xF9, 0xFB)
DEEP = (0x10, 0x13, 0x1C)

def blend(dst, src, a):
    return tuple(round(d + (s - d) * a) for d, s in zip(dst, src))

def render(size):
    px = [[DEEP if False else PAPER for _ in range(size)] for _ in range(size)]
    alpha = [[0 for _ in range(size)] for _ in range(size)]
    r_out = size * 0.46
    cx = cy = (size - 1) / 2
    # 角丸の地
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - cx, y - cy)
            cover = max(0.0, min(1.0, (r_out - d) + 0.5))
            if cover > 0:
                alpha[y][x] = round(255 * cover)
    # 2つの円が重なる意匠（左=アクア、右=ピンク）
    r = size * 0.20
    offs = size * 0.115
    for y in range(size):
        for x in range(size):
            if alpha[y][x] == 0:
                continue
            da = math.hypot(x - (cx - offs), y - cy)
            dp = math.hypot(x - (cx + offs), y - cy)
            ca = max(0.0, min(1.0, (r - da) + 0.5))
            cp = max(0.0, min(1.0, (r - dp) + 0.5))
            if ca > 0:
                px[y][x] = blend(px[y][x], AQUA, ca * 0.9)
            if cp > 0:
                # 重なった部分は濃くなる（ふたりが同じものに触れている）
                px[y][x] = blend(px[y][x], PINK, cp * 0.9)
    return px, alpha

def png_bytes(size):
    px, alpha = render(size)
    raw = b"".join(
        b"\x00" + b"".join(bytes(px[y][x]) + bytes([alpha[y][x]]) for x in range(size))
        for y in range(size)
    )
    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b""))

sizes = [16, 24, 32, 48, 64, 128, 256]
images = [png_bytes(s) for s in sizes]
header = struct.pack("<HHH", 0, 1, len(images))
offset = 6 + 16 * len(images)
entries, blob = b"", b""
for s, img in zip(sizes, images):
    entries += struct.pack("<BBBBHHII", s if s < 256 else 0, s if s < 256 else 0, 0, 0, 1, 32, len(img), offset)
    offset += len(img)
    blob += img
open("build/icon.ico", "wb").write(header + entries + blob)
open("build/icon.png", "wb").write(images[-1])
print("生成:", sizes)
