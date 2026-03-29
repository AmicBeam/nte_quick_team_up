# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2025 AmicBeam
from flask import Flask, render_template
import random

app = Flask(__name__)
app.config["TEMPLATES_AUTO_RELOAD"] = True
app.jinja_env.auto_reload = True

MAIN_CANDIDATES = [
    {"id": "bohe", "name": "薄荷", "image": "薄荷.png"},
    {"id": "yi", "name": "翳", "image": "翳.png"},
    {"id": "baicang", "name": "白藏", "image": "白藏.png"},
    {"id": "nanali", "name": "娜娜莉", "image": "娜娜莉.png"},
    {"id": "xiaozhi", "name": "小吱", "image": "小吱.png"},
]

TEAMMATES = [
    {"id": "zhujue", "name": "主角", "image": "男主.png"},
    {"id": "aidejia", "name": "埃德嘉", "image": "埃德嘉.png"},
    {"id": "jiuyuan", "name": "九原", "image": "九原.png"},
    {"id": "zaowu", "name": "早雾", "image": "早雾.png"},
    {"id": "adele", "name": "阿德勒", "image": "阿德勒.png"},
    {"id": "dafutier", "name": "达芙蒂尔（最好1觉）", "image": "达芙蒂尔.png"},
    {"id": "fatiya", "name": "法蒂娅", "image": "法帝娅.png"},
    {"id": "haniya", "name": "哈尼娅", "image": "哈尼娅.png"},
    {"id": "hasuoer", "name": "哈索尔", "image": "哈索尔.png"},
]

@app.route("/")
def home():
    teammates = []
    for item in TEAMMATES:
        if item["id"] == "zhujue":
            teammates.append({**item, "image": random.choice(["男主.png", "女主.png"])})
        else:
            teammates.append(item)
    return render_template("main.html", main_candidates=MAIN_CANDIDATES, teammates=teammates)

# 启动Flask应用
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=80, debug=True)
