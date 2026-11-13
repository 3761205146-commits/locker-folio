export type RecordId = 'unreal' | 'slot-02' | 'slot-03'

export type RecordConfig = {
  id: RecordId
  title: string
  subtitle: string
  label: string
  color: string
  accent: string
  audioSrc?: string
  requiredFile?: string
}

/** Each record owns its own audio resource entry. */
export const RECORDS: readonly RecordConfig[] = [
  { id: 'unreal', title: 'Unreal (LIZ Solo)', subtitle: 'IVE · LIZ Solo', label: 'UNREAL', color: '#a9d8ee', accent: '#4f94b7', audioSrc: `${import.meta.env.BASE_URL}audio/unreal.mp3` },
  { id: 'slot-02', title: 'Summer', subtitle: 'LIZ (IVE)', label: 'SUMMER', color: '#f4d9b6', accent: '#c98d5f', audioSrc: `${import.meta.env.BASE_URL}audio/summer.mp3` },
  { id: 'slot-03', title: '터널 (Tunnel)', subtitle: 'LIZ (IVE)', label: 'TUNNEL', color: '#e8cfe2', accent: '#a56d91', audioSrc: `${import.meta.env.BASE_URL}audio/tunnel.mp3` },
]

export function findRecord(id: RecordId | null) {
  return RECORDS.find((record) => record.id === id) ?? null
}
