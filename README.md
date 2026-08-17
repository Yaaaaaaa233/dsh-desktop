undefined# DSH Desktop

把 DeepSeek Harness（终端 + Web）打包成 macOS 桌面应用：Electron 窗口内直接加载 DSH 的
Web UI，后端一键自动启动、随应用退出，并支持主题色 / 背景定制与自定义 CSS。
可打包为 `/Applications` 里可双击运行的正式 `.app`。

## 原理

```
┌──────────────────────────────────────┐
│  DSH Desktop.app（标准 macOS 应用包） │
│  ├─ Contents/MacOS/DSH Desktop       │  Electron 主进程
│  │   ├─ 首次启动解压内置运行时         │
│  │   │   └─ dsh-runtime.tar.gz → userData
│  │   ├─ 派生捆绑的 node v24           │
│  │   │   └─ dsh web --port 0          │  用 OS 分配端口，避免冲突
│  │   ├─ BrowserWindow 加载该 URL      │  原汁原味的 DSH Web UI
│  │   └─ 外观设置注入 CSS              │  主题色/背景/自定义 CSS，实时生效
│  └─ Contents/Resources/              │
│      ├─ dsh-runtime.tar.gz           │  最小自包含 DSH 后端（build-runtime.js 产物）
│      └─ node/bin/node                │  独立 Node 24 运行时
└──────────────────────────────────────┘
```

- **自包含**：不依赖系统 Node / DSH 仓库 / 网络，双击即用；数据默认存到 `$DSH_HOME`
  （默认 `~/.dsh`），与命令行 / 网页版完全共享会话与配置。
- 后端用 `--port 0` 请求系统分配端口，主进程解析 stdout 里的 `dsh web: http://…` 行，
  因此与本机其它服务（包括原来的 3080 端口 GUI）互不冲突。
- 不修改 DSH 源码：外观定制通过 `webContents.insertCSS` 覆盖 DSH 的 CSS 变量
  （`--dsw-static-deepseek-*` 品牌色阶、`--dsw-alias-bg-*` 应用表面背景）。

## 开发态运行（需要系统 Node ≥ 24 + DSH 仓库）

```sh
cd dsh-desktop
npm install        # 首次（会下载 Electron 二进制）
npm start          # 使用 ~/dev/deepseek-harness 的构建产物启动
```

可选环境变量：`DSH_REPO`（仓库路径）、`DSH_NODE`（后端 node）、`DSH_HOME`（覆盖数据目录）。

## 打包成正式 .app（/Applications 可双击）

前置：DSH 仓库已构建（`pnpm run build`）。

```sh
cd /Users/yea/Documents/DSH/dsh-desktop
npm run build:app
# 内部流程：make-icon → build-runtime（从 DSH 仓库扁平复制生产闭包，无符号链接、单实例）→ make-runtime-archive → electron-builder
# 产物：dist-app/mac-arm64/DSH Desktop.app
```

安装到应用程序文件夹：

```sh
cp -R "dist-app/mac-arm64/DSH Desktop.app" /Applications/
open "/Applications/DSH Desktop.app"       # 首次启动会解压运行时（约 400MB，需十几秒）
```

> 说明：
> - 未签名（无 Developer ID）：首次打开若被 Gatekeeper 拦截，右键 →「打开」→「打开」即可。
> - 已内置自定义图标（默认：DSH 鲸鱼 × DeepSeek 蓝渐变；换图：`DSH_ICON_SRC=/path/to/icon.jpg npm run make:icon`，会居中裁方并加 macOS 圆角）。
> - 运行时解压到 `~/Library/Application Support/DSH Desktop/dsh-runtime`，仅首次执行；
>   应用升级（归档内容变化）会自动重新解压。

## 使用

- **外观设置**：菜单「视图 → 外观设置…」（快捷键 `⌘⇧B`），可设置
  - 主题色（DSH 的主品牌色，实时重映射界面高亮/按钮/选中态）
  - 背景：默认 / 纯色 / 渐变 / 图片（图片自动缩放铺满、可选不透明度与可读性遮罩）
  - 自定义 CSS：追加到页面末尾，覆盖任意样式
  - 设置自动保存在 `~/Library/Application Support/DSH Desktop/settings.json`
- 菜单「视图 → 在浏览器中打开」：用系统浏览器打开同一后端
- 菜单「视图 → 重启 DSH 后端」：后端崩溃或改配置后重启
- 窗口关闭即退出应用并停止后端；再次启动可继续原有会话

## 自检

```sh
node scripts/selftest.js                                 # 纯 Node 单测
npm run e2e:backend                                      # 开发态后端 E2E
npm run e2e:packaged                                     # 打包态 E2E（解压 + 启动）
DSH_DESKTOP_SMOKE=1 npm start                            # 冒烟（隐藏窗口加载后自动退出）
```

日志：`~/Library/Application Support/DSH Desktop/backend.log`

## 已知限制

- 后端依赖 Node ≥ 24（已随应用捆绑独立 node，无需系统安装）。
- runtime 由  从 DSH 仓库扁平构建（无符号链接、单实例、自包含）；[ERR_PNPM_CANNOT_DEPLOY] A deploy is only possible from inside a workspace 方案已弃用（其链接结构会导致同依赖双实例、scope 机制失灵等运行时问题）。
- 背景图以缩放后的 data URL 注入，超大图片（>1920px 宽）自动缩到 1920px 内。
- 透明背景图层是「整个应用表面变透明 + 遮罩」的近似实现，个别弹层/对话框底色可能偏透，
  可用自定义 CSS 微调。
- 应用未做代码签名与公证（个人使用无碍；对外分发需 Developer ID + notarization）。
