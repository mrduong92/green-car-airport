import { useUiStore } from '@/stores/ui'

function isStandaloneMode(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  // iOS Safari sets navigator.standalone when running as installed PWA
  if ((navigator as { standalone?: boolean }).standalone === true) return true
  return false
}

export function usePwaInstall() {
  const deferredInstallPrompt = useUiStore((s) => s.deferredInstallPrompt)
  const setDeferredInstallPrompt = useUiStore((s) => s.setDeferredInstallPrompt)
  const isInstalled = useUiStore((s) => s.isInstalled)

  const isStandalone = isStandaloneMode()
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const isAndroid = /android/i.test(navigator.userAgent)

  // Show install UI when:
  // - Not already running in standalone mode
  // - Not already installed this session
  // - Either a deferred prompt is available (Android/Desktop) or we're on iOS (manual steps)
  const canInstall = !isStandalone && !isInstalled && (!!deferredInstallPrompt || isIos)

  async function triggerInstall(): Promise<boolean> {
    if (!deferredInstallPrompt) return false
    await deferredInstallPrompt.prompt()
    const { outcome } = await deferredInstallPrompt.userChoice
    if (outcome === 'accepted') {
      setDeferredInstallPrompt(null)
    }
    return outcome === 'accepted'
  }

  return { canInstall, isStandalone, isIos, isAndroid, triggerInstall }
}
