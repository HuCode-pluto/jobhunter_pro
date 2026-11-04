-- 运维/实施方向学习资料种子库（人工挑选的优质来源，可直接扩展）
INSERT OR IGNORE INTO manual_materials (keywords, title, type, url, summary) VALUES
-- ===== 系统 / Linux =====
('linux,基础', '菜鸟教程 - Linux 教程', 'doc', 'https://www.runoob.com/linux/linux-tutorial.html', '入门级中文教程，命令速查友好'),
('linux,系统管理', '鸟哥的 Linux 私房菜', 'book', 'https://linux.vbird.org/', '经典中文 Linux 教材，系统化管理思路讲得透'),
('linux,命令', 'Linux 命令大全（搜索工具）', 'github', 'https://github.com/jaywcjlove/linux-command', '中文命令手册，可离线查'),
('linux,教程,运维', 'dunwu/linux-tutorial', 'github', 'https://github.com/dunwu/linux-tutorial', '面向运维的 Linux 知识整理'),
('linux,内核', 'Linux Kernel 官方文档', 'doc', 'https://www.kernel.org/doc/', '内核官方文档，进阶必读'),
('linux,性能调优', 'Brendan Gregg 性能分析', 'doc', 'https://www.brendangregg.com/', '性能分析领域权威，CPU/内存/IO 方法论'),
('shell,脚本', 'Advanced Bash-Scripting Guide', 'book', 'https://tldp.org/LDP/abs/html/', 'Bash 脚本进阶经典'),
('shell,脚本', 'Shell Scripting Tutorial', 'doc', 'https://www.shellscript.sh/', 'Shell 脚本系统教程'),
-- ===== 网络 =====
('网络,tcp/ip,协议', '小林coding 图解网络', 'book', 'https://xiaolincoding.com/', '图解 TCP/IP/HTTP，面试和工作都好用'),
('http,网络', 'MDN HTTP 文档（中文）', 'doc', 'https://developer.mozilla.org/zh-CN/docs/Web/HTTP', 'HTTP 协议权威参考'),
('网络,抓包', 'tcpdump 手册', 'doc', 'https://www.tcpdump.org/manpages/tcpdump.1.html', '抓包工具官方手册'),
('网络,故障排查', 'Wireshark 官方文档', 'doc', 'https://www.wireshark.org/docs/', '抓包分析工具文档'),
-- ===== 容器 / 编排 =====
('docker,容器', 'Docker 官方文档', 'doc', 'https://docs.docker.com/', '容器权威文档'),
('kubernetes,k8s,容器编排', 'Kubernetes 官方文档（中文）', 'doc', 'https://kubernetes.io/zh-cn/docs/', 'K8s 权威文档，中文翻译完整'),
('kubernetes,k8s,入门', 'Kubernetes 基础教程', 'course', 'https://kubernetes.io/zh-cn/docs/tutorials/kubernetes-basics/', '官方互动式入门'),
('devops,路线图', 'DevOps Roadmap', 'practice', 'https://roadmap.sh/devops', 'DevOps 技能路线图，规划学习路径'),
-- ===== 监控 =====
('prometheus,监控', 'Prometheus 官方文档', 'doc', 'https://prometheus.io/docs/introduction/overview/', '监控体系核心，官方文档'),
('grafana,监控,可视化', 'Grafana 官方文档', 'doc', 'https://grafana.com/docs/', '可视化面板权威文档'),
('监控,告警', 'Nightingale 夜莺监控（国产开源）', 'github', 'https://n9e.github.io/', '国产开源监控系统，国内社区活跃'),
-- ===== 自动化 / CI/CD =====
('ansible,自动化,配置管理', 'Ansible 官方文档', 'doc', 'https://docs.ansible.com/ansible/latest/', '批量配置管理权威文档'),
('ansible,自动化', 'Ansible 中文社区', 'doc', 'https://www.ansible.com.cn/', '中文入门资料'),
('jenkins,cicd,持续集成', 'Jenkins 官方文档', 'doc', 'https://www.jenkins.io/doc/', 'CI 流水线工具文档'),
('gitlab,cicd', 'GitLab CI/CD 文档', 'doc', 'https://docs.gitlab.com/ee/ci/', '代码托管+流水线一体平台'),
-- ===== 数据库 =====
('mysql,数据库', 'MySQL 8.0 官方手册', 'doc', 'https://dev.mysql.com/doc/refman/8.0/en/', 'SQL/复制/调优权威手册'),
('sql,数据库', 'W3Schools SQL 教程', 'doc', 'https://www.w3schools.com/sql/', 'SQL 语法快速复习'),
('redis,缓存', 'Redis 官方文档', 'doc', 'https://redis.io/docs/latest/', '缓存/数据结构权威文档'),
('postgresql,数据库', 'PostgreSQL 官方文档', 'doc', 'https://www.postgresql.org/docs/', 'PG 权威文档'),
-- ===== 中间件 / Web =====
('nginx,反向代理,负载均衡', 'Nginx 官方文档', 'doc', 'https://nginx.org/en/docs/', '反向代理/负载均衡权威文档'),
-- ===== 云平台 =====
('云,阿里云,认证', '阿里云认证中心', 'course', 'https://edu.aliyun.com/certification', 'ACA/ACP 认证体系，运维方向学习路径'),
('云,腾讯云', '腾讯云培训认证', 'course', 'https://cloud.tencent.com/edu', '云从业者/运维认证'),
('云,华为云', '华为云开发者学堂', 'course', 'https://edu.huaweicloud.com/', '华为云认证与实验'),
-- ===== 开发 / 脚本 =====
('python,脚本', 'Python 官方文档（中文）', 'doc', 'https://docs.python.org/zh-cn/3/', 'Python 权威文档'),
('python,入门', '廖雪峰 Python 教程', 'course', 'https://liaoxuefeng.com/books/python/', '中文入门经典'),
('git,版本控制', 'Pro Git 中文版', 'book', 'https://git-scm.com/book/zh/v2', 'Git 权威教材'),
('算法,数据结构,面试', 'hello-algo（动画图解算法）', 'github', 'https://github.com/krahets/hello-algo', '图解数据结构与算法，面试复习友好'),
-- ===== 方法论 / 体系 =====
('sre,方法论,稳定性', 'Google SRE Books（免费）', 'book', 'https://sre.google/books/', 'SRE 运维解密等全套书籍免费阅读'),
('itil,流程,实施', 'ITIL 官方（AXELOS）', 'doc', 'https://www.axelos.com/', 'IT 服务管理框架，实施岗常见要求'),
('项目管理,pmp', 'PMP 认证（PMI）', 'cert', 'https://www.pmi.org/certifications/project-management-pmp', '项目管理认证，实施工程师加分项'),
-- ===== 认证 =====
('rhce,linux,红帽,认证', 'RHCE 认证', 'cert', 'https://www.redhat.com/en/services/certification/rhce', '红帽工程师认证，Linux 运维硬通货'),
('cka,kubernetes,认证', 'CKA 认证', 'cert', 'https://training.linuxfoundation.org/certification/certified-kubernetes-administrator-cka/', 'K8s 管理员认证'),
('软考,职称,实施', '全国计算机技术与软件专业技术资格考试', 'cert', 'https://www.ruankao.org.cn/', '国内职称考试，部分岗位硬性要求'),
-- ===== 面试 / 练习 =====
('面经,面试', '牛客网', 'interview', 'https://www.nowcoder.com/', '面经、题库、公司真题'),
('算法,刷题,面试', '力扣 LeetCode 中国站', 'practice', 'https://leetcode.cn/', '刷题练习'),
('运维,面试,面经', '牛客运维面经搜索', 'interview', 'https://www.nowcoder.com/search?query=%E8%BF%90%E7%BB%B4', '运维方向面经'),
-- ===== 视频 =====
('linux,运维,视频', 'B站搜索：Linux 运维', 'video', 'https://search.bilibili.com/all?keyword=Linux%E8%BF%90%E7%BB%B4', 'B站运维视频，按播放量筛选'),
('k8s,kubernetes,视频', 'B站搜索：Kubernetes 教程', 'video', 'https://search.bilibili.com/all?keyword=Kubernetes%E6%95%99%E7%A8%8B', 'K8s 视频教程'),
('docker,视频', 'B站搜索：Docker 教程', 'video', 'https://search.bilibili.com/all?keyword=Docker%E6%95%99%E7%A8%8B', '容器视频教程'),
('实施,交付,视频', 'B站搜索：实施工程师', 'video', 'https://search.bilibili.com/all?keyword=%E5%AE%9E%E6%96%BD%E5%B7%A5%E7%A8%8B%E5%B8%88', '实施岗位日常与经验分享');
