"""手动流水线（manual_* 表）的建表、播种与 CRUD 测试。"""
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
            "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'manual_%'"
        ).fetchall()}
        self.assertEqual(
            tables,
            {
                "manual_jobs", "manual_applications", "manual_skills", "manual_materials",
                "manual_interviews", "manual_interview_questions", "manual_question_bank",
                "manual_mock_sessions", "manual_offers",
            },
        )
        # 种子资料自动播种且幂等
        count = self.db.execute("SELECT COUNT(*) FROM manual_materials").fetchone()[0]
        self.assertGreater(count, 50)
        self.assertEqual(mdb.seed_manual_materials(self.db), 0)

    def test_job_crud_and_skill_upsert(self):
        job_id = mdb.insert_manual_job(self.db, {
            "role_type": "系统运维工程师", "title": "运维", "company": "X",
            "jd_raw": "JD 原文", "jd_json": "{}",
        })
        row = mdb.get_manual_job(self.db, job_id)
        self.assertEqual(row["status"], "new")
        mdb.update_manual_job(self.db, job_id, status="applied", match_score=80)
        self.assertEqual(mdb.get_manual_job(self.db, job_id)["match_score"], 80)

        for _ in range(2):
            mdb.upsert_manual_skill(self.db, "Linux 性能调优", "系统运维工程师", "系统")
        skills = mdb.list_manual_skills(self.db, role="系统运维工程师")
        self.assertEqual(len(skills), 1)
        self.assertEqual(skills[0]["frequency"], 2)

    def test_application_ledger(self):
        job_id = mdb.insert_manual_job(self.db, {"role_type": "r", "title": "t", "company": "c"})
        app_id = mdb.add_manual_application(self.db, job_id, {
            "resume": "a.md", "greeting": "b.md", "cover_letter": "c.md",
        }, note="备注")
        self.assertGreater(app_id, 0)
        mdb.update_manual_application(self.db, job_id, "submitted", "投了")
        app = mdb.get_manual_application(self.db, job_id)
        self.assertEqual(app["status"], "submitted")
        self.assertIsNotNone(app["submitted_at"])
        # note-only 更新不改状态
        mdb.update_manual_application_note(self.db, job_id, "新备注")
        self.assertEqual(mdb.get_manual_application(self.db, job_id)["status"], "submitted")

    def test_question_bank_rebuild_and_prep_upsert(self):
        iv_id = mdb.insert_manual_interview(self.db, {"company": "X", "position": "运维"})
        mdb.save_manual_interview_questions(self.db, iv_id, [
            {"seq": 1, "question": "如何排查 CPU 飙高", "category": "技术基础",
             "your_answer": "top", "your_answer_rating": 3, "reference_answer": "top+vmstat", "gap": ""},
            {"seq": 2, "question": "如何排查 CPU 飙高", "category": "技术基础", "reference_answer": "同上"},
        ])
        mdb.rebuild_manual_question_bank(self.db)
        bank = mdb.list_manual_question_bank(self.db)
        self.assertEqual(len(bank), 1)
        self.assertEqual(bank[0]["frequency"], 1)

        mdb.upsert_manual_prep_question(self.db, "如何排查 CPU 飙高", "", "预测答案")
        mdb.upsert_manual_prep_question(self.db, "全新的预测题", "", "预测答案2")
        bank = mdb.list_manual_question_bank(self.db)
        by_q = {r["question"]: r for r in bank}
        self.assertEqual(by_q["如何排查 CPU 飙高"]["frequency"], 2)
        self.assertEqual(by_q["全新的预测题"]["source"], "prep")
        # 重建只清 interview 来源，预测题保留
        mdb.rebuild_manual_question_bank(self.db)
        bank = mdb.list_manual_question_bank(self.db)
        self.assertEqual(len(bank), 2)

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
        self.assertTrue(all("linux" in " ".join(m["keywords"].lower() for m in mats) for m in mats))


if __name__ == "__main__":
    unittest.main()
