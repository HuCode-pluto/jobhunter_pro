"""评分流程的岗位方向回填(_fill_job_role,行业分类)测试。"""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from jobhunter_pro.ai.scorer import _fill_job_role
from jobhunter_pro.db import get_db, insert_job


class ScoringRoleFillTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = get_db(Path(self.tmp.name) / "test.db")
        insert_job(self.db, {
            "id": "j1", "title": "技术支持工程师", "company": "X公司",
            "salary": "8-12K", "city": "上海",
            "jd": "负责银行客户的技术支持与系统实施",
        })

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def test_industry_llm_result_fills_role(self):
        with patch("jobhunter_pro.manual.jd_parser.detect_industry_llm",
                   return_value="金融/银行") as industry_mock:
            _fill_job_role(self.db, {"id": "j1", "title": "技术支持工程师", "company": "X公司"}, {})
            self.assertEqual(industry_mock.call_count, 1)
            # JD 原文应传入分类器(位置参数第 3 位)
            args, _ = industry_mock.call_args
            self.assertIn("银行客户", args[2])
        row = self.db.execute("SELECT role_type FROM jobs WHERE id = 'j1'").fetchone()
        self.assertEqual(row["role_type"], "金融/银行")

    def test_existing_role_not_overwritten(self):
        self.db.execute("UPDATE jobs SET role_type = '已归类的方向' WHERE id = 'j1'")
        self.db.commit()
        with patch("jobhunter_pro.manual.jd_parser.detect_industry_llm") as industry_mock:
            _fill_job_role(self.db, {"id": "j1", "title": "t", "company": "c"}, {})
            industry_mock.assert_not_called()
        row = self.db.execute("SELECT role_type FROM jobs WHERE id = 'j1'").fetchone()
        self.assertEqual(row["role_type"], "已归类的方向")

    def test_llm_failure_skips_silently(self):
        with patch("jobhunter_pro.manual.jd_parser.detect_industry_llm", return_value=""):
            _fill_job_role(self.db, {"id": "j1", "title": "t", "company": "c"}, {})
        row = self.db.execute("SELECT role_type FROM jobs WHERE id = 'j1'").fetchone()
        self.assertEqual(row["role_type"], "")


class DetectIndustryPromptTests(unittest.TestCase):
    def test_prompt_contains_standard_industries(self):
        from jobhunter_pro.manual.jd_parser import INDUSTRY_PROMPT

        for keyword in ("金融/银行", "制造业/智能制造", "企业服务/软件"):
            self.assertIn(keyword, INDUSTRY_PROMPT)


if __name__ == "__main__":
    unittest.main()
