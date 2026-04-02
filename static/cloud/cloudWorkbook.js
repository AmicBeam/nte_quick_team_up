 const WORKBOOK_URL = "/static/workbooks/%E5%BC%82%E7%8E%AF%E4%BA%91%E9%85%8D%E9%98%9F.xlsx";
 const CACHE_NAME = "cloud-xlsx-v1";
 
 function assertGlobal(name) {
   const v = window[name];
   if (!v) {
     throw new Error(`Missing global: ${name}`);
   }
   return v;
 }
 
 function colToNumber(col) {
   let n = 0;
   for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
   return n;
 }
 
 function numberToCol(n) {
   let s = "";
   while (n > 0) {
     const r = (n - 1) % 26;
     s = String.fromCharCode(65 + r) + s;
     n = Math.floor((n - 1) / 26);
   }
   return s;
 }
 
 function addrToCoord(addr) {
   const m = /^([A-Z]+)(\d+)$/.exec(addr);
   if (!m) throw new Error(`Bad address: ${addr}`);
   return { col: colToNumber(m[1]) - 1, row: Number(m[2]) - 1 };
 }
 
 function coordToAddr(row, col) {
   return `${numberToCol(col + 1)}${row + 1}`;
 }
 
 function decodeRange(ref) {
   const XLSX = assertGlobal("XLSX");
   return XLSX.utils.decode_range(ref);
 }
 
 function encodeRange(range) {
   const XLSX = assertGlobal("XLSX");
   return XLSX.utils.encode_range(range);
 }
 
 function normalizeFormula(f) {
   if (!f) return f;
  let out = String(f).replaceAll("_xlfn._xlws.FILTER", "FILTER");
  const sheetNames = ["云配队", "配装", "增益", "中间", "动作", "角色", "天赋", "弧盘", "卡带", "计算"];
  for (const name of sheetNames) {
    out = out.replaceAll(`'${name}'!`, `'${name}'!`);
    out = out.replaceAll(`${name}!`, `'${name}'!`);
  }
  out = out.replace(/'计算'!\$?(\d+):\$?\1/g, (_m, row) => {
    return `'计算'!$A$${row}:$WR$${row}`;
  });
  out = out.replace(/\bTRUE\b/g, "TRUE()");
  out = out.replace(/\bFALSE\b/g, "0");
  out = out.replace(/OFFSET\(\$X(\d+),0,MATCH\(([^,]+),\$Y\$3:\$AA\$3,0\)\)/g, (_m, row, key) => {
    return `INDEX($X${row}:$AA${row},1,MATCH(${key},$Y$3:$AA$3,0)+1)`;
  });
  out = out.replace(/INDEX\(([^,]+),([^,]+),0\)/g, "INDEX($1,$2,1)");
  return out;
 }
 
 async function fetchWorkbookArrayBuffer(url) {
   const cache = await caches.open(CACHE_NAME);
   const cached = await cache.match(url);
   if (cached) {
     return await cached.arrayBuffer();
   }
   const res = await fetch(url, { cache: "no-store" });
   if (!res.ok) throw new Error(`Failed to fetch xlsx: ${res.status}`);
   await cache.put(url, res.clone());
   return await res.arrayBuffer();
 }
 
 function sheetToMatrix(sheet) {
   const XLSX = assertGlobal("XLSX");
   const ref = sheet["!ref"];
   if (!ref) return { data: [[]], range: { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } } };
   const range = XLSX.utils.decode_range(ref);
   const rows = range.e.r - range.s.r + 1;
   const cols = range.e.c - range.s.c + 1;
   const data = Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
   for (const [addr, cell] of Object.entries(sheet)) {
     if (addr[0] === "!") continue;
     const c = XLSX.utils.decode_cell(addr);
     const r = c.r - range.s.r;
     const cc = c.c - range.s.c;
     if (r < 0 || cc < 0 || r >= rows || cc >= cols) continue;
     if (cell && typeof cell === "object" && cell.f) {
       data[r][cc] = `=${normalizeFormula(cell.f)}`;
       continue;
     }
     if (!cell) {
       data[r][cc] = null;
       continue;
     }
     const t = cell.t;
     if (t === "n") data[r][cc] = Number(cell.v);
     else if (t === "b") data[r][cc] = Boolean(cell.v);
    else if (t === "s" || t === "str") {
      const sv = String(cell.v ?? "");
      const tv = sv.trim().toUpperCase();
      if (tv === "TRUE") data[r][cc] = true;
      else if (tv === "FALSE") data[r][cc] = false;
      else data[r][cc] = sv;
    }
     else if (t === "d") data[r][cc] = cell.v;
     else data[r][cc] = cell.v ?? null;
   }
   return { data, range };
 }
 
 function buildFormulaCellSet(wb) {
   const out = new Map();
   for (const sheetName of wb.SheetNames) {
     const sheet = wb.Sheets[sheetName];
     const set = new Set();
     for (const [addr, cell] of Object.entries(sheet)) {
       if (addr[0] === "!") continue;
       if (cell && typeof cell === "object" && cell.f) set.add(addr);
     }
     out.set(sheetName, set);
   }
   return out;
 }
 
 function readColumnValues(wb, sheetName, colLetter, startRow, endRow) {
   const XLSX = assertGlobal("XLSX");
   const sheet = wb.Sheets[sheetName];
   const out = [];
   for (let r = startRow; r <= endRow; r++) {
     const addr = `${colLetter}${r}`;
     const cell = sheet[addr];
     if (!cell) continue;
     const v = cell.v;
     if (v === undefined || v === null || String(v).trim() === "") continue;
     out.push(String(v).trim());
   }
   return out;
 }
 
 function getCellV(wb, sheetName, addr) {
   const sheet = wb.Sheets[sheetName];
   const cell = sheet?.[addr];
   return cell?.v;
 }
 
 function buildActionOptions(wb) {
   const sheet = wb.Sheets["动作"];
   if (!sheet || !sheet["!ref"]) return new Map();
   const range = decodeRange(sheet["!ref"]);
   const XLSX = assertGlobal("XLSX");
   const map = new Map();
   for (let r = 4; r <= range.e.r + 1; r++) {
     const a = sheet[`A${r}`];
     const b = sheet[`B${r}`];
     const charName = String(a?.v ?? "").trim();
     const actionName = String(b?.v ?? "").trim();
     if (!charName || !actionName) continue;
     if (!map.has(charName)) map.set(charName, []);
     map.get(charName).push(actionName);
   }
   for (const [k, v] of map.entries()) {
     const uniq = Array.from(new Set(v));
     map.set(k, uniq);
   }
   return map;
 }
 
