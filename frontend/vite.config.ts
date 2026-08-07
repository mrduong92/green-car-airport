import { defineConfig, type Plugin, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { BRAND } from './src/brand'

export type AppTarget = 'customer' | 'driver' | 'admin'

// Tên app derive từ BRAND — đổi tên thương hiệu chỉ cần sửa src/brand.ts
const APPS = {
  customer: {
    entry: '/src/main.tsx',
    port: 5173,
    outDir: 'dist',
    title: BRAND.name,
    name: BRAND.name,
    shortName: BRAND.name,
    description: 'Đặt xe sân bay — Nhanh, minh bạch, tiện lợi',
    startUrl: '/',
    url: `https://${BRAND.domain}`,
  },
  driver: {
    entry: '/src/main.driver.tsx',
    port: 5174,
    outDir: 'dist-driver',
    title: `${BRAND.name} Tài Xế`,
    name: `${BRAND.name} Tài Xế`,
    shortName: `${BRAND.name} Tài Xế`,
    description: `Ứng dụng tài xế ${BRAND.name} — Nhận cuốc sân bay`,
    startUrl: '/',
    url: `https://driver.${BRAND.domain}`,
  },
  admin: {
    entry: '/src/main.admin.tsx',
    port: 5175,
    outDir: 'dist-admin',
    title: `${BRAND.name} Admin`,
    name: `${BRAND.name} Admin`,
    shortName: `${BRAND.name} Admin`,
    description: `Quản trị hệ thống ${BRAND.name}`,
    startUrl: '/login',
    url: `https://admin.${BRAND.domain}`,
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
        // index.html giữ placeholder `__APP_*__` thay vì tên thật — match theo
        // tên thương hiệu sẽ vỡ IM LẶNG khi rename (meta tag sai, không có lỗi).
        // Không dùng cú pháp `%VAR%` để tránh đụng cơ chế replace env của Vite.
        return html
          .replace('/src/main.tsx', app.entry)
          .replaceAll('__APP_TITLE__', app.title)
          .replaceAll('__APP_SHORT_NAME__', app.shortName)
          .replaceAll('__APP_DESCRIPTION__', app.description)
          .replaceAll('__APP_URL__', app.url)
          .replaceAll('__APP_IMAGE__', `${app.url}/icons/icon-512.png`)
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
          start_url: app.startUrl,
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            // maskable dùng bản riêng: glyph co về 55% để Android crop không cắt mất viền
            { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
