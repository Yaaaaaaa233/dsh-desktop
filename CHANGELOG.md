# 更新记录

## v0.2.0 — 2026-09-30

- 仓库转向官方 DeepSeek Harness Desktop 的插件适配与界面改造。
- 冻结原 Electron 桌面壳：标签 `legacy-electron-shell-20260930` 指向 `75ab5af`；原跟踪文件原样保存到 `legacy/electron-shell/`。
- 纳入鲸鱼 Desktop 适配源码：一级「用量显示」设置页、全局主题变量、挂件开关和菜单同步。
- 鲸鱼包版本为 `0.3.17-desktop.3`：运行代码与本机验证过的 `.2` 一致，更新仓库元数据、兼容声明和分发文档。
- 锁定皮肤中心 `0.4.4`，提供官方 Desktop 安装与已有 v2 皮肤的迁移说明。
- 新增插件清单、上游完整性锁定、检查/打包命令、账本迁移检查与 GitHub Actions。
- 兼容基线明确为 macOS Apple Silicon、官方 Desktop `0.2.0-rc.2`；不将未验证环境标为支持。

## 旧桌面壳

2026-09-30 前的 Electron 壳提交记录完整保留。最后提交：`75ab5af`，修复多实例检测的进程命令列宽截断。
