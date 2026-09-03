/** Shared game meta helpers (difficulties, times, leaderboard parsing). */

export type CheckersDifficulty = 'easy' | 'medium' | 'hard'

export const CHECKERS_DIFFICULTIES: {
  id: CheckersDifficulty
  label: string
  hint: string
}[] = [
  { id: 'easy', label: 'Лёгкий', hint: 'Соперник ошибается' },
  { id: 'medium', label: 'Средний', hint: 'Играет аккуратно' },
  { id: 'hard', label: 'Сложный', hint: 'Считает наперёд' },
]


export type FifteenDifficulty = 'easy' | 'medium' | 'hard'

export const FIFTEEN_DIFFICULTIES: {
  id: FifteenDifficulty
  label: string
  hint: string
}[] = [
  { id: 'easy', label: '3×3', hint: 'Быстрая разминка' },
  { id: 'medium', label: '4×4', hint: 'Классика' },
  { id: 'hard', label: '5×5', hint: 'Для терпеливых' },
]

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  const frac = Math.floor((ms % 1000) / 100)
  if (m > 0) return `${m}:${String(s).padStart(2, '0')}.${frac}`
  return `${s}.${frac}с`
}

export type GameMeta = {
  won?: boolean
  difficulty?: CheckersDifficulty | FifteenDifficulty
  durationMs?: number
  bestTimes?: Partial<Record<CheckersDifficulty | FifteenDifficulty, number>>
  [key: string]: unknown
}

export function parseGameMeta(raw: string | null | undefined): GameMeta {
  if (!raw) return {}
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' ? (v as GameMeta) : {}
  } catch {
    return {}
  }
}

export function mergeGameMeta(existingRaw: string | null | undefined, incoming: GameMeta): string {
  const base = parseGameMeta(existingRaw)
  const next: GameMeta = { ...base, ...incoming }
  const times: Partial<Record<CheckersDifficulty, number>> = { ...(base.bestTimes || {}) }
  for (const d of ['easy', 'medium', 'hard'] as Array<CheckersDifficulty | FifteenDifficulty>) {
    const a = times[d]
    const b = incoming.bestTimes?.[d]
    if (typeof b === 'number' && b > 0) {
      times[d] = typeof a === 'number' && a > 0 ? Math.min(a, b) : b
    }
  }
  if (incoming.difficulty && typeof incoming.durationMs === 'number' && incoming.won) {
    const d = incoming.difficulty
    const prev = times[d]
    times[d] = typeof prev === 'number' && prev > 0 ? Math.min(prev, incoming.durationMs) : incoming.durationMs
  }
  next.bestTimes = times
  return JSON.stringify(next).slice(0, 900)
}

const LOCAL_TIME_KEY = 'yp-game-best-times'

export function getLocalBestTime(game: string, difficulty?: string): number {
  try {
    const raw = localStorage.getItem(LOCAL_TIME_KEY)
    const map = raw ? JSON.parse(raw) : {}
    if (difficulty) return Number(map?.[game]?.[difficulty] || 0) || 0
    return Number(map?.[game]?._best || 0) || 0
  } catch {
    return 0
  }
}

export function setLocalBestTime(game: string, durationMs: number, difficulty?: string) {
  if (!durationMs || durationMs <= 0) return
  try {
    const raw = localStorage.getItem(LOCAL_TIME_KEY)
    const map = raw ? JSON.parse(raw) : {}
    if (!map[game]) map[game] = {}
    if (difficulty) {
      const prev = Number(map[game][difficulty] || 0) || 0
      map[game][difficulty] = prev > 0 ? Math.min(prev, durationMs) : durationMs
    }
    const prevBest = Number(map[game]._best || 0) || 0
    map[game]._best = prevBest > 0 ? Math.min(prevBest, durationMs) : durationMs
    localStorage.setItem(LOCAL_TIME_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

export type LeaderRow = {
  rank: number
  userId: string
  name: string
  score: number
  durationMs?: number
  difficulty?: CheckersDifficulty | FifteenDifficulty
}
