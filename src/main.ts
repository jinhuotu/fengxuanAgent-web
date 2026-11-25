/**
 * 应用入口：只做装配，不写业务。
 * 顺序有讲究：先装路由和状态库，再装 UI 库，最后 mount。
 *
 * Element Plus 采用按需引入：只注册下面列表里真正用到的组件。
 * 以前 `app.use(ElementPlus)` 会把全部组件打进包，首屏 JS 里大半是没用到的代码。
 * 维护规则：新增 <el-xxx> 时，在 components 数组和样式 import 里各补一行，
 * 漏了会出现"组件不渲染"或"没有样式"，构建不会报错，只能靠页面发现。
 */

import {
  ElAlert,
  ElButton,
  ElCard,
  ElDescriptions,
  ElDescriptionsItem,
  ElDialog,
  ElDrawer,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElInput,
  ElLoading,
  ElOption,
  ElPagination,
  ElSelect,
  ElSkeleton,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus'
// 样式按组件引入：只打包用到的 CSS，不再整份引入 theme-chalk
import 'element-plus/es/components/alert/style/css'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/card/style/css'
import 'element-plus/es/components/descriptions/style/css'
import 'element-plus/es/components/dialog/style/css'
import 'element-plus/es/components/drawer/style/css'
import 'element-plus/es/components/empty/style/css'
import 'element-plus/es/components/form/style/css'
import 'element-plus/es/components/input/style/css'
import 'element-plus/es/components/select/style/css'
import 'element-plus/es/components/option/style/css'
import 'element-plus/es/components/pagination/style/css'
import 'element-plus/es/components/skeleton/style/css'
import 'element-plus/es/components/table/style/css'
import 'element-plus/es/components/tag/style/css'
// 指令与服务：v-loading 的遮罩、ElMessage 与 ElMessageBox 的弹层
import 'element-plus/es/components/loading/style/css'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'

import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import router from './router'
import './style.css'

const app = createApp(App)

// 只在模板里出现的组件需要全局注册；直接 import 的（如 ElMessage）不需要
const components = [
  ElAlert, ElButton, ElCard, ElDescriptions, ElDescriptionsItem, ElDialog, ElDrawer, ElEmpty,
  ElForm, ElFormItem, ElInput, ElOption, ElPagination, ElSelect, ElSkeleton, ElTable, ElTableColumn, ElTag,
]
for (const component of components) app.use(component)
// v-loading 指令由 ElLoading 插件注册，用户管理表格的遮罩依赖它
app.use(ElLoading)

// 状态仓库：登录 token 存在这里
app.use(createPinia())
// 路由：地址和页面的对应关系
app.use(router)

app.mount('#app')
