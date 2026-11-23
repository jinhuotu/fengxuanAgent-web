# 进度与待定项（docs/progress.md）

> 唯一允许频繁改动的文档，每次覆盖重写，不往后追加。超过 30 行就该清理。
> 开工第一件事读本文件；每轮结束把状态更新回来。

## 一、当前状态（2026-11-20）

- 阶段：**阶段一 登录 · 前端两小步全部完成：登录跳首页、守卫拦人、首页显示后端确认的用户**
- 技术与依赖：Vue 3 + TypeScript + Vite 8.3.8 + Element Plus + Vue Router 4 + Pinia + axios
- 已具备：Vite 工程、`@` 别名（Vite 与 TS 双配置）、5176 端口 + `/api` 代理到 8000、
  路由表（`/` 按 token 分流、`/home` 带 `requiresAuth` 标记、`beforeEach` 全局守卫）、
  axios 实例（统一 baseURL/超时/token 头/错误提示）、token 读写工具、auth 仓库、
  登录页（表单校验 + 提交 + 跳首页）、首页（调 `/auth/me` 显示真实用户、401 时清 token 回登录、退出按钮）
- 已验证：`npm run build`（含 `vue-tsc`）通过；`http://127.0.0.1:5176` 返回 200；
  `http://127.0.0.1:5176/api/health` 代理到后端返回 `{"code":0,...,"data":{"status":"ok"}}`
- 已验证：`npm run build`（含 `vue-tsc`）两轮通过；登录成功跳 `/home`
- 未完成：浏览器里完整走一遍（登录 → 首页显示 admin → 退出 → 直接访问 `/home` 被守卫拦住）；阶段一验收
- 下一步：阶段一验收（术语表、3 道自测题、新手导航、`progress.md` 收尾）

## 二、阶段进度

| 阶段 | 内容 | 状态 |
|---|---|---|
| 阶段一 | 登录（登录页、鉴权、登录后首页） | 已完成 |
| 阶段二 | RBAC 权限（用户管理、角色、按钮级权限） | 未开始 |
| 阶段三 | 对话 + 知识库（会话界面、流式输出、引用来源） | 未开始 |
| 阶段四 | 多智能体协作 | 未开始 |

## 三、已定方案（已拍板）

1. 目录名 `fengxuanAgent-web`，与后端 `fengxuanAgent` 同级，都在 `F:\code\python`。
2. 技术栈 Vue3 + TS + Element Plus；状态用 Pinia；请求用 axios。
3. 端口固定 5176 且 `strictPort: true`：后端 CORS 白名单只认 5176，端口漂移会跨域失败。
4. 跨域走 Vite 代理 `/api` → `http://127.0.0.1:8000`，浏览器看到同源，后端 CORS 作为第二道保险。
5. 登录响应字段约定 `{ access_token, token_type, expires_in }`，写死在 `src/types/api.ts`，后端照它实现。

## 四、踩坑记录

格式：`日期 | 现象 | 原因 | 怎么解决的`

- 2026-11-19 | `npm create vite` 报 `ECONNREFUSED 127.0.0.1:7890` | 系统代理指向本机 7890 但代理没开 | 清掉 `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY` 与 `npm_config_*_proxy` 后重试成功
- 2026-11-19 | `npm run build` 报 `TS2307: Cannot find module '@/api/http'` | Vite 认识的 `@` 别名 TypeScript 不认识 | 在 `tsconfig.app.json` 加 `paths`
- 2026-11-19 | 加了 `baseUrl` 后报 `TS5101: baseUrl is deprecated` | 新版 TS 不再需要 baseUrl | 去掉 `baseUrl`，`paths` 写成 `./src/*`
- 2026-11-19 | `http://127.0.0.1:5176` 连不上，`localhost:5176` 正常 | Vite 默认只绑 localhost，可能落到 IPv6 | `server.host` 显式写 `127.0.0.1`

## 五、关键决策记录（追加三行：日期 / 决定了什么 / 为什么）

- 2026-11-19 | 前端独立建项目，与后端同级 | 前后端分离，各自依赖与部署互不影响；后续可单独部署到 nginx
- 2026-11-19 | 用 Vite 代理而不是在后端放开跨域 | 开发时同源最省心；生产由 nginx 反代，同样是同源思路
- 2026-11-19 | Element Plus 全量引入 | 起步简单、文档一致；体积问题等有性能要求时再改按需引入
