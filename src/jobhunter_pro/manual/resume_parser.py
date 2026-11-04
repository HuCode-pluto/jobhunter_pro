"""简历解析：把简历原文解析成 resume.yaml 的结构化数据。"""
import yaml

RESUME_PARSE_PROMPT = """你是简历结构化助手，把候选人简历文本解析成指定 JSON 结构。
要求：
1. 忠于原文，不编造经历、技能或数据；原文缺失的字段用空字符串、空数组或 null。
2. years_of_experience 从工作经历时间推算（数字，算不出用 null）。
3. skills.name 用规范技能名（如 "Linux"、"Python"、"Docker/Kubernetes"、"Prometheus"），
   level 用 了解/熟悉/熟练/精通，detail 用一句话说明掌握程度。
4. work_experience.highlights 每段工作 3-5 条成果点，保留原文数字（如"200+ 台服务器"）。
5. summary 用 1-2 句话概括候选人画像。
6. certs 只列证书名（如 RHCE、CKA）。

只输出 JSON，结构如下：
{
  "basic": {"name": "", "phone": "", "email": "", "city": "", "years_of_experience": null,
            "education": "", "school": "", "major": ""},
  "summary": "",
  "skills": [{"name": "", "level": "", "detail": ""}],
  "work_experience": [{"company": "", "title": "", "period": "", "highlights": [""]}],
  "projects": [{"name": "", "period": "", "description": ""}],
  "certs": [""]
}"""


def parse_resume(llm, text: str) -> dict:
    """把简历原文解析为 resume.yaml 结构。"""
    return llm.chat_json(RESUME_PARSE_PROMPT, text[:8000])


def to_yaml(data: dict) -> str:
    return yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=100)
