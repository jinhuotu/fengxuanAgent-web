# 命令（docs/commands.md）

> 命令一律从这里取，不要猜。node/npm 实测版本：node v24.19.0、npm 11.17.0。

## 一、环境事实

- 项目路径：`D:\code\LLM\fengxuanAgent-web`（与后端 `fengxuanAgent` 同级）
- 前端端口：**5178**（`strictPort: true`，被占用直接报错，不会偷偷换端口）
- 后端地址：`http://127.0.0.1:8081`，由 Vite 代理 `/api` 转发
<!-- 历史端口：后端 8000，前端 5176。 -->
- node 安装在 `C:\Program Files\nodejs`，nvm 版本目录 `C:\Users\mouzh\AppData\Roaming\nvm\v24.19.0`

## 二、日常命令

```powershell
# 装依赖（等同于后端里的 uv sync）
npm install

# 起开发服务器，改代码自动热更新
npm run dev

# 类型检查 + 生产打包（打包产物在 dist/）
npm run build

# 对话流解析和页面交互隔离测试，不访问真实接口
npm run test:chat

# 统一侧栏布局、菜单权限、子路由登录守卫，以及登录时长的计时规则（30 分钟续期、2 小时无操作退出）
npm run test:layout

# 知识库页面的列表、状态文案、Markdown 渲染等逻辑，不访问真实接口
npm run test:knowledge

# 启用提交前自动检查（每个克隆执行一次，钩子脚本在 .githooks/ 里，随仓库提交）
git config core.hooksPath .githooks

# 独立只读视觉预览，5179 端口，不连接真实后端或读取项目环境文件
npm run preview:layout

# 本地预览打包结果
npm run preview

# 加依赖（先问我，同意后再执行）
npm install <包名>
```

## 三、四个文件的分工

| 文件 | 作用 | 是否提交 |
|---|---|---|
| `package.json` | 声明依赖与脚本 | 提交 |
| `package-lock.json` | 锁定实际安装的版本 | **必须提交** |
| `node_modules/` | 真正的依赖目录，可从锁文件重建 | 不提交（.gitignore 已排除） |
| `vite.config.ts` | 端口、代理、别名 | 提交 |

原则：**改依赖只改 `package.json`（用 npm install），装环境只读 `package-lock.json`。**

## 四、端口与联调排查

```powershell
# 后端是否活着（跳过前端直接测）
Invoke-WebRequest http://127.0.0.1:8081/health -UseBasicParsing

# 代理是否通（前端地址测后端接口）
Invoke-WebRequest http://127.0.0.1:5178/api/health -UseBasicParsing

# 5178 被谁占了
netstat -ano | Select-String ":5178"
```

## 五、常见报错

| 现象 | 原因 | 处理 |
|---|---|---|
| `ECONNREFUSED 127.0.0.1:7890` | 系统代理开着但代理软件没启动 | 清掉 `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY` 后重试 |
| `TS2307: Cannot find module '@/xxx'` | TS 不认识 `@` 别名 | 检查 `tsconfig.app.json` 的 `paths` |
| `TS5101: baseUrl is deprecated` | 新版 TS 不需要 baseUrl | 删掉 `baseUrl`，`paths` 写 `./src/*` |
| `127.0.0.1:5178` 打不开但 `localhost:5178` 能开 | Vite 默认绑 localhost（可能 IPv6） | `server.host` 写 `127.0.0.1` |
| 端口被占用报错 | 上次的 dev server 没关 | 关掉旧终端，或 `Get-Process node \| Stop-Process` |
| 登录点提交提示 404 | 后端还没实现 `POST /auth/login` | 等后端第 10 步完成 |

## 六、提交前自动检查

钩子脚本放在仓库的 `.githooks/` 目录里，随代码一起提交；Git 默认不会去那里找，所以**每个克隆要启用一次**：

```powershell
git config core.hooksPath .githooks
```

启用后每次 `git commit` 的行为：

| 本次提交暂存了什么 | 钩子做什么 | 大约耗时 |
|---|---|---|
| 只有文档这类文件 | 不跑测试，直接放行 | 即时 |
| `tests/` 下的测试文件 | 跑三组测试（`test:chat`、`test:layout`、`test:knowledge`） | 十几秒 |
| `src/`、`package.json`、`vite.config.*`、`tsconfig*`、`index.html` | 三组测试 + `npm run build`（类型检查和打包） | 约 45 秒 |

确实要先存一版时临时跳过：`git commit --no-verify`。跳过的提交等于没有测试保护，之后要补跑。

两点说明：钩子检查的是工作区当前的文件，暂存区之外还没打算提交的改动也会被一起检查；
钩子用 PATH 里的 `npm`，终端里找不到 npm 时它会直接说明并拦下提交。
