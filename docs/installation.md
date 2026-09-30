# 安装与卸载

验证基线：官方 Desktop `0.2.0-rc.2`。完整退出客户端后安装，完成后再启动；关闭窗口可能只会隐藏窗口。

## 安装鲸鱼适配包

从 [Releases](https://github.com/Yaaaaaaa233/dsh-desktop/releases) 下载 `dsh-whale-widget-0.3.17-desktop.3.tgz`，核对同一发布中的 `SHA256SUMS`。

官方桌面端注册的 `dsh` 命令：

```sh
dsh plugin --profile desktop add /绝对路径/dsh-whale-widget-0.3.17-desktop.3.tgz
```

macOS 默认应用位置，可直接使用捆绑 CLI，无需另装 Node / pnpm：

```sh
'/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh' plugin --profile desktop add \
  /绝对路径/dsh-whale-widget-0.3.17-desktop.3.tgz
```

不要把本仓库根目录当作插件安装；实际包位于 `packages/dsh-whale-widget`。建议安装 tarball，避免目录链接依赖开发工作区。

## 安装皮肤中心

使用已验证的固定上游版本：

```sh
dsh plugin --profile desktop add @linxin666/dsh-client-ui-skin-center@0.4.4
```

同一 Release 也提供原始 npm tarball，可与鲸鱼包一起安装：

```sh
dsh plugin --profile desktop add \
  /绝对路径/dsh-whale-widget-0.3.17-desktop.3.tgz \
  /绝对路径/dsh-client-ui-skin-center-0.4.4.tgz
```

离线 tarball 只免去下载插件本身；皮肤中心的依赖首次安装仍可能需要联网。

## 生效与更新

- 「设置 → 用量显示 → 启用鲸鱼挂件」立即隐藏/显示挂件，并暂停/恢复余额与提示轮询。
- 整个插件包的启用/停用不保证完整热卸载，建议重启。
- 皮肤支持试穿与应用；已激活的皮肤在重启后恢复。
- 更新鲸鱼时安装本仓库的新适配包；直接更新到原版 npm 鲸鱼会替换本地设置页改动。
- Windows 和 Linux 尚未验证。使用它们时不要套用 macOS 应用路径，改用本机官方 `dsh` 命令。

## pnpm store 冲突

出现 `ERR_PNPM_UNEXPECTED_STORE` 时，按错误提示确认该 profile 原来使用的 store，再在此次安装命令中指定：

```sh
dsh plugin --profile desktop add --store-dir /已有/store/目录 /绝对路径/插件.tgz
```

不要仅为某个旧 profile 修改全局 store 配置。Web 和 Desktop 是不同 profile，新 Desktop profile 通常无需继承旧 Web 的 store。

## 卸载

先备份皮肤、激活状态与鲸鱼账本，完整退出应用，再移除需要卸载的包：

```sh
dsh plugin --profile desktop remove dsh-whale-widget
dsh plugin --profile desktop remove @linxin666/dsh-client-ui-skin-center
```

卸载插件与删除个人数据是不同操作；本仓库工具不自动清除用户数据。恢复方法见 [迁移文档](migration.md)。

官方命令来源：[Desktop README](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/apps/desktop/README.md)。
