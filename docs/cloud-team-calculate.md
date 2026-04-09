# /api/cloud-team/calculate 接口说明

## 概述

该接口用于计算“云配队”结果（DPS、总伤害、各角色贡献、额外伤害等）。

- 后端：Flask 路由在 [app.py](file:///Users/bytedance/projects/nte_quick_team_up/app.py#L88-L116)
- 计算引擎：通过 Node 执行 [cloud_team_calculate.mjs](file:///Users/bytedance/projects/nte_quick_team_up/scripts/cloud_team_calculate.mjs)，加载 xlsx 与 HyperFormula，并复用前端版 [cloudWorkbook.js](file:///Users/bytedance/projects/nte_quick_team_up/static/cloud/cloudWorkbook.js) 的导入/导出逻辑

## 请求

- Method: `POST`
- Path: `/api/cloud-team/calculate`
- Content-Type: `application/json`

### Body

Body 为“云配队状态 JSON”，与前端 `CloudWorkbook.exportState()` 的输出结构一致：

- `{}`（空对象）：使用 xlsx 的默认配置执行一次 `recalc()` 后返回结果
- `{ version, workbook, slotCount, team, gear }`：先 `importState()` 写入 xlsx，再基于该状态计算并返回结果

状态字段较多，建议直接使用前端导出的 JSON 作为输入；字段绑定细节见：

- [xlsx-bindings.md](file:///Users/bytedance/projects/nte_quick_team_up/docs/xlsx-bindings.md)
- `CloudWorkbook.exportState/importState`：[cloudWorkbook.js](file:///Users/bytedance/projects/nte_quick_team_up/static/cloud/cloudWorkbook.js#L685-L820)

### 示例

```bash
curl -X POST "http://127.0.0.1:5000/api/cloud-team/calculate" \
  -H "Content-Type: application/json" \
  -d '{}'
```

或传入完整状态：

```bash
curl -X POST "http://127.0.0.1:5000/api/cloud-team/calculate" \
  -H "Content-Type: application/json" \
  -d @state.json
```

## 响应（200）

成功时返回 `CloudWorkbook.exportResults()` 的 JSON：

- 代码位置：[cloudWorkbook.js](file:///Users/bytedance/projects/nte_quick_team_up/static/cloud/cloudWorkbook.js#L656-L683)
- 结构示例（字段会随 xlsx/公式演进而变化）：

```json
{
  "summary": {
    "dps": 44946.8580879085,
    "totalDamage": 719149.729406536,
    "cumulativeTrap": 35.874167,
    "cumulativeTime": 16
  },
  "roles": [
    { "slot": 1, "name": "娜娜莉", "damage": 235058.873804607, "trap": 16.523, "energy": 76.3986, "ring": 86.5 },
    { "slot": 2, "name": "主角",   "damage": 49667.022796192,  "trap": 5.301167, "energy": 90.672534, "ring": 100 },
    { "slot": 3, "name": "阿德勒", "damage": 35076.1986541329, "trap": 8.65, "energy": 70.3594, "ring": 20.1 },
    { "slot": 4, "name": "九原",   "damage": 122780.922388374, "trap": 5.4, "energy": 140.3594, "ring": 11.802 }
  ],
  "extraDamage": [
    { "label": "创生", "value": 222831.546083888 },
    { "label": "浊燃", "value": 0 },
    { "label": "黯星", "value": 0 },
    { "label": "倾陷", "value": 53735.165679342 }
  ]
}
```

### 字段说明

- `summary.dps`：队伍 DPS
- `summary.totalDamage`：队伍总伤害
- `summary.cumulativeTrap`：累计陷阱值
- `summary.cumulativeTime`：累计时间（与轴长/循环相关）
- `roles[]`：四个出战位的贡献（名称来自 `云配队!F4:F7`），每个元素包含：
  - `slot`：1~4
  - `name`：角色名
  - `damage / trap / energy / ring`：对应贡献值
- `extraDamage[]`：额外伤害分类（固定标签：创生/浊燃/黯星/倾陷）

所有数值在导出时会经过 `serializeCellValue()` 规整（`undefined/null/NaN/Infinity` 会被转为 `null`）：

- [serializeCellValue](file:///Users/bytedance/projects/nte_quick_team_up/static/cloud/cloudWorkbook.js#L48-L59)

## 错误响应

错误时响应为 JSON，形如：

```json
{ "error": "....", "detail": "...." }
```

对应逻辑见：[app.py](file:///Users/bytedance/projects/nte_quick_team_up/app.py#L88-L116)

- `400`：请求体不是合法 JSON（`request.get_json(silent=True)` 返回 `None`）
- `503`：工作簿文件缺失（默认路径：`static/workbooks/异环云配队.xlsx`）
- `500`：
  - Node 脚本执行失败（返回码非 0）：`detail` 为 stderr/stdout 的错误信息
  - Node 返回的 stdout 不是合法 JSON：`detail` 为截断后的 stdout
