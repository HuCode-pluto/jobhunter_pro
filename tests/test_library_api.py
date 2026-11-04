"""Job Library（手动流水线）WSGI API 测试：mock LLM，走真实 DB 与路由。"""
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import yaml

from jobhunter_pro.web import server

JD = {
    "title": "系统运维工程师",
    "company": "某公司",
    "city": "北京",
    "salary_min": 18000,
    "salary_max": 28000,
    "salary_note": "14薪",
    "years_required": "3-5年",
    "education_required": "本科",
    "company_nature": "外企",
    "company_size_people": 3000,
    "responsibilities": ["负责 Linux 服务器运维"],
    "must_have": ["熟悉 Linux"],
    "nice_to_have": [],
    "skill_points": [{"name": "Linux 性能调优", "category": "系统", "level": "掌握", "evidence": ""}],
    "red_flags": [],
}

RESUME = {
    "basic": {"name": "测试", "phone": "", "email": "", "city": "北京", "years_of_experience": 5},
    "summary": "运维工程师",
    "skills": [{"name": "Linux", "level": "熟练", "detail": ""}],
    "work_experience": [],
    "projects": [],
    "certs": [],
}


class FakeLLM:
    """按提示词特征分派返回值的桩 LLM。"""

    def __init__(self):
        self.jd = dict(JD)

    def chat_json(self, system, user, temperature=0.2):
        if "JD 分析师" in system:
            return self.jd
        if "分类助手" in system:
            return {"role": "系统运维工程师", "reason": "关键词命中"}
        if "招聘顾问" in system:
            return {"score": 80, "summary": "匹配", "strengths": [], "missing_skills": ["K8s"], "advice": "投"}
        if "求职顾问" in system:
            return {
                "greeting": "您好，我的 Linux 运维经验与贵司岗位匹配",
                "cover_letter": "求职信内容",
                "tailored_resume": "定制简历内容",
                "highlight_points": ["要点1", "要点2"],
            }
        raise AssertionError(f"unexpected prompt: {system[:50]!r}")

    def chat_vision(self, system, user_text, image_base64, mime="image/jpeg"):
        return "识别出的招聘信息文本" * 10


class LibraryApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        server.set_base_dir(Path(self.tmp.name))
        (server.CONFIG_PATH).write_text(
            yaml.safe_dump({
                "job_preferences": {"roles": [{
                    "name": "系统运维工程师",
                    "keywords": ["运维", "Linux"],
                    "cities": ["北京"],
                    "salary_min": 10000,
                    "exclude_keywords": [],
                }]},
                "apply": {"min_score": 60},
            }, allow_unicode=True),
            encoding="utf-8",
        )
        self.original_base_dir = None
        self.llm_patcher = patch("jobhunter_pro.web.server._library_llm", return_value=FakeLLM())
        self.resume_patcher = patch("jobhunter_pro.web.server._library_resume", return_value=RESUME)
        self.llm_patcher.start()
        self.resume_patcher.start()

    def tearDown(self):
        self.llm_patcher.stop()
        self.resume_patcher.stop()
        server.set_base_dir(Path(__file__).parent)
        self.tmp.cleanup()

    def _request(self, path, method="GET", json_body=None):
        if "?" in path:
            path_info, query_string = path.split("?", 1)
        else:
            path_info, query_string = path, ""
        status_headers = {}

        def start_response(status, headers, exc_info=None):
            status_headers["status"] = status
            status_headers["headers"] = dict(headers)

        request_body = io.BytesIO(json.dumps(json_body).encode("utf-8") if json_body is not None else b"")
        content_type = "application/json"
        environ = {
            "REMOTE_ADDR": "127.0.0.1",
            "REQUEST_METHOD": method,
            "PATH_INFO": path_info,
            "QUERY_STRING": query_string,
            "SERVER_NAME": "127.0.0.1",
            "SERVER_PORT": "8686",
            "wsgi.version": (1, 0),
            "wsgi.url_scheme": "http",
            "wsgi.input": request_body,
            "wsgi.errors": io.StringIO(),
            "wsgi.multithread": False,
            "wsgi.multiprocess": False,
            "wsgi.run_once": False,
            "CONTENT_TYPE": content_type,
            "CONTENT_LENGTH": str(len(request_body.getvalue())),
        }
        status_headers["status"] = "200 OK"
        body = server.app(environ, start_response)
        joined = b"".join(body) if isinstance(body, list) else body
        return status_headers["status"], dict(status_headers["headers"]), joined.decode("utf-8") if isinstance(joined, bytes) else joined

    # ---------- 岗位库 ----------

    def test_manual_add_creates_matched_job_with_tailored_files(self):
        status, _, body = self._request("/api/library/jobs/manual", "POST", {"jd_text": "JD 原文" * 10})
        self.assertTrue(status.startswith("200"), body)
        payload = json.loads(body)
        self.assertEqual(payload["errors"], 0)
        result = payload["results"][0]
        self.assertEqual(result["role"], "系统运维工程师")
        self.assertGreaterEqual(result["score"], 60)
        self.assertIn("tailored", result)

        # 定制文件落盘
        out_dir = server.DATA_DIR / "output" / result["job_id"]
        self.assertTrue((out_dir / "打招呼语.md").exists())
        self.assertTrue((out_dir / "求职信.md").exists())
        self.assertTrue((out_dir / "定制简历.md").exists())
        # 台账自动建档
        status, _, body = self._request(f"/api/library/jobs/{result['job_id']}")
        detail = json.loads(body)
        self.assertIsNotNone(detail["application"])
        self.assertIn("我的 Linux 运维经验", detail["greeting_file"])

    def test_manual_add_batch_split_and_reject_on_short(self):
        status, _, body = self._request("/api/library/jobs/manual", "POST", {"jd_text": "太短"})
        self.assertTrue(status.startswith("400"), body)
        two = ("JD 原文" * 10) + "\n" + ("=" * 8) + "\n" + ("JD 原文" * 10)
        status, _, body = self._request("/api/library/jobs/manual", "POST", {"jd_text": two})
        payload = json.loads(body)
        self.assertEqual(payload["count"], 2)

    def test_job_list_filters(self):
        self._request("/api/library/jobs/manual", "POST", {"jd_text": "JD 原文" * 10})
        status, _, body = self._request("/api/library/jobs?role=系统运维工程师")
        self.assertEqual(len(json.loads(body)), 1)
        status, _, body = self._request("/api/library/jobs?role=不存在的方向")
        self.assertEqual(json.loads(body), [])

    def test_status_transition_syncs_application(self):
        self._request("/api/library/jobs/manual", "POST", {"jd_text": "JD 原文" * 10})
        status, _, body = self._request("/api/library/jobs")
        job_id = json.loads(body)[0]["id"]
        status, _, body = self._request(
            f"/api/library/jobs/{job_id}/status", "POST", {"status": "applied", "note": "已投"}
        )
        self.assertTrue(status.startswith("200"), body)
        status, _, body = self._request(f"/api/library/jobs/{job_id}")
        detail = json.loads(body)
        self.assertEqual(detail["status"], "applied")
        self.assertEqual(detail["application"]["status"], "submitted")
        self.assertEqual(detail["application"]["notes"], "已投")
        # 非法状态
        status, _, body = self._request(f"/api/library/jobs/{job_id}/status", "POST", {"status": "bad"})
        self.assertTrue(status.startswith("400"), body)

    def test_process_is_idempotent(self):
        self._request("/api/library/jobs/manual", "POST", {"jd_text": "JD 原文" * 10})
        status, _, body = self._request("/api/library/jobs")
        job_id = json.loads(body)[0]["id"]
        status, _, body = self._request(f"/api/library/jobs/{job_id}/process", "POST")
        self.assertTrue(status.startswith("200"), body)
        self.assertIn("job_id", json.loads(body))
        status, _, body = self._request("/api/library/jobs/batch-process", "POST", {"ids": [job_id, "not-exist"]})
        payload = json.loads(body)
        self.assertEqual(payload["ok_count"], 1)
        self.assertTrue(any("岗位不存在" in r.get("error", "") for r in payload["results"]))

    def test_screenshot_ocr_and_fetch_link_validation(self):
        status, _, body = self._request("/api/library/jobs/screenshot", "POST", {"image_base64": ""})
        self.assertTrue(status.startswith("400"), body)
        status, _, body = self._request("/api/library/jobs/screenshot", "POST", {"image_base64": "aGVsbG8="})
        self.assertTrue(status.startswith("200"), body)
        self.assertTrue(json.loads(body)["text"].startswith("识别出"))
        status, _, body = self._request("/api/library/jobs/fetch-link", "POST", {"url": "not-a-url"})
        self.assertTrue(status.startswith("400"), body)
        self.assertIn("http", json.loads(body)["error"])

    def test_prep_pack_cached_and_question_bank_sync(self):
        self._request("/api/library/jobs/manual", "POST", {"jd_text": "JD 原文" * 10})
        status, _, body = self._request("/api/library/jobs")
        job_id = json.loads(body)[0]["id"]
        with patch("jobhunter_pro.manual.interview_llm.prep_pack", return_value={
            "questions": [{"question": "如何排查 CPU 飙高", "why": "常见", "reference_answer": "top"}],
            "tips": ["复习基础"],
        }):
            status, _, body = self._request(f"/api/library/jobs/{job_id}/prep", "POST")
            payload = json.loads(body)
            self.assertFalse(payload["cached"])
            self.assertIn("面试准备包", payload["content"])
            # 第二次走缓存
            status, _, body = self._request(f"/api/library/jobs/{job_id}/prep", "POST")
            self.assertTrue(json.loads(body)["cached"])
        status, _, body = self._request("/api/library/question-bank")
        self.assertTrue(any("CPU" in r["question"] for r in json.loads(body)))

    # ---------- 面试/题库 ----------

    def _upload_interview(self, transcript_text="", filename="", content=b"", content_type="application/octet-stream"):
        """house 模式的 multipart 构造：可选录音文件 + 表单字段。"""
        boundary = "----JobHunter ProInterviewUpload"
        parts = []
        for name, value in (
            ("company", "X公司"), ("position", "运维工程师"), ("transcript_text", transcript_text),
        ):
            parts.append(
                f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'
            )
        if filename:
            parts.append(
                f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\n'
                f"Content-Type: {content_type}\r\n\r\n"
            )
            body = ("".join(parts)).encode("utf-8") + content + f"\r\n--{boundary}--\r\n".encode("utf-8")
        else:
            body = ("".join(parts) + f"--{boundary}--\r\n").encode("utf-8")
        status_headers = {}

        def start_response(status, headers, exc_info=None):
            status_headers["status"] = status
            status_headers["headers"] = dict(headers)

        environ = {
            "REQUEST_METHOD": "POST",
            "PATH_INFO": "/api/library/interviews",
            "QUERY_STRING": "",
            "CONTENT_LENGTH": str(len(body)),
            "CONTENT_TYPE": f"multipart/form-data; boundary={boundary}",
            "SERVER_NAME": "127.0.0.1",
            "SERVER_PORT": "8686",
            "wsgi.version": (1, 0),
            "wsgi.url_scheme": "http",
            "wsgi.input": io.BytesIO(body),
            "wsgi.errors": io.StringIO(),
            "wsgi.multithread": False,
            "wsgi.multiprocess": False,
            "wsgi.run_once": False,
            "REMOTE_ADDR": "127.0.0.1",
        }
        server.app(environ, start_response)
        return status_headers["status"]

    def test_interview_upload_requires_audio_or_transcript(self):
        status = self._upload_interview()
        self.assertTrue(status.startswith("400"), status)

    def test_interview_upload_bad_extension_rejected(self):
        status = self._upload_interview(filename="a.exe", content=b"x")
        self.assertTrue(status.startswith("400"), status)

    def test_interview_transcript_success_flow(self):
        import time

        with patch("jobhunter_pro.manual.interview_llm.analyze_interview", return_value={
            "questions": [{
                "seq": 1, "question": "Q1", "category": "技术基础",
                "your_answer": "A", "your_answer_rating": 3,
                "reference_answer": "R", "gap": "G",
            }],
            "summary": {"overall_score": 70, "skill_gaps": []},
        }):
            status = self._upload_interview(transcript_text="面试转写文本")
            self.assertTrue(status.startswith("200"), status)
            # 找到刚建的面谈记录并等待后台线程完成
            _, _, body = self._request("/api/library/interviews")
            iid = json.loads(body)[0]["id"]
            for _ in range(50):
                _, _, body = self._request(f"/api/library/interviews/{iid}")
                if json.loads(body)["status"] != "processing":
                    break
                time.sleep(0.1)
        detail = json.loads(body)
        self.assertEqual(detail["status"], "done")
        self.assertEqual(detail["questions"][0]["question"], "Q1")
        self.assertEqual(detail["report"]["summary"]["overall_score"], 70)
        # 题库自动聚合
        _, _, body = self._request("/api/library/question-bank")
        self.assertTrue(any("Q1" in r["question"] for r in json.loads(body)))

    def test_question_bank_rebuild_endpoint(self):
        status, _, body = self._request("/api/library/question-bank/rebuild", "POST")
        self.assertTrue(status.startswith("200"), body)
        self.assertIn("count", json.loads(body))

    # ---------- 求职管理 ----------

    def test_offers_crud_and_weekly_report(self):
        status, _, body = self._request("/api/library/offers", "POST", {"company": "A", "position": "运维"})
        oid = json.loads(body)["id"]
        status, _, body = self._request(f"/api/library/offers/{oid}", "POST", {"status": "accepted"})
        self.assertTrue(status.startswith("200"), body)
        status, _, body = self._request("/api/library/offers")
        self.assertEqual(json.loads(body)[0]["status"], "accepted")
        status, _, body = self._request(f"/api/library/offers/{oid}/delete", "POST")
        self.assertTrue(status.startswith("200"), body)

        self._request("/api/library/jobs/manual", "POST", {"jd_text": "JD 原文" * 10})
        status, _, body = self._request("/api/library/report/weekly")
        payload = json.loads(body)
        self.assertEqual(payload["total_jobs"], 1)
        self.assertIn("avg_score", payload)

    # ---------- 技能地图 / 学习计划 ----------

    def test_skillmap_empty_and_generated(self):
        status, _, body = self._request("/api/library/skillmap?role=系统运维工程师")
        payload = json.loads(body)
        self.assertEqual(payload["markdown"], "")
        self._request("/api/library/jobs/manual", "POST", {"jd_text": "JD 原文" * 10})
        status, _, body = self._request("/api/library/skillmap?role=系统运维工程师")
        payload = json.loads(body)
        self.assertIn("技能地图", payload["markdown"])
        self.assertIn("<table>", payload["html"])  # markdown2 表格渲染

    def test_study_plan_requires_skills(self):
        with patch("jobhunter_pro.manual.study_plan.build_plan", side_effect=ValueError("技能库为空")):
            status, _, body = self._request("/api/library/study-plan", "POST", {"role": "系统运维工程师"})
        self.assertTrue(status.startswith("400"), body)
        self.assertIn("技能库为空", json.loads(body)["error"])

    # ---------- 简历 / 资料 ----------

    def test_resume_structured_and_parse(self):
        status, _, body = self._request("/api/library/resume/structured")
        self.assertFalse(json.loads(body)["exists"])
        with patch("jobhunter_pro.manual.resume_parser.parse_resume", return_value=RESUME):
            status, _, body = self._request("/api/library/resume/parse", "POST", {"text": "简历文本"})
        self.assertTrue(status.startswith("200"), body)
        status, _, body = self._request("/api/library/resume/structured")
        self.assertTrue(json.loads(body)["exists"])

    def test_materials_seed_idempotent(self):
        status, _, body = self._request("/api/library/materials/seed", "POST")
        self.assertEqual(json.loads(body)["added"], 0)  # 建库时已自动播种


if __name__ == "__main__":
    unittest.main()
