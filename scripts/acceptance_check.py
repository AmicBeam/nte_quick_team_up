import json

from dataclasses import dataclass

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError


@dataclass
class CheckResult:
  name: str
  ok: bool
  detail: str = ""


def main() -> int:
  base_url = "http://127.0.0.1:5000"
  results: list[CheckResult] = []

  with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context()

    page = context.new_page()
    console_errors: list[str] = []
    page_errors: list[str] = []
    request_failed: list[str] = []

    def on_console(msg):
      if msg.type in ("error",):
        console_errors.append(msg.text)

    page.on("console", on_console)
    page.on("pageerror", lambda exc: page_errors.append(str(exc)))
    def on_request_failed(req):
      fail = getattr(req, "failure", None)
      if fail is None:
        err = ""
      elif isinstance(fail, str):
        err = fail
      else:
        err = getattr(fail, "error_text", "") or ""
      request_failed.append(f"{req.method} {req.url} {err}".strip())

    page.on("requestfailed", on_request_failed)

    try:
      page.goto(f"{base_url}/cloud-team?verify=1", wait_until="domcontentloaded", timeout=15000)
      page.wait_for_selector("#statusText", timeout=15000)
      try:
        page.wait_for_function(
          "document.querySelector('#statusText') && document.querySelector('#statusText').textContent.includes('已载入')",
          timeout=45000,
        )
      except PlaywrightTimeoutError:
        pass

      trace = (page.locator("#traceBox").text_content() or "").strip()
      dps = (page.locator("#dpsValue").text_content() or "").strip()
      total = (page.locator("#totalDamage").text_content() or "").strip()
      status = (page.locator("#statusText").text_content() or "").strip()

      results.append(CheckResult("cloud-team loaded", "加载失败" not in status, status))
      results.append(CheckResult("dps rendered", dps not in ("", "—"), f"dps={dps}"))
      results.append(CheckResult("total damage rendered", total not in ("", "—"), f"total={total}"))

      if "验证通过" in trace:
        results.append(CheckResult("default verify", True, trace))
      elif trace:
        try:
          obj = json.loads(trace)
          bad = [x for x in obj if isinstance(x, dict) and not x.get("ok", False)]
          results.append(CheckResult("default verify", len(bad) == 0, json.dumps(bad, ensure_ascii=False)))
        except Exception:
          results.append(CheckResult("default verify", False, f"unexpected traceBox: {trace[:400]}"))
      else:
        results.append(CheckResult("default verify", False, "traceBox empty"))

    except PlaywrightTimeoutError as e:
      results.append(CheckResult("cloud-team loaded", False, f"timeout: {e}"))

    try:
      page2 = context.new_page()
      page2.goto(f"{base_url}/cloud-gear", wait_until="domcontentloaded", timeout=15000)
      page2.wait_for_selector("#gearTable", timeout=15000, state="attached")
      page2.wait_for_selector("#gearStatus", timeout=15000, state="attached")
      page2.wait_for_function(
        "document.querySelectorAll('#gearTable tbody tr').length >= 1 || (document.querySelector('#gearStatus') && document.querySelector('#gearStatus').textContent.includes('加载失败'))",
        timeout=45000,
      )
      row_count = page2.locator("#gearTable tbody tr").count()
      results.append(CheckResult("cloud-gear rows", row_count >= 1, f"rows={row_count}"))

      first_role = (page2.locator("#gearTable tbody tr td").first.text_content() or "").strip()
      results.append(CheckResult("cloud-gear role cell", len(first_role) > 0, first_role[:80]))
    except PlaywrightTimeoutError as e:
      results.append(CheckResult("cloud-gear rows", False, f"timeout: {e}"))

    if console_errors:
      results.append(CheckResult("console errors", False, "; ".join(console_errors[:5])))
    else:
      results.append(CheckResult("console errors", True))
 
    if page_errors:
      results.append(CheckResult("page errors", False, "; ".join(page_errors[:3])[:800]))
    else:
      results.append(CheckResult("page errors", True))
 
    if request_failed:
      results.append(CheckResult("request failed", False, "; ".join(request_failed[:3])[:800]))
    else:
      results.append(CheckResult("request failed", True))

    browser.close()

  failed = [r for r in results if not r.ok]
  for r in results:
    status = "PASS" if r.ok else "FAIL"
    detail = f" - {r.detail}" if r.detail else ""
    print(f"[{status}] {r.name}{detail}")

  if failed:
    print("\nFAILED CHECKS:")
    for r in failed:
      print(f"- {r.name}: {r.detail}")
    return 1

  return 0


if __name__ == "__main__":
  raise SystemExit(main())
