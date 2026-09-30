# DSH Desktop · 插件适配与改造

为**官方 DeepSeek Harness 桌面端**维护社区插件适配、界面定制和迁移经验。

从 **v0.2.0** 开始，本仓库转向官方 Desktop 的扩展开发。原来的 Electron 桌面壳已冻结在 [legacy/electron-shell](legacy/electron-shell) 和标签 [`legacy-electron-shell-20260930`](https://github.com/Yaaaaaaa233/dsh-desktop/tree/legacy-electron-shell-20260930)。旧项目仍可查阅和复现，不再作为当前产品继续维护。

本项目由社区维护，与 DeepSeek 官方没有隶属关系。仓库名继续使用 `dsh-desktop`。

## 当前功能

| 插件 / 功能 | 维护方式 | 状态 |
| --- | --- | --- |
| [鲸鱼余额挂件](packages/dsh-whale-widget) | 本仓库维护 Desktop 适配源码和安装包 | 已验证：实际余额、一级「用量显示」设置页、即时挂件开关、菜单同步 |
| [皮肤中心](integrations/skin-center) | 锁定已验证的上游版本，提供安装与迁移说明 | 已验证：自定义壁纸、配色、原皮肤与重启恢复 |
| [Adaptive Plan / Mids·快速](https://github.com/Yaaaaaaa233/dsh-adaptive-plan) | 保持独立仓库 | 官方 Desktop 适配待完成，本次不纳入安装包 |

**当前验证环境：官方 Desktop `0.2.0-rc.2`，macOS Apple Silicon。** 官方发布页仍将该版本标记为候选版。Windows、Linux 和其他 DSH 版本暂未验证；详情见 [兼容性](docs/compatibility.md)。

## 安装

1. 安装 [官方 DeepSeek Harness Desktop](https://github.com/deepseek-ai/deepseek-harness/releases)。
2. 从本仓库 [Releases](https://github.com/Yaaaaaaa233/dsh-desktop/releases) 下载鲸鱼适配包。
3. 完整退出官方客户端，使用它提供的 `dsh` 命令安装到 **desktop profile**：

```sh
dsh plugin --profile desktop add /绝对路径/dsh-whale-widget-0.3.17-desktop.3.tgz
dsh plugin --profile desktop add @linxin666/dsh-client-ui-skin-center@0.4.4
```

若未注册 `dsh` 命令，可在官方客户端菜单中管理；macOS 也可以直接调用应用内的 CLI。完整命令、离线包、卸载和 pnpm store 排查见 [安装说明](docs/installation.md)。

启动后在「设置 → 用量显示」管理鲸鱼，在「设置 → 皮肤」管理外观。挂件设置中的开关即时生效；插件管理页整个包的启停建议完整重启客户端。

## 从旧 DSH 迁移

Web 与 Desktop 使用各自的插件 profile，但默认共享 `~/.dsh` 数据目录。先备份，再在 Desktop 中安装独立插件；已有 v2 皮肤可继续使用。旧账本保留在新版的历史字段中，新版观测统计从迁移时开始。

按 [迁移说明](docs/migration.md) 操作。个人配置、凭据、账本和壁纸不随仓库发布。两个客户端共用鲸鱼账本时，避免同时运行两个挂件实例。

## 开发

仓库根目录是开发与打包入口，不是可直接安装的 DSH 插件。当前工具只使用 Node 内置模块，无需在根目录安装依赖。

```sh
npm run check
npm test
npm run pack
```

`pack` 会打包本地鲸鱼插件，并下载、校验锁定版本的上游皮肤中心包。产物在 `dist/`：两个 `.tgz`、`SHA256SUMS` 和 `release-manifest.json`。不会自动安装到用户的 DSH。

```text
packages/dsh-whale-widget/   本地维护的鲸鱼 Desktop 适配
integrations/skin-center/   上游皮肤中心的版本与迁移说明
catalog.json                插件清单、版本与上游完整性
docs/                       安装、迁移、兼容性与开发约定
scripts/                    检查与打包工具
tests/                      账本迁移回归检查
legacy/electron-shell/      冻结的旧桌面壳
```

下一步优先补充不同平台的验证记录、跟进官方插件生命周期和 Adaptive Plan 的 Desktop 适配。新增插件遵循 [开发约定](docs/development.md)。

## 许可与来源

本仓库自己维护的代码使用 MIT。鲸鱼上游代码保留 MeteorNOX 的 MIT 声明，**美术与音效不属于 MIT 范围**，按上游 [PROVENANCE](packages/dsh-whale-widget/PROVENANCE.md) 随原插件提供。皮肤中心保持上游 Apache-2.0 许可，冻结项目保留原第三方声明。见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