function buildActionIndexByKey(wb) {
  const sheet = wb.Sheets["动作"];
  if (!sheet || !sheet["!ref"]) return new Map();
  const range = decodeRange(sheet["!ref"]);
  const map = new Map();
  for (let r = 3; r <= range.e.r + 1; r++) {
    const a = sheet[`A${r}`];
    const b = sheet[`B${r}`];
    const charName = String(a?.v ?? "").trim();
    const actionName = String(b?.v ?? "").trim();
    if (!charName || !actionName) continue;
    const idx = r - 2;
    map.set(`${charName}||${actionName}`, idx);
  }
  return map;
}

 function buildArcOptions(wb) {
   const sheet = wb.Sheets["弧盘"];
   if (!sheet || !sheet["!ref"]) return { byFit: new Map(), all: [] };
   const range = decodeRange(sheet["!ref"]);
   const byFit = new Map();
   const all = [];
   for (let r = 3; r <= range.e.r + 1; r++) {
     const name = String(sheet[`A${r}`]?.v ?? "").trim();
     if (!name) continue;
     const fit = String(sheet[`F${r}`]?.v ?? "").trim();
     all.push(name);
     if (fit) {
       if (!byFit.has(fit)) byFit.set(fit, []);
       byFit.get(fit).push(name);
     }
   }
   for (const [k, v] of byFit.entries()) {
     byFit.set(k, Array.from(new Set(v)));
   }
   return { byFit, all: Array.from(new Set(all)) };
 }
 
 function buildCalcTemplateMeta(wb) {
   const sheet = wb.Sheets["计算"];
   if (!sheet) return null;
   const oneAddr = Object.keys(sheet).find(k => sheet[k]?.v === 1);
   const twoAddr = Object.keys(sheet).find(k => sheet[k]?.v === 2);
   if (!oneAddr || !twoAddr) return null;
   const c1 = addrToCoord(oneAddr);
   const c2 = addrToCoord(twoAddr);
   const width = c2.col - c1.col;
   if (width <= 0) return null;
   return { groupStartCol0: c1.col, groupWidth: width };
 }
 
