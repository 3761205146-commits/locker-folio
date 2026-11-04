/* ============================================================================
 * 场景材质
 *
 * 统一 Metallic-Roughness：柜体是烤漆金属，低 metalness、中等 roughness，
 * 高光靠主光和半球光形成，不在贴图里画高光。
 * Liz 生日版只调整柜体本身的蓝色：提高明度和饱和度，
 * 同时保留门、柜壳、柜腔与五金的原有层次。
 * ========================================================================== */

export const PALETTE = {
  /** 门面：接近白蓝的浅粉蓝 */
  door: '#e2eff8',
  /** 门内侧：受光更足的淡蓝白 */
  doorInner: '#edf6fb',
  /** 柜壳与立柱：比门面略深，保持框架层次 */
  frame: '#a9cde3',
  /** 顶盖 */
  cap: '#c6deed',
  /** 底座 */
  plinth: '#9fc4dc',
  /** 柜腔内壁：比门面更深，但保持明亮、清透的蓝 */
  cavity: '#5f98c6',
  /** 柜腔后壁：比内侧亮一档，避免吸光成深蓝 */
  cavityBack: '#7fb7d9',
  /** 隔板 */
  shelf: '#b9dbea',
  /** 把手底板 */
  handlePlate: '#9fc3d7',
  /** 把手蓝色嵌条 */
  handleGrip: '#6dadd0',
  /** 通风槽底衬 */
  ventBack: '#8db8d1',
} as const

/** 柜体烤漆的通用参数 */
export const PAINT = { roughness: 0.52, metalness: 0.08 } as const
/** 柜腔内壁：更哑，避免内部出现不该有的反光 */
export const MATTE = { roughness: 0.82, metalness: 0.02 } as const
/** 把手：金属感稍强 */
export const METAL = { roughness: 0.36, metalness: 0.42 } as const
