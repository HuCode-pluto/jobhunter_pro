"""Launch the project's dedicated Chrome instance when it is not running."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen
from uuid import uuid4


def dedicated_profile() -> Path:
	"""Return the per-OS Chrome profile used by the project launchers."""
	if os.name == "nt":
		base = os.environ.get("LOCALAPPDATA") or str(Path.home())
		return Path(base) / "JobHunter ProChrome"
	if sys.platform == "darwin":
		return Path.home() / ".jobhunter_pro-chrome"
	return Path.home() / ".config" / "jobhunter_pro-chrome"


def chrome_executable() -> str | None:
	"""Find a Chrome/Chromium executable for the current platform."""
	if os.name == "nt":
		roots = (
			os.environ.get("PROGRAMFILES"),
			os.environ.get("PROGRAMFILES(X86)"),
			os.environ.get("LOCALAPPDATA"),
		)
		for root in roots:
			if not root:
				continue
			candidate = Path(root) / "Google" / "Chrome" / "Application" / "chrome.exe"
			if candidate.is_file():
				return str(candidate)
		return None
	if sys.platform == "darwin":
		for candidate in (
			Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
			Path.home() / "Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			Path("/Applications/Chromium.app/Contents/MacOS/Chromium"),
		):
			if candidate.is_file():
				return str(candidate)
		return None
	for name in ("google-chrome-stable", "google-chrome", "chromium", "chromium-browser"):
		path = shutil.which(name)
		if path:
			return path
	return None


def chrome_debug_ready(port: int, timeout: float = 1.0) -> bool:
	"""Return True when a Chrome DevTools endpoint answers on localhost."""
	try:
		with urlopen(f"http://127.0.0.1:{port}/json/version", timeout=timeout) as response:
			return response.status == 200
	except (OSError, URLError, ValueError):
		return False


def _linux_session_env() -> tuple[dict[str, str], list[str]]:
	"""Use the local desktop display when the panel has no graphical env."""
	env = os.environ.copy()
	display = env.get("DISPLAY", "")
	if display and not display.startswith("localhost:"):
		# Chrome 157 can hang under Wayland on some drivers; XWayland is the
		# combination used by the project launchers and by this deployment.
		return env, ["--ozone-platform=x11", "--disable-gpu"]
	runtime_dir = env.get("XDG_RUNTIME_DIR") or f"/run/user/{os.getuid()}"
	auths = sorted(Path(runtime_dir).glob(".mutter-Xwaylandauth.*"))
	if not auths:
		return env, []
	env["XDG_RUNTIME_DIR"] = runtime_dir
	env.setdefault("DBUS_SESSION_BUS_ADDRESS", f"unix:path={runtime_dir}/bus")
	env["XAUTHORITY"] = str(auths[0])
	env["DISPLAY"] = ":1" if Path("/tmp/.X11-unix/X1").exists() else ":0"
	return env, ["--ozone-platform=x11", "--disable-gpu"]


def _launch_command(executable: str, profile: Path, port: int) -> tuple[list[str], dict[str, str]]:
	args = [executable]
	env = os.environ.copy()
	if sys.platform.startswith("linux"):
		env, extra = _linux_session_env()
		args.extend(extra)
	args.extend([
		f"--remote-debugging-port={port}",
		f"--user-data-dir={profile}",
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-features=MediaRouter",
		"about:blank",
	])
	return args, env


def _spawn(args: list[str], env: dict[str, str]) -> None:
	if os.name == "nt":
		flags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
		subprocess.Popen(
			args,
			env=env,
			stdin=subprocess.DEVNULL,
			stdout=subprocess.DEVNULL,
			stderr=subprocess.DEVNULL,
			creationflags=flags,
		)
		return
	if sys.platform.startswith("linux") and shutil.which("systemd-run"):
		# Run Chrome outside the panel service cgroup, so restarting the panel
		# does not terminate the browser.
		cmd = [
			"systemd-run", "--user", "--collect", "--quiet",
			f"--unit=jobhunter-chrome-{uuid4().hex[:8]}",
		]
		for key in ("DISPLAY", "XAUTHORITY", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS", "HOME"):
			value = env.get(key)
			if value:
				cmd.extend(["--setenv", f"{key}={value}"])
		cmd.extend(args)
		subprocess.Popen(
			cmd,
			env=env,
			stdin=subprocess.DEVNULL,
			stdout=subprocess.DEVNULL,
			stderr=subprocess.DEVNULL,
			start_new_session=True,
		)
		return
	subprocess.Popen(
		args,
		env=env,
		stdin=subprocess.DEVNULL,
		stdout=subprocess.DEVNULL,
		stderr=subprocess.DEVNULL,
		start_new_session=True,
	)


def ensure_chrome_running(port: int, profile: Path | None = None, wait_seconds: float = 20.0) -> bool:
	"""Ensure a debuggable Chrome is running; launch the dedicated profile if not."""
	if chrome_debug_ready(port):
		return True
	executable = chrome_executable()
	if not executable:
		return False
	profile = profile or dedicated_profile()
	try:
		profile.mkdir(parents=True, exist_ok=True)
		args, env = _launch_command(executable, profile, port)
		_spawn(args, env)
	except OSError:
		return False

	deadline = time.time() + max(wait_seconds, 0)
	while time.time() < deadline:
		if chrome_debug_ready(port):
			return True
		time.sleep(0.5)
	return chrome_debug_ready(port)
