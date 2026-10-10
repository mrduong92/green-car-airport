// frontend/src/api/appVersion.ts
import { Capacitor } from '@capacitor/core'
import api from './axios'
import type { AppVersionInfo } from '@/utils/appVersion'

export const getAppVersion = (app: 'customer' | 'driver') =>
  api
    .get<AppVersionInfo>('/app/version', { params: { app, platform: Capacitor.getPlatform() } })
    .then((r) => r.data)
