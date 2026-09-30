# 验证记录

## 2026-09-30：官方 Desktop 0.2.0-rc.2

环境：macOS Apple Silicon、官方发行应用。未发送聊天任务，未更改凭据或模型配置。

| 检查 | 结果 |
| --- | --- |
| 上游 npm 包 | 鲸鱼 0.3.17、皮肤中心 0.4.4 的原始 tarball SHA-512 与 npm 元数据一致 |
| 隔离 Host | 用临时 DSH_HOME 启动官方打包 Host，两个插件激活成功，结构化注入与设置页加载 |
| 隔离 UI | 一份鲸鱼，v2 皮肤激活，设置保存与即时开关通过，停用后提示轮询暂停，无页面脚本错误 |
| 正式 Desktop | `dsh-app://app/` 页面加载成功，真实余额可见 |
| 原生设置页 | 原大小 1.5×、音量 90%、小黄鸭、提示关闭 10 秒被保留 |
| 菜单双向同步 | 设置页 10→12 秒，挂件全局设置显示 12 秒；菜单恢复 10 秒，设置页同步恢复 |
| 皮肤 | 原 v2 皮肤显示为当前激活，壁纸可见；文件摘要与备份一致 |
| 账本 | accounting v1 的 legacyHistory 与迁移前 history 完整一致 |
| 重启 | 实际余额、参数和原皮肤激活状态均恢复 |
| 冻结归档 | 原 Electron 壳的跟踪文件在 legacy 中保留相同内容；冻结标签保留原提交 |

实际客户端安装验证的是鲸鱼 `0.3.17-desktop.2`。仓库包 `.3` 保持 `lib/index.js`、`lib/client.js`、`lib/accounting.mjs` 和 `assets/whale-widget.js` 字节一致，仅更新仓库元数据、兼容声明与文档。运行代码的摘要记录在 `catalog.json`，仓库检查与发布打包会核对它们。

测试曾因临时 Host 占用桌面端固定端口导致一次启动失败；关闭临时 Host 后正式客户端启动和重启通过。验证时不要让临时 Host 与正式 Desktop 同时争用同一端口。

## 待验证

- Windows、Linux 与 Intel macOS。
- 上游 Desktop 新版本。
- 整个鲸鱼插件的完整热卸载。
- Adaptive Plan 的官方 Desktop 模型选择与执行路由。
