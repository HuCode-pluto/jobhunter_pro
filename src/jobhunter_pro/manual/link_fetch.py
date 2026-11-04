"""岗位链接提取三通道：① 用户已登录 Chrome（CDP）→ ② 服务器直抓 → ③ 工具浏览器兜底。

说明：Boss 等平台的分享页需要登录才能看（会跳登录墙），这种链接会返回明确提示，
引导用户用截图导入。
"""
import re
import time

import httpx

UA_MOBILE = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
)


def _strip_text(html: str) -> str:
    m = re.search(r'<meta[^>]*property="og:description"[^>]*content="([^"]*)"', html)
    if m:
        return m.group(1).strip()
    html2 = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", html)
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html2)).strip()


def _cjk_count(text: str) -> int:
    return len(re.findall(r"[一-鿿]", text))


def _looks_like_login_wall(text: str) -> bool:
    return ("登录" in text or "验证码" in text) and len(text) < 400


def _norm(url: str) -> str:
    return (url or "").split("?")[0].split("#")[0].rstrip("/")


def _fetch_via_requests(url: str) -> str:
    r = httpx.get(url, headers={"User-Agent": UA_MOBILE}, timeout=20, trust_env=False)
    r.raise_for_status()
    return _strip_text(r.text)


def _fetch_via_browser(url: str) -> str:
    """patchright headless Chrome 兜底（通道③，需要本机装有 Chrome）。"""
    from patchright.sync_api import sync_playwright

    p = sync_playwright().start()
    try:
        browser = None
        for channel in ("chrome", None):
            try:
                kwargs = {"headless": True}
                if channel:
                    kwargs["channel"] = channel
                browser = p.chromium.launch(**kwargs)
                break
            except Exception:
                continue
        if not browser:
            raise RuntimeError("浏览器不可用")
        page = browser.new_page(viewport={"width": 430, "height": 900}, user_agent=UA_MOBILE)
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(6000)  # 等 JS 渲染；部分平台风控 20 秒后清空，抢在前面抓
        text = page.evaluate("() => document.body ? document.body.innerText.slice(0, 8000) : ''")
        browser.close()
        return text
    finally:
        p.stop()


def cdp_available() -> bool:
    """用户已登录 Chrome 的调试端口是否可用（Browser Runtime）。"""
    from jobhunter_pro.browser import get_page_targets

    try:
        return isinstance(get_page_targets(), list)
    except Exception:
        return False


def fetch_via_cdp(url: str) -> str:
    """通道①：通过 Browser Runtime 指挥用户已登录的 Chrome：打开链接 → 等渲染 → 提取页面文字。

    只读取页面内容，不做任何点击/提交；标签页保留在用户 Chrome 里（不关闭）。
    """
    from jobhunter_pro.browser import evaluate, get_page_info, get_page_targets, new_tab, wait_for_load

    url_key = _norm(url)
    # 目标页已打开则复用；否则新开标签页
    target_id = None
    for t in get_page_targets():
        if _norm(t.get("url") or "") == url_key:
            target_id = t.get("targetId") or t.get("id")
            break
    if not target_id:
        target_id = new_tab(url)
        if not target_id:
            raise RuntimeError("无法在 Chrome 中打开新标签页")
        # 轮询真实 URL（可能发生登录跳转等重定向）
        for _ in range(20):
            time.sleep(0.5)
            try:
                info = get_page_info(target_id)
                if info and _norm(info.get("url") or "") not in ("", "about:blank", url_key):
                    break
            except Exception:
                pass

    wait_for_load(target_id, timeout=15)
    time.sleep(5)  # 等 JS 渲染出 JD
    text = evaluate(target_id, "() => document.body ? document.body.innerText.slice(0, 8000) : ''")
    return str(text or "")


JD_KEYWORDS = ("职位描述", "任职要求", "岗位职责", "岗位要求", "工作职责", "职责描述", "职位详情")


def _jd_quality_ok(text: str) -> bool:
    """判断提取内容是否像完整 JD（防止拿到未登录时的残缺页面）。

    未登录的 Boss 分享页约 500-600 个汉字且正文被折叠，完整 JD 通常 >800 汉字。
    """
    cjk = _cjk_count(text)
    if cjk >= 800:
        return True
    return cjk >= 150 and any(k in text for k in JD_KEYWORDS)


def fetch_jd(url: str) -> str:
    """提取链接里的岗位信息文本；失败抛 ValueError（含用户可操作的提示）。

    优先级：① 用户已登录的 Chrome（CDP，体验最好）→ ② 服务器直接抓 → ③ 工具自带浏览器。
    """
    if cdp_available():
        try:
            text = fetch_via_cdp(url)
        except Exception:
            text = ""
        if _jd_quality_ok(text):
            return text
        if _cjk_count(text) >= 40:
            raise ValueError(
                "Chrome 里页面内容不完整（很可能未登录）："
                "在调试 Chrome 窗口登录该网站后重试，或直接截图导入"
            )

    text = ""
    try:
        text = _fetch_via_requests(url)
    except Exception:
        text = ""
    if _cjk_count(text) >= 40 and not _looks_like_login_wall(text):
        return text

    try:
        text = _fetch_via_browser(url)
    except Exception:
        text = ""
    if _looks_like_login_wall(text):
        raise ValueError("该链接需要登录后才能查看：在调试 Chrome 里登录后重试，或截图导入")
    if _cjk_count(text) < 40:
        raise ValueError("链接内容提取失败（可能是验证码/需登录页面），建议截图导入")
    return text
