"""技能地图生成：聚合 JD 技能点 → 按频次排序 → 关联学习资料 → 输出 Markdown。"""
import sqlite3
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from jobhunter_pro.manual.db import list_manual_skills, match_manual_materials

ADVICE_PROMPT = """你是资深运维/实施方向的导师。针对以下高频技能点，给出每个 2-3 句学习建议：
学什么核心内容、怎么练（实践方式）、大约需要多久。只输出 JSON：{ "技能点名": "建议" }"""


def build(conn: sqlite3.Connection, role_name: str, output_dir: Path, top: int = 40, llm=None) -> Path | None:
    """生成技能地图 Markdown，返回文件路径；技能库为空返回 None。"""
    skills = list_manual_skills(conn, role=role_name, limit=top)
    if not skills:
        return None

    job_count = conn.execute(
        "SELECT COUNT(*) FROM manual_jobs WHERE role_type = ?", (role_name,)
    ).fetchone()[0]

    # 按分类分组
    by_category = defaultdict(list)
    for s in skills:
        by_category[s["category"] or "其他"].append(s)

    advice = {}
    if llm:
        try:
            top10 = {s["name"] for s in skills[:10]}
            user = "技能点列表：\n" + "\n".join(f"- {n}" for n in top10)
            advice = llm.chat_json(ADVICE_PROMPT, user)
        except Exception:
            pass

    lines = [
        f"# 技能地图 — {role_name}",
        "",
        f"> 生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}　"
        f"数据来源：{job_count} 个 JD，共 {len(skills)} 个技能点",
        "",
        "## 统计总览（按出现频次）",
        "",
        "| 技能点 | 分类 | 出现频次 |",
        "|---|---|---|",
    ]
    for s in skills:
        lines.append(f"| {s['name']} | {s['category'] or '其他'} | {s['frequency']} |")

    category_order = ["系统", "网络", "容器", "监控", "自动化", "数据库", "云", "脚本", "安全", "项目管理", "软技能", "其他"]
    for cat in category_order:
        if cat not in by_category:
            continue
        lines += ["", f"## {cat}", ""]
        for s in by_category[cat]:
            lines.append(f"### {s['name']}（出现 {s['frequency']} 次）")
            if s["name"] in advice:
                lines += ["", f"> 💡 学习建议：{advice[s['name']]}"]
            mats = match_manual_materials(conn, s["name"], top=4)
            if mats:
                lines.append("")
                for m in mats:
                    lines.append(f"- [{m['title']}]({m['url']})（{m['type']}）— {m['summary']}")
            else:
                lines += ["", "（资料库暂无匹配）"]
            lines.append("")

    out = output_dir / f"技能地图_{role_name}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines), encoding="utf-8")
    return out
