## 云配队页面开发约定

### 1. 其他配置（misc）新增/修改流程

当你在主界面“其他配置”里新增一个字段（输入框/下拉）时，必须同时完成以下同步更新：

1) UI 绑定
- 更新 [cloudTeamPage.js](file:///Users/bytedance/projects/nte_quick_team_up/static/cloud/cloudTeamPage.js) 的 `renderMisc` 配置项列表与读写逻辑。

2) JSON 导入导出
- 更新 [cloudWorkbook.js](file:///Users/bytedance/projects/nte_quick_team_up/static/cloud/cloudWorkbook.js) 的：
  - `exportState()`：把对应单元格地址加入 `miscAddrs`（或明确说明它不对应单元格，例如轴长使用 `slotCount`）。
  - `importState()`：确保导入时会写回到对应单元格；如果字段影响列数/范围（如轴长），要先扩展到足够的 slot 再写入动作/反应/buff。

3) 文档
- 更新 [docs/xlsx-bindings.md](file:///Users/bytedance/projects/nte_quick_team_up/docs/xlsx-bindings.md) 的“其他配置”段落，写清楚：
  - 绑定到哪个 sheet/addr（或绑定到 JSON 顶层字段）
  - 可选值范围/枚举

### 2. 破坏性变更

若你修改了 localStorage 的状态结构或导入导出结构，导致旧数据不再兼容，需要：
- 升级前端的 `STORAGE_KEY` 版本号（例如 `cloudTeamState:v3`）
- 同步更新配装页使用的相同 `STORAGE_KEY`

### 3. 时间轴（动作/反应&倾陷/buff）交互约定

- 左键：仅用于拖动/缩放气泡（不弹下拉）。
- 右键：用于编辑/新增（在气泡内打开原生 select；右键空白会创建 1 格气泡并打开 select）。
- 任何写入到 workbook 的操作必须走统一刷新入口：
  - 先写入（`setValue`/`batchSet`）→ `recalc()` → `refreshAfterMutation(wb)`
- 轴长扩展：
  - 自动扩展/缩容：仅在尾部空列时缩容；仅在最后一列已有内容时扩展 1 列（避免循环扩容导致卡死）。
  - 导入 JSON 时必须先扩展到足够 slots，再写入动作/反应/buff。

### 4. HyperFormula API 兼容注意

本仓库 vendor 的 HyperFormula API 与常见示例不同，常见差异：
- `addColumns(sheetId, [col, amount])`
- `copy({start, end})` 与 `paste({sheet,row,col})`（paste 不接收 clipboard 参数）

对 HyperFormula 的调用若改动，需要跑验收脚本确认无 pageerror。

### 5. 静态资源缓存与版本号

- 修改 `static/cloud/*` 的 JS/CSS 后，需要同步更新模板里的 `?v=...`，避免浏览器仍命中旧资源：
  - [cloud_team.html](file:///Users/bytedance/projects/nte_quick_team_up/templates/cloud_team.html)
  - [cloud_gear.html](file:///Users/bytedance/projects/nte_quick_team_up/templates/cloud_gear.html)
- xlsx 缓存策略：
  - 优先使用 CacheStorage（`window.caches`）缓存 xlsx。
  - 若运行环境不支持 CacheStorage（例如 `caches is not defined`），自动降级使用 IndexedDB 持久缓存。
  - 若替换了 xlsx 内容，需要升级 [cloudWorkbook.js](file:///Users/bytedance/projects/nte_quick_team_up/static/cloud/cloudWorkbook.js) 里的 `CACHE_NAME`，以触发缓存失效更新。

### 6. 验证与回归

每次涉及下列变更之一，必须跑一次自动验收：
- 轴长扩展/导入导出/状态持久化
- 时间轴交互（拖动/缩放/右键编辑）
- 结果区计算或图表取数绑定

验收脚本：
- [acceptance_check.py](file:///Users/bytedance/projects/nte_quick_team_up/scripts/acceptance_check.py)
