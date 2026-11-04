"""面试复盘 / 题库 / 模拟面试 / 准备包 的 LLM 逻辑。"""
import json

ANALYZE_PROMPT = """你是资深面试复盘教练，分析一场面试的转写文本，输出结构化复盘。

要求：
1. 提取面试官提出的所有实质问题（寒暄、流程性话语不算），按出现顺序编号
2. category 从以下取值：技术基础/项目经历/行为素质/薪资期望/岗位反问/其他
3. your_answer 用 2-3 句概括候选人当时的回答（忠于原文，不美化不脑补）
4. your_answer_rating 对现场回答打分 1-5（5=满分）
5. reference_answer 是该问题的高分参考答案：结合候选人简历和岗位 JD 定制，3-6 句，
   具体可操作（技术题给知识点要点，项目题给 STAR 结构示例，行为题给表达框架），可直接背诵
6. gap 指出现场回答与高分答案的差距及改进点（1-2 句）
7. summary 整体复盘：overall_score 0-100；highlights 亮点；mistakes 失误；
   improvements 改进清单（可执行）；follow_up_suggestions 后续跟进建议（如感谢信要点、何时跟进）；
   skill_gaps 技能短板列表（供学习计划使用）

只输出 JSON：
{
  "questions": [
    {"seq": 1, "question": "", "category": "", "your_answer": "",
     "your_answer_rating": 3, "reference_answer": "", "gap": ""}
  ],
  "summary": {
    "overall_score": 0, "highlights": [""], "mistakes": [""], "improvements": [""],
    "follow_up_suggestions": [""],
    "skill_gaps": [{"skill": "", "reason": ""}]
  }
}"""


def analyze_interview(llm, transcript: str, resume: dict, jd_info: dict | None) -> dict:
    """一次调用完成：问题提取 + 参考回答 + 差距分析 + 整体总结。"""
    resume_brief = {
        "summary": resume.get("summary", ""),
        "skills": [s["name"] for s in resume.get("skills", [])],
        "work_experience": resume.get("work_experience", []),
    }
    user = (
        f"候选人简历：\n{json.dumps(resume_brief, ensure_ascii=False, indent=2)}\n\n"
        f"岗位信息（可能为空）：\n{json.dumps(jd_info or {}, ensure_ascii=False, indent=2)}\n\n"
        f"面试转写文本：\n{transcript[:20000]}"
    )
    return llm.chat_json(ANALYZE_PROMPT, user, temperature=0.3)


PREP_PROMPT = """你是资深面试教练。根据岗位 JD 和候选人简历，生成面试准备包。
要求：
1. questions 列出该岗位最可能被问的 10 个问题，按可能性排序
2. 每个问题给出：why（为什么会问这个，考察什么）、reference_answer（结合候选人简历定制的高分回答，3-6 句）
3. tips 给出 3 条针对该岗位的面试策略建议

只输出 JSON：
{"questions": [{"question": "", "why": "", "reference_answer": ""}], "tips": [""]}"""


def prep_pack(llm, jd_json: dict, resume: dict) -> dict:
    user = (
        f"岗位 JD：\n{json.dumps(jd_json, ensure_ascii=False, indent=2)}\n\n"
        f"候选人简历：\n{json.dumps(resume, ensure_ascii=False, indent=2)}"
    )
    return llm.chat_json(PREP_PROMPT, user, temperature=0.5)


MOCK_PROMPT = """你是{role}方向的资深面试官，正在面试一位候选人。
规则：
1. 每次只问一个问题，从易到难递进，覆盖：技术基础 → 项目深挖 → 场景题 → 行为题
2. 候选人回答后，先给 1-2 句简短点评（指出对错/亮点），再问下一个问题
3. 结合岗位 JD 和候选人简历提问，问题要像真实面试
4. 累计 5-8 个问题后收尾：给出整体评价（优点/不足/建议）和预估通过概率
5. reply 字段：点评+下一问（或收尾总结）；finished 表示是否收尾

只输出 JSON：{"reply": "", "finished": false}"""


def mock_interviewer(llm, role: str, resume: dict, jd_json: dict | None, history: list[dict]) -> dict:
    # 注意：不能用 .format()——提示词里的 JSON 示例含花括号会被误解析，用 replace 注入角色名
    sys_prompt = MOCK_PROMPT.replace("{role}", role or "技术")
    user = (
        f"候选人简历：\n{json.dumps(resume, ensure_ascii=False)}\n\n"
        f"岗位 JD：\n{json.dumps(jd_json or {}, ensure_ascii=False)}\n\n"
        f"对话历史（最近 10 轮）：\n{json.dumps(history[-10:], ensure_ascii=False)}"
    )
    return llm.chat_json(sys_prompt, user, temperature=0.7)
