'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  Check,
  ChevronRight,
  Eye,
  FolderKanban,
  Leaf,
  MapPin,
  Shield,
  Ticket,
  Users,
  Zap,
  UserRound,
  Gauge,
  BadgeCheck,
  Camera,
  ListChecks,
  Briefcase,
  Trophy,
} from 'lucide-react'
import {
  getQuickAccessTutorialState,
  requestOpenQuickAccess,
  requestQuickAccessTutorial,
  QUICK_ACCESS_TUTORIAL_DONE_EVENT,
} from '@/lib/quick-access'
import {
  ALL_GUIDE_IDS,
  areAllGuidesViewed,
  filterGuideIdsByModules,
  INSTRUCTIONS_VERSION,
  isGuideViewed,
  isInstructionsBadgeActive,
  markGuideUnviewed,
  markGuideViewed,
  type ProfileGuideId,
} from '@/lib/profile-guides'
import type { ModuleFlags } from '@/lib/module-flags'

type Tab = 'new' | 'seen'

type GuideDef = {
  id: ProfileGuideId
  title: string
  summary: string
  steps: string[]
  accent?: string
  Icon: typeof Zap
  /** Hide when this ops module flag is off */
  module?: string
}

const GUIDES: GuideDef[] = [
  {
    id: 'quick-access',
    title: 'Быстрый доступ',
    summary: 'Панель ⚡ — разделы без лишних кликов',
    accent: '#2563eb',
    Icon: Zap,
    steps: [
      'Телефон: кнопка ⚡ справа внизу — открыть панель.',
      'ПК: клавиша ? — шпаргалка; G + буква — переход (G H — главная).',
      'Пройдите анимацию один раз — портал запомнит.',
    ],
  },
  {
    id: 'profile',
    title: 'Профиль',
    summary: 'Фото, видимость, публичный ID',
    accent: '#0d9488',
    Icon: UserRound,
    steps: [
      'Кабинет → Данные профиля (на той же странице): имя, город, о себе, увлечения.',
      'Открытый / друзья / закрытый — кто видит вас в поиске.',
      'Публичный ID (YM-…) копируйте с обзора — безопасно делиться.',
    ],
  },
  {
    id: 'events',
    title: 'Афиша и билеты',
    summary: 'Запись, QR, брони',
    accent: '#c2410c',
    Icon: Ticket,
    module: 'events',
    steps: [
      'Афиша — записывайтесь, если точно придёте.',
      'Билеты и QR — раздел «Билеты» в кабинете.',
      'Отменяйте заранее — авторитет не падает.',
    ],
  },
  {
    id: 'social',
    title: 'Друзья и сообщения',
    summary: 'Иконки в панели кабинета',
    accent: '#7c3aed',
    Icon: Users,
    module: 'friends',
    steps: [
      'Ищите по имени или публичному ID.',
      'Закрытый профиль — только по ссылке-приглашению.',
      'Без спама: лимиты смягчают авторитет и соцрейтинг.',
    ],
  },
  {
    id: 'places',
    title: 'Куда сходить',
    summary: 'Места Сочи, отзывы, приглашения',
    accent: '#0d9488',
    Icon: MapPin,
    module: 'places',
    steps: [
      'Раздел «Куда сходить» — маршрут, избранное, оценка.',
      '«Пригласить друга» — только для друзей.',
      'Отзывы публикуются после модерации.',
    ],
  },
  {
    id: 'gallery',
    title: 'Галерея',
    summary: 'Общая на главной и личный альбом',
    accent: '#0284c7',
    Icon: Camera,
    module: 'gallery',
    steps: [
      'Главная / Галерея — моменты организации.',
      'Личная галерея в профиле — фото сжимаются автоматически.',
      'За фото растёт соцрейтинг и начисляются мбаллы.',
    ],
  },
  {
    id: 'reliability',
    title: 'Авторитет и соцрейтинг',
    summary: 'Два рейтинга — А% и С%',
    accent: '#ca8a04',
    Icon: Gauge,
    module: 'ratings',
    steps: [
      'Авторитет (старт 100%): чекин, пропуски, правила.',
      'Сообщество (старт 50%): друзья, галерея, общение.',
      'Нажмите на А% или С% в кабинете — откроется история.',
    ],
  },
  {
    id: 'eco',
    title: 'мбаллы',
    summary: 'Забота о планете и оформление профиля',
    accent: '#16a34a',
    Icon: Leaf,
    module: 'eco',
    steps: [
      'мбаллы за активность: чекин, друзья, галерея, инструктаж, вакансии, конкурсы и игры.',
      'В профиле — каталог рамок и значков за мбаллы.',
      'История начислений — во вкладке «мб» в модалке репутации.',
    ],
  },
  {
    id: 'entities',
    title: 'Проекты и клубы',
    summary: 'Заявки, чат, приглашения',
    accent: '#2563eb',
    Icon: FolderKanban,
    module: 'clubs',
    steps: [
      'Кабинет → Заявки: статус по проектам и клубам.',
      'Чат участников — на странице сущности и во вкладках «Клубы»/«Проекты» в Сообщениях.',
      'Приглашайте друзей в команду из карточки или из личного диалога.',
    ],
  },
  {
    id: 'career',
    title: 'Вакансии',
    summary: 'Отклики и авто-скрининг',
    accent: '#0f766e',
    Icon: Briefcase,
    module: 'vacancies',
    steps: [
      'Раздел «Вакансии» — предложения Центра и партнёров.',
      'Сначала авто-скрининг (квиз), затем ручная модерация.',
      'Нужны актуальный инструктаж, возраст и пороги А%/С%.',
    ],
  },
  {
    id: 'contests',
    title: 'Конкурсы',
    summary: 'Работы и розыгрыши',
    accent: '#b45309',
    Icon: Trophy,
    module: 'contests',
    steps: [
      'Конкурсы работ: подача + модерация + голосование.',
      'Розыгрыши — среди check-in на событии афиши.',
      'Гранты остаются в отдельном разделе /grants.',
    ],
  },
  {
    id: 'legal',
    title: 'Правила и политика',
    summary: 'Согласия 152-ФЗ, cookie, FAQ',
    accent: '#334155',
    Icon: Shield,
    steps: [
      'Актуальные тексты: Политика, Правила и Пользовательское соглашение.',
      'Частые вопросы — в разделе FAQ (/faq), если он включён.',
      'В настройках безопасности можно включить двухфакторную аутентификацию (код из приложения).',
      'Cookie: «Только необходимые» или «Принять все» в подвале.',
    ],
  },
]

