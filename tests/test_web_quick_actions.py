"""首页快捷操作：重启面板与打开招聘官网登录页的 API 测试。"""
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from jobhunter_pro.web import server


class QuickActionApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        server.set_base_dir(Path(self.tmp.name))

    def tearDown(self):
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
            "CONTENT_TYPE": "application/json",
            "CONTENT_LENGTH": str(len(request_body.getvalue())),
        }
        status_headers["status"] = "200 OK"
        body = server.app(environ, start_response)
        joined = b"".join(body) if isinstance(body, list) else body
        text = joined.decode("utf-8") if isinstance(joined, bytes) else joined
        return status_headers["status"], dict(status_headers["headers"]), text

    def test_open_platform_rejects_unknown_platform(self):
        with patch("jobhunter_pro.browser.new_tab") as new_tab:
            status, _, body = self._request("/api/browser/open-platform", "POST", {"platform": "bad"})
        self.assertTrue(status.startswith("400"), body)
        self.assertIn("不支持的平台", body)
        new_tab.assert_not_called()

    def test_open_platform_opens_whitelisted_url(self):
        with patch("jobhunter_pro.browser.new_tab", return_value="target-1") as new_tab:
            status, _, body = self._request("/api/browser/open-platform", "POST", {"platform": "zhilian"})
        self.assertTrue(status.startswith("200"), body)
        payload = json.loads(body)
        self.assertTrue(payload["success"])
        self.assertEqual(payload["target_id"], "target-1")
        self.assertEqual(payload["url"], server.PLATFORM_LOGIN_URLS["zhilian"])
        new_tab.assert_called_once_with(server.PLATFORM_LOGIN_URLS["zhilian"], background=False)

    def test_open_platform_reports_disconnected_chrome(self):
        with patch("jobhunter_pro.browser.new_tab", return_value=None):
            status, _, body = self._request("/api/browser/open-platform", "POST", {"platform": "boss"})
        self.assertTrue(status.startswith("503"), body)
        self.assertIn("Chrome", body)

    def test_restart_unsupported_outside_systemd(self):
        with patch.object(server, "_current_systemd_unit", return_value=None):
            status, _, body = self._request("/api/system/restart", "POST")
        self.assertTrue(status.startswith("501"), body)
        self.assertIn("systemd", body)

    def test_restart_schedules_systemd_unit(self):
        with (
            patch.object(server, "_current_systemd_unit", return_value="jobhunter-panel.service"),
            patch.object(server.shutil, "which", return_value="/usr/bin/systemctl"),
            patch.object(server, "_schedule_panel_restart") as schedule,
        ):
            status, _, body = self._request("/api/system/restart", "POST")
        self.assertTrue(status.startswith("200"), body)
        payload = json.loads(body)
        self.assertTrue(payload["success"])
        self.assertEqual(payload["unit"], "jobhunter-panel.service")
        schedule.assert_called_once_with("jobhunter-panel.service")


if __name__ == "__main__":
    unittest.main()
