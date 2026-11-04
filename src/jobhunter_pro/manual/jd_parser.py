"""JD 解析：把一段招聘原文解析成结构化岗位信息 + 技能点列表。"""

SYSTEM_PROMPT = """你是一名资深招聘 JD 分析师，负责把招聘信息解析成结构化 JSON。
要求：
1. 所有字段用中文填写；未知/未提及的字段用空字符串或 null，不要编造。
2. 薪资：salary_min/salary_max 填 JD 标注的**原始月薪区间**数字（如 15k-25k → 15000 和 25000）；
   只有年薪的按 /12 折算；**不要**对 13薪/14薪 做乘法折算。
   salary_note 记录薪酬备注原文摘要（如 "14薪"、"13薪"、"年终奖"），没有则空字符串。
3. skill_points 要具体到子领域（如"Linux 性能调优"而不是笼统的"Linux"），
   category 从以下取值：系统/网络/容器/监控/自动化/数据库/云/脚本/安全/项目管理/软技能/其他。
4. level 表示 JD 要求的掌握程度：了解/熟悉/掌握/精通/不限。
5. red_flags 是风险信号，如：驻场、外包、倒班、长期出差、无五险一金等。
6. company_nature 从 JD/公司信息中判断：外企/国企/上市民企/民企/合资/事业单位/其他/未知
   （外资、外商独资、欧美/日资企业→外企；央企、地方国企→国企；已上市的民营企业→上市民企）。
7. company_size_people：如文本出现"公司规模5000人/员工300余人/近千人/万人以上"等，换算为数字；
   确实没有提及才用 null，不要猜测。

只输出 JSON，结构如下：
{
  "title": "岗位名称",
  "company": "公司名称",
  "city": "工作城市，多个用/分隔，远程办公写'远程'",
  "salary_min": 数字或null,
  "salary_max": 数字或null,
  "salary_note": "14薪",
  "years_required": "经验要求原文摘要，如'3-5年'",
  "education_required": "学历要求，如'本科'",
  "company_nature": "外企",
  "company_size_people": 5000,
  "responsibilities": ["职责1", "职责2"],
  "must_have": ["硬性要求1"],
  "nice_to_have": ["加分项1"],
  "skill_points": [
    {"name": "技能点名", "category": "系统", "level": "掌握", "evidence": "JD原文依据"}
  ],
  "red_flags": ["风险点"]
}"""


def parse_jd(llm, jd_text: str) -> dict:
    """调用 LLM 解析 JD，失败时抛异常（由调用方决定降级策略）。"""
    user = f"请解析以下招聘信息（可能包含公司介绍等杂项，聚焦岗位要求部分）：\n\n{jd_text[:6000]}"
    return llm.chat_json(SYSTEM_PROMPT, user)


def detect_role(jd_json: dict, roles_cfg: list[dict]) -> str:
    """按配置的关键词判断岗位属于哪个目标方向；都不匹配返回空串。"""
    text = " ".join(
        [
            jd_json.get("title", ""),
            jd_json.get("company", ""),
            " ".join(jd_json.get("responsibilities", [])),
            " ".join(jd_json.get("must_have", [])),
        ]
    )
    for role in roles_cfg:
        if any(kw in text for kw in role["keywords"]):
            return role["name"]
    return ""


ROLE_PROMPT = """你是岗位方向分类助手。判断 JD 的岗位方向。
规则：
1. 如果 JD 与给定的目标方向之一**接近**（综合职责、技能要求判断，不要只看标题用词），
   role 输出该方向名（必须与定义中的名称完全一致）
2. 否则输出该岗位的**真实方向标签**：4-10 个字的通用岗位方向名（如"技术支持工程师"、
   "测试工程师"、"产品经理"，从标题和职责提炼，不要输出"其他"）
3. reason 用一句话说明判断依据

只输出 JSON：{"role": "", "reason": ""}"""


def detect_role_llm(llm, jd_json: dict, roles_cfg: list[dict]) -> str:
    """关键词未命中时用 LLM 分类：接近目标方向则映射到目标方向，否则输出真实方向标签。"""
    text = " ".join(
        [
            jd_json.get("title", ""),
            jd_json.get("company", ""),
            " ".join(jd_json.get("responsibilities", [])),
            " ".join(jd_json.get("must_have", [])),
            " ".join(sp.get("name", "") for sp in jd_json.get("skill_points", [])),
        ]
    )
    desc = "\n".join(f"- {r['name']}（参考关键词：{'、'.join(r['keywords'])}）" for r in roles_cfg)
    try:
        r = llm.chat_json(ROLE_PROMPT, f"岗位方向定义：\n{desc}\n\nJD 内容：\n{text[:3000]}")
    except Exception:
        return ""
    return (r.get("role") or "").strip()[:20]
