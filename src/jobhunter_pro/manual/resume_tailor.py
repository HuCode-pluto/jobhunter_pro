"""定制内容生成：打招呼语（招聘 APP 私信）、求职信（官网/邮箱）、定制简历。"""
import json

TAILOR_PROMPT = """你是一名资深求职顾问，帮候选人针对具体岗位定制投递材料。
要求：
1. 所有内容基于候选人简历的真实信息措辞，严禁编造经历、技能或数据。
2. 突出与 JD 的匹配点：技能排序按 JD 相关性调整，项目描述强调 JD 关注的技术点。
3. 语言专业、简洁、口语化程度适中（国内招聘语境）。

只输出 JSON：
{
  "greeting": "打招呼语，不超过 200 字，用于招聘 APP 私信开场，点明与岗位的匹配点",
  "cover_letter": "求职信全文，正式语气，适合官网投递/邮件附件，500 字以内",
  "tailored_resume": "定制简历 Markdown 全文（姓名/联系方式/个人总结/技能/工作经历/项目/证书），技能按 JD 相关性排序，每个技能一句话说明",
  "highlight_points": ["投递该岗位的 3 个自我推销要点"]
}"""


def tailor(llm, resume: dict, jd_json: dict) -> dict:
    user = (
        f"候选人简历（事实来源，不可编造）：\n"
        f"{json.dumps(resume, ensure_ascii=False, indent=2)}\n\n"
        f"目标岗位解析结果：\n"
        f"{json.dumps(jd_json, ensure_ascii=False, indent=2)}"
    )
    return llm.chat_json(TAILOR_PROMPT, user, temperature=0.4)


def save_outputs(job_id: int, job_title: str, result: dict, output_dir) -> dict:
    """把定制内容写入 data/output/<job_id>/，返回文件路径映射。"""
    job_dir = output_dir / f"{job_id:04d}"
    job_dir.mkdir(parents=True, exist_ok=True)
    files = {
        "greeting": job_dir / "打招呼语.md",
        "cover_letter": job_dir / "求职信.md",
        "resume": job_dir / "定制简历.md",
    }
    header = f"> 岗位：{job_title}（ID {job_id}）\n\n"
    (job_dir / "打招呼语.md").write_text(header + result.get("greeting", ""), encoding="utf-8")
    (job_dir / "求职信.md").write_text(header + result.get("cover_letter", ""), encoding="utf-8")
    (job_dir / "定制简历.md").write_text(header + result.get("tailored_resume", ""), encoding="utf-8")
    (job_dir / "投递要点.md").write_text(
        header + "\n".join(f"- {p}" for p in result.get("highlight_points", [])),
        encoding="utf-8",
    )
    return {k: str(v) for k, v in files.items()}
