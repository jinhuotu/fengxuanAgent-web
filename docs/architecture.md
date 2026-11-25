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
├─ index.html                     ✔ 入口 HTML，标题"锋煊 Agent 平台"
├─ docs/                          ✔ 本文件与进度、命令、学习契约
├─ public/favicon.svg             ✔
└─ src/
   ├─ main.ts                     ✔ 装配：Pinia → Router → Element Plus → mount
   ├─ App.vue                     ✔ 只放 <router-view>
   ├─ style.css                   ✔ 全局样式（极简）
   ├─ api/
   │  ├─ http.ts                  ✔ 唯一 axios 实例：baseURL、超时、token 头、错误提示
   │  ├─ auth.ts                  ✔ 登录与本人改密接口，返回强类型
   │  └─ users.ts                 ✔ 用户列表分页与追加角色请求，返回强类型结果
   ├─ types/api.ts                ✔ 与后端约定的响应与登录数据结构
   ├─ stores/auth.ts              ✔ token 状态（Pinia）
   ├─ utils/token.ts              ✔ token 的 localStorage 读写
   ├─ router/index.ts             ✔ 登录页、首页及受登录保护的改密、用户管理路由
   ├─ views/LoginView.vue         ✔ 登录页
   ├─ views/ChangePasswordView.vue ✔ 本人改密表单、校验与提交，成功后退出并回登录页
   ├─ views/UserManagementView.vue ✔ 用户表格、分页、角色标签、权限错误及管理员追加角色弹窗，绑定后刷新当前页
   ├─ views/ChatView.vue          ✔ 对话页外壳：会话列表、消息容器、输入卡片，逻辑在 composables/useChat.ts
   ├─ components/
   │  ├─ ChatMessageItem.vue      ✔ 单条消息展示：用户气泡 / 助手平铺 + 模型标签 + 状态提示，无请求无状态
   │  ├─ ChatSessionList.vue      ✔ 会话列表及本页面生成中状态，发出选择、新建和分页事件
   │  └─ ChatEmptyState.vue       ✔ 空状态：无会话引导新建；有会话无消息时给三条建议提问，点击只填入输入框
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

## 五、AI 对话

新增 `/chat` 登录保护路由，首页提供入口。当前实际联调端口为前端 5178、后端 8081。
`views/ChatView.vue` 负责布局、表单和页面生命周期，`composables/useChat.ts` 管理局部交互与过期响应隔离。
`api/chat.ts` 封装分页请求、带认证的流式 POST 和 keepalive 中断；`utils/chatStream.ts` 统一解析 SSE。
`types/chat.ts` 定义与后端一致的会话、消息和事件结构，不把聊天内容写入浏览器持久存储。
`chatTabSync.ts` 托管同源 BroadcastChannel、可见/焦点/存储事件与单飞轮询；`chatRemote.ts` 查询本人状态和快照，不接管停止权限；`utils/tabChannel.ts` 仅封装可选通道，无业务或鉴权。
ChatView 展示远端观察及同步入口；auth.syncStoredToken 采用其他页面的存储并清空身份/权限，不写回 token。登录变化撤销旧页面并重新验证，通知只传标识，所有内容仍从本人接口读取。
切换或新建会话不中断旧生成；消息、草稿、错误和活动请求按会话隔离，state.current 指向当前展示会话。停止按钮只停止当前会话，离开、刷新或关闭对话页取消本页面全部任务；历史由后端 MySQL 恢复。
components/ChatSessionList.vue 纯展示列表和本页面正在生成的会话，发出选择、新建和分页事件，不发请求、不修改共享状态。
composables/chatRecovery.ts 管理有限结果确认和重试资格查询；未知结果期间禁止该会话重新发送，其他会话不受影响。最近失败或中断回答的按钮仅发事件，由 useChat 使用新 UUID 和 retry_of_request_id 提交。
context SSE 事件由 utils/chatStream.ts 校验，useChat 写入所属会话的 contextNotice，视图作为普通信息提示展示；下一次发送清除旧提示，完整历史照常保留。
composables/chatHistory.ts 区分初次加载与完成后的后台校准；后台校准不禁用输入和发送，失败显示独立同步提示。新发送或结果确认使旧历史响应失效；分页按请求/角色去重，恢复结果原位替换，不按临时负编号排序。
助手回答由本地白名单渲染器 `utils/markdown.ts` 转成 HTML：先转义原文，再只输出 p、h1~h3、ul/ol/li、strong、em、code、pre、blockquote、hr、a，链接仅允许 http/https。没有引入第三方 Markdown 依赖，模型输出里的 HTML 只会显示为文字。

## 六、样式约定

`src/style.css` 的 `:root` 是全项目唯一的设计变量来源：品牌色（含 light-3/5/7/9 四档浅色）、中性色、圆角、阴影、动效时长，以及 Element Plus 主色梯度。
页面只在 `<style scoped>` 里写 `var(--color-primary)` 这类名字，不再手写十六进制颜色；换主题只改 style.css。
`.brand-mark` 是侧栏、登录页、对话头像共用的品牌方块，所以放全局；其余样式一律 scoped。
Markdown 正文由 v-html 生成，拿不到 scoped 属性，所以 ChatMessageItem 里凡是正文子元素都用 `:deep()` 选择器配样式。
加载态统一约定：首屏还没有任何数据时用骨架（`SkeletonTable`、`ChatHistorySkeleton`），已有数据的分页或刷新才用轻遮罩，避免整块闪白。

## 七、统一登录后布局

`layouts/AppLayout.vue` 提供左侧固定菜单、顶部当前位置、账号和退出入口，菜单按已有权限过滤。
`router/index.ts` 把 /home、/chat、/users、/change-password 注册为布局的子路由，统一继承 requiresAuth。
`stores/auth.ts` 新增共享 currentUser 和加载方法，切换账号或退出时清空，旧请求不能覆盖新账号。
HomeView 只展示工作台；ChatView、UserManagementView、ChangePasswordView 均作为右侧内容，移除重复外层导航。
页面切换只替换右侧 RouterView；没有 KeepAlive，对话离开页面仍会执行原有中断逻辑。
`tests/layout.test.mjs` 用真实 Vue SSR 和路由验证布局、菜单权限、高亮与登录守卫。
`tests/layout-preview.mjs` 提供 5179 独立只读演示，不读取项目环境文件、不连接真实后端，写入请求会被拒绝。

## 八、构建与按需引入

`main.ts` 不再整体 `app.use(ElementPlus)`，而是列出项目实际用到的组件并逐个注册，样式也按组件引入（`element-plus/es/components/*/style/css`）。
维护规则：新增 `<el-xxx>` 时要在 `main.ts` 的注册表和样式 import 各补一行；漏掉构建不会报错，只会出现组件不渲染或没样式。
`tests/main-registration.test.mjs` 会扫描所有 `.vue` 模板里的 `el-` 标签，缺注册或缺样式直接失败，已挂在 `npm run test:layout` 里。
`vite.config.ts` 用 `build.rolldownOptions.output.codeSplitting` 切出 `vendor-vue`（vue/vue-router/pinia）和 `vendor-element`（element-plus）两个块，业务代码更新时这两块的 hash 不变，浏览器缓存可复用。
拆分前后（同一次 `npm run build`）：JS 1.17MB → 约 610KB（gzip 378KB → 211KB），CSS 393KB → 约 150KB（gzip 54KB → 23KB），>500KB 的整包警告消失。
