-- 学习资料种子库第二批（运维/实施方向，人工挑选的优质来源）
INSERT OR IGNORE INTO manual_materials (keywords, title, type, url, summary) VALUES
-- ===== 系统进阶 / 性能 =====
('linux,性能,火焰图', 'Linux Performance（Brendan Gregg）', 'doc', 'https://www.brendangregg.com/linuxperf.html', 'Linux 性能分析工具全景图与方法论'),
('linux,内核', 'Linux 内核文档（中文）', 'doc', 'https://www.kernel.org/doc/html/latest/', '内核官方文档'),
('linux,国产化,信创', 'openEuler 文档（华为欧拉）', 'doc', 'https://docs.openeuler.org/', '国产服务器操作系统，信创方向必备'),
('linux,国产化,信创', '龙蜥社区 Anolis OS', 'doc', 'https://openanolis.cn/', '阿里开源国产操作系统'),
('shell,bash', '阮一峰 Bash 脚本教程', 'book', 'https://wangdoc.com/bash/', '中文 Bash 教程，系统完整'),
-- ===== 网络 =====
('网络,ssh,安全', 'SSH Academy', 'doc', 'https://www.ssh.com/academy/ssh', 'SSH 原理/密钥/加固权威资料'),
('网络,高可用,负载均衡', 'Keepalived 官方文档', 'doc', 'https://keepalived.org/doc/', 'VRRP 高可用方案'),
('网络,负载均衡,代理', 'HAProxy 官网', 'doc', 'https://www.haproxy.org/', '开源负载均衡器'),
('网络,负载均衡,nginx', 'Nginx 负载均衡管理指南', 'doc', 'https://docs.nginx.com/nginx/admin-guide/load-balancer/', 'Nginx 官方负载均衡配置指南'),
('网络,等保,安全', '网络安全等级保护网', 'doc', 'https://www.djbh.net/', '等保 2.0 政策与标准，政企运维常见要求'),
-- ===== 虚拟化 / 存储 =====
('虚拟化,vmware', 'VMware vSphere 产品页', 'doc', 'https://www.vmware.com/products/vsphere.html', '企业虚拟化主流方案'),
('虚拟化,kvm,libvirt', 'Libvirt 文档', 'doc', 'https://libvirt.org/docs.html', 'KVM 虚拟化管理接口'),
('存储,ceph,分布式', 'Ceph 官方文档', 'doc', 'https://docs.ceph.com/', '分布式存储系统文档'),
-- ===== 容器 / 云原生 =====
('kubernetes,helm,包管理', 'Helm 中文文档', 'doc', 'https://helm.sh/zh/docs/', 'K8s 包管理器'),
('容器,镜像仓库,harbor', 'Harbor 官方文档', 'doc', 'https://goharbor.io/docs/', '企业级容器镜像仓库'),
('容器,containerd', 'containerd 文档', 'doc', 'https://containerd.io/docs/', '容器运行时'),
('kubernetes,概念', 'Kubernetes 概念（中文）', 'doc', 'https://kubernetes.io/zh-cn/docs/concepts/', 'Pod/Service/调度等核心概念'),
('devops,gitops,cicd', 'Argo CD 文档', 'doc', 'https://argo-cd.readthedocs.io/', 'GitOps 持续部署工具'),
('cicd,gitlab', 'GitLab Runner 文档', 'doc', 'https://docs.gitlab.com/runner/', 'CI 执行器配置'),
-- ===== 监控 / 日志 =====
('zabbix,监控', 'Zabbix 官方文档', 'doc', 'https://www.zabbix.com/documentation', '老牌企业监控系统'),
('监控,告警,alertmanager', 'Alertmanager 文档', 'doc', 'https://prometheus.io/docs/alerting/latest/alertmanager/', 'Prometheus 告警路由与降噪'),
('日志,loki,监控', 'Grafana Loki 文档', 'doc', 'https://grafana.com/docs/loki/latest/', '轻量日志聚合'),
('日志,elk,elasticsearch', 'Elastic Stack 文档', 'doc', 'https://www.elastic.co/guide/en/elastic-stack/current/index.html', 'ELK 日志平台'),
('日志,graylog', 'Graylog 文档', 'doc', 'https://go2docs.graylog.org/', '开源日志管理'),
('监控,夜莺,n9e', 'Nightingale 文档', 'doc', 'https://n9e.github.io/docs/', '国产开源监控，社区活跃'),
-- ===== 数据库 =====
('mysql,主从,复制', 'MySQL 复制官方文档', 'doc', 'https://dev.mysql.com/doc/refman/8.0/en/replication.html', '主从复制原理与配置'),
('redis,哨兵,高可用', 'Redis Sentinel 文档', 'doc', 'https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/', 'Redis 高可用方案'),
('postgresql,高可用', 'PostgreSQL 高可用文档', 'doc', 'https://www.postgresql.org/docs/current/high-availability.html', 'PG 高可用方案'),
('数据库,达梦,国产化', '达梦数据库在线文档', 'doc', 'https://eco.dameng.com/', '国产数据库文档与社区（简历有达梦经验）'),
('数据库,国产化,金仓', '人大金仓 KingbaseES', 'doc', 'https://www.kingbase.com.cn/', '国产数据库'),
('sql,练习', 'SQLZoo 练习', 'practice', 'https://sqlzoo.net/', '经典 SQL 在线练习'),
('sql,面试,刷题', 'LeetCode 数据库题库', 'practice', 'https://leetcode.cn/problemset/database/', 'SQL 面试题练习'),
-- ===== 中间件 =====
('rabbitmq,消息队列', 'RabbitMQ 官方文档', 'doc', 'https://www.rabbitmq.com/docs', '消息中间件文档'),
('zookeeper,分布式', 'ZooKeeper 官方文档', 'doc', 'https://zookeeper.apache.org/doc/', '分布式协调服务'),
('tomcat,中间件', 'Tomcat 10 文档', 'doc', 'https://tomcat.apache.org/tomcat-10.1-doc/', 'Java 应用服务器'),
('elasticsearch,搜索', 'Elasticsearch 参考手册', 'doc', 'https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html', 'ES 权威文档'),
-- ===== 脚本 / 开发 =====
('python,运维,paramiko', 'Paramiko 文档', 'doc', 'https://docs.paramiko.org/', 'Python SSH 自动化'),
('python,运维,psutil', 'psutil 文档', 'doc', 'https://psutil.readthedocs.io/', '系统监控 Python 库'),
('python,正则', 'Python 正则表达式 HOWTO（中文）', 'doc', 'https://docs.python.org/zh-cn/3/howto/regex.html', '日志处理必备'),
('powershell,windows', 'PowerShell 官方文档（中文）', 'doc', 'https://learn.microsoft.com/zh-cn/powershell/', 'Windows 自动化'),
('windows,服务器', 'Windows Server 文档（中文）', 'doc', 'https://learn.microsoft.com/zh-cn/windows-server/', 'Windows 服务器管理'),
-- ===== 文档 / 表达 =====
('markdown,文档', 'Markdown Guide', 'doc', 'https://www.markdownguide.org/', 'Markdown 语法参考'),
('文档,流程图', 'draw.io 在线绘图', 'practice', 'https://app.diagrams.net/', '拓扑图/流程图绘制'),
-- ===== 认证 / 考试 =====
('rhcsa,linux,认证', 'RHCSA 认证', 'cert', 'https://www.redhat.com/en/services/certification/rhcsa', '红帽系统管理员认证（RHCE 前置）'),
('ckad,kubernetes,认证', 'CKAD 认证', 'cert', 'https://training.linuxfoundation.org/certification/certified-kubernetes-application-developer-ckad/', 'K8s 应用开发者认证'),
('软考,项目管理,实施', '软考系统集成项目管理工程师', 'cert', 'https://www.ruankao.org.cn/', '实施/交付方向常见证书（中级）'),
('等保,安全,认证', '等保测评要求（2.0）', 'cert', 'https://www.djbh.net/', '等保合规知识'),
-- ===== 面试 / 题库 =====
('面试,题库,在线', '牛客网题库', 'interview', 'https://www.nowcoder.com/exam/oj', '在线笔试/面试题库'),
('面经,运维', '牛客网运维面试搜索', 'interview', 'https://www.nowcoder.com/search?query=%E8%BF%90%E7%BB%B4%E9%9D%A2%E8%AF%95', '运维方向面经'),
-- ===== 视频 =====
('zabbix,监控,视频', 'B站搜索：Zabbix 教程', 'video', 'https://search.bilibili.com/all?keyword=Zabbix%E6%95%99%E7%A8%8B', '监控系统视频教程'),
('elk,日志,视频', 'B站搜索：ELK 日志系统', 'video', 'https://search.bilibili.com/all?keyword=ELK%E6%97%A5%E5%BF%97%E7%B3%BB%E7%BB%9F', '日志平台搭建视频'),
('mysql,调优,视频', 'B站搜索：MySQL 性能调优', 'video', 'https://search.bilibili.com/all?keyword=MySQL%E6%80%A7%E8%83%BD%E8%B0%83%E4%BC%98', '数据库调优视频'),
('等保,安全,视频', 'B站搜索：等保测评', 'video', 'https://search.bilibili.com/all?keyword=%E7%AD%89%E4%BF%9D%E6%B5%8B%E8%AF%84', '等保合规知识视频'),
('powershell,视频', 'B站搜索：PowerShell 教程', 'video', 'https://search.bilibili.com/all?keyword=PowerShell%E6%95%99%E7%A8%8B', 'Windows 自动化视频'),
('软考,视频', 'B站搜索：软考系统集成项目管理', 'video', 'https://search.bilibili.com/all?keyword=%E8%BD%AF%E8%80%83%E7%B3%BB%E7%BB%9F%E9%9B%86%E6%88%90', '软考备考视频'),
('kubernetes,实战,视频', 'B站搜索：Kubernetes 实战', 'video', 'https://search.bilibili.com/all?keyword=Kubernetes%E5%AE%9E%E6%88%98', 'K8s 实战视频'),
('面试,模拟,视频', 'B站搜索：运维面试模拟', 'video', 'https://search.bilibili.com/all?keyword=%E8%BF%90%E7%BB%B4%E9%9D%A2%E8%AF%95%E6%A8%A1%E6%8B%9F', '面试模拟与技巧视频'),
('linux,运维,视频', 'B站搜索：Linux 运维入门到精通', 'video', 'https://search.bilibili.com/all?keyword=Linux%E8%BF%90%E7%BB%B4%E5%85%A5%E9%97%A8%E5%88%B0%E7%B2%BE%E9%80%9A', '系统化视频教程');