export class CloudWorkbook {
  static async load() {
     assertGlobal("XLSX");
     assertGlobal("HyperFormula");
     const data = await fetchWorkbookArrayBuffer(WORKBOOK_URL);
     const XLSX = assertGlobal("XLSX");
     const wb = XLSX.read(data, { type: "array", cellFormula: true, cellNF: true, cellText: false });
     const formulaCells = buildFormulaCellSet(wb);
    const sheets = {};
    for (const sheetName of wb.SheetNames) {
      const { data: matrix } = sheetToMatrix(wb.Sheets[sheetName]);
      sheets[sheetName] = matrix;
    }
    const hf = window.HyperFormula.buildFromSheets(sheets, { licenseKey: "gpl-v3" });
    const sheetIdByName = new Map();
    for (const sheetName of wb.SheetNames) {
      sheetIdByName.set(sheetName, hf.getSheetId(sheetName));
    }
    if (sheetIdByName.has("计算")) {
      const calcId = sheetIdByName.get("计算");
      const setFormula = (addr, formula) => {
        const { row, col } = addrToCoord(addr);
        hf.setCellContents({ sheet: calcId, row, col }, [[formula]]);
      };
      setFormula("T10", "=COUNTIF($F$4:$F$7,$F$4)");
      setFormula("T11", "=COUNTIF($F$4:$F$7,$F$5)");
      setFormula("T12", "=COUNTIF($F$4:$F$7,$F$6)");
      setFormula("T13", "=COUNTIF($F$4:$F$7,$F$7)");
    }
     const actionOptions = buildActionOptions(wb);
    const actionIndexByKey = buildActionIndexByKey(wb);
     const arcs = buildArcOptions(wb);
     const cassettes = readColumnValues(wb, "卡带", "A", 3, 40);
     const mainStatOptions = readColumnValues(wb, "中间", "K", 2, 40);
    const reactionOptions = readColumnValues(wb, "中间", "O", 2, 20);
    const trapStateOptions = readColumnValues(wb, "中间", "T", 2, 10);
     const buffSelf = readColumnValues(wb, "增益", "A", 2, 11);
     const buffTeam = readColumnValues(wb, "增益", "A", 12, 22);
     const buffCassette = readColumnValues(wb, "增益", "A", 23, 27);
     const buffArc = readColumnValues(wb, "增益", "A", 28, 39);
     const calcMeta = buildCalcTemplateMeta(wb);
     const characters = readColumnValues(wb, "配装", "A", 3, 60);
     const baseEditableSnapshot = CloudWorkbook.snapshotEditableBase(wb, formulaCells);
    return new CloudWorkbook({
       wb,
       hf,
       sheetIdByName,
       formulaCells,
       actionOptions,
      actionIndexByKey,
       arcs,
       cassettes,
       mainStatOptions,
      reactionOptions,
      trapStateOptions,
       buffSelf,
       buffTeam,
       buffCassette,
       buffArc,
       calcMeta,
       characters,
       baseEditableSnapshot,
     });
   }
 
