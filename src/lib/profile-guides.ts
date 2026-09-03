/** Profile help/guides: unseen vs viewed tabs (localStorage) + version stamp. */

import { INSTRUCTIONS_VERSION } from '@/lib/consent-versions';
import type { ModuleFlagKey, ModuleFlags } from '@/lib/module-flags';

export const PROFILE_GUIDES_KEY = 'yp-profile-guides-v2';

export type ProfileGuideId =
  | 'quick-access'
  | 'profile'
  | 'events'
  | 'social'
  | 'places'
  | 'gallery'
  | 'reliability'
  | 'eco'
  | 'entities'
  | 'career'
  | 'contests'
  | 'legal';

export type ProfileGuideRecord = {
  /** Matches INSTRUCTIONS_VERSION when the pack was last synced locally */
  version: string
  viewed: Partial<Record<ProfileGuideId, number>>
}

/** All current guide ids — order is display order for completeness checks */
export const ALL_GUIDE_IDS: ProfileGuideId[] = [
  'quick-access',
  'profile',
  'events',
  'social',
  'places',
  'gallery',
  'reliability',
  'eco',
  'entities',
  'career',
  'contests',
  'legal',
]

/** Map guide → required module(s). All listed modules must be enabled. */
export const GUIDE_MODULE_REQUIREMENTS: Partial<Record<ProfileGuideId, ModuleFlagKey[]>> = {
  events: ['events'],
  social: ['friends'],
  places: ['places'],
  gallery: ['gallery'],
  reliability: ['ratings'],
  eco: ['eco'],
  entities: ['projects', 'clubs'],
  career: ['vacancies'],
  contests: ['contests'],
}

export function filterGuideIdsByModules(
  ids: ProfileGuideId[] = ALL_GUIDE_IDS,
  modules?: ModuleFlags | Record<string, boolean> | null
): ProfileGuideId[] {
  if (!modules) return ids
  return ids.filter((id) => {
    const req = GUIDE_MODULE_REQUIREMENTS[id]
    if (!req?.length) return true
    return req.every((k) => (modules as Record<string, boolean>)[k] !== false)
  })
}

const DEFAULT: ProfileGuideRecord = { version: INSTRUCTIONS_VERSION, viewed: {} }

export { INSTRUCTIONS_VERSION }

export function readProfileGuides(): ProfileGuideRecord {
  if (typeof window === 'undefined') return { ...DEFAULT, viewed: {} }
  try {
    const raw = localStorage.getItem(PROFILE_GUIDES_KEY)
    if (!raw) {
      // migrate v1 key if present
      const legacy = localStorage.getItem('yp-profile-guides-v1')
      if (legacy) {
        try {
          const parsed = JSON.parse(legacy) as { viewed?: ProfileGuideRecord['viewed'] }
          const viewed = parsed?.viewed && typeof parsed.viewed === 'object' ? parsed.viewed : {}
          return { version: INSTRUCTIONS_VERSION, viewed }
        } catch {
          /* fall through */
        }
      }
      return { ...DEFAULT, viewed: {} }
    }
    const parsed = JSON.parse(raw) as ProfileGuideRecord
    const viewed =
      parsed?.viewed && typeof parsed.viewed === 'object' ? parsed.viewed : {}
    const version =
      typeof parsed?.version === 'string' && parsed.version ? parsed.version : INSTRUCTIONS_VERSION
    return { version, viewed }
  } catch {
    return { ...DEFAULT, viewed: {} }
  }
}

function writeRecord(rec: ProfileGuideRecord) {
  try {
    localStorage.setItem(PROFILE_GUIDES_KEY, JSON.stringify(rec))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('yp:profile-guides-changed', { detail: rec }))
    }
  } catch {
    /* ignore */
  }
}

export function isGuideViewed(id: ProfileGuideId): boolean {
  return Boolean(readProfileGuides().viewed[id])
}

export function markGuideViewed(id: ProfileGuideId) {
  const cur = readProfileGuides()
  cur.viewed[id] = Date.now()
  cur.version = INSTRUCTIONS_VERSION
  writeRecord(cur)
}

export function markGuideUnviewed(id: ProfileGuideId) {
  const cur = readProfileGuides()
  delete cur.viewed[id]
  writeRecord(cur)
}

/** True when every current guide id has been marked viewed locally */
export function areAllGuidesViewed(ids: ProfileGuideId[] = ALL_GUIDE_IDS): boolean {
  const cur = readProfileGuides()
  return ids.every((id) => Boolean(cur.viewed[id]))
}

export function countUnseenGuides(ids: ProfileGuideId[] = ALL_GUIDE_IDS): number {
  const cur = readProfileGuides()
  return ids.filter((id) => !cur.viewed[id]).length
}

/** Server badge is valid only when stored version matches current pack */
export function isInstructionsBadgeActive(opts: {
  instructionsVersion?: string | null
  instructionsCompletedAt?: string | Date | null
}): boolean {
  return Boolean(
    opts.instructionsCompletedAt &&
      opts.instructionsVersion &&
      opts.instructionsVersion === INSTRUCTIONS_VERSION
  )
}
