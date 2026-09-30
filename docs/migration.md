# 从旧 Web / Electron 壳迁移

## 数据与插件位置

默认数据根目录为 `~/.dsh`，也可通过 `DSH_HOME` 指定。

| 内容 | 位置 |
| --- | --- |
| 旧 Web 插件 | `$DSH_HOME/profiles/web` |
| 官方 Desktop 插件 | `$DSH_HOME/profiles/desktop` |
| v2 用户皮肤 | `$DSH_HOME/skins/<skin-id>` |
| 皮肤激活状态 | `$DSH_HOME/skin-center-active.json` |
| 鲸鱼参数 | `$DSH_HOME/.dshw-size.json` |
| 鲸鱼账本 | `$DSH_HOME/.dshw-usage.json` |

两个 profile 默认会访问部分相同的数据。迁移过程中完整退出两种客户端，先备份，再安装。不要直接复制 Web 的 node_modules 到 Desktop。

## 步骤

1. 备份 Desktop profile（如已存在）、用户皮肤及激活状态、鲸鱼参数和账本。私密配置备份保存在仓库外。
2. 按 [安装说明](installation.md) 在 Desktop profile 安装鲸鱼适配包与独立皮肤中心。
3. 同一个 `DSH_HOME` 下已有 v2 皮肤无需复制。换数据目录时，复制完整皮肤文件夹，并在皮肤中心重新选择激活。
4. 打开「用量显示」，核对大小、声音和气泡参数；打开「皮肤」，核对自定义皮肤与全局明暗主题。
5. 完整退出后重启，确认余额、参数和外观恢复。

旧 Electron 壳保存在自身 `userData/settings.json` 中的自定义 CSS/主题色没有自动转换器，应通过皮肤中心重建为 v2 皮肤。已存放于 `$DSH_HOME/skins` 的皮肤是本次验证成功的迁移路径。

## 鲸鱼账本

新版将旧历史保留为 `accounting.legacyHistory`，重新建立余额观测区间。因此新版的“已观测消费”可能从零开始；这不表示旧历史被删除。不要将余额差当作平台交易流水。

旧 `usageMode: ledger` 可继续使用。平台 token 用量模式已被上游移除；峰谷文案改由挂件泡泡模块管理。新版也有额外的 Codex 统计、预算/预警、任务结束音与提问/授权提示，可按个人需要关闭。本机迁移时关闭这些新增项，保留旧使用习惯。

## 回退

完整退出客户端；先保存迁移后产生的数据，再恢复迁移前的 Desktop profile 和必要配置。恢复旧账本前保留新版账本，避免覆盖新的消费记录。原 Web profile 可以继续保留，但不要同时运行两个写同一账本的鲸鱼实例。

## 本仓库不发布个人配置

安装包包含插件代码与上游素材，不包含凭据、账号信息、会话、个人账本或自定义壁纸。示例与验证记录只使用虚构数据。
