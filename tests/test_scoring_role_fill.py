"""评分流程的岗位方向回填(_fill_job_role)测试。"""
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
            "salary": "8-12K", "city": "上海", "jd": "负责技术支持与客户沟通",
        })

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def _config(self):
        return {
            "job_preferences": {"roles": [
                {"name": "实施工程师", "keywords": ["实施", "交付"]},
                {"name": "系统运维工程师", "keywords": ["运维", "Linux"]},
            ]},
        }

    def test_keyword_match_fills_role_without_llm(self):
        self.db.execute("UPDATE jobs SET title = ? WHERE id = 'j1'", ("Linux 运维工程师",))
        self.db.commit()
        with patch("jobhunter_pro.manual.jd_parser.detect_role_llm") as llm_mock:
            _fill_job_role(self.db, {"id": "j1", "title": "Linux 运维工程师", "company": "X公司"}, self._config())
            llm_mock.assert_not_called()
        row = self.db.execute("SELECT role_type FROM jobs WHERE id = 'j1'").fetchone()
        self.assertEqual(row["role_type"], "系统运维工程师")

    def test_llm_fallback_writes_real_direction_label(self):
        with patch("jobhunter_pro.manual.jd_parser.detect_role_llm", return_value="技术支持工程师") as llm_mock:
            _fill_job_role(self.db, {"id": "j1", "title": "技术支持工程师", "company": "X公司"}, self._config())
            llm_mock.assert_called_once()
        row = self.db.execute("SELECT role_type FROM jobs WHERE id = 'j1'").fetchone()
        self.assertEqual(row["role_type"], "技术支持工程师")

    def test_existing_role_not_overwritten(self):
        self.db.execute("UPDATE jobs SET role_type = '已归类的方向' WHERE id = 'j1'")
        self.db.commit()
        with patch("jobhunter_pro.manual.jd_parser.detect_role_llm") as llm_mock:
            _fill_job_role(self.db, {"id": "j1", "title": "技术支持工程师", "company": "X公司"}, self._config())
            llm_mock.assert_not_called()
        row = self.db.execute("SELECT role_type FROM jobs WHERE id = 'j1'").fetchone()
        self.assertEqual(row["role_type"], "已归类的方向")

    def test_no_roles_configured_skips(self):
        with patch("jobhunter_pro.manual.jd_parser.detect_role_llm") as llm_mock:
            _fill_job_role(self.db, {"id": "j1", "title": "t", "company": "c"},
                           {"job_preferences": {"roles": []}})
            llm_mock.assert_not_called()


if __name__ == "__main__":
    unittest.main()
