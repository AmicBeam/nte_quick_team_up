# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2025 AmicBeam
import json
import random
import subprocess
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_from_directory

app = Flask(__name__)
app.config["TEMPLATES_AUTO_RELOAD"] = True
app.jinja_env.auto_reload = True

STATIC_DIR = Path(app.root_path) / "static"
WORKBOOK_PATH = STATIC_DIR / "workbooks" / "异环云配队.xlsx"
CALCULATE_SCRIPT = Path(app.root_path) / "scripts" / "cloud_team_calculate.mjs"

MAIN_CANDIDATES = [
    {"id": "bohe", "name": "薄荷", "image": "薄荷.png", "elem": "灵"},
    {"id": "yi", "name": "翳", "image": "翳.png", "elem": "相"},
    {"id": "baicang", "name": "白藏", "image": "白藏.png", "elem": "咒"},
    {"id": "nanali", "name": "娜娜莉", "image": "娜娜莉.png", "elem": "灵"},
    {"id": "xiaozhi", "name": "小吱", "image": "小吱.png", "elem": "光"},
    {"id": "anhunqu0", "name": "安魂曲（0觉）", "image": "安魂曲.png", "elem": "暗"},
    {"id": "anhunqu1", "name": "安魂曲（1觉）", "image": "安魂曲.png", "elem": "暗"},
]

TEAMMATES = [
    {"id": "zhujue", "name": "主角", "image": "男主.png", "elem": "光"},
    {"id": "xun", "name": "浔", "image": "浔.png", "elem": "光"},
    {"id": "aidejia", "name": "埃德嘉", "image": "埃德嘉.png", "elem": "光"},
    {"id": "jiuyuan", "name": "九原", "image": "九原.png", "elem": "灵"},
    {"id": "boheT", "name": "薄荷", "image": "薄荷.png", "elem": "灵"},
    {"id": "nanaliT", "name": "娜娜莉", "image": "娜娜莉.png", "elem": "灵"},
    {"id": "zaowu", "name": "早雾", "image": "早雾.png", "elem": "咒"},
    {"id": "adele", "name": "阿德勒", "image": "阿德勒.png", "elem": "咒"},
    {"id": "anhunquT1", "name": "安魂曲（1觉）", "image": "安魂曲.png", "elem": "暗"},
    {"id": "dafutier0", "name": "达芙蒂尔（0觉）", "image": "达芙蒂尔.png", "elem": "暗"},
    {"id": "dafutier1", "name": "达芙蒂尔（1觉）", "image": "达芙蒂尔.png", "elem": "暗"},
    {"id": "fatiya", "name": "法帝娅", "image": "法帝娅.png", "elem": "魂"},
    {"id": "haniya", "name": "哈尼娅", "image": "哈尼娅.png", "elem": "魂"},
    {"id": "hasuoer", "name": "哈索尔", "image": "哈索尔.png", "elem": "相"},
]

@app.route("/")
def home():
    return preteam()

@app.route("/preteam")
def preteam():
    teammates = []
    for item in TEAMMATES:
        if item["id"] == "zhujue":
            teammates.append({**item, "image": random.choice(["男主.png", "女主.png"])})
        else:
            teammates.append(item)
    return render_template("main.html", main_candidates=MAIN_CANDIDATES, teammates=teammates)

@app.route("/cloud-team")
def cloud_team():
    return render_template("cloud_team.html")

@app.route("/cloud-gear")
def cloud_gear():
    return render_template("cloud_gear.html")

@app.route("/cloud-avatar")
def cloud_avatar():
    name = (request.args.get("name") or "").strip()
    if not name:
        return send_from_directory(STATIC_DIR, "单位.jpg")
    if name == "主角":
        filename = "男主.png"
        if (STATIC_DIR / filename).exists():
            return send_from_directory(STATIC_DIR, filename)
        return send_from_directory(STATIC_DIR, "单位.jpg")
    normalized = name.split("（", 1)[0].split("(", 1)[0].strip()
    for item in TEAMMATES + MAIN_CANDIDATES:
        if item.get("name") in (name, normalized):
            filename = item.get("image")
            if filename and (STATIC_DIR / filename).exists():
                return send_from_directory(STATIC_DIR, filename)
    for cand in (f"{name}.png", f"{normalized}.png", "单位.jpg"):
        if (STATIC_DIR / cand).exists():
            return send_from_directory(STATIC_DIR, cand)
    return send_from_directory(STATIC_DIR, "单位.jpg")

@app.route("/api/cloud-team/calculate", methods=["POST"])
def cloud_team_calculate():
    payload = request.get_json(silent=True)
    if payload is None:
        return jsonify({"error": "Request body must be valid JSON"}), 400
    if not WORKBOOK_PATH.exists():
        return jsonify({"error": f"Workbook not found: {WORKBOOK_PATH}"}), 503

    proc = subprocess.run(
        ["node", str(CALCULATE_SCRIPT)],
        input=json.dumps(payload, ensure_ascii=False),
        text=True,
        capture_output=True,
        cwd=app.root_path,
    )
    if proc.returncode != 0:
        return jsonify({
            "error": "Failed to calculate cloud team results",
            "detail": (proc.stderr or proc.stdout or "").strip(),
        }), 500

    try:
        result = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return jsonify({
            "error": "Calculation returned invalid JSON",
            "detail": proc.stdout.strip()[:2000],
        }), 500
    return jsonify(result)

# 启动Flask应用
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=80, debug=True)
