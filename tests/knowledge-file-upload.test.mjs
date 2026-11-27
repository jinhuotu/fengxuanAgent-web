import assert from 'node:assert/strict'
import { File } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import * as axios from 'axios'
import ts from 'typescript'
import * as vue from 'vue'

const [uploadSource, managementSource, apiSource] = await Promise.all([
  readFile(new URL('../src/composables/useKnowledgeFileUpload.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/composables/knowledgeManagement.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/api/knowledge.ts', import.meta.url), 'utf8'),
])

// 做什么：用真实 TypeScript 实现配合测试替身运行模块
// 入参：源码和允许加载的依赖
// 返回：编译后的模块导出
function loadModule(source, dependencies) {
  const exports = {}
  const compilerOptions = { module: ts.ModuleKind.CommonJS }
  const compiled = ts.transpileModule(source, { compilerOptions })
  new Function('require', 'exports', compiled.outputText)((name) => dependencies[name], exports)
  return exports
}

// 做什么：模拟同页的文件选择、请求与刷新，并记录可见提示
// 入参：本条测试及可替换的 API 上传函数
// 返回：选文件方法、上传状态和交互记录
function uploader(testCase, upload = async () => {}) {
  const notices = [], requests = [], refreshes = []
  const element = { ElMessage: { success: (message) => notices.push(['success', message]),
    error: (message) => notices.push(['error', message]) } }
  const management = loadModule(managementSource, { axios, vue, 'element-plus': element })
  const module = loadModule(uploadSource, {
    vue, 'element-plus': element, '@/composables/knowledgeManagement': management,
    '@/api/knowledge': { uploadKnowledgeDocumentFile: (id, file) => {
      requests.push({ id, file })
      return upload(id, file)
    } },
  })
  const scope = vue.effectScope()
  testCase.after(() => scope.stop())
  const controls = scope.run(() => module.useKnowledgeFileUpload(() => 14, async () => refreshes.push(14)))
  return { ...controls, notices, requests, refreshes }
}

// 做什么：模拟一次原生文件选择
// 入参：文件信息
// 返回：拥有当前文件及可清空文件名的 change 事件
function fileSelection(file) {
  return { currentTarget: { files: { item: () => file }, value: file.name } }
}

// 做什么：确认发送期间显示加载，成功后刷新并允许重选同名文件
// 入参：大小刚好到上限的 Markdown 文件
// 返回：重复请求、缺少刷新或错误清空状态时断言失败
test('uploads the selected file and refreshes only after success', async (testCase) => {
  const pending = Promise.withResolvers()
  const { selectKnowledgeFile, fileUploading, requests, refreshes, notices } = uploader(testCase, () => pending.promise)
  const file = { name: '说明.MD', size: 10 * 1024 * 1024 }
  const event = fileSelection(file)
  const uploading = selectKnowledgeFile(event)
  assert.equal(event.currentTarget.value, '')
  assert.equal(fileUploading.value, true)
  await selectKnowledgeFile(fileSelection(file))
  assert.deepEqual(requests, [{ id: 14, file }])
  assert.deepEqual(refreshes, [])
  pending.resolve()
  await uploading
  assert.equal(fileUploading.value, false)
  assert.deepEqual(refreshes, [14])
  assert.deepEqual(notices, [['success', '文件已上传并完成解析']])
})

// 做什么：验证类型和大小两项限制都在发请求前拦截
// 入参：扩展名无效的文件与超过 10 MB 的文件
// 返回：错误提示缺失或调用后端时断言失败
test('rejects unsupported types and oversized files before sending', async (testCase) => {
  const { selectKnowledgeFile, requests, notices, refreshes } = uploader(testCase)
  await selectKnowledgeFile(fileSelection({ name: '表格.xls', size: 100 }))
  await selectKnowledgeFile(fileSelection({ name: '说明.pdf', size: 10 * 1024 * 1024 + 1 }))
  assert.deepEqual(requests, [])
  assert.deepEqual(refreshes, [])
  assert.deepEqual(notices, [
    ['error', '当前可解析 .txt、.md、.pdf、.docx、.pptx、.xlsx；图片与视频暂未启用'],
    ['error', '文件不能超过 10 MB，请拆分后上传'],
  ])
})

// 做什么：确认后端解析失败文案原样显示，列表不刷新
// 入参：后端返回 422 和扫描件提示
// 返回：文案改变或请求仍显示加载时断言失败
test('shows the backend error unchanged when parsing fails', async (testCase) => {
  const message = '未识别到文字，暂不支持扫描件'
  const failure = new axios.AxiosError('Request failed', undefined, undefined, undefined, {
    status: 422, data: { code: 4007, message },
  })
  const controls = uploader(testCase, () => Promise.reject(failure))
  await controls.selectKnowledgeFile(fileSelection({ name: '扫描.pdf', size: 100 }))
  assert.deepEqual(controls.notices, [['error', message]])
  assert.deepEqual(controls.refreshes, [])
  assert.equal(controls.fileUploading.value, false)
})

// 做什么：核对上传 API 的路径、文件字段与超时
// 入参：命名文件与记录 Axios 调用的替身
// 返回：字段不是 file、丢失文件名或错误拆包时断言失败
test('posts the selected file as the multipart file field', async () => {
  const requests = []
  const document = { id: 19, title: '说明', status: 5 }
  const post = async (...request) => {
    requests.push(request)
    return { data: { code: 0, data: document } }
  }
  const http = { __esModule: true, default: { post } }
  const { uploadKnowledgeDocumentFile } = loadModule(apiSource, { '@/api/http': http })
  const file = new File(['test'], '说明.txt')
  assert.deepEqual(await uploadKnowledgeDocumentFile(14, file), document)
  const [[path, form, config]] = requests
  assert.equal(path, '/knowledge-bases/14/documents/file')
  assert.equal(form.get('file').name, file.name)
  assert.equal(await form.get('file').text(), 'test')
  assert.ok(config.timeout > 30000)
})
