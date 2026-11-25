import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../src/', import.meta.url))

// 做什么：递归收集 src 下所有 .vue 文件
// 入参：目录
// 返回：文件路径数组
async function collectVue(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await collectVue(path))
    else if (entry.name.endsWith('.vue')) files.push(path)
  }
  return files
}

// 做什么：收集模板里用到的 el- 组件标签
// 入参：全部 vue 文件
// 返回：去重后的标签名（如 el-table-column）
async function usedTags(files) {
  const tags = new Set()
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    for (const match of source.matchAll(/<(el-[a-z-]+)/g)) tags.add(match[1])
  }
  return [...tags]
}

// 做什么：把 kebab 标签转成组件注册名
// 入参：el-table-column
// 返回：ElTableColumn
function toComponentName(tag) {
  return tag.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')
}

// 做什么：把标签映射到样式目录（子组件共用父组件的样式）
// 入参：标签名
// 返回：element-plus 组件目录名
function styleDirectory(tag) {
  return { 'el-table-column': 'table', 'el-descriptions-item': 'descriptions', 'el-form-item': 'form' }[tag]
    ?? tag.replace(/^el-/, '')
}

const mainSource = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8')
const tags = await usedTags(await collectVue(root))

// 做什么：确认模板里出现的每个 el- 组件都在 main.ts 注册
// 入参：全部模板标签
// 返回：有组件未注册时失败，并列出缺的名字
test('registers every element-plus component used in templates', () => {
  const missing = tags.filter((tag) => !new RegExp(`\\b${toComponentName(tag)}\\b`).test(mainSource))
  assert.deepEqual(missing, [], `未注册的组件：${missing.join('、')}`)
})

// 做什么：确认每个用到的组件都引入了对应样式
// 入参：全部模板标签
// 返回：缺样式 import 时失败
test('imports the style entry of every used component', () => {
  const missing = tags.filter((tag) => !mainSource.includes(`element-plus/es/components/${styleDirectory(tag)}/style/css`))
  assert.deepEqual(missing, [], `缺样式引入：${missing.join('、')}`)
})
