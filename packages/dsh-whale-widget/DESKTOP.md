# Desktop 集成

本包由 dsh-desktop 仓库维护，当前版本 `0.3.17-desktop.3`。

它沿用上游结构化 Desktop 注入与账本逻辑，并通过官方 `settings.section` 插槽补回一级用量设置。设置页与挂件共享 `/dsh-whale/size.json`，使用 `dshw-config-changed` 事件同步。

挂件级开关即时生效；插件包的完整热卸载尚不保证。当前验证范围与安装命令见 README.md，源码来源见 ADAPTATION.md。
