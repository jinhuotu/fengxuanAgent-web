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

# 统一侧栏布局、菜单权限和子路由登录守卫
npm run test:layout

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
