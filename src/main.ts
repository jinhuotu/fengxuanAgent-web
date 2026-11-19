/**
 * 应用入口：只做装配，不写业务。
 * 顺序有讲究：先装路由和状态库，再装 UI 库，最后 mount。
 */

import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import router from './router'
import './style.css'

const app = createApp(App)

// 状态仓库：登录 token 存在这里
app.use(createPinia())
// 路由：地址和页面的对应关系
app.use(router)
// 全量引入 Element Plus：省事，代价是打包体积大；要省体积可改成按需引入（后期再优化）
app.use(ElementPlus)

app.mount('#app')
