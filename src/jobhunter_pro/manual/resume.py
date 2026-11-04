"""结构化简历（resume_structured.yaml）缓存与解析编排。

手动流水线的打分/定制/面试复盘共用这份结构化简历；由
/api/library/resume/parse 生成，或首次使用时从 profile.resume_path 原文解析。
"""
from pathlib import Path

import yaml

from jobhunter_pro.manual.resume_parser import parse_resume

STRUCTURED_RESUME_NAME = "resume_structured.yaml"


def structured_resume_path(data_dir: Path) -> Path:
    return data_dir / STRUCTURED_RESUME_NAME


def load_structured_resume(data_dir: Path) -> dict | None:
    """读取结构化简历缓存；不存在或损坏返回 None。"""
    path = structured_resume_path(data_dir)
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        return None
    return data if isinstance(data, dict) else None


def save_structured_resume(data_dir: Path, data: dict) -> Path:
    """写入结构化简历缓存（yaml，UTF-8），返回路径。"""
    path = structured_resume_path(data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=100),
        encoding="utf-8",
    )
    return path


def ensure_structured_resume(llm, config: dict, data_dir: Path) -> dict:
    """返回结构化简历：优先缓存；否则从 profile.resume_path 原文解析并缓存。

    解析失败抛 ValueError（含可操作提示），不静默返回空结构。
    """
    cached = load_structured_resume(data_dir)
    if cached:
        return cached
    resume_path = Path(str(config.get("profile", {}).get("resume_path") or "resume.md"))
    if not resume_path.exists():
        raise ValueError(
            "尚未配置结构化简历：请先在「设置 → 简历」上传简历，或在岗位库「简历」页执行 AI 解析"
        )
    try:
        text = resume_path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        raise ValueError(f"简历文件读取失败：{exc}") from exc
    structured = parse_resume(llm, text)
    if not isinstance(structured, dict) or not structured.get("basic"):
        raise ValueError("简历解析失败：AI 未返回有效的结构化简历")
    save_structured_resume(data_dir, structured)
    return structured
