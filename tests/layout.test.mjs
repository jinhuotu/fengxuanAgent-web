import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createSSRApp, h } from 'vue'
import * as vue from 'vue'
import * as vueRouter from 'vue-router'
import { renderToString } from 'vue/server-renderer'
import ElementPlus from 'element-plus'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'

const layoutSource = await readFile(new URL('../src/layouts/AppLayout.vue', import.meta.url), 'utf8')
const sidebarAccountSource = await readFile(new URL('../src/components/SidebarAccount.vue', import.meta.url), 'utf8')
const routerSource = await readFile(new URL('../src/router/index.ts', import.meta.url), 'utf8')

// 做什么：在真实 Vue 渲染环境中加载源码，只替换后端身份边界
// 入参：脚本源码和模块解析函数
// 返回：真实编译后的模块，不复制页面实现
function evaluateModule(source, resolve) {
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText
  const exported = {}
  new Function('require', 'exports', compiled)(resolve, exported)
  return exported
}

// 做什么：构造真实布局和路由，使用公开测试账号替代网络登录
// 入参：权限清单和是否已登录
// 返回：真实 Vue Router 与 AppLayout
function createWorkspace(permissions, loggedIn = true) {
  const auth = { currentUser: { username: 'preview-user', display_name: '演示用户' },
    hasPermission: (permission) => permissions.includes(permission) }
  const descriptor = parse(layoutSource).descriptor
  const script = compileScript(descriptor, { id: 'layout-test', inlineTemplate: true, templateOptions: { ssr: true } })
  const sidebarAccount = compileScript(parse(sidebarAccountSource).descriptor,
    { id: 'sidebar-account-test', inlineTemplate: true, templateOptions: { ssr: true } })
  const shared = { vue, 'vue-router': { ...vueRouter, createWebHistory: vueRouter.createMemoryHistory },
    'vue/server-renderer': serverRenderer, '@/stores/auth': { useAuthStore: () => auth },
    '@/api/auth': { logout: async () => null },
    // 会话计时依赖真实时钟和浏览器存储，渲染布局时只确认它被启动和收尾
    '@/composables/useSessionWatch': { startSessionWatch: () => ({ check: async () => undefined, stop: () => undefined }) } }
  shared['@/components/SidebarAccount.vue'] = evaluateModule(sidebarAccount.content, (name) => shared[name])
  const layout = evaluateModule(script.content, (name) => shared[name]).default
  const router = evaluateModule(routerSource, (name) => {
    if (name === '@/layouts/AppLayout.vue') return { __esModule: true, default: layout }
    if (name.endsWith('.vue')) return { __esModule: true, default: { render: () => h('p', { class: 'test-page' }, name) } }
    if (name === '@/utils/token') return { getToken: () => loggedIn ? 'layout-test-only' : '' }
    return shared[name]
  }).default
  return { router }
}

const serverRenderer = await import('vue/server-renderer')

// 做什么：渲染当前路由，检查真实布局中的菜单和内容出口
// 入参：路由对象与目标路径
// 返回：完整 HTML
async function renderWorkspace(router, path) {
  await router.push(path)
  await router.isReady()
  return renderToString(createSSRApp({ render: () => h(vueRouter.RouterView) }).use(router).use(ElementPlus))
}

// 做什么：证明全部登录后页面在同一个固定布局中显示
// 入参：无
// 返回：页面没有共享父布局或身份要求时失败
test('all workspace routes inherit layout and authentication', async () => {
  const { router } = createWorkspace(['users:list'])
  for (const path of ['/home', '/chat', '/users', '/change-password']) {
    const resolved = router.resolve(path)
    assert.equal(resolved.matched.length, 2)
    assert.equal(resolved.meta.requiresAuth, true)
  }
  const html = await renderWorkspace(router, '/chat')
  assert.match(html, /class="app-sidebar"/)
  assert.match(html, /aria-label="退出登录"/)
  assert.match(html, /aria-current="page"[^>]*href="\/chat"/)
  assert.match(html, /class="test-page"[^>]*>@\/views\/ChatView.vue/)
})

// 做什么：确认侧栏用户管理菜单继续按真实权限判断
// 入参：无
// 返回：无权限仍显示入口或有权限不显示时失败
test('users menu follows permission state', async () => {
  const ordinary = createWorkspace([])
  const ordinaryHtml = await renderWorkspace(ordinary.router, '/home')
  assert.doesNotMatch(ordinaryHtml, /href="\/users"/)
  assert.match(ordinaryHtml, /href="\/knowledge"[^>]*aria-label="知识库"/)
  const manager = createWorkspace(['users:list'])
  assert.match(await renderWorkspace(manager.router, '/home'), /href="\/users"/)
})

// 做什么：确认直接访问子页面仍执行登录守卫
// 入参：无
// 返回：未登录进入业务布局时失败
test('direct navigation without token redirects to login', async () => {
  const { router } = createWorkspace([], false)
  const html = await renderWorkspace(router, '/chat')
  assert.equal(router.currentRoute.value.path, '/login')
  assert.doesNotMatch(html, /class="app-sidebar"/)
})

