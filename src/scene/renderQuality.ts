import { useSyncExternalStore } from 'react'

// Use input capability rather than user-agent strings. A desktop with a mouse
// retains its existing quality; a phone/tablet uses the coarse-pointer budget.
const query = '(pointer: coarse)'
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(query)
  media.addEventListener('change', notify)
  return () => media.removeEventListener('change', notify)
}
export function useMobileRendering() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false)
}
export const MOBILE_DPR = 1.25
export const DESKTOP_DPR = 1.75
export const CONTACT_SHADOW_INTERVAL = 0.125
