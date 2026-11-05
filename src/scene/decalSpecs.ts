/* ============================================================================
 * 柜门贴花的位置表
 *
 * ── 坐标用的是门面百分比 ────────────────────────────────────
 *   left / top  = 贴花左上角相对门面左上角的比例
 *   width       = 贴花宽度相对门宽的比例
 *   高度不写   —— 由贴图 alpha 包围盒的宽高比算，换素材自动跟着变
 *
 * 门内侧那一组的百分比是**镜像坐标系**里的值：`Door_02_InnerContent`
 * 整组绕 Y 转了 180°，法线才朝外，所以它的 left 从门的右边算起。
 *
 * ── 缺的几张 ────────────────────────────────────────────────
 * 参考里还有几张手写纸条和气泡，仓库里没有对应贴图资源，
 * 不能凭空造一张进 3D，这几张就先空着。
 * ========================================================================== */

export type DecalSpec = {
  /** 稳定 id：热点绑定和拖拽状态都按它索引，可交互节点必须稳定命名 */
  id: string
  url: string
  /** 左上角相对门面的比例 */
  left: number
  top: number
  /** 宽度相对门宽的比例 */
  width: number
  /** 面内旋转（度） */
  rot?: number
  /** 是否允许在门板平面内拖动 */
  draggable?: boolean
}

/** 第 1 扇门（关着）外表面 */
// 海报与两个托盘已经换成独立、有厚度的实体组件（Props.tsx）；这里不再保留
// 透明平面副本，否则会与实体重叠并重新产生穿过通风槽的视觉问题。
export const DOOR1_DECALS: readonly DecalSpec[] = []

/** 第 4 扇门（关着）外表面 */
// 原先一张复合 polaroids.webp 已拆成五张可单独拖动的实体磁吸卡。
export const DOOR4_DECALS: readonly DecalSpec[] = []

/**
 * 第 2 扇门的内侧 —— 翻开后正对观众的那一面，贴纸最密的地方。
 *
 * ABOUT 的入口是工牌，它已经不在这张表里：贴花是零厚度的平面，工牌挂在
 * 实体挂钩上、还要被钩尖穿过吊环，做成实体才成立。现在它是 PhysicalProps
 * 的 IdCardModel，由 Props.tsx 按 ID_CARD_AT 装到门上。
 */
export const DOOR2_INNER_DECALS: readonly DecalSpec[] = [
  // 文字贴纸固定在基本信息卡片上方，留出卡片文字的完整阅读空间。
  { id: 'birthday', url: '/assets/obj2/liz-door/happy-birthday.png', left: 0.22, top: 0.025, width: 0.28, rot: -3, draggable: true },
  { id: 'liz-heart', url: '/assets/obj2/liz-door/liz-heart.png', left: 0.55, top: 0.035, width: 0.2, rot: 4, draggable: true },

  // 内侧内容组绕 Y 轴镜像：较小的 left 会落在观众视角的右侧。
  // 人物因此与基本信息卡片左右并列，既完整可见，也不压住卡片文字。
  { id: 'liz-cutout', url: '/assets/obj2/liz-door/39ae5202-5f40-4047-9bc5-704e020d6a88.png', left: 0.02, top: 0.3, width: 0.2, rot: -2, draggable: true },

  // 原三宫格位置改用上传的原始四宫格照片，保留独立贴花与白色描边效果。
  { id: 'four-grid', url: '/assets/obj2/liz-door/four-grid.jpg', left: 0.62, top: 0.46, width: 0.25, rot: 2, draggable: true },

  // 六张橙猫分散在余白与底部区域，避免遮挡主卡、人物和打字机。
  { id: 'cat-front', url: '/assets/obj2/liz-door/01_orange_cat_front.png', left: 0.06, top: 0.54, width: 0.13, rot: -5, draggable: true },
  { id: 'cat-singing', url: '/assets/obj2/liz-door/02_orange_cat_singing.png', left: 0.78, top: 0.16, width: 0.14, rot: 6, draggable: true },
  { id: 'cat-surprised', url: '/assets/obj2/liz-door/03_orange_cat_surprised.png', left: 0.5, top: 0.56, width: 0.12, rot: 4, draggable: true },
  { id: 'cat-tears', url: '/assets/obj2/liz-door/04_orange_cat_tears.png', left: 0.25, top: 0.68, width: 0.13, rot: -4, draggable: true },
  { id: 'cat-front2', url: '/assets/obj2/liz-door/05_orange_cat_front2.png', left: 0.7, top: 0.7, width: 0.12, rot: 5, draggable: true },
  { id: 'cat-music', url: '/assets/obj2/liz-door/06_orange_cat_music.png', left: 0.79, top: 0.48, width: 0.12, rot: -6, draggable: true },
]

