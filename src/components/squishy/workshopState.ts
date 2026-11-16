import { Vector2 } from 'three'
export type WorkshopStage = 'prepare' | 'wax' | 'cool' | 'squeeze'
export const STAGES: readonly WorkshopStage[] = ['prepare', 'wax', 'cool', 'squeeze']
export const STAGE_LABELS = ['准备', '裹蜡', '冷却', '捏捏']

/** Mutable interaction data: pointer movement never causes React re-renders. */
export function createWorkshopMotion() {
  return {
    yaw: -0.09, tilt: 0, hovered: false,
    dragY: 0.3, dragging: false, autoDip: false,
    coating: 0, cooling: 0, liftTime: 0,
    pressPoint: new Vector2(0, 0.36),
    pressed: false, pressure: 0.5, pressStart: 0, depth: 0,
    lastCrack: 0, lastTap: 0, holdCracked: false,
  }
}
export type WorkshopMotion = ReturnType<typeof createWorkshopMotion>
