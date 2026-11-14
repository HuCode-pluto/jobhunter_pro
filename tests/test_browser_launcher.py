"""专用 Chrome 自动启动助手测试。"""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from jobhunter_pro.browser import launcher


class ChromeLauncherTests(unittest.TestCase):
    def test_returns_true_when_debug_endpoint_ready(self):
        with (
            patch.object(launcher, "chrome_debug_ready", return_value=True),
            patch.object(launcher, "chrome_executable") as executable,
        ):
            self.assertTrue(launcher.ensure_chrome_running(9229))
        executable.assert_not_called()

    def test_launches_dedicated_profile_when_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            profile = Path(tmp) / "profile"
            with (
                patch.object(launcher, "chrome_debug_ready", side_effect=[False, True]),
                patch.object(launcher, "chrome_executable", return_value="/usr/bin/google-chrome"),
                patch.object(launcher, "_launch_command", return_value=(["chrome"], {})) as command,
                patch.object(launcher, "_spawn") as spawn,
            ):
                self.assertTrue(launcher.ensure_chrome_running(9229, profile=profile))
            self.assertTrue(profile.is_dir())
            command.assert_called_once_with("/usr/bin/google-chrome", profile, 9229)
            spawn.assert_called_once()

    def test_returns_false_without_chrome_binary(self):
        with (
            patch.object(launcher, "chrome_debug_ready", return_value=False),
            patch.object(launcher, "chrome_executable", return_value=None),
        ):
            self.assertFalse(launcher.ensure_chrome_running(9229))

    def test_launch_command_contains_debug_port_and_profile(self):
        with (
            patch.object(launcher.sys, "platform", "linux"),
            patch.object(launcher, "_linux_session_env", return_value=({}, ["--ozone-platform=x11"])),
        ):
            args, _ = launcher._launch_command("/usr/bin/google-chrome", Path("/tmp/profile"), 9333)
        self.assertIn("--ozone-platform=x11", args)
        self.assertIn("--remote-debugging-port=9333", args)
        self.assertIn("--user-data-dir=/tmp/profile", args)


if __name__ == "__main__":
    unittest.main()