/* ============================================================================
 * 工牌与它的挂钩
 *
 * 这两个坐标不是贴花，但必须和这张贴花表里那套「门面百分比」反解出自同一处：
 * 工牌原本就是按 left 26% / top 18% / width 38% 摆的一张贴花，挂钩是照着它的
 * 印刷吊环对齐做出来的。工牌换成实体（PhysicalProps 的 IdCardModel）之后，
 * 位置一个像素都不能动，否则钩尖就不再从吊环的孔里穿过去。两个数放在一起，
 * 就不会有人只改一个。
 *
 *   贴片宽  w = 0.38 × DOOR_W(0.924)                = 0.35112
 *   贴片高  h = w ÷ 源图宽高比 430/760(0.565789)     = 0.62059
 *   贴片中心 x = (0.26 + 0.38/2) × DOOR_W − DOOR_W/2 = −0.0462
 *          y = DOOR_H/2 − (0.18 × DOOR_H + h/2)     =  0.55307
 *
 * 吊环的孔在 430×760 源图里占 x 177–252 / y 25–108，换算到内容组：
 *          x = −0.0462 + (214.5/430 − 0.5) × w      = −0.04661
 *          y ∈ 0.55307 + (0.5 − {25,108}/760) × h   = 0.7752 … 0.8430
 *   净空 0.062 × 0.069，钩体直径 0.012，穿得过去。
 *
 * 挂钩底板压在孔上沿之上，所以 ID_CARD_HOOK_AT 给的是**底板中心**：
 * y = 手臂下端 0.810 + 0.087（模型里手臂到底板的距离），z 落在门内侧面上。
 * 手臂下端 0.810、钩尖 0.810–0.835 都落在上面那段孔高里。
 * ========================================================================== */

export const ID_CARD_HOOK_AT: readonly [number, number, number] = [-0.0466, 0.897, -0.0045]

/**
 * 工牌整张（吊环 + 卡体）的世界宽高 —— 就是上面那两行 w / h。
 *
 * 两处在用，必须是同一份：拖拽的占地范围（Props.tsx），以及实体模型反推
 * 「源图 1px 折算多少世界单位」的基准（PhysicalProps 的 IdCardModel）。
 */
export const ID_CARD_SIZE: readonly [number, number] = [0.35112, 0.62059]

/**
 * 工牌实体的装配点：整张牌（吊环 + 卡体）的中心，与原贴花中心重合。
 *
 * z 是卡背离门内侧面的距离。门内侧面在 −0.0045，挂钩底板厚 0.012 压在上面，
 * 正面就到 0.0075 —— 牌子贴着承它重量的那块五金件，卡背取同一个 z。
 * 由此卡体中面（IdCardModel 里吊环片所在的位置）落在 0.0075 + 0.014/2 = 0.0145：
 * 挂钩手臂在 −0.0025 被环带挡住，钩尖在 0.0255 从孔里探到牌子前面 0.011。
 */
export const ID_CARD_AT: readonly [number, number, number] = [-0.0462, 0.55307, 0.0075]

/**
 * 图集要打包的全部贴图（去重后）。
 *
 * 工牌退出这张表之后，图集里 `/assets/obj/idcard2.webp` 那一格就成了「已备好、
 * 场景层未排位」的多余项 —— pack-decals 对这个方向只警告不失败，重打图集时
 * 它会被顺手挤掉，都不影响运行时。素材本身仍在用：IdCardModel 按 URL 单独加载它。
 */
export const DECAL_URLS: readonly string[] = [
  ...new Set(
    [...DOOR1_DECALS, ...DOOR4_DECALS, ...DOOR2_INNER_DECALS].map((d) => d.url),
  ),
]