   static snapshotEditableBase(wb, formulaCells) {
     const out = {};
     for (const sheetName of wb.SheetNames) {
       const sheet = wb.Sheets[sheetName];
       const ref = sheet["!ref"];
       if (!ref) continue;
       const range = decodeRange(ref);
       const set = formulaCells.get(sheetName) || new Set();
       const values = {};
       for (let r = range.s.r; r <= range.e.r; r++) {
         for (let c = range.s.c; c <= range.e.c; c++) {
           const addr = coordToAddr(r, c);
           if (set.has(addr)) continue;
           const cell = sheet[addr];
           if (!cell) continue;
           const v = cell.v;
           if (v === undefined) continue;
           values[addr] = v;
         }
       }
       out[sheetName] = values;
     }
     return out;
   }
 
   constructor(opts) {
     Object.assign(this, opts);
    this.physicalSlotCount = 20;
    this.slotCount = 20;
    this._teamBindings = null;
   }
 
   getValue(sheetName, addr) {
     const sheetId = this.sheetIdByName.get(sheetName);
     const { row, col } = addrToCoord(addr);
     return this.hf.getCellValue({ sheet: sheetId, row, col });
   }
 
   setValue(sheetName, addr, value) {
     const sheetId = this.sheetIdByName.get(sheetName);
     const { row, col } = addrToCoord(addr);
     this.hf.setCellContents({ sheet: sheetId, row, col }, [[value]]);
   }
 
   batchSet(sheetName, updates) {
     const sheetId = this.sheetIdByName.get(sheetName);
     for (const { addr, value } of updates) {
       const { row, col } = addrToCoord(addr);
       this.hf.setCellContents({ sheet: sheetId, row, col }, [[value]]);
     }
   }
 
   recalc() {
    this.syncActionRowNumbers();
     this.hf.rebuildAndRecalculate();
   }
 
  syncActionRowNumbers() {
    if (!this.calcMeta) return;
    const calcId = this.sheetIdByName.get("计算");
    if (calcId === undefined || calcId === null) return;
    const { groupStartCol0, groupWidth } = this.calcMeta;
    for (let slot = 1; slot <= this.slotCount; slot++) {
      const actionCol0 = groupStartCol0 + (slot - 1) * groupWidth;
      const rowCol0 = actionCol0 + 1;
      const actionColLetter = numberToCol(colToNumber("J") + slot - 1);
      for (let i = 0; i < 4; i++) {
        const charName = String(this.getValue("云配队", `F${4 + i}`) ?? "").trim();
        const actName = String(this.getValue("云配队", `${actionColLetter}${4 + i}`) ?? "").trim();
        const idx = actName && charName ? (this.actionIndexByKey.get(`${charName}||${actName}`) || 1) : 1;
        const row0 = (4 + i) - 1;
        this.hf.setCellContents({ sheet: calcId, row: row0, col: rowCol0 }, [[idx]]);
      }
    }
  }

  getCachedValue(sheetName, addr) {
    const sheet = this.wb.Sheets[sheetName];
    const cell = sheet?.[addr];
    if (!cell) return undefined;
    return cell.v;
  }

