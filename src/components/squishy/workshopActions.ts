import type { WorkshopMotion } from './workshopState'
import type { WorkshopAudio } from './workshopAudio'
export function beginPress(motion: WorkshopMotion, audio: WorkshopAudio, x = 0, y = 0.36, pressure = 0.5) {
  if (motion.pressed || !motion.interactiveReady || !motion.sessionActive) return false
  audio.unlock()
  motion.pressPoint.set(x, y); motion.pressure = Math.max(0.25, Math.min(1, pressure || 0.5))
  motion.pressed = true; motion.pressStart = performance.now(); motion.pressSerial++
  motion.pressQueue.push({ serial: motion.pressSerial, generation: motion.waxGeneration,
    x, y, pressure: motion.pressure })
  return true
}
export function endPress(motion: WorkshopMotion, _audio: WorkshopAudio) {
  // A short press can finish before the next render. Its queued down survives.
  motion.pressed = false
}

export function cancelPresses(motion: WorkshopMotion) {
  motion.pressed = false
  motion.pressQueue.length = 0
}
