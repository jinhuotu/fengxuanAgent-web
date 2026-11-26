import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createPinia, setActivePinia, defineStore } from 'pinia'
import ts from 'typescript'

import { createMemoryStorage, fakeToken, loadTokenModule } from './token-module.mjs'

const source = await readFile(new URL('../src/stores/auth.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText

// 做什么：加载真实身份仓库和真实凭证工具，模拟另一个页面直接改写存储的行为
// 入参：本人及权限查询的可控响应，以及存储的初始内容
// 返回：仓库、虚拟存储与凭证工具
function authWorkspace(api = {}, stored = { fengxuan_token: 'old-token' }) {
  setActivePinia(createPinia())
  const storage = createMemoryStorage(stored)
  const token = loadTokenModule(storage)
  const modules = { pinia: { defineStore }, '@/api/auth': api, '@/utils/token': token }
  const exported = {}
  new Function('require', 'exports', compiled)((name) => modules[name], exported)
  return { auth: exported.useAuthStore(), storage, token }
}

test('adopting another tab login revokes old identity without deleting its new token', () => {
  const { auth, storage } = authWorkspace()
  auth.currentUser = { id: 1, username: 'old-user' }
  auth.permissions = ['users:list']
  auth.permissionsLoaded = true
  storage.setItem('fengxuan_token', 'new-token')
  auth.syncStoredToken()
  assert.equal(auth.token, 'new-token')
  assert.equal(storage.getItem('fengxuan_token'), 'new-token')
  assert.equal(auth.currentUser, null)
  assert.deepEqual(auth.permissions, [])
  assert.equal(auth.permissionsLoaded, false)
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
  storage.setItem('fengxuan_token', '')
  auth.syncStoredToken()
  releaseUser({ id: 1, username: 'old-user' })
  releasePermissions({ permissions: ['users:list'] })
  await Promise.all([userRequest, permissionRequest])
  assert.equal(auth.token, '')
  assert.equal(auth.currentUser, null)
  assert.deepEqual(auth.permissions, [])
  assert.equal(auth.permissionsLoaded, false)
})

test('rotated token of the same account keeps identity and permissions', () => {
  const { auth, storage, token } = authWorkspace({}, { fengxuan_token: fakeToken(7) })
  auth.currentUser = { id: 7, username: 'same-user' }
  auth.permissions = ['users:list']
  auth.permissionsLoaded = true
  const rotated = fakeToken(7)
  storage.setItem('fengxuan_token', rotated)
  auth.syncStoredToken()
  assert.equal(auth.token, rotated)
  assert.equal(auth.currentUser.username, 'same-user')
  assert.deepEqual(auth.permissions, ['users:list'])
  assert.equal(auth.permissionsLoaded, true)
  assert.equal(token.getToken(), rotated)
})

test('replaceToken stores the new credential without clearing the loaded account', () => {
  const { auth, storage, token } = authWorkspace({}, { fengxuan_token: fakeToken(7) })
  auth.currentUser = { id: 7, username: 'same-user' }
  auth.permissions = ['users:list']
  auth.permissionsLoaded = true
  const rotated = fakeToken(7)
  auth.replaceToken(rotated)
  assert.equal(auth.token, rotated)
  assert.equal(auth.currentUser.username, 'same-user')
  assert.deepEqual(auth.permissions, ['users:list'])
  assert.equal(storage.getItem('fengxuan_token'), rotated)
  assert.equal(typeof token.getTokenIssuedAt(), 'number')
})

test('account key follows account and login batch, not the credential string', () => {
  const { auth, storage, token } = authWorkspace({}, { fengxuan_token: fakeToken(7, 2) })
  assert.equal(token.readAccountKey(), '7:2')
  // 仓库里的账号标识跟着自己保存的凭证走，所以每次存储变化后要先让它同步一次
  auth.syncStoredToken()
  assert.equal(auth.accountKey, '7:2')
  storage.setItem('fengxuan_token', fakeToken(7, 3))
  auth.syncStoredToken()
  assert.equal(auth.accountKey, '7:3')
  storage.setItem('fengxuan_token', fakeToken(8, 2))
  auth.syncStoredToken()
  assert.equal(auth.accountKey, '8:2')
  // 不是标准凭证时原样返回，旧测试和占位字符串的行为保持不变
  assert.equal(token.readAccountKey('opaque-token'), 'opaque-token')
})
