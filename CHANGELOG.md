# Changelog

本文件自 v0.1.0 起记录 JobHunter Pro 的版本历史。更名前的上游版本历史见上游项目 [BossHunter](https://github.com/shengjidaguai-china/BossHunter) 的 CHANGELOG。

## 版本规则

- 新功能：次版本号 +1（如 `0.1.0` → `0.2.0`）
- 修复和小改动：修订号 +1（如 `0.2.0` → `0.2.1`）
- 不兼容变更：在 `0.x` 阶段通过次版本号提升，并在条目中注明
- 每次发布同步更新 `pyproject.toml`、`src/jobhunter_pro/__init__.py`、前端 `package.json`，并打 `vX.Y.Z` Git tag

## v0.2.0

2026-11-14

- 首页新增「快捷操作」卡片：项目重启按钮，以及 BOSS 直聘 / 智联招聘 / 前程无忧 / 猎聘 的登录入口
- 登录入口在专用 Chrome 未运行时自动拉起 `jobhunter_pro` 独立 profile；Linux 通过 `systemd-run` 启动，面板重启不会关闭浏览器
- 新增 `POST /api/system/restart`（systemd 用户服务）和 `POST /api/browser/open-platform`（平台白名单）接口
- 首页显示当前运行版本号，健康检查返回 `0.2.0`
- 新增后端测试覆盖重启、平台白名单、Chrome 自动启动

## v0.1.0

2026-11-04

- 以 BossHunter v2.4.0 为基座整体更名为 **jobhunter_pro**:Python 包、CLI 命令(`jobhunter`)、前端品牌、数据库文件名、CDP 运行时标识全部换新
- 新增**岗位库**手动求职流水线(移植自自建工具 job-hunter):
  - 粘贴 JD(批量 ====== 分隔,单次 ≤10 条)/ 截图识别(视觉模型 OCR)/ 链接提取(CDP 三通道)→ LLM 解析 → 目标方向识别 → 硬条件过滤 + 0-100 匹配打分(LLM 失败自动关键词兜底)
  - 达标自动生成打招呼语/求职信/定制简历/投递要点,文件存 `data/output/`
  - 投递台账(状态流转 + 备注)、面试准备包(缓存 + 题库同步)、定制简历 PDF 导出
- 新增**面试复盘**:上传录音(mp3/m4a/wav/mp4 等,mp4 走 ffmpeg 抽音轨)或粘贴转写文本 → 后台 LLM 复盘(问题提取/参考回答/差距分析/总结)→ 题库自动聚合;本地 faster-whisper 可选
- 新增**面试题库**(按方向去重、频次统计、准备包预测题合并)、**模拟面试**(5-8 问渐进式,会话持久化)
- 新增**求职管理**:求职周报(累计/投递/面试/Offer 统计)+ Offer 对比
- 新增**技能地图**(分类聚合 + 频次统计 + 学习资料匹配 + AI 学习建议)与 **30 天学习计划**(技能频次 + 面试短板 + 资料库)
- 新增**结构化简历管理**:AI 解析简历 → resume_structured.yaml,基础简历 PDF 导出
- 新增学习资料种子库(104 条运维/实施/信创/等保/软考方向,建库自动播种)
- 配置面板新增:目标岗位方向编辑器、匹配分阈值、视觉模型(智谱 GLM-4V-Flash)与转写设置
