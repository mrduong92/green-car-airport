// frontend/src/utils/appVersion.ts
// Logic buộc cập nhật — module thuần để Node test import được.

export type AppVersionInfo = { min_supported: string; latest: string; store_url: string }
export type VersionGate = { state: 'ok' } | { state: 'soft' | 'blocked'; storeUrl: string }

export function parseVersion(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** -1 / 0 / 1; null nếu một trong hai chuỗi sai định dạng. */
export function compareVersions(a: string, b: string): number | null {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) return null
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1
  }
  return 0
}

/** Dữ liệu sai → 'ok': server trả rác không được khoá người dùng ngoài app. */
export function evaluateGate(current: string, info: AppVersionInfo): VersionGate {
  if (compareVersions(current, info.min_supported) === -1) return { state: 'blocked', storeUrl: info.store_url }
  if (compareVersions(current, info.latest) === -1) return { state: 'soft', storeUrl: info.store_url }
  return { state: 'ok' }
}
