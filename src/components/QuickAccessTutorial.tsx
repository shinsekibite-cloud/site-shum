'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { Award, Keyboard, Smartphone, X, Zap } from 'lucide-react'
import {
  getQuickAccessTutorialState,
  setQuickAccessTutorialState,
  notifyQuickAccessTutorialDone,
  type QuickAccessTutorialState,
} from '@/lib/quick-access'
import {
  COOKIE_BANNER_VISIBILITY_EVENT,
  hasAnsweredCookieBanner,
} from '@/lib/cookie-consent'

type Props = {
  forceOpen?: boolean
  restartKey?: number
}

function useIsCoarsePointer() {
  const [coarse, setCoarse] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    const update = () => setCoarse(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return coarse
}

/**
 * Blocking modal for quick-access tips.
 * Auto-open is intentionally OFF for guests and homepage first paint —
 * TZ: no onboarding modals covering the hero. Opens only via forceOpen
 * (profile guides / explicit «?» request) or once for logged-in users
 * after cookie consent, never stacking with the cookie sheet.
 */
export function QuickAccessTutorial({ forceOpen = false, restartKey = 0 }: Props) {
  const { data: session, status } = useSession()
  const pathname = usePathname() || '/'
  const isMobile = useIsCoarsePointer()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [localState, setLocalState] = useState<QuickAccessTutorialState | null>(null)

  useEffect(() => {
    setLocalState(getQuickAccessTutorialState())
  }, [restartKey])

  useEffect(() => {
    if (forceOpen) {
      setOpen(true)
      return
    }
    if (status === 'loading' || localState === null) return
    if (localState !== 'pending') return

    // Guests: never auto-block the first visit — discover via edge tab / «?».
    if (status !== 'authenticated' || !session?.user) return

    // Keep homepage hero free; offer tutorial from other pages only.
    if (pathname === '/' || pathname === '') return

    if (!hasAnsweredCookieBanner()) return
    if (document.querySelector('.yp-cookie-banner') || document.querySelector('.yp-pwa-sheet')) return

    const t = window.setTimeout(() => {
      if (document.querySelector('.yp-cookie-banner') || document.querySelector('.yp-pwa-sheet')) return
      setOpen(true)
    }, 12_000)
    return () => window.clearTimeout(t)
  }, [forceOpen, localState, status, session?.user, pathname, restartKey])

  useEffect(() => {
    if (forceOpen || !open) return
    const onCookieVis = (e: Event) => {
      const visible = Boolean((e as CustomEvent<{ visible?: boolean }>).detail?.visible)
      if (visible) setOpen(false)
    }
    window.addEventListener(COOKIE_BANNER_VISIBILITY_EVENT, onCookieVis as EventListener)
    return () => window.removeEventListener(COOKIE_BANNER_VISIBILITY_EVENT, onCookieVis as EventListener)
  }, [forceOpen, open])

  useEffect(() => {
    if (!open) return
    document.body.classList.add('yp-modal-open')
    return () => document.body.classList.remove('yp-modal-open')
  }, [open])

  const persist = useCallback(
    async (next: Exclude<QuickAccessTutorialState, 'pending'>) => {
      setBusy(true)
      setQuickAccessTutorialState(next)
      setLocalState(next)
      if (session?.user) {
        try {
          const res = await fetch('/api/user/quick-access', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: next === 'done' ? 'complete' : 'skip' }),
          })
          if (next === 'done' && res.ok) {
            const json = await res.json().catch(() => ({}))
            notifyQuickAccessTutorialDone(Boolean(json?.unlocked || json?.alreadyHad))
          }
        } catch {
          /* local state already saved */
        }
      } else if (next === 'done') {
        notifyQuickAccessTutorialDone(false)
      }
      setBusy(false)
      setOpen(false)
    },
    [session?.user]
  )

  if (!open) return null

  return (
    <div className="qa-tutorial-root" role="dialog" aria-modal="true" aria-label="Инструктаж быстрого доступа">
      <div className="qa-tutorial-backdrop" />
      <div className="qa-tutorial-card">
        <button
          type="button"
          className="qa-tutorial-close"
          aria-label="Закрыть"
          disabled={busy}
          onClick={() => void persist('skipped')}
        >
          <X size={18} />
        </button>

        <div className="qa-tutorial-kicker">
          <Zap size={16} /> Быстрый доступ
        </div>
        <h2 className="qa-tutorial-title">Тонкая вкладка у края экрана</h2>
        <p className="qa-tutorial-lead">
          Справа еле заметная полоска — как Edge Panel. Тап или свайп от края откроет узкую панель с
          иконками разделов.
        </p>

        <div className="qa-tutorial-demo" data-mode={isMobile ? 'mobile' : 'desktop'}>
          {isMobile ? (
            <>
              <div className="qa-demo-phone" aria-hidden>
                <div className="qa-demo-screen">
                  <div className="qa-demo-lines">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="qa-demo-fab qa-demo-fab--thin" />
                  <div className="qa-demo-edge-panel" />
                  <div className="qa-demo-finger" />
                  <div className="qa-demo-ripple" />
                </div>
              </div>
              <div className="qa-tutorial-steps">
                <div className="qa-tutorial-step">
                  <Smartphone size={18} />
                  <div>
                    <strong>Полоска справа</strong>
                    <span>Почти незаметна. Тапните или потяните от правого края</span>
                  </div>
                </div>
                <div className="qa-tutorial-step">
                  <X size={18} />
                  <div>
                    <strong>Панель с иконками</strong>
                    <span>Узкая тёмная панель как у Samsung — разделы столбиком</span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="qa-demo-keys" aria-hidden>
                <kbd className="qa-demo-key qa-demo-key-q">?</kbd>
                <span className="qa-demo-or">или</span>
                <div className="qa-demo-chord">
                  <kbd className="qa-demo-key qa-demo-key-g">G</kbd>
                  <span>+</span>
                  <kbd className="qa-demo-key qa-demo-key-h">H</kbd>
                </div>
              </div>
              <div className="qa-tutorial-steps">
                <div className="qa-tutorial-step">
                  <Keyboard size={18} />
                  <div>
                    <strong>Клавиша ?</strong>
                    <span>Открывает шпаргалку быстрого доступа</span>
                  </div>
                </div>
                <div className="qa-tutorial-step">
                  <Keyboard size={18} />
                  <div>
                    <strong>G + буква</strong>
                    <span>
                      Например <kbd>G</kbd> <kbd>H</kbd> — на главную, <kbd>G</kbd> <kbd>E</kbd> — афиша,{' '}
                      <kbd>G</kbd> <kbd>G</kbd> — игры. <kbd>?</kbd> открывает шпаргалку, <kbd>/</kbd> — поиск,{' '}
                      <kbd>Esc</kbd> — назад.
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="qa-tutorial-reward">
          <Award size={18} />
          <span>
            Пройдите инструктаж — получите достижение <strong>«Современный человек»</strong> и значок в профиле.
          </span>
        </div>

        <div className="qa-tutorial-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void persist('done')}
          >
            Понятно, готово
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => void persist('skipped')}
          >
            Пропустить
          </button>
        </div>
        <p className="qa-tutorial-footnote">
          Если пропустите — больше не покажем. Инструкция всегда останется в профиле.
        </p>
      </div>
    </div>
  )
}
