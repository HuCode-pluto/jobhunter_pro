"""采集与评分阶段的外包/人力派遣排除测试。"""
import json
from unittest.mock import patch

from jobhunter_pro.ai.prefilter import quick_score
from jobhunter_pro.ai.scorer import _build_scoring_prompt, score_jobs
from jobhunter_pro.db import get_db, insert_job


def _job(job_id: str, **overrides) -> dict:
    job = {
        "id": job_id,
        "title": "系统运维工程师",
        "company": "测试公司",
        "salary": "20-30K",
        "city": "上海",
        "experience": "3-5年",
        "jd": "负责 Linux 运维",
        "url": f"https://example.com/jobs/{job_id}",
        "source_platform": "boss",
    }
    job.update(overrides)
    return job


def test_confirmed_outsourcing_is_rejected_by_prefilter():
    score, reason = quick_score(_job("os", outsourcing_level="confirmed"), {"profile": {}})
    assert score == 0
    assert "外包" in reason


def test_suspected_outsourcing_is_left_for_ai():
    score, reason = quick_score(
        _job("suspected", outsourcing_level="suspected"),
        {"profile": {"allow_internship": True}},
    )
    assert score != 0
    assert "预筛通过" in reason


def test_accept_outsourcing_flag_allows_outsourcing():
    job = _job(
        "accepted",
        outsourcing_level="confirmed",
        outsourcing_matches=json.dumps(
            [{"layer": "L1", "keyword": "外包", "field": "company"}],
            ensure_ascii=False,
        ),
    )
    score, reason = quick_score(
        job,
        {
            "profile": {
                "allow_internship": True,
                "accept_outsourcing": True,
                "accept_labor_dispatch": True,
                "accept_onsite": True,
            }
        },
    )
    assert score != 0
    assert "预筛通过" in reason


def test_dispatch_and_onsite_flags_are_independent():
    dispatch_job = _job(
        "dispatch",
        outsourcing_matches=json.dumps(
            [{"layer": "L1", "keyword": "劳务派遣", "field": "jd"}],
            ensure_ascii=False,
        ),
    )
    score, reason = quick_score(
        dispatch_job,
        {
            "profile": {
                "allow_internship": True,
                "accept_outsourcing": True,
                "accept_labor_dispatch": False,
                "accept_onsite": True,
            }
        },
    )
    assert score == 0
    assert "劳务派遣" in reason

    onsite_job = _job(
        "onsite",
        outsourcing_matches=json.dumps(
            [{"layer": "L1", "keyword": "驻场", "field": "title"}],
            ensure_ascii=False,
        ),
    )
    score, reason = quick_score(
        onsite_job,
        {
            "profile": {
                "allow_internship": True,
                "accept_outsourcing": True,
                "accept_labor_dispatch": True,
                "accept_onsite": False,
            }
        },
    )
    assert score == 0
    assert "驻场" in reason


def test_prompt_includes_outsourcing_evidence_and_type_preferences():
    job = _job(
        "prompt",
        outsourcing_level="confirmed",
        outsourcing_matches=json.dumps(
            [{"layer": "L1", "keyword": "外包", "field": "company"}],
            ensure_ascii=False,
        ),
    )
    prompt = _build_scoring_prompt(job, "真实简历", {"profile": {}})
    assert "岗位类型排除规则" in prompt
    assert "已确认外包/人力派遣" in prompt
    assert "命中：外包" in prompt
    assert "外包：不考虑" in prompt
    assert "劳务派遣：不考虑" in prompt
    assert "驻场：不考虑" in prompt


def test_score_jobs_recycles_confirmed_outsourcing(tmp_path):
    db_path = tmp_path / "outsourcing.db"
    db = get_db(db_path)
    try:
        insert_job(db, _job("os"))
        db.execute(
            "UPDATE jobs SET outsourcing_level = 'confirmed', outsourcing_confirmed = 1 WHERE id = 'os'"
        )
        db.commit()
    finally:
        db.close()

    with (
        patch("jobhunter_pro.ai.scorer.get_db", side_effect=lambda: get_db(db_path)),
        patch("jobhunter_pro.ai.scorer._load_resume", return_value="真实简历"),
    ):
        score_jobs(
            {
                "profile": {"allow_internship": True},
                "scoring": {"threshold": 60},
            },
            scope="selected",
            job_ids=["os"],
            force_rescore=True,
            recycle_filtered=True,
        )

    db = get_db(db_path)
    try:
        row = db.execute(
            "SELECT status, deleted_at, deleted_reason FROM jobs WHERE id = 'os'"
        ).fetchone()
    finally:
        db.close()

    assert row["status"] == "filtered"
    assert row["deleted_at"] is not None
    assert "外包" in row["deleted_reason"]
