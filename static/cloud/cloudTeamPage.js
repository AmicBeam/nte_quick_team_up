const VERSION = new URL(import.meta.url).searchParams.get("v") || "";
let CloudWorkbook = null;
let renderGearTable = null;

async function loadDeps() {
  if (!CloudWorkbook) {
    const mod = await import(`./cloudWorkbook.js${VERSION ? `?v=${VERSION}` : ""}`);
    CloudWorkbook = mod.CloudWorkbook;
  }
  if (!renderGearTable) {
    const mod = await import(`./cloudGearPage.js${VERSION ? `?v=${VERSION}` : ""}`);
    renderGearTable = mod.renderGearTable;
  }
}
 
const STORAGE_KEY = "cloudTeamState:v3";
const scrollState = { action: 0, config: 0, buff: 0 };
let syncingScroll = false;
const HOLD_MS = 160;
const MOVE_TOL = 14;
let activeView = "main";
 
 function el(tag, attrs = {}, children = []) {
   const node = document.createElement(tag);
   for (const [k, v] of Object.entries(attrs)) {
     if (k === "class") node.className = v;
     else if (k === "style") node.style.cssText = v;
     else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
     else node.setAttribute(k, String(v));
   }
   for (const c of children) {
     if (c === null || c === undefined) continue;
     if (typeof c === "string") node.appendChild(document.createTextNode(c));
     else node.appendChild(c);
   }
   return node;
 }
 
 function showPicker(anchorEl, options, current, onPick) {
   const picker = document.getElementById("picker");
   picker.innerHTML = "";
  let opts = Array.from(new Set(options));
  const cur = current === null || current === undefined ? "" : String(current);
  if (cur && !opts.includes(cur)) opts = ["", cur, ...opts.filter(x => x !== "")];
  const sel = el("select", {}, opts.map(o => el("option", { value: o }, [o === "" ? "清空" : o])));
  if (opts.includes(cur)) sel.value = cur;
   sel.addEventListener("change", () => {
     onPick(sel.value);
     hidePicker();
   });
   sel.addEventListener("blur", () => hidePicker());
   picker.appendChild(sel);
   const rect = anchorEl.getBoundingClientRect();
   picker.style.left = `${Math.min(rect.left, window.innerWidth - 340)}px`;
   picker.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 140)}px`;
   picker.style.display = "block";
  window.__pickerOpenedAt = Date.now();
  sel.focus();
  try {
    if (typeof sel.showPicker === "function") sel.showPicker();
    else sel.click();
  } catch {}
 }
 
 function hidePicker() {
   const picker = document.getElementById("picker");
   picker.style.display = "none";
   picker.innerHTML = "";
 }
 
 function fmtNum(v) {
   const n = Number(v);
   if (!Number.isFinite(n)) return "—";
   return n.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
 }
 
 function cellAddrForAction(rowIndex0, slotIndex0) {
   const baseCol = "J".charCodeAt(0) - 64;
   const colNum = baseCol + slotIndex0;
   const col = numberToCol(colNum);
   return `${col}${4 + rowIndex0}`;
 }
 
 function cellAddrForRepeat(slotIndex0) {
   const baseCol = "J".charCodeAt(0) - 64;
   const colNum = baseCol + slotIndex0;
   const col = numberToCol(colNum);
   return `${col}8`;
 }
 
 function cellAddrForBuffRow(row, slotIndex0) {
   const baseCol = "J".charCodeAt(0) - 64;
   const colNum = baseCol + slotIndex0;
   const col = numberToCol(colNum);
   return `${col}${row}`;
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
 
 function saveState(wb) {
   const state = wb.exportState();
   localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
 }
 
 function loadState() {
   const raw = localStorage.getItem(STORAGE_KEY);
   if (!raw) return null;
   try {
     return JSON.parse(raw);
   } catch {
     return null;
   }
 }
 
function openSelectInCell(cell, values, currentValue, onCommit) {
  cell.innerHTML = "";
  const opts = ["", ...values];
  const sel = el(
    "select",
    { style: "width:100%;height:100%;background:transparent;border:none;color:rgba(247,248,255,0.92);outline:none" },
    opts.map(o => el("option", { value: o }, [o === "" ? "清空" : o])),
  );
  const cur = currentValue && String(currentValue).trim() ? String(currentValue).trim() : "";
  sel.value = opts.includes(cur) ? cur : "";
  let committed = false;
  sel.addEventListener("change", (e) => {
    e.stopPropagation();
    const picked = sel.value;
    committed = true;
    cell.innerHTML = `<div class="value">${picked === "" ? "" : picked}</div>`;
    onCommit(picked === "" ? null : picked);
  });
  sel.addEventListener("click", (e) => e.stopPropagation());
  sel.addEventListener("mousedown", (e) => e.stopPropagation());
  sel.addEventListener("pointerdown", (e) => e.stopPropagation());
  sel.addEventListener("blur", () => {
    if (committed) return;
    onCommit(cur === "" ? null : cur);
  });
  cell.appendChild(sel);
  sel.focus();
  try {
    if (typeof sel.showPicker === "function") sel.showPicker();
    else sel.click();
  } catch {}
}

 function renderMisc(wb) {
   const misc = document.getElementById("misc");
   misc.innerHTML = "";
   const items = [
     { label: "指定轴长", type: "axisTime", step: "1" },
     { label: "角色等级", sheet: "云配队", addr: "F9", type: "number", step: "1" },
     { label: "怪物等级", sheet: "云配队", addr: "G9", type: "number", step: "1" },
     { label: "倾陷上限", sheet: "云配队", addr: "H9", type: "number", step: "1" },
     { label: "怪物弱点", sheet: "云配队", addr: "G11", type: "select", options: ["无", "光", "灵", "咒", "暗", "魂", "相"] },
     { label: "怪物抗性", sheet: "云配队", addr: "F11", type: "number", step: "0.01" },
     { label: "弱点减抗", sheet: "云配队", addr: "H11", type: "number", step: "0.01" },
     { label: "对敌类型", sheet: "云配队", addr: "G13", type: "select", options: ["群怪", "BOSS"] },
     { label: "早雾DOT层数", sheet: "云配队", addr: "H13", type: "number", step: "1" },
   ];
   for (const it of items) {
     const cur = it.type === "axisTime" ? wb.getAxisTimeLength() : wb.getValue(it.sheet, it.addr);
     let input;
     if (it.type === "axisTime") {
       input = el("input", { type: "number", step: it.step || "1", value: String(cur ?? ""), oninput: () => {} });
       input.addEventListener("change", () => {
         const v = input.value === "" ? null : Number(input.value);
         wb.setAxisTimeLength(Number.isFinite(v) ? v : null);
         wb.recalc();
         refreshAfterMutation(wb);
       });
       misc.appendChild(el("div", { class: "field" }, [el("label", {}, [it.label]), input]));
       continue;
     }
     if (it.type === "select") {
      input = el("select", {}, it.options.map(o => el("option", { value: o }, [o])));
      if (it.addr === "G11") input.value = String(cur ?? "").trim() || "无";
      else input.value = String(cur ?? "");
      input.addEventListener("change", () => {
        const v = it.addr === "G11" && input.value === "无" ? null : input.value;
        wb.setValue(it.sheet, it.addr, v);
        wb.recalc();
        refreshAfterMutation(wb);
      });
     } else {
       input = el("input", { type: "number", step: it.step || "1", value: String(cur ?? ""), oninput: () => {} });
       input.addEventListener("change", () => {
         const v = input.value === "" ? null : Number(input.value);
         wb.setValue(it.sheet, it.addr, v);
         wb.recalc();
        refreshAfterMutation(wb);
       });
     }
     misc.appendChild(el("div", { class: "field" }, [el("label", {}, [it.label]), input]));
   }
 }
 
const MIN_SLOTS = 12;

function isEmptyValue(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === "number") return !Number.isFinite(v) || v === 0;
  return String(v).trim() === "";
}

function autoResizeSlots(wb, allowExpand = true) {
  const hasContentInSlot = (slotIdx0) => {
    const col = numberToCol("J".charCodeAt(0) - 64 + slotIdx0);
    for (let r = 0; r < 4; r++) {
      const v = wb.getValue("云配队", `${col}${4 + r}`);
      if (!isEmptyValue(v)) return true;
    }
    for (let rr = 11; rr <= 12; rr++) {
      const v = wb.getValue("云配队", `${col}${rr}`);
      if (!isEmptyValue(v)) return true;
    }
    for (let rr = 14; rr <= 29; rr++) {
      const v = wb.getValue("云配队", `${col}${rr}`);
      if (!isEmptyValue(v)) return true;
    }
    return false;
  };

  while (wb.slotCount > MIN_SLOTS && !hasContentInSlot(wb.slotCount - 1)) {
    wb.setActiveSlots(wb.slotCount - 1);
  }
  if (allowExpand && wb.slotCount < 200 && hasContentInSlot(wb.slotCount - 1)) {
    wb.setActiveSlots(wb.slotCount + 1);
  }
}

function buffSectionForRow(wb, wbRow) {
  if (wbRow === 14 || wbRow === 15) return { key: "self", options: wb.buffSelf };
  if (wbRow >= 16 && wbRow <= 21) return { key: "team", options: wb.buffTeam };
  if (wbRow >= 22 && wbRow <= 25) return { key: "cassette", options: wb.buffCassette };
  return { key: "arc", options: wb.buffArc };
}

function clearSelection(container) {
  container.querySelectorAll(".grid-cell.selected").forEach((n) => n.classList.remove("selected"));
}

function pickOptionsForCells(cells, getOptionsKey) {
  let key = null;
  let options = null;
  for (const cell of cells) {
    const { k, opts } = getOptionsKey(cell);
    if (key === null) {
      key = k;
      options = opts;
    } else if (k !== key) {
      return { values: [""], clearOnly: true };
    }
  }
  return { values: ["", ...(options || [])], clearOnly: false };
}

const SLOT_W = 140;

function refreshAfterMutation(wb) {
  if (refreshAfterMutation.__queued) return;
  refreshAfterMutation.__queued = true;
  queueMicrotask(() => {
    refreshAfterMutation.__queued = false;
    const isNearEnd = (id) => {
      const elx = document.getElementById(id);
      if (!elx) return false;
      const max = elx.scrollWidth - elx.clientWidth;
      if (max <= 0) return true;
      return elx.scrollLeft >= max - 180;
    };
    const nearEndAction = isNearEnd("actionScroll");
    const nearEndConfig = isNearEnd("configScroll");
    const nearEndBuff = isNearEnd("buffScroll");

    const beforeSlots = wb.slotCount;
    let roleChanged = false;
    const defRole = wb.characters && wb.characters.length ? wb.characters[0] : "";
    if (defRole) {
      for (let i = 0; i < 4; i++) {
        const addr = `F${4 + i}`;
        const cur = String(wb.getValue("云配队", addr) ?? "").trim();
        if (!cur) {
          wb.setValue("云配队", addr, defRole);
          roleChanged = true;
        }
      }
    }
    autoResizeSlots(wb, true);
    if (roleChanged || wb.slotCount !== beforeSlots) wb.recalc();
    saveState(wb);
    try {
      renderAll(wb);
      if (wb.slotCount !== beforeSlots) {
        if (nearEndAction) scrollState.action = 1e9;
        if (nearEndConfig) scrollState.config = 1e9;
        if (nearEndBuff) scrollState.buff = 1e9;
        applyScrollState();
      }
      const gearTable = document.getElementById("gearTable");
      if (gearTable && typeof renderGearTable === "function") renderGearTable(wb, gearTable);
    } catch (e) {
      const trace = document.getElementById("traceBox");
      if (trace) trace.textContent = e?.stack || String(e);
    }
  });
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function getCalcSlotSeries(wb, key, rowIndex0) {
  if (!wb || !wb.hf || !wb.sheetIdByName || !wb.calcMeta) return null;
  const calcId = wb.sheetIdByName.get("计算");
  if (calcId === undefined || calcId === null) return null;
  const { groupStartCol0, groupWidth } = wb.calcMeta;
  if (!groupStartCol0 || !groupWidth) return null;
  if (!wb.__calcKeyOffset) wb.__calcKeyOffset = new Map();
  let off = wb.__calcKeyOffset.get(key);
  if (off === undefined) {
    off = null;
    for (let i = 0; i < groupWidth; i++) {
      const v = wb.hf.getCellValue({ sheet: calcId, row: 0, col: groupStartCol0 + i });
      if (String(v ?? "").trim() === key) { off = i; break; }
    }
    wb.__calcKeyOffset.set(key, off);
  }
  if (off === null) return null;
  const out = [];
  for (let s = 0; s < wb.slotCount; s++) {
    const col = groupStartCol0 + s * groupWidth + off;
    out.push(wb.hf.getCellValue({ sheet: calcId, row: rowIndex0, col }));
  }
  return out;
}

function slotIndexFromClientX(scrollEl, clientX) {
  const rect = scrollEl.getBoundingClientRect();
  const x = clientX - rect.left + scrollEl.scrollLeft;
  return clamp(Math.floor(x / SLOT_W), 0, 1000000);
}

function buildBlocks(slotCount, getValueAtSlot) {
  const blocks = [];
  let s = 0;
  while (s < slotCount) {
    const raw = getValueAtSlot(s);
    const v = raw === null || raw === undefined ? "" : String(raw).trim();
    if (!v) {
      s += 1;
      continue;
    }
    const start = s;
    let end = s + 1;
    while (end < slotCount) {
      const raw2 = getValueAtSlot(end);
      const v2 = raw2 === null || raw2 === undefined ? "" : String(raw2).trim();
      if (v2 !== v) break;
      end += 1;
    }
    blocks.push({ start, len: end - start, value: v });
    s = end;
  }
  return blocks;
}

function renderTimelineRuler(wb, slotCount) {
  const row = el("div", { class: "tl-ruler", style: `width:${slotCount * SLOT_W}px` });
  const fmtTime = (n) => {
    const s = Number(n).toFixed(1);
    return s.endsWith(".0") ? s.slice(0, -2) : s;
  };
  const deltas = getCalcSlotSeries(wb, "t", 7) || [];
  let cum = 0;
  for (let s = 0; s < slotCount; s++) {
    const delta = Number(deltas[s]);
    if (Number.isFinite(delta)) cum += delta;
    const txt = Number.isFinite(delta) && delta !== 0 ? fmtTime(cum) : "";
    row.appendChild(el("div", { class: "tl-tick", style: `left:${s * SLOT_W}px;width:${SLOT_W}px` }, [el("div", { class: "tl-tick-label" }, [txt])]));
  }
  return row;
}

function applyRange(sheet, rowAddrFn, start, len, value) {
  const updates = [];
  for (let s = start; s < start + len; s++) updates.push({ addr: rowAddrFn(s), value });
  return updates;
}

function buildInlineSelectOptions(values, currentValue) {
  let opts = ["", ...(values || [])];
  const cur = currentValue === null || currentValue === undefined ? "" : String(currentValue).trim();
  if (cur && !opts.includes(cur)) opts = ["", cur, ...opts.filter(x => x !== "" && x !== cur)];
  opts = Array.from(new Set(opts));
  return { opts, cur };
}

function applyMove(sheet, rowAddrFn, oldStart, oldLen, newStart, newLen, value) {
  const updates = [];
  const oldEnd = oldStart + oldLen;
  const newEnd = newStart + newLen;
  const min = Math.min(oldStart, newStart);
  const max = Math.max(oldEnd, newEnd);
  for (let s = min; s < max; s++) {
    const inNew = s >= newStart && s < newEnd;
    const inOld = s >= oldStart && s < oldEnd;
    if (inNew) updates.push({ addr: rowAddrFn(s), value });
    else if (inOld) updates.push({ addr: rowAddrFn(s), value: null });
  }
  return updates;
}

function renderBubbleLane({ wb, slotCount, scrollEl, sheet, laneKey, leftLabelEl, getCellAddr, getOptions, getBlockClass, onChanged }) {
  const lane = el("div", { class: "tl-lane", "data-lane": laneKey, style: `width:${slotCount * SLOT_W}px` });
  const blocks = buildBlocks(slotCount, (s) => wb.getValue(sheet, getCellAddr(s)));
  for (const b of blocks) {
    const bubble = el(
      "div",
      {
        class: `tl-bubble ${getBlockClass ? getBlockClass() : ""}`.trim(),
        style: `left:${b.start * SLOT_W}px;width:${b.len * SLOT_W}px`,
        "data-start": String(b.start),
        "data-len": String(b.len),
        "data-value": b.value,
      },
      [el("div", { class: "tl-bubble-text" }, [b.value]), el("div", { class: "tl-handle left" }), el("div", { class: "tl-handle right" })],
    );
    lane.appendChild(bubble);
  }

  let mode = null;
  let active = null;
  let origin = null;
  let moved = false;
  let activePointerId = null;
  let windowListenersAttached = false;

  const commit = (newStart, newLen) => {
    const value = active.dataset.value;
    const oldStart = Number(active.dataset.start);
    const oldLen = Number(active.dataset.len);
    const updates = applyMove(sheet, getCellAddr, oldStart, oldLen, newStart, newLen, value);
    wb.batchSet(sheet, updates);
    wb.recalc();
    refreshAfterMutation(wb);
  };

  const openInlineSelect = (bubble, start, len, currentValue) => {
    const { opts, cur } = buildInlineSelectOptions(getOptions(), currentValue);
    const sel = el("select", { class: "tl-select" }, opts.map(o => el("option", { value: o }, [o === "" ? "清空" : o])));
    sel.value = opts.includes(cur) ? cur : "";
    const close = () => {
      if (sel.parentNode === bubble) bubble.removeChild(sel);
    };
    const finish = (picked) => {
      const txtEl = bubble.querySelector(".tl-bubble-text");
      bubble.dataset.value = picked;
      if (txtEl) txtEl.textContent = picked === "" ? "" : picked;
      close();
      if (picked === "" && bubble.parentNode) bubble.parentNode.removeChild(bubble);
      const updates = [];
      for (let s = start; s < start + len; s++) updates.push({ addr: getCellAddr(s), value: picked === "" ? null : picked });
      wb.batchSet(sheet, updates);
      wb.recalc();
      refreshAfterMutation(wb);
    };
    sel.addEventListener("change", () => finish(sel.value));
    sel.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
    sel.addEventListener("pointerdown", (e) => e.stopPropagation());
    sel.addEventListener("mousedown", (e) => e.stopPropagation());
    bubble.appendChild(sel);
    sel.focus();
    try {
      if (typeof sel.showPicker === "function") sel.showPicker();
      else sel.click();
    } catch {}

    const onDoc = (e) => {
      if (e.target === sel || sel.contains(e.target)) return;
      window.removeEventListener("pointerdown", onDoc, true);
      close();
    };
    window.setTimeout(() => {
      window.addEventListener("pointerdown", onDoc, true);
    }, 0);
  };

  const endDragOrClick = () => {
    if (!active || !origin) return;
    const ps = active.dataset.pendingStart ? Number(active.dataset.pendingStart) : Number(active.dataset.start);
    const pl = active.dataset.pendingLen ? Number(active.dataset.pendingLen) : Number(active.dataset.len);
    delete active.dataset.pendingStart;
    delete active.dataset.pendingLen;
    const changed = ps !== Number(active.dataset.start) || pl !== Number(active.dataset.len);
    if (changed) commit(ps, pl);
    mode = null;
    active = null;
    origin = null;
    moved = false;
    activePointerId = null;
  };

  const detachWindowListeners = () => {
    if (!windowListenersAttached) return;
    windowListenersAttached = false;
    window.removeEventListener("pointerup", onWindowPointerUp, true);
    window.removeEventListener("pointercancel", onWindowPointerUp, true);
  };

  const onWindowPointerUp = (e) => {
    if (activePointerId === null) return;
    if (e.pointerId !== activePointerId) return;
    detachWindowListeners();
    endDragOrClick();
  };

  lane.addEventListener("pointerdown", (e) => {
    const b = e.target.closest(".tl-bubble");
    if (!b || !lane.contains(b)) return;
    if (e.button === 2) return;
    e.preventDefault();
    active = b;
    moved = false;
    const isLeft = e.target.classList.contains("left");
    const isRight = e.target.classList.contains("right");
    mode = isLeft ? "resize-left" : isRight ? "resize-right" : "drag";
    origin = {
      x: e.clientX,
      start: Number(b.dataset.start),
      len: Number(b.dataset.len),
    };
    activePointerId = e.pointerId;
    lane.setPointerCapture(e.pointerId);
    if (!windowListenersAttached) {
      windowListenersAttached = true;
      window.addEventListener("pointerup", onWindowPointerUp, true);
      window.addEventListener("pointercancel", onWindowPointerUp, true);
    }
  });

  lane.addEventListener("pointermove", (e) => {
    if (!active || !origin) return;
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    const dx = e.clientX - origin.x;
    if (Math.abs(dx) > 3) moved = true;
    const delta = Math.round(dx / SLOT_W);
    let ns = origin.start;
    let nl = origin.len;
    if (mode === "drag") {
      ns = clamp(origin.start + delta, 0, slotCount - origin.len);
    } else if (mode === "resize-left") {
      const maxStart = origin.start + origin.len - 1;
      ns = clamp(origin.start + delta, 0, maxStart);
      nl = origin.start + origin.len - ns;
    } else if (mode === "resize-right") {
      nl = clamp(origin.len + delta, 1, slotCount - origin.start);
    }
    active.style.left = `${ns * SLOT_W}px`;
    active.style.width = `${nl * SLOT_W}px`;
    active.dataset.pendingStart = String(ns);
    active.dataset.pendingLen = String(nl);
  });

  lane.addEventListener("pointerup", (e) => {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    detachWindowListeners();
    endDragOrClick();
  });

  lane.addEventListener("lostpointercapture", () => {
    detachWindowListeners();
    endDragOrClick();
  });

  lane.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const b = e.target.closest(".tl-bubble");
    if (b && lane.contains(b)) {
      const start = Number(b.dataset.start);
      const len = Number(b.dataset.len);
      openInlineSelect(b, start, len, b.dataset.value);
      return;
    }
    const slot = slotIndexFromClientX(scrollEl, e.clientX);
    if (slot >= slotCount) return;
    const cur = wb.getValue(sheet, getCellAddr(slot));
    if (!isEmptyValue(cur)) return;
    const temp = el(
      "div",
      { class: `tl-bubble ${getBlockClass ? getBlockClass() : ""}`.trim(), style: `left:${slot * SLOT_W}px;width:${SLOT_W}px`, "data-start": String(slot), "data-len": "1", "data-value": "" },
      [el("div", { class: "tl-bubble-text" }, [""]), el("div", { class: "tl-handle left" }), el("div", { class: "tl-handle right" })],
    );
    lane.appendChild(temp);
    openInlineSelect(temp, slot, 1, "");
  });

  if (leftLabelEl) leftLabelEl.classList.add("tl-left-label");
  return lane;
}

function renderActionArea(wb) {
  const area = document.getElementById("actionArea");
  const prev = document.getElementById("actionScroll");
  if (prev) scrollState.action = prev.scrollLeft;
  area.innerHTML = "";

  const wrap = el("div", { class: "tl-wrap" });
  const left = el("div", { class: "tl-left" });
  const scroll = el("div", { class: "tl-scroll", id: "actionScroll" });
  const grid = el("div", { class: "tl-grid", style: `width:${wb.slotCount * SLOT_W}px` });

  left.appendChild(el("div", { class: "tl-left-cell compact center" }, ["时间"]));
  scroll.appendChild(renderTimelineRuler(wb, wb.slotCount));

  for (let i = 0; i < 4; i++) {
    const addr = `F${4 + i}`;
    const role = String(wb.getValue("云配队", addr) ?? "").trim();
    const avatarSrc = wb.getRoleAvatar(role);
    const img = el("img", { class: "avatar", src: avatarSrc || "/static/%E5%8D%95%E4%BD%8D.jpg" });
    img.addEventListener("error", () => { img.src = "/static/%E5%8D%95%E4%BD%8D.jpg"; }, { once: true });
    const sel = el(
      "select",
      {
        onchange: () => {
          const next = sel.value;
          wb.setValue("云配队", addr, next);
          img.src = wb.getRoleAvatar(next) || "/static/%E5%8D%95%E4%BD%8D.jpg";
          const slots = wb.physicalSlotCount || wb.slotCount;
          const updates = [];
          for (let s = 0; s < slots; s++) updates.push({ addr: cellAddrForAction(i, s), value: null });
          wb.batchSet("云配队", updates);
          wb.recalc();
          refreshAfterMutation(wb);
        },
      },
      wb.characters.map(name => el("option", { value: name }, [name])),
    );
    sel.value = role || wb.characters[0] || "";
    left.appendChild(el("div", { class: "tl-left-cell role" }, [img, sel]));
    const lane = renderBubbleLane({
      wb,
      slotCount: wb.slotCount,
      scrollEl: scroll,
      sheet: "云配队",
      laneKey: `action-${i}`,
      getCellAddr: (s) => cellAddrForAction(i, s),
      getOptions: () => wb.getActionOptions(String(wb.getValue("云配队", addr) ?? "").trim()),
      getBlockClass: () => "lane-action",
      onChanged: () => {
        renderActionArea(wb);
        renderConfigArea(wb);
        renderBuffArea(wb);
        renderResults(wb);
        syncHorizontalScroll();
        applyScrollState();
      },
    });
    grid.appendChild(lane);
  }

  left.appendChild(el("div", { class: "tl-left-cell compact center" }, ["重复"]));
  const repeatLane = el("div", { class: "tl-lane", style: `width:${wb.slotCount * SLOT_W}px` });
  for (let s = 0; s < wb.slotCount; s++) {
    const addr = cellAddrForRepeat(s);
    const v = wb.getValue("云配队", addr);
    const inp = el("input", { type: "number", step: "0.001", value: isEmptyValue(v) ? "" : String(v), class: "tl-num" });
    inp.addEventListener("change", () => {
      const nv = inp.value === "" ? 0 : Number(inp.value);
      wb.setValue("云配队", addr, Number.isFinite(nv) ? nv : 0);
      wb.recalc();
      refreshAfterMutation(wb);
    });
    repeatLane.appendChild(el("div", { class: "tl-cell", style: `left:${s * SLOT_W}px;width:${SLOT_W}px` }, [inp]));
  }
  grid.appendChild(repeatLane);

  left.appendChild(el("div", { class: "tl-left-cell compact center" }, ["伤害"]));
  const dmgLane = el("div", { class: "tl-lane", style: `width:${wb.slotCount * SLOT_W}px` });
  const damages = getCalcSlotSeries(wb, "d", 7) || [];
  for (let s = 0; s < wb.slotCount; s++) {
    const n = Number(damages[s]);
    dmgLane.appendChild(el("div", { class: "tl-cell", style: `left:${s * SLOT_W}px;width:${SLOT_W}px` }, [el("div", { class: "tl-val" }, [Number.isFinite(n) && n !== 0 ? fmtNum(n) : ""])]));
  }
  grid.appendChild(dmgLane);

  scroll.appendChild(grid);
  wrap.appendChild(left);
  wrap.appendChild(scroll);
  area.appendChild(wrap);
}

function renderBuffArea(wb) {
  const area = document.getElementById("buffArea");
  const prev = document.getElementById("buffScroll");
  if (prev) scrollState.buff = prev.scrollLeft;
  area.innerHTML = "";

  const wrap = el("div", { class: "tl-wrap" });
  const left = el("div", { class: "tl-left" });
  const scroll = el("div", { class: "tl-scroll", id: "buffScroll" });
  const grid = el("div", { class: "tl-grid", style: `width:${wb.slotCount * SLOT_W}px` });

  for (let rr = 14; rr <= 29; rr++) {
    const covAddr = `H${rr}`;
    const cov = wb.getValue("云配队", covAddr);
    const pct = typeof cov === "number" && Number.isFinite(cov) ? cov * 100 : (cov ? Number(cov) * 100 : 0);
    const inp = el("input", { type: "number", step: "1", value: String(Number.isFinite(pct) ? pct : 0), class: "tl-num" });
    inp.addEventListener("change", () => {
      const nv = Number(inp.value);
      const v = Number.isFinite(nv) ? nv / 100 : 0;
      wb.setValue("云配队", covAddr, v);
      wb.recalc();
      refreshAfterMutation(wb);
    });
    left.appendChild(el("div", { class: "tl-left-cell compact center" }, [inp]));

    const sec = buffSectionForRow(wb, rr);
    const lane = renderBubbleLane({
      wb,
      slotCount: wb.slotCount,
      scrollEl: scroll,
      sheet: "云配队",
      laneKey: `buff-${rr}`,
      getCellAddr: (s) => cellAddrForBuffRow(rr, s),
      getOptions: () => sec.options || [],
      getBlockClass: () => `buff-${sec.key}`,
      onChanged: () => {
        renderBuffArea(wb);
        renderResults(wb);
        syncHorizontalScroll();
        applyScrollState();
      },
    });
    grid.appendChild(lane);
  }

  scroll.appendChild(grid);
  wrap.appendChild(left);
  wrap.appendChild(scroll);
  area.appendChild(wrap);
}

function renderConfigArea(wb) {
  const area = document.getElementById("configArea");
  const prev = document.getElementById("configScroll");
  if (prev) scrollState.config = prev.scrollLeft;
  area.innerHTML = "";

  const wrap = el("div", { class: "tl-wrap" });
  const left = el("div", { class: "tl-left" });
  const scroll = el("div", { class: "tl-scroll", id: "configScroll" });
  const grid = el("div", { class: "tl-grid", style: `width:${wb.slotCount * SLOT_W}px` });

  const rows = [
    { label: "反应", wbRow: 11, options: wb.reactionOptions || [], cls: "config-reaction" },
    { label: "倾陷状态", wbRow: 12, options: wb.trapStateOptions || [], cls: "config-trap" },
  ];

  for (const r of rows) {
    left.appendChild(el("div", { class: "tl-left-cell compact center" }, [r.label]));
    const lane = renderBubbleLane({
      wb,
      slotCount: wb.slotCount,
      scrollEl: scroll,
      sheet: "云配队",
      laneKey: `config-${r.wbRow}`,
      getCellAddr: (s) => cellAddrForBuffRow(r.wbRow, s),
      getOptions: () => r.options,
      getBlockClass: () => r.cls,
      onChanged: () => {
        renderConfigArea(wb);
        renderResults(wb);
        syncHorizontalScroll();
        applyScrollState();
      },
    });
    grid.appendChild(lane);
  }

  scroll.appendChild(grid);
  wrap.appendChild(left);
  wrap.appendChild(scroll);
  area.appendChild(wrap);
}

function syncHorizontalScroll() {
  const ids = ["actionScroll", "configScroll", "buffScroll"];
  const els = ids.map(id => document.getElementById(id)).filter(Boolean);
  if (els.length < 2) return;
  for (const elx of els) {
    if (elx.dataset.syncAttached === "1") continue;
    elx.dataset.syncAttached = "1";
    elx.addEventListener("scroll", () => {
      if (syncingScroll) return;
      syncingScroll = true;
      for (const other of els) {
        if (other === elx) continue;
        other.scrollLeft = elx.scrollLeft;
      }
      syncingScroll = false;
    }, { passive: true });
  }
}
 
function applyScrollState() {
  const a = document.getElementById("actionScroll");
  const c = document.getElementById("configScroll");
  const b = document.getElementById("buffScroll");
  syncingScroll = true;
  if (a) a.scrollLeft = scrollState.action;
  if (c) c.scrollLeft = scrollState.config;
  if (b) b.scrollLeft = scrollState.buff;
  syncingScroll = false;
}

 function renderResults(wb) {
  const dps = wb.getTeamDps();
  const totalDamage = wb.getTeamTotalDamage();
   document.getElementById("dpsValue").textContent = fmtNum(dps);
   document.getElementById("totalDamage").textContent = fmtNum(totalDamage);
 
   const series = [];
   const labels = [];
   for (let i = 0; i < 4; i++) {
     const name = String(wb.getValue("云配队", `F${4 + i}`) ?? "").trim() || `角色${i + 1}`;
     labels.push(name);
    const v = wb.getTeamContribDamage(i);
    series.push(Number(v) || 0);
   }
 
  const list = document.getElementById("roleContribList");
  list.innerHTML = "";
  const modeKey = "cloudContribMode";
  const mode = (localStorage.getItem(modeKey) || "damage").trim();
  const modes = [
    { key: "damage", label: "贡献伤害" },
    { key: "trap", label: "倾陷" },
    { key: "energy", label: "回能" },
    { key: "ring", label: "环合" },
  ];
  const getMetric = (k, i) => {
    if (k === "damage") return wb.getTeamContribDamage(i);
    if (k === "trap") return wb.getTeamContribTrap(i);
    if (k === "energy") return wb.getTeamContribEnergy(i);
    if (k === "ring") return wb.getTeamContribRing(i);
    return wb.getTeamContribDamage(i);
  };
  const metricLabel = (modes.find(x => x.key === mode)?.label) || "贡献伤害";
  const metricSeries = labels.map((_, i) => Number(getMetric(mode, i)) || 0);
  const tabs = `<div class="metric-tabs">${modes.map(x => `<button class="metric-tab${x.key === mode ? " active" : ""}" data-mode="${x.key}">${x.label}</button>`).join("")}</div>`;
  const rows = labels.map((n, i) => `<tr><td>${n}</td><td style="text-align:right">${fmtNum(metricSeries[i])}</td></tr>`).join("");
  const roleTable = `<table class="table"><thead><tr><th>${metricLabel}</th><th style="text-align:right">数值</th></tr></thead><tbody>${rows}</tbody></table>`;
  const extra = ["创生", "浊燃", "黯星", "倾陷"].map((label) => ({
    label,
    value: wb.getExtraDamage(label),
  }));
  const extraRows = extra.map(x => `<tr><td>${x.label}</td><td style="text-align:right">${fmtNum(x.value)}</td></tr>`).join("");
  const extraTable = `<table class="table" style="margin-top:10px"><thead><tr><th>类型贡献伤害</th><th style="text-align:right">数值</th></tr></thead><tbody>${extraRows}</tbody></table>`;
  const cumTrap = wb.getCumulativeTrap();
  const cumTime = wb.getCumulativeTime();
  const miscRows = [
    { label: "累计倾陷", value: cumTrap },
  ];
  const miscTable = `<table class="table" style="margin-top:10px"><thead><tr><th>其他统计结果</th><th style="text-align:right">数值</th></tr></thead><tbody>${miscRows.map(x => `<tr><td>${x.label}</td><td style="text-align:right">${fmtNum(x.value)}</td></tr>`).join("")}</tbody></table>`;
  list.innerHTML = `${tabs}${roleTable}${extraTable}${miscTable}`;
  list.querySelectorAll(".metric-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.getAttribute("data-mode") || "damage";
      localStorage.setItem(modeKey, next);
      renderResults(wb);
    });
  });

  const pieItems = [];
  for (let i = 0; i < 4; i++) pieItems.push({ name: labels[i], value: series[i] });
  for (const x of extra) pieItems.push({ name: x.label, value: Number(x.value) || 0 });

  const chartDom = document.getElementById("chart");
  const chart = echarts.init(chartDom);
  chart.setOption({
    backgroundColor: "transparent",
    textStyle: { color: "rgba(247,248,255,0.9)" },
    tooltip: {
      trigger: "item",
      formatter: (p) => `${p.name}<br/>${fmtNum(p.value)} (${Number(p.percent).toFixed(1)}%)`,
    },
    series: [
      {
        type: "pie",
        radius: ["34%", "66%"],
        center: ["50%", "54%"],
        avoidLabelOverlap: false,
        minShowLabelAngle: 0,
        itemStyle: { borderColor: "rgba(10,14,28,0.9)", borderWidth: 1 },
        label: {
          show: true,
          position: "outside",
          color: "rgba(247,248,255,0.9)",
          fontSize: 11,
          formatter: (p) => `${p.name}  ${p.percent}%`,
        },
        labelLine: {
          show: true,
          length: 10,
          length2: 10,
          lineStyle: { color: "rgba(247,248,255,0.5)" },
        },
        labelLayout: { hideOverlap: false, moveOverlap: "shiftY" },
        data: pieItems,
      },
    ],
  });
  window.addEventListener("resize", () => chart.resize(), { passive: true });

  const actionDom = document.getElementById("actionShareChart");
  if (!actionDom) return;
  const actionItems = [];
  for (let r = 3; r <= 17; r++) {
    const name = String(wb.getValue("中间", `H${r}`) ?? "").trim();
    const v = wb.getValue("中间", `I${r}`);
    const n = Number(v);
    if (!name) continue;
    if (!Number.isFinite(n) || n <= 0) continue;
    actionItems.push({ name, value: n });
  }
  if (!actionItems.length) {
    actionDom.style.display = "none";
    return;
  }
  actionDom.style.display = "";
  const sum = actionItems.reduce((a, b) => a + b.value, 0);
  const items = actionItems
    .map(x => ({ ...x, pct: sum > 0 ? x.value / sum : 0 }))
    .sort((a, b) => b.value - a.value);

  const inst = echarts.getInstanceByDom(actionDom) || echarts.init(actionDom);
  inst.setOption({
    backgroundColor: "transparent",
    textStyle: { color: "rgba(247,248,255,0.9)" },
    grid: { left: 110, right: 16, top: 18, bottom: 18 },
    xAxis: {
      type: "value",
      max: 100,
      axisLabel: { color: "rgba(247,248,255,0.6)", formatter: "{value}%" },
      splitLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } },
      axisLine: { lineStyle: { color: "rgba(255,255,255,0.18)" } },
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: items.map(x => x.name),
      axisLabel: { color: "rgba(247,248,255,0.75)", width: 96, overflow: "truncate" },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "rgba(255,255,255,0.18)" } },
    },
    series: [
      {
        type: "bar",
        data: items.map(x => Number((x.pct * 100).toFixed(2))),
        barWidth: 10,
        itemStyle: { color: "#8ad1ff" },
        label: {
          show: true,
          position: "right",
          color: "rgba(247,248,255,0.85)",
          formatter: (p) => `${p.value}%`,
        },
      },
    ],
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params) => {
        const p = params && params[0];
        if (!p) return "";
        const idx = p.dataIndex;
        const it = items[idx];
        return `${it.name}<br/>${fmtNum(it.value)} (${(it.pct * 100).toFixed(1)}%)`;
      },
    },
  });
  window.addEventListener("resize", () => inst.resize(), { passive: true });
 }
 
 function renderAll(wb) {
  renderMisc(wb);
  renderActionArea(wb);
  renderConfigArea(wb);
  renderBuffArea(wb);
  renderResults(wb);
  syncHorizontalScroll();
  applyScrollState();
 }
 
function setView(view, wb) {
  activeView = view;
  const mainPanel = document.getElementById("mainPanel");
  const gearPanel = document.getElementById("gearPanel");
  const navGear = document.getElementById("navGear");
  const navMain = document.getElementById("navMain");

  if (view === "gear") {
    if (mainPanel) mainPanel.style.display = "none";
    if (gearPanel) gearPanel.style.display = "block";
    if (navGear) navGear.style.display = "none";
    if (navMain) navMain.style.display = "";
    const table = document.getElementById("gearTable");
    const status = document.getElementById("gearStatus");
    if (table) renderGearTable(wb, table);
    if (status) status.textContent = "已载入（修改会保存到浏览器缓存与本地状态）";
  } else {
    if (gearPanel) gearPanel.style.display = "none";
    if (mainPanel) mainPanel.style.display = "";
    if (navMain) navMain.style.display = "none";
    if (navGear) navGear.style.display = "";
    renderAll(wb);
  }
}

function resolveViewFromHash() {
  return location.hash === "#gear" ? "gear" : "main";
}

 async function main() {
   const statusText = document.getElementById("statusText");
   try {
    await loadDeps();
    const verify = new URLSearchParams(location.search).get("verify");
     const wb = await CloudWorkbook.load();
     window.__cloudWorkbook = wb;
    if (verify === "1") {
      wb.recalc();
    } else {
      const saved = loadState();
      if (saved) {
        try {
          wb.importState(saved);
        } catch {}
      }
      wb.recalc();
    }
    setView(resolveViewFromHash(), wb);
     if (!window.__didInitialScrollReset) {
       window.__didInitialScrollReset = true;
       for (const id of ["actionScroll", "configScroll", "buffScroll"]) {
         const elx = document.getElementById(id);
         if (elx) elx.scrollLeft = 0;
       }
     }
    if (verify === "1") {
      const report = wb.verifyDefault();
      const bad = report.filter(x => !x.ok);
      document.getElementById("traceBox").textContent = bad.length ? JSON.stringify(bad, null, 2) : "验证通过：与xlsx缓存结果近似一致";
    }
    statusText.textContent = "已载入（xlsx已走浏览器缓存）";
    refreshAfterMutation(wb);

    window.addEventListener("hashchange", () => {
      setView(resolveViewFromHash(), wb);
    });

     document.getElementById("exportBtn").addEventListener("click", () => {
       const state = wb.exportState();
       const text = JSON.stringify(state, null, 2);
       const box = document.getElementById("jsonBox");
       box.value = text;
       box.focus();
       box.select();
       saveState(wb);
     });
 
     document.getElementById("importBtn").addEventListener("click", () => {
       const box = document.getElementById("jsonBox");
       const text = box.value.trim();
       if (!text) return;
       const obj = JSON.parse(text);
       wb.importState(obj);
      wb.recalc();
      refreshAfterMutation(wb);
     });
 
    document.addEventListener("click", (e) => {
       const picker = document.getElementById("picker");
       if (picker.style.display === "none") return;
      if (Date.now() - (window.__pickerOpenedAt || 0) < 200) return;
       if (picker.contains(e.target)) return;
       hidePicker();
     });
   } catch (e) {
     statusText.textContent = `加载失败：${e?.message || String(e)}`;
     document.getElementById("traceBox").textContent = e?.stack || "";
   }
 }
 
 main();