type Props = {
  instructionsVersion?: string | null
  instructionsCompletedAt?: string | null
  modules?: ModuleFlags | null
  onInstructionsSync?: (state: {
    completed: boolean
    version: string
    completedAt?: string | null
  }) => void
}

async function syncInstructionsToServer(viewedIds: ProfileGuideId[]) {
  const res = await fetch('/api/user/instructions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'complete',
      version: INSTRUCTIONS_VERSION,
      viewedIds,
    }),
  })
  if (!res.ok) return null
  return res.json().catch(() => null)
}

export default function ProfileGuides({
  instructionsVersion,
  instructionsCompletedAt,
  onInstructionsSync,
}: Props) {
  const [tab, setTab] = useState<Tab>('new')
  const [tick, setTick] = useState(0)
  const [moduleFlags, setModuleFlags] = useState<Record<string, boolean> | null>(null)
  const [openId, setOpenId] = useState<ProfileGuideId | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [serverBadge, setServerBadge] = useState(() =>
    isInstructionsBadgeActive({ instructionsVersion, instructionsCompletedAt })
  )

  const refresh = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    import('@/lib/public-status-client').then(({ fetchPublicStatusCached }) => {
      fetchPublicStatusCached()
        .then((d) => {
          if (d?.modules && typeof d.modules === 'object') setModuleFlags(d.modules as Record<string, boolean>)
          else if ((d as any)?.flags && typeof (d as any).flags === 'object') setModuleFlags((d as any).flags)
        })
        .catch(() => null)
    })
  }, [])

  const activeGuides = useMemo(() => {
    const ids = filterGuideIdsByModules(ALL_GUIDE_IDS, moduleFlags)
    return GUIDES.filter((g) => ids.includes(g.id))
  }, [moduleFlags])

  useEffect(() => {
    setServerBadge(isInstructionsBadgeActive({ instructionsVersion, instructionsCompletedAt }))
  }, [instructionsVersion, instructionsCompletedAt])

  useEffect(() => {
    if (!instructionsCompletedAt) return
    if (isInstructionsBadgeActive({ instructionsVersion, instructionsCompletedAt })) return
    setServerBadge(false)
    onInstructionsSync?.({ completed: false, version: INSTRUCTIONS_VERSION, completedAt: null })
    void fetch('/api/user/instructions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'invalidate' }),
    }).catch(() => null)
  }, [instructionsCompletedAt, instructionsVersion, onInstructionsSync])

  useEffect(() => {
    const onChange = () => refresh()
    window.addEventListener('yp:profile-guides-changed', onChange)
    window.addEventListener(QUICK_ACCESS_TUTORIAL_DONE_EVENT, onChange)
    return () => {
      window.removeEventListener('yp:profile-guides-changed', onChange)
      window.removeEventListener(QUICK_ACCESS_TUTORIAL_DONE_EVENT, onChange)
    }
  }, [refresh])

  useEffect(() => {
    const state = getQuickAccessTutorialState()
    if ((state === 'done' || state === 'skipped') && !isGuideViewed('quick-access')) {
      markGuideViewed('quick-access')
      refresh()
    }
  }, [refresh, tick])

  const { unseen, seen, progress } = useMemo(() => {
    void tick
    const unseenList: GuideDef[] = []
    const seenList: GuideDef[] = []
    let done = 0
    for (const g of activeGuides) {
      if (isGuideViewed(g.id)) {
        seenList.push(g)
        done += 1
      } else unseenList.push(g)
    }
    const total = activeGuides.length
    return {
      unseen: unseenList,
      seen: seenList,
      progress: { done, total, percent: total ? Math.round((done / total) * 100) : 0 },
    }
  }, [tick, activeGuides])

  const nextGuide = unseen[0] || null

  const allDoneLocal = useMemo(() => {
    void tick
    return areAllGuidesViewed(activeGuides.map((g) => g.id))
  }, [tick, activeGuides])

  useEffect(() => {
    if (!allDoneLocal || serverBadge || syncing) return
    let cancelled = false
    setSyncing(true)
    const viewedIds = activeGuides.map((g) => g.id).filter((id) => isGuideViewed(id))
    syncInstructionsToServer(viewedIds)
      .then((data) => {
        if (cancelled || !data?.ok) return
        setServerBadge(true)
        onInstructionsSync?.({
          completed: true,
          version: data.version || INSTRUCTIONS_VERSION,
          completedAt: data.completedAt || new Date().toISOString(),
        })
      })
      .finally(() => {
        if (!cancelled) setSyncing(false)
      })
    return () => {
      cancelled = true
    }
  }, [allDoneLocal, serverBadge, syncing, onInstructionsSync])

  useEffect(() => {
    if (tab === 'new' && unseen.length === 0 && seen.length > 0) setTab('seen')
  }, [tab, unseen.length, seen.length])

  const list = tab === 'new' ? unseen : seen

  const markSeen = (id: ProfileGuideId) => {
    markGuideViewed(id)
    setOpenId(null)
    refresh()
    // Stay on "new" until list empties — don't force jump to "готово"
  }

  const markNew = (id: ProfileGuideId) => {
    markGuideUnviewed(id)
    setServerBadge(false)
    onInstructionsSync?.({ completed: false, version: INSTRUCTIONS_VERSION, completedAt: null })
    void fetch('/api/user/instructions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'invalidate' }),
    }).catch(() => null)
    refresh()
    setTab('new')
    setOpenId(id)
  }

  const runQuickAccess = () => {
    requestOpenQuickAccess()
    if (nextGuide?.id === 'quick-access') markSeen('quick-access')
  }

  return (
    <section className="profile-guides profile-guides--dense" aria-label="Инструкции">
      <div className="profile-guides-head">
        <h3>
          <BookOpen size={16} aria-hidden /> Инструкции
        </h3>
        <div className="profile-guides-head-meta">
          <span className="profile-guides-progress-label">
            {progress.done}/{progress.total}
          </span>
          {serverBadge ? (
            <span className="profile-guides-trained" title="Все текущие инструкции пройдены">
              <BadgeCheck size={14} /> Готово
            </span>
          ) : unseen.length > 0 ? (
            <span className="profile-guides-badge" title="Непросмотренные">
              {unseen.length}
            </span>
          ) : syncing ? (
            <span className="profile-guides-sync">Сохраняем…</span>
          ) : null}
        </div>
      </div>

      <div className="profile-guides-progress" aria-label={`Прогресс ${progress.percent}%`}>
        <div className="profile-guides-progress__track">
          <i style={{ width: `${progress.percent}%` }} />
        </div>
        <span>{progress.percent}%</span>
      </div>

      {nextGuide && !serverBadge ? (
        <div className="profile-guides-now">
          <div className="profile-guides-now__label">
            <ListChecks size={14} aria-hidden /> Что сделать сейчас
          </div>
          <button
            type="button"
            className="profile-guides-now__card"
            onClick={() => setOpenId(nextGuide.id)}
          >
            <span className="profile-guide-icon" style={{ color: nextGuide.accent || 'var(--primary)' }}>
              <nextGuide.Icon size={15} />
            </span>
            <span>
              <strong>{nextGuide.title}</strong>
              <span>{nextGuide.summary}</span>
            </span>
            <ChevronRight size={15} aria-hidden />
          </button>
        </div>
      ) : null}

      <div className="profile-guides-tabs" role="tablist" aria-label="Статус инструкций">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'new'}
          className={`profile-guides-tab${tab === 'new' ? ' is-active' : ''}`}
          onClick={() => setTab('new')}
        >
          Новые
          {unseen.length > 0 ? <em>{unseen.length}</em> : null}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'seen'}
          className={`profile-guides-tab${tab === 'seen' ? ' is-active' : ''}`}
          onClick={() => setTab('seen')}
        >
          Готово
        </button>
      </div>

      {list.length === 0 ? (
        <p className="profile-guides-empty">
          {tab === 'new' ? 'Все инструкции просмотрены.' : 'Здесь — уже открытые подсказки.'}
        </p>
      ) : (
        <ul className="profile-guides-list">
          {list.map((g) => {
            const expanded = openId === g.id
            const Icon = g.Icon
            return (
              <li key={g.id} className={`profile-guide-item${expanded ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="profile-guide-row"
                  aria-expanded={expanded}
                  onClick={() => setOpenId(expanded ? null : g.id)}
                >
                  <span className="profile-guide-icon" style={{ color: g.accent || 'var(--primary)' }}>
                    <Icon size={15} />
                  </span>
                  <span className="profile-guide-text">
                    <strong>{g.title}</strong>
                    <span>{g.summary}</span>
                  </span>
                  <ChevronRight size={15} className="profile-guide-chevron" aria-hidden />
                </button>
                {expanded ? (
                  <div className="profile-guide-body">
                    <ol className="profile-guide-steps">
                      {g.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                    {g.id === 'quick-access' ? (
                      <div className="profile-guide-actions">
                        <button type="button" className="btn btn-primary btn-sm" onClick={runQuickAccess}>
                          Открыть панель
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => requestQuickAccessTutorial(true)}
                        >
                          Анимация
                        </button>
                      </div>
                    ) : null}
                    <div className="profile-guide-meta">
                      {tab === 'new' ? (
                        <button type="button" className="profile-guide-mark" onClick={() => markSeen(g.id)}>
                          <Check size={14} /> Готово
                        </button>
                      ) : (
                        <span className="profile-guide-mark is-muted" style={{ cursor: 'default' }}>
                          <Eye size={14} /> Можно просмотреть ещё
                        </span>
                      )}
                    </div>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
