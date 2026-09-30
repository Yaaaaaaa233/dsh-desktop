# Desktop 适配来源

上游 npm 基线：`dsh-whale-widget@0.3.17`，MeteorNOX，代码 MIT。上游 Desktop bootstrap 与账本引擎沿用原代码。

本地改动：

- `lib/client.js`：官方一级「用量显示」设置插槽、主题变量、串行保存与配置事件同步。
- `lib/index.js`：读取/写入 `enabled`，保留未编辑字段。
- `assets/whale-widget.js`：挂件显隐与轮询开关、从设置页刷新配置、菜单保存后通知设置页。
- package.json / 文档：本仓库地址、精确兼容基线、分发与安装说明。

版本 `.3` 的运行代码与实机验证过的 `.2` 完全相同；验证代码摘要见仓库 `catalog.json`。

原使用文档为 `UPSTREAM_README.md`，原素材许可范围为 `PROVENANCE.md`。用户的个人角色、音效与壁纸不在本安装包内。