  resolveTeamBindings() {
    if (this._teamBindings) return this._teamBindings;
    const sheetId = this.sheetIdByName.get("云配队");
    const dims = this.hf.getSheetDimensions(sheetId);
    const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);
    const isErrorValue = (v) => v && typeof v === "object" && (v.value === "#ERROR!" || v.value === "#VALUE!" || v.value === "#NAME?" || v.value === "#REF!" || v.value === "#N/A" || v.value === "#DIV/0!");
    const find = (needle) => {
      for (let r = 0; r < dims.height; r++) {
        for (let c = 0; c < dims.width; c++) {
          const v = this.hf.getCellValue({ sheet: sheetId, row: r, col: c });
          if (String(v ?? "").trim() === needle) return { row: r, col: c };
        }
      }
      return null;
    };
    const dpsLabel = find("DPS");
    const totalLabel = find("累计伤害");
    const contribLabel = find("贡献伤害");
    const dpsAddr = dpsLabel ? coordToAddr(dpsLabel.row + 1, dpsLabel.col) : "AD7";
    const totalAddr = totalLabel ? coordToAddr(totalLabel.row + 1, totalLabel.col) : "AD5";
    const dpsValue = this.getValue("云配队", dpsAddr);
    const totalValue = this.getValue("云配队", totalAddr);
    const bindings = {
      dps: isFiniteNumber(dpsValue) && !isErrorValue(dpsValue) ? { sheet: "云配队", addr: dpsAddr } : { sheet: "云配队", addr: "AD7" },
      totalDamage: isFiniteNumber(totalValue) && !isErrorValue(totalValue) ? { sheet: "云配队", addr: totalAddr } : { sheet: "云配队", addr: "AD5" },
      contribDamageCol: contribLabel ? contribLabel.col : addrToCoord("AG3").col,
      contribStartRow: addrToCoord("AG4").row,
    };
    this._teamBindings = bindings;
    return bindings;
  }

  getTeamDps() {
    const b = this.resolveTeamBindings();
    return this.getValue(b.dps.sheet, b.dps.addr);
  }

  getTeamTotalDamage() {
    const b = this.resolveTeamBindings();
    return this.getValue(b.totalDamage.sheet, b.totalDamage.addr);
  }

  getTeamContribDamage(i) {
    const b = this.resolveTeamBindings();
    const addr = coordToAddr(b.contribStartRow + i, b.contribDamageCol);
    return this.getValue("云配队", addr);
  }

  updateCalcInputRanges(endCol) {
    const calcId = this.sheetIdByName.get("计算");
    const dims = this.hf.getSheetDimensions(calcId);
    const rows = [4, 5, 6, 7, 8];
    for (let r = 14; r <= 29; r++) rows.push(r);
    const patterns = [];
    for (const rr of rows) {
      patterns.push([`云配队!$J${rr}:$AC${rr}`, `云配队!$J${rr}:$${endCol}${rr}`]);
      patterns.push([`云配队!$J$${rr}:$AC$${rr}`, `云配队!$J$${rr}:$${endCol}$${rr}`]);
      patterns.push([`云配队!$J${rr}:$AC$${rr}`, `云配队!$J${rr}:$${endCol}$${rr}`]);
      patterns.push([`云配队!$J$${rr}:$AC${rr}`, `云配队!$J$${rr}:$${endCol}${rr}`]);
    }
    for (let r = 0; r < dims.height; r++) {
      for (let c = 0; c < dims.width; c++) {
        const f = this.hf.getCellFormula({ sheet: calcId, row: r, col: c });
        if (!f) continue;
        let nf = f;
        for (const [from, to] of patterns) nf = nf.replaceAll(from, to);
        if (nf !== f) this.hf.setCellContents({ sheet: calcId, row: r, col: c }, [[nf]]);
      }
    }
  }

  ensureSlots(n) {
     if (!this.calcMeta) return;
    if (n <= this.physicalSlotCount) return;
    const add = n - this.physicalSlotCount;
     const teamId = this.sheetIdByName.get("云配队");
     const calcId = this.sheetIdByName.get("计算");
     const { groupStartCol0, groupWidth } = this.calcMeta;
 
    const insertAt = addrToCoord("AD1").col;
    this.hf.addColumns(teamId, insertAt, add);
 
    const templateFromCol = groupStartCol0 + groupWidth * (this.physicalSlotCount - 1);
     const templateToCol = templateFromCol + groupWidth - 1;
     const copyHeight = 30;
 
     for (let i = 0; i < add; i++) {
      const targetFromCol = groupStartCol0 + groupWidth * (this.physicalSlotCount + i);
       this.hf.addColumns(calcId, targetFromCol, groupWidth);
       const clipboard = this.hf.copy(
         { sheet: calcId, row: 0, col: templateFromCol },
         { sheet: calcId, row: copyHeight - 1, col: templateToCol },
       );
       this.hf.paste({ sheet: calcId, row: 0, col: targetFromCol }, clipboard);
       const idxAddr = coordToAddr(0, targetFromCol);
      this.setValue("计算", idxAddr, this.physicalSlotCount + i + 1);
     }
 
    this.physicalSlotCount = n;
    if (this.slotCount < this.physicalSlotCount) this.slotCount = this.physicalSlotCount;
    const endCol = numberToCol(colToNumber("J") + this.physicalSlotCount - 1);
    this.updateCalcInputRanges(endCol);
    this._teamBindings = null;
   }

  setActiveSlots(n) {
    const target = Math.max(1, Math.floor(Number(n) || 1));
    if (target > this.physicalSlotCount) this.ensureSlots(target);
    if (target < this.slotCount) {
      for (let s = target; s < this.slotCount; s++) {
        const col = numberToCol(colToNumber("J") + s);
        this.setValue("云配队", `${col}8`, 0);
        for (let r = 0; r < 4; r++) this.setValue("云配队", `${col}${4 + r}`, null);
        for (let rr = 14; rr <= 29; rr++) this.setValue("云配队", `${col}${rr}`, null);
      }
    }
    this.slotCount = target;
    this._teamBindings = null;
  }
 
   exportState() {
    const team = {
      roles: [],
      repeats: [],
      actions: [[], [], [], []],
      buffs: {},
      misc: {},
    };
    for (let i = 0; i < 4; i++) team.roles.push(this.getValue("云配队", `F${4 + i}`));
    for (let s = 0; s < this.slotCount; s++) {
      const addr = `${numberToCol(colToNumber("J") + s)}8`;
      team.repeats.push(this.getValue("云配队", addr));
    }
    for (let r = 0; r < 4; r++) {
      for (let s = 0; s < this.slotCount; s++) {
        const addr = `${numberToCol(colToNumber("J") + s)}${4 + r}`;
        team.actions[r].push(this.getValue("云配队", addr));
      }
    }
    const buffRows = [];
    for (let rr = 14; rr <= 29; rr++) buffRows.push(rr);
    for (const rr of buffRows) {
      team.buffs[String(rr)] = [];
      for (let s = 0; s < this.slotCount; s++) {
        const addr = `${numberToCol(colToNumber("J") + s)}${rr}`;
        team.buffs[String(rr)].push(this.getValue("云配队", addr));
      }
    }
    const miscAddrs = ["F9", "G9", "H9", "F11", "H11", "G13"];
    for (const a of miscAddrs) team.misc[a] = this.getValue("云配队", a);
 
    const gear = {};
    for (let i = 0; i < this.characters.length; i++) {
      const rowNum = 3 + i;
      const name = String(this.getValue("配装", `A${rowNum}`) ?? "").trim();
      if (!name) continue;
      const pick = (col) => this.getValue("配装", `${col}${rowNum}`);
      gear[name] = {
        V: pick("V"),
        X: pick("X"),
        Z: pick("Z"),
        AB: pick("AB"),
        AC: pick("AC"),
        AD: pick("AD"),
        AF: pick("AF"),
        AG: pick("AG"),
        AH: pick("AH"),
        AI: pick("AI"),
        AJ: pick("AJ"),
        AK: pick("AK"),
        AL: pick("AL"),
        AM: pick("AM"),
        AN: pick("AN"),
        AO: pick("AO"),
        AP: pick("AP"),
        AQ: pick("AQ"),
        AR: pick("AR"),
        AS: pick("AS"),
        AT: pick("AT"),
        AU: pick("AU"),
        AV: pick("AV"),
        AW: pick("AW"),
      };
    }
 
    return { version: 2, workbook: "异环云配队.xlsx", slotCount: this.slotCount, team, gear };
   }
 
   importState(state) {
     if (!state || typeof state !== "object") throw new Error("Bad state");
    const slotCount = Number(state.slotCount || 20);
    if (slotCount > this.slotCount) this.ensureSlots(slotCount);
 
    const team = state.team || {};
    if (Array.isArray(team.roles)) {
      for (let i = 0; i < 4; i++) this.setValue("云配队", `F${4 + i}`, team.roles[i] ?? null);
    }
    if (Array.isArray(team.repeats)) {
      for (let s = 0; s < Math.min(this.slotCount, team.repeats.length); s++) {
        const addr = `${numberToCol(colToNumber("J") + s)}8`;
        this.setValue("云配队", addr, team.repeats[s] ?? 0);
      }
    }
    if (Array.isArray(team.actions)) {
      for (let r = 0; r < 4; r++) {
        const row = team.actions[r] || [];
        for (let s = 0; s < Math.min(this.slotCount, row.length); s++) {
          const addr = `${numberToCol(colToNumber("J") + s)}${4 + r}`;
          this.setValue("云配队", addr, row[s] ?? null);
        }
      }
    }
    if (team.buffs && typeof team.buffs === "object") {
      for (const [rr, arr] of Object.entries(team.buffs)) {
        const rowNum = Number(rr);
        if (!Number.isFinite(rowNum)) continue;
        if (!Array.isArray(arr)) continue;
        for (let s = 0; s < Math.min(this.slotCount, arr.length); s++) {
          const addr = `${numberToCol(colToNumber("J") + s)}${rowNum}`;
          this.setValue("云配队", addr, arr[s] ?? null);
        }
      }
    }
    if (team.misc && typeof team.misc === "object") {
      for (const [addr, value] of Object.entries(team.misc)) {
        if (!/^[A-Z]+\d+$/.test(addr)) continue;
        this.setValue("云配队", addr, value ?? null);
      }
    }
 
    const gear = state.gear || {};
    if (gear && typeof gear === "object") {
      for (let i = 0; i < this.characters.length; i++) {
        const rowNum = 3 + i;
        const name = String(this.getValue("配装", `A${rowNum}`) ?? "").trim();
        if (!name) continue;
        const g = gear[name];
        if (!g) continue;
        for (const col of ["V", "X", "Z", "AB", "AC", "AD", "AF", "AG", "AH", "AI", "AJ", "AK", "AL", "AM", "AN", "AO", "AP", "AQ", "AR", "AS", "AT", "AU", "AV", "AW"]) {
          if (!(col in g)) continue;
          this.setValue("配装", `${col}${rowNum}`, g[col]);
        }
      }
    }
 
    this.recalc();
   }
 
  verifyDefault() {
    const checks = [
      { sheet: "云配队", addr: "AD5", label: "累计伤害" },
      { sheet: "云配队", addr: "AD7", label: "DPS" },
      { sheet: "云配队", addr: "AG4", label: "贡献伤害1" },
      { sheet: "云配队", addr: "AG5", label: "贡献伤害2" },
      { sheet: "云配队", addr: "AG6", label: "贡献伤害3" },
      { sheet: "云配队", addr: "AG7", label: "贡献伤害4" },
    ];
    const out = [];
    for (const c of checks) {
      const cached = this.getCachedValue(c.sheet, c.addr);
      const computed = this.getValue(c.sheet, c.addr);
      const cn = Number(cached);
      const vn = Number(computed);
      const ok = Number.isFinite(cn) && Number.isFinite(vn) ? Math.abs(cn - vn) <= Math.max(1e-6, Math.abs(cn) * 1e-3) : String(cached) === String(computed);
      out.push({ ...c, cached, computed, ok });
    }
    return out;
  }

   getRoleAvatar(name) {
     if (!name) return null;
     return `/cloud-avatar?name=${encodeURIComponent(String(name))}`;
   }
 
   getArcOptionsForCharacter(characterName) {
     const row = this.characters.indexOf(characterName);
     if (row < 0) return this.arcs.all;
     const fitValue = this.getValue("配装", `C${row + 3}`);
     const fit = String(fitValue ?? "").trim();
     const opts = this.arcs.byFit.get(fit);
     return opts && opts.length ? opts : this.arcs.all;
   }
 
   getActionOptions(characterName) {
     const opts = this.actionOptions.get(characterName);
     return opts && opts.length ? opts : [];
   }
 }
