"""匹配打分：硬条件过滤（城市/薪资/红线词）+ LLM 综合打分。"""
import json


def hard_filters(jd_json: dict, jd_raw: str, role_cfg: dict, extra: dict | None = None) -> list[str]:
    """返回未通过的原因列表；空列表 = 通过。

    extra 是搜索页传入的额外筛选：{nature: [外企,国企,...], size_min: 人数, salary_min: 月薪}
    这些是严格筛选：JD 未注明相应信息也会被排除。
    """
    extra = extra or {}
    reasons = []

    city = jd_json.get("city") or ""
    cities = role_cfg.get("cities", [])
    if city and cities:
        hit = any(c in city for c in cities) or (
            "远程" in cities and "远程" in city
        )
        if not hit:
            reasons.append(f"城市不匹配：{city}（期望 {cities}）")

    # 薪资区间：JD 标注区间与期望区间无交集 → 排除
    smin = extra.get("salary_min") or role_cfg.get("salary_min", 0)
    smax = extra.get("salary_max") or 0
    jd_smin = jd_json.get("salary_min")
    jd_smax = jd_json.get("salary_max")
    if (smin or smax) and jd_smax:
        if jd_smax < smin or (smax and jd_smin and jd_smin > smax):
            want = f"{smin}-{smax}" if smax else f"{smin}+"
            reasons.append(
                f"薪资区间 {jd_smin or '?'}-{jd_smax} 与期望 {want} 无交集"
            )

    # 公司性质（严格：未注明/不在所选范围 → 排除）
    nature_sel = [n for n in (extra.get("nature") or []) if n]
    if nature_sel:
        nature = jd_json.get("company_nature") or "未知"
        if nature not in nature_sel:
            reasons.append(f"公司性质为「{nature}」，不在所选范围（{nature_sel}）")

    # 公司规模（严格：未注明 → 排除）
    size_min = extra.get("size_min") or 0
    if size_min:
        people = jd_json.get("company_size_people")
        if not people:
            reasons.append("JD 未注明公司规模")
        elif people < size_min:
            reasons.append(f"公司规模 {people} 人，低于要求 {size_min} 人")

    for kw in role_cfg.get("exclude_keywords", []):
        if kw in jd_raw:
            reasons.append(f"命中排除词：{kw}")
    # 通用评分配置（非目标方向）不把风险点当排除理由，只作参考
    if not role_cfg.get("no_red_flags"):
        for flag in jd_json.get("red_flags", []):
            reasons.append(f"风险点：{flag}")

    return reasons


def keyword_score(resume: dict, jd_json: dict) -> float:
    """关键词兜底打分：简历技能名与 JD 技能点/要求的重合度（0-100）。"""
    resume_text = " ".join(s["name"] + " " + s["detail"] for s in resume.get("skills", []))
    jd_skills = " ".join(sp["name"] for sp in jd_json.get("skill_points", []))
    jd_must = " ".join(jd_json.get("must_have", []))
    hits = 0
    total = 0
    for sp in jd_json.get("skill_points", []):
        total += 1
        name = sp["name"]
        # 技能点名或其关键词出现在简历里即算命中
        if any(seg in resume_text for seg in name.replace("/", " ").split()):
            hits += 1
    return round(hits / total * 100, 1) if total else 0.0


SCORE_PROMPT = """你是一名资深招聘顾问，评估候选人与岗位 JD 的匹配度。
基于简历和岗位解析结果，给出 0-100 的匹配分（60 分=基本可投，80 分=高度匹配）。
只输出 JSON：
{
  "score": 数字,
  "summary": "匹配结论，2-3 句话",
  "strengths": ["候选人的优势点"],
  "missing_skills": ["候选人欠缺/简历未体现的技能点，用于学习计划"],
  "advice": "投递建议，1 句话"
}"""


def llm_score(llm, resume: dict, jd_json: dict) -> dict:
    resume_brief = {
        "summary": resume.get("summary", ""),
        "skills": resume.get("skills", []),
        "years": resume.get("basic", {}).get("years_of_experience"),
        "work_experience": resume.get("work_experience", []),
        "certs": resume.get("certs", []),
    }
    user = (
        f"候选人简历：\n{json.dumps(resume_brief, ensure_ascii=False, indent=2)}\n\n"
        f"岗位解析结果：\n{json.dumps(jd_json, ensure_ascii=False, indent=2)}"
    )
    return llm.chat_json(SCORE_PROMPT, user)


def score_job(llm, resume: dict, jd_json: dict, jd_raw: str, role_cfg: dict, extra: dict | None = None) -> dict:
    """综合评估：返回 {reasons, score, missing_skills, report}。

    无论是否被硬条件排除都打分（分数对用户始终有参考价值）；
    reasons 非空时由调用方决定标记为 rejected 并保存排除原因。
    """
    reasons = hard_filters(jd_json, jd_raw, role_cfg, extra)

    try:
        report = llm_score(llm, resume, jd_json)
        score = float(report.get("score", 0))
    except Exception as e:
        # LLM 失败时用关键词兜底，保证流程能跑完
        score = keyword_score(resume, jd_json)
        report = {
            "score": score,
            "summary": f"（LLM 打分失败，使用关键词兜底分）{e}",
            "strengths": [],
            "missing_skills": [],
            "advice": "",
        }
    return {
        "reasons": reasons,
        "score": score,
        "missing_skills": report.get("missing_skills", []),
        "report": report,
    }


# 非目标方向岗位的通用评分配置（不做城市/薪资/排除词/风险点硬过滤，只评估匹配度）
GENERIC_ROLE_CFG = {"cities": [], "salary_min": 0, "exclude_keywords": [], "no_red_flags": True}
