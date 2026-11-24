/** 独立的布局视觉预览：仅使用演示账号和模拟 API，不连接真实后端。 */
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'

const PREVIEW_PORT = 5179
const CREATED_AT = '2026-11-23T10:00:00'
const session = { id: 1, title: '项目方案讨论', created_at: CREATED_AT, updated_at: CREATED_AT }
const currentUser = { id: 1, username: 'preview', display_name: '演示用户', status: 'active', is_admin: true, created_at: CREATED_AT }
const requestId = '00000000-0000-4000-8000-000000000001'
const commonMessage = { request_id: requestId, status: 'completed', model: 'deepseek-flash', finish_reason: null, error_code: null, created_at: CREATED_AT }
const responses = {
  '/api/auth/me': currentUser,
  '/api/auth/me/permissions': { permissions: ['users:list', 'users:create'] },
  '/api/chat/sessions': { items: [session], total: 1, page: 1, page_size: 20 },
  '/api/chat/sessions/1/messages': { session, total: 2, page: 1, page_size: 20, items: [
    { ...commonMessage, id: 1, role: 'user', content: '帮我梳理一下项目的实现思路。' },
    { ...commonMessage, id: 2, role: 'assistant', content: '可以从三个部分推进：\n\n1. 明确需求与数据边界。\n2. 实现后端服务和前端交互。\n3. 验证权限、失败处理及页面体验。' },
  ] },
  '/api/users': { items: [{ ...currentUser, roles: [{ code: 'admin', name: '管理员' }] }], total: 1, page: 1, page_size: 20 },
}

// 做什么：为独立预览提供只读模拟接口，任何写入请求都会拒绝
// 入参：Node 请求、响应和下一个中间件
// 返回：模拟 JSON 或交给 Vite，不转发真实后端
function handlePreviewApi(request, response, next) {
  const path = request.url.split('?')[0]
  if (!path.startsWith('/api/')) return next()
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  const payload = request.method === 'GET' ? responses[path] : undefined
  response.statusCode = payload === undefined ? 403 : 200
  response.end(JSON.stringify({ code: payload === undefined ? 1 : 0,
    message: payload === undefined ? '布局预览不提交真实请求' : '成功', data: payload ?? null }))
}

// 做什么：在独立预览端口装配只读模拟接口与虚拟登录凭证
// 入参：无
// 返回：Vite 插件，不修改应用源文件或真实账号
function layoutPreviewPlugin() {
  return {
    name: 'isolated-layout-preview',
    // 做什么：安装只读模拟接口
    // 入参：当前 Vite 预览服务器
    // 返回：无，不连接真实后端
    configureServer(server) { server.middlewares.use(handlePreviewApi) },
    // 做什么：只在独立预览来源保存虚拟 token
    // 入参：无
    // 返回：预览入口脚本，不影响正式端口的登录状态
    transformIndexHtml() {
      return [{ tag: 'script', children: "localStorage.setItem('fengxuan_token', 'layout-preview-only')", injectTo: 'head-prepend' }]
    },
  }
}

const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)), configFile: false,
  envDir: fileURLToPath(new URL('./no-environment-files', import.meta.url)),
  plugins: [vue(), layoutPreviewPlugin()],
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  server: { host: '127.0.0.1', port: PREVIEW_PORT, strictPort: true },
})
await server.listen()
process.stdout.write(`LAYOUT_PREVIEW_PID=${process.pid} http://127.0.0.1:${PREVIEW_PORT}/home\n`)

