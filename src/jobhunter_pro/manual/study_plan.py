"""30 天学习计划：技能地图（频次）+ 面试技能短板 + 资料库 → LLM 生成每日计划。"""
import json
import sqlite3
from pathlib import Path

from jobhunter_pro.manual.db import list_manual_skills, match_manual_materials

PLAN_PROMPT = """你是资深运维/实施方向的学习规划师。根据候选人的高频技能点、面试暴露的短板和可用学习资料，生成一份 30 天学习计划。

要求：
1. 按 4 周组织：每周一个主题，每周 5 天学习任务 + 1 天实战 + 1 天复盘
2. 每天任务具体可执行：学什么、用什么资料（优先用给出的资料链接）、做什么实践练习
3. 高频技能点优先安排，面试短板重点穿插（用「短板」标注）
4. 每天学习量控制在 1-2 小时（在职学习）
5. 输出 Markdown：标题、每周概览、每日任务（含资料链接）、每周复盘要点

只输出 JSON：{"markdown": "完整 Markdown 内容"}"""


def build_plan(llm, conn: sqlite3.Connection, role_name: str, output_dir: Path, top: int = 30) -> tuple[Path, str]:
    """生成学习计划，返回（文件路径, markdown 内容）。"""
    skills = list_manual_skills(conn, role=role_name, limit=top)
    if not skills:
        raise ValueError(f"技能库为空：先添加一些 JD（手动加岗位）再生成学习计划")

    # 高频技能点 + 匹配资料
    skill_lines = []
    for s in skills:
        mats = match_manual_materials(conn, s["name"], top=3)
        mat_str = "；".join(f"{m['title']}（{m['url']}）" for m in mats)
        skill_lines.append(f"- {s['name']}（出现 {s['frequency']} 次）：资料：{mat_str or '无'}")

    # 面试技能短板（最近 10 场面试的 skill_gaps）
    gap_lines = []
    rows = conn.execute(
        "SELECT report_json FROM manual_interviews WHERE status = 'done' ORDER BY id DESC LIMIT 10"
    ).fetchall()
    seen = set()
    for r in rows:
        try:
            report = json.loads(r["report_json"])
        except Exception:
            continue
        for g in report.get("summary", {}).get("skill_gaps", []):
            name = g.get("skill", "")
            if name and name not in seen:
                seen.add(name)
                gap_lines.append(f"- {name}：{g.get('reason', '')}")

    user = (
        f"目标方向：{role_name}\n\n"
        f"高频技能点（JD 统计）：\n{chr(10).join(skill_lines)}\n\n"
        f"面试暴露的短板：\n{chr(10).join(gap_lines) or '（暂无面试复盘数据）'}"
    )
    result = llm.chat_json(PLAN_PROMPT, user, temperature=0.5)
    md = result.get("markdown", "")
    if not md:
        raise ValueError("学习计划生成失败（LLM 未返回内容）")
    out = output_dir / f"学习计划_{role_name}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(md, encoding="utf-8")
    return out, md
