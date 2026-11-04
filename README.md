<p align="center">
  <strong>JobHunter Pro</strong> — 求职自动化 + 手动求职流水线一体化工具
</p>

<h1 align="center">JobHunter Pro v0.1.0</h1>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-v0.1.0-FB6511">
  <img alt="Python 3.10+" src="https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-lightgrey">
</p>

<p align="center">
  🚀 本地运行 · 🔐 人工确认 · 🤖 多模型兼容 · 🧩 招聘全流程覆盖
</p>

**JobHunter Pro** 帮你把求职流程从头到尾跑通:

- **自动化侧(源自 [BossHunter](https://github.com/shengjidaguai-china/BossHunter))**:多平台岗位采集(BOSS 直聘/智联/51job/猎聘)、AI 评分筛选、生成个性化招呼语、人工确认后低频发送、监听 HR 回复、定制简历。直连你自己的 Chrome,不伪造指纹,遇到验证码/风控信号主动刹车。
- **手动流水线侧(岗位库)**:粘贴 JD(或截图识别/链接提取)→ LLM 解析 → 硬条件过滤 + 0-100 匹配打分 → 打招呼语/求职信/定制简历 → 投递台账 → 面试复盘 → 面试题库 → 模拟面试 → Offer 对比 → 求职周报 → 技能地图 + 30 天学习计划。

所有投递必须经过人工确认,不会自动偷跑。

## 快速开始

需要 Python 3.10+、Node.js 22+、最新版 Google Chrome 和可用的 AI API(推荐 DeepSeek)。

```bash
git clone https://github.com/HuCode-pluto/jobhunter_pro.git
cd jobhunter_pro
npm --prefix src/jobhunter_pro/web/frontend ci
npm --prefix src/jobhunter_pro/web/frontend run build
pip install -e .
jobhunter web
```

在本地打开的 `http://127.0.0.1:8686` 面板中:

1. 上传本人真实简历(.md/.docx/带文字层的 .pdf)
2. 填写搜索关键词、目标城市、期望薪资
3. 配置 AI 服务商(API Key 只在本地面板输入,不会发送到聊天/Issue/提交)
4. 「求职方向与手动流水线」里添加目标方向(关键词/城市/薪资/一票否决词)
5. 开启 Chrome 远程调试并登录招聘平台后:`jobhunter connect` → `jobhunter run`

> ⚠️ 自动化操作招聘平台存在账号限制或封禁风险。本项目仅用于个人求职效率提升;请遵守平台规则、保持低频,并自行承担使用风险。本项目与任何招聘平台不存在隶属或合作关系。

## 手动流水线(岗位库)使用流程

1. 日常浏览器浏览到心仪岗位 → 复制 JD 文本(或截图/链接)到「岗位库」页
2. 工具自动:解析 JD → 归类方向 → 硬条件过滤(城市/薪资/排除词/风险点)→ 匹配打分
3. 达标岗位自动生成:打招呼语、求职信、定制简历、投递要点(存 `data/output/`)
4. 人工到原平台投递 → 回「岗位库」更新台账状态
5. 面试后上传录音或粘贴转写文本 → 自动复盘 + 题库聚合
6. 累计 JD 后生成技能地图与 30 天学习计划

截图识别默认用智谱 GLM-4V-Flash(免费),Key 放环境变量 `ZHIPU_API_KEY`;录音转写默认手动粘贴,可选本地 faster-whisper(`pip install jobhunter_pro[asr]`)。

## 常用命令

```bash
jobhunter web              # 打开 Web 面板
jobhunter connect          # 检测 Chrome CDP 连接
jobhunter ai-status        # 检测 AI API 连接
jobhunter run              # 一键执行完整自动化流程
jobhunter scrape -k "关键词"  # 采集岗位
jobhunter score / greet / confirm / send / monitor / status
```

## Ubuntu 长期运行部署

适合把项目放在一台常开的 Linux 机器（如合盖的笔记本/NAS）上长期运行,日常工作机通过 Tailscale 访问面板:

```bash
# 1. 安装(Node 22+ 必装;国内走 npmmirror:https://npmmirror.com/mirrors/node/ 下载解压到 /opt 并链接 /usr/local/bin/node)
# 2. 拉代码 + 建虚拟环境 + 构建前端(见「快速开始」,pip 用清华镜像)
# 3. 面板系统服务
mkdir -p ~/.config/systemd/user
cp scripts/linux/jobhunter-panel.service ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now jobhunter-panel
# 4. Chrome 调试实例随图形会话自启(首次登录招聘平台用)
mkdir -p ~/.config/autostart
cp scripts/linux/jobhunter-chrome.desktop ~/.config/autostart/
# 5. 远程访问:Ubuntu 需装 socat;本机浏览器打开
#    http://127.0.0.1:8686(本机)/ http://<tailscale-ip>:8686(远程,需先跑一次 start_jobhunter_pro.sh 建立转发)
bash scripts/linux/start_jobhunter_pro.sh
```

- 面板无登录鉴权(设计为仅本机),远程访问只转发到 Tailscale 地址,不暴露到局域网/公网
- 日志:`journalctl --user -u jobhunter-panel -f`、`/tmp/jobhunter_pro-panel.log`、`/tmp/jobhunter_pro-start.log`

## 隐私与安全

- 你的简历、数据库(`data/`)、录音、生成文件、`config.yaml`(含 API Key 配置)全部在本地,均已被 .gitignore 排除,**永远不会进入 git 仓库**
- API Key 只从本地面板输入或环境变量读取,项目代码不读取任何第三方工具的登录凭证
- 自动化侧内置风控保护:日访问硬上限、高斯随机间隔、时间窗口、检测到验证码/拦截立即停止并冷却

## 文档

| 文档 | 内容 |
|---|---|
| [完整上手指南](docs/QUICKSTART.md) | 安装、Chrome 连接、首次配置和安全边界 |
| [CLI 命令](docs/CLI.md) | 一键流程、分步命令、监听与状态查看 |
| [配置指南](docs/CONFIGURATION.md) | 平台、AI、简历和风险控制配置 |

## 许可证

本项目基于 [BossHunter](https://github.com/shengjidaguai-china/BossHunter)(PolyForm Noncommercial License 1.0.0)衍生,沿用同一许可证,详见 [LICENSE](LICENSE)。允许非商业用途的使用、修改与分发;商业使用需另行授权。岗位库手动流水线移植自作者自建工具 job-hunter。

## 版本历史

| 日期 | 版本号 | 更新内容 |
|---|---|---|
| 2026-11-04 | v0.1.0 | 以 BossHunter v2.4.0 为基座整体更名为 jobhunter_pro;新增岗位库手动流水线(粘贴 JD/截图识别/链接提取 → 解析打分 → 定制材料 → 投递台账)、面试复盘/题库/模拟面试、Offer 对比、求职周报、技能地图与 30 天学习计划、简历 PDF 导出 |

完整版本历史见 [CHANGELOG.md](CHANGELOG.md)。
