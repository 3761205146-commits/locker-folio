import type { WorkshopMotion } from './workshopState'
import type { WorkshopAudio } from './workshopAudio'
export function beginPress(motion: WorkshopMotion, audio: WorkshopAudio, x = 0, y = 0.36, pressure = 0.5) {
  if (motion.pressed) return
  audio.unlock()
  motion.pressPoint.set(x, y); motion.pressure = Math.max(0.25, Math.min(1, pressure || 0.5))
  motion.pressed = true; motion.pressStart = performance.now(); motion.pressSerial++
}
export function endPress(motion: WorkshopMotion, _audio: WorkshopAudio) {
  motion.pressed = false
}
