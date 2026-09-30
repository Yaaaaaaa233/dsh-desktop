# 第三方来源与许可

本仓库是官方 DeepSeek Harness Desktop 的独立社区扩展项目。DeepSeek 名称和标识属于各自权利人，本项目不代表官方。

## 本地维护的鲸鱼插件

- 上游：[MeteorNOX/DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)
- 基线：npm `dsh-whale-widget@0.3.17`。
- 上游代码：MIT，版权声明保留于 `packages/dsh-whale-widget/LICENSE`。
- 本地改动：Desktop 设置页、启用开关、配置事件同步和分发元数据。
- `assets/` 内的图片、动图与音效保留上游素材；它们不按本仓库 MIT 再许可。来源与使用范围见同目录上级的 `PROVENANCE.md`。`assets/whale-widget.js` 是代码。
- 上游使用说明保留为 `UPSTREAM_README.md`。

## 上游皮肤中心

- 上游：[zhu1090093659/dsh-skins](https://github.com/zhu1090093659/dsh-skins)
- 发布包：`@linxin666/dsh-client-ui-skin-center@0.4.4`。
- 许可：Apache-2.0；下载与分发原始 npm 包，不修改或移除其中的声明和素材。
- 仓库保存版本与完整性信息，不复制用户自定义壁纸或整套上游源码。

## 官方运行环境

DeepSeek Harness 是独立的上游运行环境，由用户自行安装。本仓库当前插件发行包不打包官方应用或 Harness 内核。

## 冻结的 Electron 壳

旧壳、图标和构建工具原样保留。其 Electron、Node、sharp、resvg、DSH 与旧 Web 插件的声明见 [原第三方说明](legacy/electron-shell/THIRD_PARTY_NOTICES.md)。归档文件的移动没有改变原许可范围。
