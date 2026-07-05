import { defineConfig, type Plugin, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export type AppTarget = 'customer' | 'driver'

const APPS = {
  customer: {
    entry: '/src/main.tsx',
    port: 5173,
    outDir: 'dist',
    title: 'Save Go',
    name: 'Save Go',
    shortName: 'SaveGo',
    description: 'Đặt xe sân bay — Nhanh, minh bạch, tiện lợi',
  },
  driver: {
    entry: '/src/main.driver.tsx',
    port: 5174,
    outDir: 'dist-driver',
    title: 'Save Go Tài Xế',
    name: 'Save Go Tài Xế',
    shortName: 'SaveGo Tài Xế',
    description: 'Ứng dụng tài xế Save Go — Nhận cuốc sân bay',
  },
} as const

// Swap entry script + title/meta trong index.html theo app target —
// giữ 1 index.html duy nhất để dev server và SPA fallback hoạt động chuẩn
function appEntryPlugin(target: AppTarget): Plugin {
  const app = APPS[target]
  return {
    name: 'app-entry',
    // order: 'pre' bắt buộc — khi build, Vite chốt entry module TRƯỚC khi chạy
    // các transform mặc định, nên swap ở giai đoạn mặc định chỉ đổi được title
    // còn bundle vẫn là main.tsx (app customer). Dev server không bị vì transform
    // luôn chạy trước khi browser fetch entry.
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html
          .replace('/src/main.tsx', app.entry)
          .replace(/<title>.*<\/title>/, `<title>${app.title}</title>`)
          .replace('content="SaveGo"', `content="${app.shortName}"`)
      },
    },
  }
}

export function createAppConfig(target: AppTarget): UserConfig {
  const app = APPS[target]
  return {
    plugins: [
      appEntryPlugin(target),
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        includeAssets: ['favicon.ico', 'icons/*.png'],
        manifest: {
          name: app.name,
          short_name: app.shortName,
          description: app.description,
          theme_color: '#006a36',
          background_color: '#F8FAF9',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
    },
    build: { outDir: app.outDir },
    server: {
      host: true,
      port: app.port,
      allowedHosts: ['.ngrok-free.app', '.ngrok.io'],
      proxy: {
        '/api': { target: 'http://nginx', changeOrigin: true },
      },
    },
  }
}

// `vite` không --config vẫn chạy app customer (docker service `frontend` hiện tại)
export default defineConfig(createAppConfig('customer'))
