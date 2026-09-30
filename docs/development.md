# 插件适配开发约定

## 新增适配

1. 有本地改动的插件放 `packages/<name>`；只需组合或锁定版本的上游插件放 `integrations/<name>`。
2. 在 `catalog.json` 登记版本、上游来源、许可、分发方式和实际验证环境。
3. 保留上游 LICENSE / PROVENANCE / 使用文档；本地改动在插件 README 和 CHANGELOG 说明。
4. 输出可安装 tarball，避免依赖开发者目录链接或个人路径。
5. 在临时 `DSH_HOME` 验证 Host、Desktop 注入、设置保存与卸载/重启，再记录验证范围。

## UI 与生命周期

- 优先使用官方插槽、客户端插件入口和结构化注入。
- 限定 CSS 作用范围，沿用官方明暗主题与语义变量。
- 插件启用不应直接改写与其无关的全局控件或模型选择器。
- 对事件、样式和定时器登记清理；如果宿主或上游尚不支持完整热卸载，在文档中说明。
- Host/设置页/挂件共用配置时，保存仅发送实际修改的字段，避免旧页面覆盖新字段。

## 发布

```sh
npm run check
npm test
npm run pack
```

根目录不需要 `npm install`。打包时会从 npm 下载固定版皮肤中心并校验 SHA-512。已有原始 tarball 时可以离线打包：

```sh
npm run pack -- --skin-archive /绝对路径/dsh-client-ui-skin-center-0.4.4.tgz
```

`dist/` 被 git 忽略。Release 附上两个安装包、`SHA256SUMS`、`release-manifest.json`，在兼容表中区分代码检查与真实 Desktop 验证。提交 `v*` 标签触发的 CI 只打包和上传 workflow artifact，GitHub Release 由维护者明确发布。

打包脚本不修改用户 profile，也不读取用户 DSH 配置。真实迁移、安装和回退应单独授权并备份。

## 旧项目

`legacy/electron-shell/` 和冻结标签只用于查阅、复现。根目录不再启动或构建 Electron 壳；不要通过重建旧 `.app` 分发新的官方 Desktop 适配。
