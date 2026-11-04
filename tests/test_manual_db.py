"""手动流水线辅助表(manual_* + applications)与岗位库 CRUD 测试。"""
import json
import tempfile
import unittest
from pathlib import Path

from jobhunter_pro.db import get_db
from jobhunter_pro.manual import db as mdb


class ManualDbTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = get_db(Path(self.tmp.name) / "test.db")

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def test_tables_created_and_materials_seeded(self):
        tables = {r[0] for r in self.db.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()}
        for expected in {
            "applications", "manual_skills", "manual_materials", "manual_interviews",
            "manual_interview_questions", "manual_question_bank", "manual_mock_sessions",
            "manual_offers",
        }:
            self.assertIn(expected, tables)
        self.assertNotIn("manual_jobs", tables)  # 岗位已并入 jobs 表
        # 手动流水线列迁移到 jobs
        job_cols = {r[1] for r in self.db.execute("PRAGMA table_info(jobs)").fetchall()}
        for col in ("role_type", "jd_json", "red_flags", "missing_skills", "reject_reason",
                    "salary_min", "salary_max", "salary_note"):
            self.assertIn(col, job_cols)
        count = self.db.execute("SELECT COUNT(*) FROM manual_materials").fetchone()[0]
        self.assertGreater(count, 50)
        self.assertEqual(mdb.seed_manual_materials(self.db), 0)

    def test_library_job_crud_and_skill_upsert(self):
        job_id = mdb.insert_library_job(self.db, {
            "source_platform": "manual", "title": "运维", "company": "X",
            "jd": "JD 原文", "jd_json": "{}", "role_type": "系统运维工程师",
            "status": "new", "score": 0,
        })
        self.assertTrue(job_id.startswith("manual-"))
        row = mdb.get_library_job(self.db, job_id)
        self.assertEqual(row["status"], "new")
        mdb.update_library_job(self.db, job_id, status="applied", score=80)
        self.assertEqual(mdb.get_library_job(self.db, job_id)["score"], 80)

        for _ in range(2):
            mdb.upsert_manual_skill(self.db, "Linux 性能调优", "系统运维工程师", "系统")
        skills = mdb.list_manual_skills(self.db, role="系统运维工程师")
        self.assertEqual(len(skills), 1)
        self.assertEqual(skills[0]["frequency"], 2)

    def test_library_list_filters_by_source_and_keyword(self):
        mdb.insert_library_job(self.db, {
            "source_platform": "manual", "title": "手动运维岗", "company": "A 公司",
            "jd": "x", "status": "matched", "score": 75,
        })
        # 采集岗：source_platform 为平台名
        mdb.insert_library_job(self.db, {
            "source_platform": "boss", "title": "采集开发岗", "company": "B 公司",
            "jd": "x", "status": "pending", "score": 60,
        })
        self.assertEqual(len(mdb.list_library_jobs(self.db)), 2)
        self.assertEqual(len(mdb.list_library_jobs(self.db, source="manual")), 1)
        self.assertEqual(len(mdb.list_library_jobs(self.db, source="collected")), 1)
        self.assertEqual(len(mdb.list_library_jobs(self.db, keyword="运维")), 1)
        self.assertEqual(len(mdb.list_library_jobs(self.db, min_score=70)), 1)

    def test_application_ledger_text_id(self):
        job_id = mdb.insert_library_job(self.db, {"title": "t", "company": "c"})
        app_id = mdb.add_library_application(self.db, job_id, {
            "resume": "a.md", "greeting": "b.md", "cover_letter": "c.md",
        }, note="备注")
        self.assertGreater(app_id, 0)
        mdb.update_library_application(self.db, job_id, "submitted", "投了")
        app = mdb.get_library_application(self.db, job_id)
        self.assertEqual(app["status"], "submitted")
        self.assertIsNotNone(app["submitted_at"])
        mdb.update_library_application_note(self.db, job_id, "新备注")
        self.assertEqual(mdb.get_library_application(self.db, job_id)["status"], "submitted")

    def test_interview_links_jobs_table(self):
        job_id = mdb.insert_library_job(self.db, {"title": "t", "company": "c", "role_type": "r"})
        iv_id = mdb.insert_manual_interview(self.db, {"job_id": job_id, "company": "X"})
        mdb.save_manual_interview_questions(self.db, iv_id, [
            {"seq": 1, "question": "Q1", "category": "技术基础",
             "your_answer": "A", "your_answer_rating": 3, "reference_answer": "R", "gap": ""},
        ])
        mdb.rebuild_manual_question_bank(self.db)
        bank = mdb.list_manual_question_bank(self.db)
        self.assertEqual(len(bank), 1)
        self.assertEqual(bank[0]["role_type"], "r")
        # 岗位删除后面试记录保留悬空引用（house 不启用 FK 约束），
        # 详情页查不到关联岗位时按无岗位处理
        self.db.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        self.db.commit()
        iv = mdb.get_manual_interview(self.db, iv_id)
        self.assertEqual(iv["job_id"], job_id)
        self.assertIsNone(mdb.get_library_job(self.db, iv["job_id"]))

    def test_mock_session_and_offers(self):
        sid = mdb.insert_manual_mock_session(self.db, {
            "role_type": "系统运维工程师",
            "messages": json.dumps([{"role": "assistant", "content": "开始面试"}], ensure_ascii=False),
        })
        s = mdb.get_manual_mock_session(self.db, sid)
        self.assertEqual(json.loads(s["messages"])[0]["content"], "开始面试")
        mdb.update_manual_mock_session(self.db, sid, finished=1)
        self.assertEqual(mdb.get_manual_mock_session(self.db, sid)["finished"], 1)

        oid = mdb.insert_manual_offer(self.db, {"company": "A", "position": "运维", "status": "pending"})
        mdb.update_manual_offer(self.db, oid, status="accepted")
        self.assertEqual(len(mdb.list_manual_offers(self.db)), 1)
        mdb.delete_manual_offer(self.db, oid)
        self.assertEqual(mdb.list_manual_offers(self.db), [])

    def test_match_materials(self):
        mats = mdb.match_manual_materials(self.db, "Linux 性能调优", top=2)
        self.assertTrue(mats)


if __name__ == "__main__":
    unittest.main()
