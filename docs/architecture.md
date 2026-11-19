# 目录与分层（docs/architecture.md）

> 新建文件、新增页面时读。AGENTS.md 第二节的三条职责边界优先于本文件。

## 一、目录骨架

```
fengxuanAgent-web/                ✔ 已建 / □ 未建
├─ AGENTS.md                      ✔ 硬约束（上限 80 行）
├─ package.json                   ✔ 依赖与脚本
├─ package-lock.json              ✔ 版本锁定，必须提交
├─ vite.config.ts                 ✔ 端口 5176、/api 代理、@ 别名
├─ tsconfig.app.json              ✔ 类型检查与 @ 路径映射
├─ index.html                     ✔ 入口 HTML，标题"风轩 Agent 平台"
├─ docs/                          ✔ 本文件与进度、命令、学习契约
├─ public/favicon.svg             ✔
└─ src/
   ├─ main.ts                     ✔ 装配：Pinia → Router → Element Plus → mount
   ├─ App.vue                     ✔ 只放 <router-view>
   ├─ style.css                   ✔ 全局样式（极简）
   ├─ api/
   │  ├─ http.ts                  ✔ 唯一 axios 实例：baseURL、超时、token 头、错误提示
   │  └─ auth.ts                  ✔ 登录接口，返回强类型
   ├─ types/api.ts                ✔ 与后端约定的响应与登录数据结构
   ├─ stores/auth.ts              ✔ token 状态（Pinia）
   ├─ utils/token.ts              ✔ token 的 localStorage 读写
   ├─ router/index.ts             ✔ 路由表（现只有 /login）
   ├─ views/LoginView.vue         ✔ 登录页
   └─ components/                 □ 可复用组件，等有第二个页面再建
```

## 二、一次登录请求怎么走

```
浏览器输入 127.0.0.1:5176 → Vite dev server → /login 路由 → LoginView
  → 表单校验（el-form rules）
  → api/auth.ts 的 login()
  → api/http.ts 的 axios 实例（baseURL /api）
  → Vite 代理转发到 http://127.0.0.1:8000/auth/login
  → 后端校验密码、签发 token，返回 { code, message, data }
  → http 拦截器判断 code === 0
  → api/auth.ts 返回 data（含 access_token）
  → LoginView 调 authStore.setToken() 存入 Pinia + localStorage
```

## 三、接口约定

```json
{ "code": 0, "message": "成功", "data": { } }
```

- `code === 0` 成功；非 0 时 `message` 直接展示给用户，`data` 为 null。
- 登录返回 `data`：`{ "access_token": "...", "token_type": "bearer", "expires_in": 1800 }`
- 带 token 的请求统一用 `Authorization: Bearer <token>`，由 `http.ts` 请求拦截器自动加。

## 四、端口与跨域

- 前端 5176（`strictPort`），后端 8000。
- 开发期跨域由 Vite 代理解决（`/api` → 8000 并去掉前缀）；后端 CORS 白名单同时留着 5176 作为第二道保险。
- 生产期由 nginx 把 `/api` 反代到后端，思路相同：让浏览器始终看到同源。
