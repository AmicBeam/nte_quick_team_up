const VERSION = new URL(import.meta.url).searchParams.get("v") || "";
let CloudWorkbook = null;

async function loadWorkbook() {
  if (CloudWorkbook) return;
  const mod = await import(`./cloudWorkbook.js${VERSION ? `?v=${VERSION}` : ""}`);
  CloudWorkbook = mod.CloudWorkbook;
}
 
const STORAGE_KEY = "cloudTeamState:v3";
 
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
 
 function toNumOrNull(s) {
   const t = String(s ?? "").trim();
   if (!t) return null;
   const n = Number(t);
   return Number.isFinite(n) ? n : null;
 }
 
export function renderGearTable(wb, table) {
   table.innerHTML = "";
 
   const head = el("tr", {}, [
     el("th", {}, ["角色"]),
     el("th", {}, ["适配"]),
     el("th", {}, ["弧盘"]),
     el("th", {}, ["卡带"]),
     el("th", {}, ["卡带主词条"]),
     el("th", {}, ["副词条"]),
     el("th", {}, ["觉醒激活"]),
   ]);
   table.appendChild(el("thead", {}, [head]));
 
   const body = el("tbody");
 
   for (let i = 0; i < wb.characters.length; i++) {
     const rowNum = 3 + i;
     const name = String(wb.getValue("配装", `A${rowNum}`) ?? "").trim();
     if (!name) continue;
     const fit = String(wb.getValue("配装", `C${rowNum}`) ?? "").trim();
 
     const avatarSrc = wb.getRoleAvatar(name) || "/static/%E5%8D%95%E4%BD%8D.jpg";
    const img = el("img", { class: "avatar", src: avatarSrc });
    img.addEventListener("error", () => { img.src = "/static/%E5%8D%95%E4%BD%8D.jpg"; }, { once: true });
    const roleCell = el("td", {}, [el("div", { class: "role-row" }, [img, el("div", {}, [name])])]);
 
     const fitCell = el("td", {}, [fit || "—"]);
 
     const arcSel = el("select", {}, wb.getArcOptionsForCharacter(name).map(o => el("option", { value: o }, [o])));
     arcSel.value = String(wb.getValue("配装", `V${rowNum}`) ?? "");
     arcSel.addEventListener("change", () => {
       wb.setValue("配装", `V${rowNum}`, arcSel.value || null);
       wb.recalc();
       saveState(wb);
     });
     const arcCell = el("td", {}, [arcSel]);
 
     const casSel = el("select", {}, wb.cassettes.map(o => el("option", { value: o }, [o])));
     casSel.value = String(wb.getValue("配装", `X${rowNum}`) ?? "");
     casSel.addEventListener("change", () => {
       wb.setValue("配装", `X${rowNum}`, casSel.value || null);
       wb.recalc();
       saveState(wb);
     });
     const casCell = el("td", {}, [casSel]);
 
     const mainSel = el("select", {}, wb.mainStatOptions.map(o => el("option", { value: o }, [o])));
     mainSel.value = String(wb.getValue("配装", `AB${rowNum}`) ?? "");
     mainSel.addEventListener("change", () => {
       wb.setValue("配装", `AB${rowNum}`, mainSel.value || null);
       wb.recalc();
       saveState(wb);
     });
     const mainCell = el("td", {}, [mainSel]);
 
     const subCols = [
       { col: "AG", label: "全伤" },
       { col: "AH", label: "暴击" },
       { col: "AI", label: "暴伤" },
       { col: "AJ", label: "精通" },
       { col: "AK", label: "倾陷" },
       { col: "AL", label: "攻击%" },
       { col: "AM", label: "攻击" },
       { col: "AN", label: "生命%" },
       { col: "AO", label: "生命" },
       { col: "AP", label: "防御%" },
       { col: "AQ", label: "防御" },
     ];
    const subWrap = el("div", { class: "chip-row" });
     for (const sc of subCols) {
       const addr = `${sc.col}${rowNum}`;
       const inp = el("input", { type: "number", step: "0.001", value: String(wb.getValue("配装", addr) ?? ""), style: "width:110px" });
       inp.addEventListener("change", () => {
         wb.setValue("配装", addr, toNumOrNull(inp.value) ?? 0);
         wb.recalc();
         saveState(wb);
       });
       subWrap.appendChild(el("div", { class: "chip" }, [el("span", {}, [sc.label]), inp]));
     }
     const subCell = el("td", {}, [subWrap]);
 
     const awakCols = [
       { col: "AR", label: "A" },
       { col: "AS", label: "B" },
       { col: "AT", label: "C" },
       { col: "AU", label: "D" },
       { col: "AV", label: "E" },
       { col: "AW", label: "F" },
     ];
     const awakWrap = el("div", { class: "check-row" });
     for (const ac of awakCols) {
       const addr = `${ac.col}${rowNum}`;
       const cur = Boolean(wb.getValue("配装", addr));
       const box = el("input", { type: "checkbox" });
       box.checked = cur;
       box.addEventListener("change", () => {
         wb.setValue("配装", addr, box.checked ? true : false);
         wb.recalc();
         saveState(wb);
       });
       const item = el("label", { class: "check" }, [box, ac.label]);
       awakWrap.appendChild(item);
     }
     const awakCell = el("td", {}, [awakWrap]);
 
    body.appendChild(el("tr", {}, [roleCell, fitCell, arcCell, casCell, mainCell, subCell, awakCell]));
   }
 
   table.appendChild(body);
 }
 
export async function initGearStandalone() {
  const gearStatus = document.getElementById("gearStatus");
  const table = document.getElementById("gearTable");
   try {
    await loadWorkbook();
     const wb = await CloudWorkbook.load();
     const saved = loadState();
     if (saved) {
       try {
         wb.importState(saved);
       } catch {}
     } else {
       wb.recalc();
     }
    renderGearTable(wb, table);
     gearStatus.textContent = "已载入（修改会保存到浏览器缓存与本地状态）";
   } catch (e) {
     gearStatus.textContent = `加载失败：${e?.message || String(e)}`;
   }
 }
 
if (document.getElementById("gearTable") && !window.__cloudWorkbook) {
  initGearStandalone();
}
