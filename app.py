# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2025 AmicBeam
from flask import Flask, render_template, make_response, send_file
import io
import struct
import zlib

app = Flask(__name__)

MAIN_CANDIDATES = [
    {"id": "bohe", "name": "薄荷", "color": (112, 196, 190)},
    {"id": "yi", "name": "翳", "color": (110, 148, 214)},
    {"id": "baicang", "name": "白藏", "color": (201, 160, 219)},
    {"id": "nanali", "name": "娜娜莉", "color": (245, 168, 189)},
    {"id": "xiaozhi", "name": "小吱", "color": (246, 198, 128)},
]

TEAMMATES = [
    {"id": "zhujue", "name": "主角", "color": (140, 206, 232)},
    {"id": "aidejia", "name": "埃德嘉", "color": (233, 164, 141)},
    {"id": "jiuyuan", "name": "九原", "color": (141, 198, 233)},
    {"id": "zaowu", "name": "早雾", "color": (188, 141, 233)},
    {"id": "adele", "name": "阿德勒", "color": (141, 233, 200)},
    {"id": "dafutier", "name": "达芙蒂尔", "color": (233, 210, 141)},
    {"id": "fatiya", "name": "法蒂娅", "color": (233, 141, 184)},
    {"id": "haniya", "name": "哈尼娅", "color": (141, 233, 158)},
    {"id": "hasuoer", "name": "哈索尔", "color": (233, 173, 141)},
]

_AVATAR_CACHE = {}
_UNIT_CACHE = None

def _png_chunk(tag, data):
    return struct.pack("!I", len(data)) + tag + data + struct.pack("!I", zlib.crc32(tag + data) & 0xFFFFFFFF)

def _build_png(width, height, pixels):
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        row_start = y * width
        for x in range(width):
            r, g, b, a = pixels[row_start + x]
            raw.extend([r, g, b, a])
    ihdr = struct.pack("!IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + _png_chunk(b"IHDR", ihdr) + _png_chunk(b"IDAT", zlib.compress(bytes(raw))) + _png_chunk(b"IEND", b"")

def _build_solid_avatar(color):
    width = 96
    height = 96
    r, g, b = color
    pixels = [(r, g, b, 255) for _ in range(width * height)]
    return _build_png(width, height, pixels)

def _build_unit_png():
    width = 64
    height = 24
    pixels = [(0, 0, 0, 0) for _ in range(width * height)]
    fg = (255, 255, 255, 255)
    def draw_rect(x0, y0, x1, y1):
        for y in range(y0, y1):
            for x in range(x0, x1):
                pixels[y * width + x] = fg
    draw_rect(10, 4, 14, 20)
    draw_rect(26, 4, 30, 20)
    draw_rect(10, 18, 30, 22)
    return _build_png(width, height, pixels)

def _cache_headers(response):
    response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return response

@app.route("/")
def home():
    return render_template("main.html", main_candidates=MAIN_CANDIDATES, teammates=TEAMMATES)

@app.route("/avatars/<avatar_id>.png")
def avatar_png(avatar_id):
    if avatar_id not in _AVATAR_CACHE:
        all_items = {item["id"]: item for item in MAIN_CANDIDATES + TEAMMATES}
        color = all_items.get(avatar_id, {"color": (180, 180, 180)})["color"]
        _AVATAR_CACHE[avatar_id] = _build_solid_avatar(color)
    data = _AVATAR_CACHE[avatar_id]
    response = make_response(send_file(io.BytesIO(data), mimetype="image/png"))
    return _cache_headers(response)

@app.route("/unit.png")
def unit_png():
    global _UNIT_CACHE
    if _UNIT_CACHE is None:
        _UNIT_CACHE = _build_unit_png()
    response = make_response(send_file(io.BytesIO(_UNIT_CACHE), mimetype="image/png"))
    return _cache_headers(response)

# 启动Flask应用
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=80, debug=True)
