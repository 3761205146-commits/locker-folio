import type { WorkshopMotion } from './workshopState'
import type { WorkshopAudio } from './workshopAudio'
export function beginPress(motion: WorkshopMotion, audio: WorkshopAudio, x = 0, y = 0.36, pressure = 0.5) {
  if (motion.pressed) return
  const now = performance.now()
  motion.pressPoint.set(x, y); motion.pressure = Math.max(0.25, Math.min(1, pressure || 0.5))
  motion.depth = Math.max(motion.depth, 0.022)
  motion.pressed = true; motion.pressStart = now; motion.holdCracked = false; motion.lastCrack = now
  audio.play(now - motion.lastTap < 220 ? 'rapid' : motion.pressure > 0.72 ? 'crunch' : 'light', motion.pressure)
  audio.beginHold(motion.pressure)
  motion.lastTap = now
}
export function endPress(motion: WorkshopMotion, audio: WorkshopAudio) {
  if (!motion.pressed) return
  motion.pressed = false
  audio.endHold()
  audio.play('release', Math.max(0.25, motion.pressure))
}
