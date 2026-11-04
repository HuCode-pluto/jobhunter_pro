"""简历 PDF 导出：HTML → 本机 Chrome 打印为 PDF。

- 基础简历：结构化简历（resume_structured.yaml）→ 结构化 HTML → PDF
- 定制简历：岗位定制简历 Markdown → 简易 HTML → PDF

渲染走项目的 Browser Runtime CDP（Page.printToPDF），零新增依赖；
CDP 不可用时降级为 patchright 启动本机 Chrome 打印。
"""
import re
import tempfile
import time
from pathlib import Path

CSS = """
body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; color: #222; line-height: 1.7; margin: 0; }
h1 { font-size: 22px; text-align: center; margin: 4px 0 2px; }
h2 { font-size: 15px; border-bottom: 2px solid #2563eb; padding-bottom: 3px; margin: 18px 0 8px; color: #2563eb; }
h3 { font-size: 13px; margin: 10px 0 4px; }
p, li { font-size: 12px; margin: 3px 0; }
ul { margin: 2px 0 6px 18px; padding: 0; }
.subtitle { text-align: center; color: #555; font-size: 12px; margin-bottom: 10px; }
.meta { text-align: center; font-size: 11px; color: #666; }
b { color: #000; }
"""


def _inline(s: str) -> str:
    s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    return s


def md_to_html(md: str) -> str:
    """简易 Markdown → HTML（标题/列表/粗体，够简历用）。"""
    out, in_list = [], False
    for line in md.split("\n"):
        t = line.strip()
        if not t:
            if in_list:
                out.append("</ul>")
                in_list = False
            continue
        if t.startswith("### "):
            if in_list:
                out.append("</ul>")
                in_list = False
            out.append(f"<h3>{_inline(t[4:])}</h3>")
        elif t.startswith("## "):
            if in_list:
                out.append("</ul>")
                in_list = False
            out.append(f"<h2>{_inline(t[3:])}</h2>")
        elif t.startswith("# "):
            if in_list:
                out.append("</ul>")
                in_list = False
            out.append(f"<h1>{_inline(t[2:])}</h1>")
        elif t.startswith("- "):
            if not in_list:
                out.append("<ul>")
                in_list = True
            out.append(f"<li>{_inline(t[2:])}</li>")
        else:
            if in_list:
                out.append("</ul>")
                in_list = False
            out.append(f"<p>{_inline(t)}</p>")
    if in_list:
        out.append("</ul>")
    return "\n".join(out)


def resume_to_html(resume: dict) -> str:
    """结构化简历 → 简历 HTML。"""
    b = resume.get("basic", {})
    lines = [f"<h1>{_inline(b.get('name', ''))}</h1>"]
    meta = " ｜ ".join(
        x for x in [b.get("phone", ""), b.get("email", ""), b.get("city", ""),
                    f"{b.get('years_of_experience', '')}年经验" if b.get("years_of_experience") else "",
                    b.get("education", ""), b.get("school", ""), b.get("major", "")]
        if x
    )
    lines.append(f'<p class="meta">{_inline(meta)}</p>')
    lines.append(f'<h2>个人总结</h2><p>{_inline(resume.get("summary", ""))}</p>')
    lines.append("<h2>技能</h2><ul>")
    for s in resume.get("skills", []):
        lines.append(f"<li><b>{_inline(s.get('name', ''))}</b>（{_inline(s.get('level', ''))}）：{_inline(s.get('detail', ''))}</li>")
    lines.append("</ul>")
    lines.append("<h2>工作经历</h2>")
    for w in resume.get("work_experience", []):
        lines.append(f"<h3>{_inline(w.get('company', ''))} · {_inline(w.get('title', ''))}（{_inline(w.get('period', ''))}）</h3><ul>")
        for h in w.get("highlights", []):
            lines.append(f"<li>{_inline(h)}</li>")
        lines.append("</ul>")
    if resume.get("projects"):
        lines.append("<h2>项目</h2>")
        for p in resume.get("projects", []):
            lines.append(f"<h3>{_inline(p.get('name', ''))}{'（' + _inline(p['period']) + '）' if p.get('period') else ''}</h3>")
            lines.append(f"<p>{_inline(p.get('description', ''))}</p>")
    if resume.get("certs"):
        lines.append("<h2>证书</h2><p>" + "、".join(_inline(c) for c in resume["certs"]) + "</p>")
    return f"<html><head><meta charset='utf-8'><style>{CSS}</style></head><body>{''.join(lines)}</body></html>"


def _render_pdf_via_cdp(html: str, out_path: Path) -> bool:
    """Browser Runtime Page.printToPDF 打印 A4 PDF。"""
    from jobhunter_pro.browser import close_tab, new_tab, print_pdf, wait_for_load

    out_path = out_path.expanduser().resolve()
    temp_html = Path(tempfile.gettempdir()) / "jobhunter_pro_library_resume.html"
    temp_html.write_text(html, encoding="utf-8")
    file_url = f"file:///{temp_html.as_posix()}"
    try:
        for attempt in range(2):
            target_id = None
            try:
                target_id = new_tab(file_url, background=True)
                if target_id and wait_for_load(target_id, timeout=10):
                    out_path.parent.mkdir(parents=True, exist_ok=True)
                    out_path.unlink(missing_ok=True)
                    if print_pdf(target_id, out_path) and out_path.exists() and out_path.stat().st_size > 0:
                        return True
            except Exception:
                pass
            finally:
                if target_id:
                    close_tab(target_id)
            if attempt == 0:
                time.sleep(0.5)
        return False
    finally:
        temp_html.unlink(missing_ok=True)


def _render_pdf_via_patchright(html: str, out_path: Path) -> bool:
    """CDP 不可用时的降级：patchright 启动本机 Chrome 打印。"""
    from patchright.sync_api import sync_playwright

    out_path.parent.mkdir(parents=True, exist_ok=True)
    p = sync_playwright().start()
    try:
        browser = None
        for channel in ("chrome", None):
            try:
                kwargs = {"headless": True}
                if channel:
                    kwargs["channel"] = channel
                browser = p.chromium.launch(**kwargs)
                break
            except Exception:
                continue
        if not browser:
            return False
        page = browser.new_page()
        page.set_content(html, wait_until="load")
        page.pdf(
            path=str(out_path),
            format="A4",
            margin={"top": "18mm", "bottom": "18mm", "left": "16mm", "right": "16mm"},
            print_background=True,
        )
        browser.close()
        return out_path.exists() and out_path.stat().st_size > 0
    finally:
        p.stop()


def render_pdf(html: str, out_path: Path) -> Path:
    """用本机 Chrome 把 HTML 打印为 A4 PDF（CDP 优先，patchright 兜底）。"""
    if _render_pdf_via_cdp(html, out_path):
        return out_path
    if _render_pdf_via_patchright(html, out_path):
        return out_path
    raise RuntimeError("简历 PDF 导出失败：请确认 Chrome 调试端口可用（jobhunter connect）")


def export_base_resume(resume: dict, output_dir: Path) -> Path:
    out = output_dir / f"简历_{resume.get('basic', {}).get('name', '候选人')}.pdf"
    out.parent.mkdir(parents=True, exist_ok=True)
    return render_pdf(resume_to_html(resume), out)


def export_tailored_resume(job_id: int, markdown: str, output_dir: Path) -> Path:
    out = output_dir / f"{job_id:04d}" / "定制简历.pdf"
    out.parent.mkdir(parents=True, exist_ok=True)
    return render_pdf(
        f"<html><head><meta charset='utf-8'><style>{CSS}</style></head>"
        f"<body>{md_to_html(markdown)}</body></html>", out
    )
