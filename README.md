## nte_quick_team_up

异环预配队 + 云配队（浏览器端计算/时间轴编辑）工具。

### 功能

- 预配队：选择主C与队友，生成队伍评分
- 云配队：浏览器端加载 xlsx，支持时间轴气泡编辑（动作/反应&倾陷/buff），并实时重算输出 DPS / 总伤害等结果
  - 网页版特性：时间轴可自动扩容/缩容（末尾有内容时自动扩 1 列；末尾为空时自动回收空列）
- 配装：配装页编辑后写回本地状态，并与主界面同步刷新

### 数据与改表流程

云配队网页版是基于 xlsx 版实现的：网页侧只负责加载并重算 xlsx 的数据与公式。

如果要新增/调整以下内容：

- 新增角色
- 新增/调整 buff 候选
- 新增/调整动作（以及对应的伤害/时间等计算）

请先修改 xlsx（[static/workbooks/异环云配队.xlsx](file:///Users/bytedance/projects/nte_quick_team_up/static/workbooks/%E5%BC%82%E7%8E%AF%E4%BA%91%E9%85%8D%E9%98%9F.xlsx)），再按绑定文档同步网页侧读取/展示逻辑（必要时升级 `CACHE_NAME` 让浏览器更新 xlsx 缓存）。

### 本地运行

```bash
export FLASK_APP=app.py
export FLASK_DEBUG=1
flask run --host 0.0.0.0 --port 5000
```

入口：

- 预配队：`/` 或 `/preteam`
- 云配队：`/cloud-team`
- 配装：`/cloud-gear`

### 目录结构

- [app.py](file:///Users/bytedance/projects/nte_quick_team_up/app.py)：Flask 路由
- [templates/](file:///Users/bytedance/projects/nte_quick_team_up/templates)：页面模板
- [static/cloud/](file:///Users/bytedance/projects/nte_quick_team_up/static/cloud)：云配队/配装页前端逻辑
- [static/workbooks/异环云配队.xlsx](file:///Users/bytedance/projects/nte_quick_team_up/static/workbooks/%E5%BC%82%E7%8E%AF%E4%BA%91%E9%85%8D%E9%98%9F.xlsx)：数据与公式来源

### 缓存说明

- xlsx 缓存：
  - 优先使用 CacheStorage（cacheName 见 `cloudWorkbook.js` 的 `CACHE_NAME`）
  - 若运行环境不支持 CacheStorage，会降级使用 IndexedDB（DB：`cloud-xlsx-cache`）
- 可编辑状态缓存：
  - 云配队/配装页状态存入 localStorage（key 见前端 `STORAGE_KEY`）

更新 xlsx 或状态结构后，如果发现页面仍使用旧数据：

- 升级 `CACHE_NAME`（让 xlsx 缓存失效）
- 或升级 `STORAGE_KEY`（让本地状态失效）

### 验证

- 默认结果验证流程：[docs/verification.md](file:///Users/bytedance/projects/nte_quick_team_up/docs/verification.md)
- 绑定说明：[docs/xlsx-bindings.md](file:///Users/bytedance/projects/nte_quick_team_up/docs/xlsx-bindings.md)
- 自动验收脚本：[scripts/acceptance_check.py](file:///Users/bytedance/projects/nte_quick_team_up/scripts/acceptance_check.py)

### License

GPL-3.0-only，详见 [LICENSE](file:///Users/bytedance/projects/nte_quick_team_up/LICENSE)。

### QQ 群

- 1005485948
