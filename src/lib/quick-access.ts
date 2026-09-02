/** Client-safe quick-access tutorial prefs (localStorage). */

export const QA_TUTORIAL_KEY = 'yp-quick-access-tutorial-v1'
export const QUICK_ACCESS_OPEN_EVENT = 'yp:quick-access-open'
export const QUICK_ACCESS_TUTORIAL_EVENT = 'yp:quick-access-tutorial'

/** @deprecated use QUICK_ACCESS_OPEN_EVENT */
export const QA_OPEN_EVENT = QUICK_ACCESS_OPEN_EVENT
/** @deprecated use QUICK_ACCESS_TUTORIAL_EVENT */
export const QA_TUTORIAL_EVENT = QUICK_ACCESS_TUTORIAL_EVENT

export type QuickAccessTutorialState = 'pending' | 'done' | 'skipped'
export type TutorialState = QuickAccessTutorialState

export type QuickAccessTutorialEventDetail = {
  force?: boolean
}

export function getQuickAccessTutorialState(): QuickAccessTutorialState {
  if (typeof window === 'undefined') return 'pending'
  try {
    const v = localStorage.getItem(QA_TUTORIAL_KEY)
    if (v === 'done' || v === 'skipped') return v
  } catch {
    /* ignore */
  }
  return 'pending'
}

export function setQuickAccessTutorialState(state: Exclude<QuickAccessTutorialState, 'pending'>) {
  try {
    localStorage.setItem(QA_TUTORIAL_KEY, state)
  } catch {
    /* ignore */
  }
}

export function readTutorialState(): TutorialState {
  return getQuickAccessTutorialState()
}

export function writeTutorialState(state: 'done' | 'skipped') {
  setQuickAccessTutorialState(state)
}

export function requestOpenQuickAccess() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(QUICK_ACCESS_OPEN_EVENT))
  }
}

export function requestQuickAccessTutorial(force = true) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(QUICK_ACCESS_TUTORIAL_EVENT, {
        detail: { force } satisfies QuickAccessTutorialEventDetail,
      })
    )
  }
}

export const QUICK_ACCESS_TUTORIAL_DONE_EVENT = 'yp:quick-access-tutorial-done'

export function notifyQuickAccessTutorialDone(unlocked: boolean) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(QUICK_ACCESS_TUTORIAL_DONE_EVENT, {
        detail: { unlocked },
      })
    )
  }
}
