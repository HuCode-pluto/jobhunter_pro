#!/bin/bash
# JobHunter Pro Linux 启动器（Ubuntu 长期运行）。
# 职责：专用 Chrome 调试实例（登录态持久）→ Browser Runtime 连接检查 → 本地面板。
# 面板默认只监听 127.0.0.1:8686；通过 Tailscale 地址转发，供局域网外机器安全访问。

set -u

BOSSHUNTER_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHROME_PROFILE="$HOME/.config/jobhunter_pro-chrome"
DEBUG_URL="http://127.0.0.1:9222/json/version"
WORKBENCH_URL="http://127.0.0.1:8686/"

# 可执行方式：CLI 命令 > 仓库 venv > python3 -m
RUNNER=()
RUNNER_PREFIX=()
if command -v jobhunter >/dev/null 2>&1; then
    RUNNER=("$(command -v jobhunter)")
elif [ -x "$BOSSHUNTER_ROOT/.venv/bin/python" ]; then
    RUNNER=("$BOSSHUNTER_ROOT/.venv/bin/python")
    RUNNER_PREFIX=(-m jobhunter_pro.main)
elif command -v python3 >/dev/null 2>&1; then
    RUNNER=("$(command -v python3)")
    RUNNER_PREFIX=(-m jobhunter_pro.main)
else
    echo "[JobHunter Pro] 未找到 jobhunter 或 Python。先安装：pip install -e $BOSSHUNTER_ROOT" >&2
    exit 1
fi

launch_chrome() {
    # Chrome 136+ 禁止在默认 profile 上开调试端口，必须用独立 user-data-dir；
    # 首次使用在该窗口登录招聘平台（扫码一次，登录态保存在 $CHROME_PROFILE）。
    local chrome_bin=""
    for candidate in google-chrome google-chrome-stable chromium chromium-browser; do
        if command -v "$candidate" >/dev/null 2>&1; then chrome_bin="$candidate"; break; fi
    done
    if [ -z "$chrome_bin" ]; then
        echo "[JobHunter Pro] 未找到 Chrome/Chromium：请先安装 google-chrome 后重试" >&2
        return 1
    fi
    nohup "$chrome_bin" --remote-debugging-port=9222 \
        --user-data-dir="$CHROME_PROFILE" \
        --no-first-run --no-default-browser-check --disable-features=MediaRouter \
        "https://www.zhipin.com" >/dev/null 2>&1 &
}

wait_ready() {
    local url="$1" tries="${2:-20}"
    for _ in $(seq 1 "$tries"); do
        sleep 0.5
        if curl -s --max-time 2 "$url" >/dev/null 2>&1; then return 0; fi
    done
    return 1
}

if ! curl -s --max-time 2 "$DEBUG_URL" >/dev/null 2>&1; then
    echo "[JobHunter Pro] 启动专用 Chrome 调试实例…"
    launch_chrome || exit 1
    if ! wait_ready "$DEBUG_URL"; then
        echo "[JobHunter Pro] 警告：Chrome 调试端口 10 秒内未就绪（若已有 Chrome 在跑，请完全退出后重试）" >&2
    fi
fi

echo "[JobHunter Pro] 检查 Browser Runtime…"
if ! "${RUNNER[@]}" "${RUNNER_PREFIX[@]}" connect; then
    echo "[JobHunter Pro] 警告：浏览器连接检查失败，面板仍会启动" >&2
fi

echo "[JobHunter Pro] 启动本地面板（127.0.0.1:8686）…"
cd "$BOSSHUNTER_ROOT" || exit 1
nohup "${RUNNER[@]}" "${RUNNER_PREFIX[@]}" web --no-open >/tmp/jobhunter_pro-panel.log 2>&1 &

if wait_ready "$WORKBENCH_URL"; then
    TS_IP=$(ip -4 -o addr show tailscale0 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -1)
    if [ -n "$TS_IP" ] && ! curl -s --max-time 2 "http://$TS_IP:8686/" >/dev/null 2>&1; then
        # 面板无登录鉴权（官方设计为仅本机），只转发到 Tailscale 地址，
        # 不暴露到局域网/公网；远程机器浏览器直接打开 http://<tailscale-ip>:8686
        if command -v socat >/dev/null 2>&1; then
            nohup socat TCP-LISTEN:8686,bind="$TS_IP",fork,reuseaddr \
                TCP:127.0.0.1:8686 >/dev/null 2>&1 &
            echo "[JobHunter Pro] 面板已就绪：本机 http://127.0.0.1:8686 ，远程 http://$TS_IP:8686"
        else
            echo "[JobHunter Pro] 面板已就绪：http://127.0.0.1:8686（未装 socat，跳过 Tailscale 转发）"
        fi
    else
        echo "[JobHunter Pro] 面板已就绪：http://127.0.0.1:8686"
    fi
else
    echo "[JobHunter Pro] 警告：面板 10 秒内未就绪，日志见 /tmp/jobhunter_pro-panel.log" >&2
fi

echo "[JobHunter Pro] 完成。首次使用请在专用 Chrome 窗口登录招聘平台。"
