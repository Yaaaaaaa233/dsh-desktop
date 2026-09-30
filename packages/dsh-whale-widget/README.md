# 鲸鱼余额挂件 · 官方 Desktop 适配

基于 MeteorNOX 的 `dsh-whale-widget@0.3.17`，为官方 DeepSeek Harness Desktop 补充一级「用量显示」设置页、挂件启用开关与菜单同步。

## 安装

从本仓库 Release 下载适配包，完整退出官方客户端后执行：

```sh
dsh plugin --profile desktop add /绝对路径/dsh-whale-widget-0.3.17-desktop.3.tgz
```

验证环境为官方 macOS Desktop `0.2.0-rc.2`（Apple Silicon）。版本 `.3` 更新仓库元数据、兼容声明与文档，运行代码与本机验证过的 `.2` 完全相同。

## 使用

- 「设置 → 用量显示」管理挂件开关、大小、按压音效、音量、气泡、每轮消耗提示和滚动条避让。
- 设置页与挂件菜单使用相同配置，保存后双向同步。
- 设置页开关即时生效，停用时隐藏挂件并暂停余额/提示轮询。
- CSS 限定在本插件设置节点内，使用官方全局主题变量。
- 角色、峰谷文案、自定义音效与提示在挂件菜单中编辑。
- 上游的余额观测、账本及 Desktop bootstrap 保留。

整个插件包启停仍建议重启。原版 npm 更新会替换本地适配，更新时使用本仓库的包。默认共享 `$DSH_HOME` 的两个鲸鱼实例不应同时运行。

新版不提供原平台 token 模式。旧账本历史保留在 `accounting.legacyHistory`，新余额观测区间从迁移时开始。新版 Codex 统计等可选功能沿用上游，在挂件菜单中按需要管理。

## 来源与许可

[ADAPTATION.md](ADAPTATION.md) 说明本地改动；[UPSTREAM_README.md](UPSTREAM_README.md) 保留原完整使用文档。

代码为 MIT，保留上游版权。图片、动图和音效不按 MIT 再许可，详见 [PROVENANCE.md](PROVENANCE.md)。

[仓库与问题反馈](https://github.com/Yaaaaaaa233/dsh-desktop) · [上游项目](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)
