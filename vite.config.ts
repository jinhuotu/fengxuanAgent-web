import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// 开发服务器配置
export default defineConfig({
  plugins: [vue()],
  resolve: {
    // @ 指向 src，import 时写 @/api/http 比写一堆 ../../ 好读
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // 端口必须是 5176：后端 CORS 白名单里只放了 127.0.0.1:5176 和 localhost:5176
    port: 5176,
    // 显式绑 127.0.0.1：默认只监听 localhost（可能落到 IPv6），
    // 绑 IPv4 之后 http://127.0.0.1:5176 稳定可访问，和后端白名单第一条对得上
    host: '127.0.0.1',
    // 端口被占用时直接报错，而不是偷偷换成 5177：
    // 后端白名单只认 5176，端口漂移会让跨域莫名其妙失败
    strictPort: true,
    proxy: {
      // 浏览器请求 /api/xxx → Vite 转成 http://127.0.0.1:8000/xxx
      // 好处有两个：前端不用知道后端地址；浏览器看到的是同源请求，不触发跨域
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        // 后端路由没有 /api 前缀（如 /auth/login），转发时把它去掉
        rewrite: (path: string) => path.replace(/^\/api/, ''),
      },
    },
  },
})
