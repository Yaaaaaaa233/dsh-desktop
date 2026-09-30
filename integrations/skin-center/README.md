# 官方 Desktop 的皮肤中心

使用上游 [`@linxin666/dsh-client-ui-skin-center@0.4.4`](https://github.com/zhu1090093659/dsh-skins)，本仓库不另做同名 fork。

在官方 macOS Desktop `0.2.0-rc.2` 验证通过：独立设置入口、v2 皮肤、壁纸、配色和重启恢复。用户原来的 `$DSH_HOME/skins` 及激活状态可以继续使用。旧 Electron 壳的注入式自定义 CSS 没有自动转换器。

```sh
dsh plugin --profile desktop add @linxin666/dsh-client-ui-skin-center@0.4.4
```

版本和原始包 SHA-512 锁定于根目录 `catalog.json`。`npm run pack` 下载并校验该原始包，和鲸鱼适配包一起输出到 `dist/`。源码与安装包中的 Apache-2.0 声明和上游素材保持原样。

详情：[安装](../../docs/installation.md) · [迁移](../../docs/migration.md) · [兼容性](../../docs/compatibility.md)。
