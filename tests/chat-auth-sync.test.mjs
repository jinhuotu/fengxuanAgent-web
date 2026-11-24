import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createPinia, setActivePinia, defineStore } from 'pinia'
import ts from 'typescript'

const source = await readFile(new URL('../src/stores/auth.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText

// 做什么：加载真实身份仓库，模拟另一个页面直接替换存储的行为
// 入参：本人及权限查询的可控响应
// 返回：仓库、虚拟存储及写入记录
function authWorkspace(api = {}) {
  setActivePinia(createPinia())
  const storage = { token: 'old-token' }
  const writes = []
  const modules = { pinia: { defineStore }, '@/api/auth': api, '@/utils/token': {
    getToken: () => storage.token,
    saveToken: (token) => { writes.push(token); storage.token = token },
    clearToken: () => { writes.push(''); storage.token = '' },
  } }
  const exported = {}
  new Function('require', 'exports', compiled)((name) => modules[name], exported)
  return { auth: exported.useAuthStore(), storage, writes }
}

test('adopting another tab login revokes old identity without deleting its new token', () => {
  const { auth, storage, writes } = authWorkspace()
  auth.currentUser = { id: 1, username: 'old-user' }
  auth.permissions = ['users:list']
  auth.permissionsLoaded = true
  storage.token = 'new-token'
  auth.syncStoredToken()
  assert.equal(auth.token, 'new-token')
  assert.equal(storage.token, 'new-token')
  assert.equal(auth.currentUser, null)
  assert.deepEqual(auth.permissions, [])
  assert.equal(auth.permissionsLoaded, false)
  assert.deepEqual(writes, [])
})

test('old identity and permission responses cannot restore a replaced login', async () => {
  let releaseUser
  let releasePermissions
  const { auth, storage } = authWorkspace({
    getCurrentUser: () => new Promise((resolve) => { releaseUser = resolve }),
    getCurrentPermissions: () => new Promise((resolve) => { releasePermissions = resolve }),
  })
  const userRequest = auth.loadCurrentUser()
  const permissionRequest = auth.loadPermissions()
  storage.token = ''
  auth.syncStoredToken()
  releaseUser({ id: 1, username: 'old-user' })
  releasePermissions({ permissions: ['users:list'] })
  await Promise.all([userRequest, permissionRequest])
  assert.equal(auth.token, '')
  assert.equal(auth.currentUser, null)
  assert.deepEqual(auth.permissions, [])
  assert.equal(auth.permissionsLoaded, false)
})
