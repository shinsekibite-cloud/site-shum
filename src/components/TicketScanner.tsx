'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { CheckCircle2, XCircle, ScanLine, RefreshCw, Calendar, X, CloudOff, Wifi, LogOut, ClipboardPaste, Camera } from 'lucide-react';
import {
  enqueueScan,
  flushQueuedScans,
  listQueuedScans,
  type QueuedScan,
} from '@/lib/scanner-queue';
import { signOutLogged } from '@/lib/sign-out-logged';

type ScanResult = {
  ok: boolean;
  status: string;
  message: string;
  guest?: { name?: string | null; phone?: string | null; image?: string | null };
  event?: { id?: string; title?: string; space?: { title?: string } | string | null };
  stats?: { checkedCount: number; registeredCount: number };
  checkedAt?: string;
  checkInId?: string;
};

type CameraPhase = 'idle' | 'requesting' | 'active' | 'denied' | 'error';

function statusHeadline(status: string, fallback: string) {
  switch (status) {
    case 'OK':
    case 'LIVE':
      return 'Проход разрешён';
    case 'ALREADY_CHECKED':
      return 'Уже отмечен';
    case 'INVALID':
      return 'Неверный формат';
    case 'NOT_FOUND':
      return 'Не найден';
    case 'WRONG_EVENT':
      return 'Другое мероприятие';
    case 'NOT_APPROVED':
      return 'Заявка не одобрена';
    case 'USER_NOT_FOUND':
      return 'Пользователь не найден';
    case 'NOT_REGISTERED':
      return 'Нет регистрации';
    case 'QUEUED':
      return 'В очереди';
    default:
      return fallback || status;
  }
}

function formatCheckedAt(value?: string) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return value;
  }
}

type ScannerEvent = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  space?: { title?: string } | null;
  registeredCount: number;
  checkedCount: number;
};

type RecentItem = {
  id: string;
  createdAt: string;
  method?: string;
  scannedById?: string;
  user?: { name?: string | null; phone?: string | null } | null;
  booking?: { id?: string; title?: string; space?: { title?: string } | null } | null;
};

function methodLabel(method?: string) {
  switch (method) {
    case 'VENUE_SELF':
      return 'QR двери';
    case 'ORG_SELF':
      return 'QR входа';
    case 'MANUAL':
      return 'вручную';
    case 'QR':
      return 'сканер';
    default:
      return method || 'проход';
  }
}

export default function TicketScanner({ compact = false }: { compact?: boolean }) {
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<ScanResult | null>(null);
  const [todayCount, setTodayCount] = useState(0);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [byMethod, setByMethod] = useState<Record<string, number>>({});
  const [eventStats, setEventStats] = useState<{ checkedCount: number; registeredCount: number } | null>(null);
  const [cameraError, setCameraError] = useState('');
  /** Camera starts only after explicit user gesture («Включить камеру»). */
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraPhase, setCameraPhase] = useState<CameraPhase>('idle');
  const [events, setEvents] = useState<ScannerEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [showResult, setShowResult] = useState(false);
  const [online, setOnline] = useState(true);
  const [queueLen, setQueueLen] = useState(0);
  const lastCodeRef = useRef('');
  const lastAtRef = useRef(0);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const submitCodeRef = useRef<(code: string, method?: 'QR' | 'MANUAL') => Promise<void>>(async () => undefined);
  const seenLiveIdsRef = useRef<Set<string>>(new Set());
  const ownCheckInIdsRef = useRef<Set<string>>(new Set());
  const liveBootstrappedRef = useRef(false);
  const viewportId = `scanner-vp-${useId().replace(/:/g, '')}`;
  const [pageVisible, setPageVisible] = useState(
    () => (typeof document === 'undefined' ? true : document.visibilityState !== 'hidden')
  );

  const syncQueueLen = useCallback(() => setQueueLen(listQueuedScans().length), []);

  const showLivePass = useCallback((item: RecentItem) => {
    const spaceTitle = item.booking?.space?.title;
    setLast({
      ok: true,
      status: 'LIVE',
      message: 'Проход!',
      checkInId: item.id,
      guest: { name: item.user?.name, phone: item.user?.phone },
      event: {
        id: item.booking?.id,
        title: item.booking?.title,
        space: spaceTitle || null,
      },
      checkedAt: item.createdAt,
    });
    setShowResult(true);
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = 880;
      g.gain.value = 0.06;
      o.start();
      setTimeout(() => {
        o.stop();
        ctx.close();
      }, 160);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshStats = useCallback(async () => {
    try {
      const q = selectedEventId ? `?bookingId=${encodeURIComponent(selectedEventId)}` : '';
      const res = await fetch(`/api/scanner/check${q}`);
      if (!res.ok) return;
      const data = await res.json();
      setTodayCount(data.todayCount || 0);
      const list: RecentItem[] = Array.isArray(data.recent) ? data.recent : [];
      setRecent(list);
      setByMethod(data.byMethod && typeof data.byMethod === 'object' ? data.byMethod : {});
      setEventStats(data.eventStats || null);

      if (!liveBootstrappedRef.current) {
        for (const r of list) seenLiveIdsRef.current.add(r.id);
        liveBootstrappedRef.current = true;
        return;
      }

      for (const r of list) {
        if (seenLiveIdsRef.current.has(r.id)) continue;
        seenLiveIdsRef.current.add(r.id);
        if (ownCheckInIdsRef.current.has(r.id)) continue;
        showLivePass(r);
        break;
      }
    } catch {
      /* ignore */
    }
  }, [selectedEventId, showLivePass]);

  // Reset live cursor when event filter changes (avoid false fullscreen)
  useEffect(() => {
    liveBootstrappedRef.current = false;
    seenLiveIdsRef.current = new Set();
  }, [selectedEventId]);

  const refreshEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/scanner/events');
      if (!res.ok) return;
      const data = await res.json();
      setEvents(Array.isArray(data.events) ? data.events : []);
    } catch {
      /* ignore */
    }
  }, []);

  const beep = (ok: boolean) => {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = ok ? 880 : 220;
      g.gain.value = 0.05;
      o.start();
      setTimeout(() => {
        o.stop();
        ctx.close();
      }, ok ? 120 : 280);
    } catch {
      /* ignore */
    }
  };

  const postScan = useCallback(
    async (payload: { code: string; method: 'QR' | 'MANUAL'; bookingId?: string }) => {
      const res = await fetch('/api/scanner/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: payload.code,
          method: payload.method,
          bookingId: payload.bookingId || undefined,
        }),
      });
      const data = (await res.json()) as ScanResult;
      return { res, data };
    },
    []
  );

  const flushQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    const result = await flushQueuedScans(async (item: QueuedScan) => {
      try {
        const { res, data } = await postScan({
          code: item.code,
          method: item.method,
          bookingId: item.bookingId,
        });
        // Drop from queue on definitive server answer (ok or business error)
        return res.ok || (res.status >= 400 && res.status < 500 && data.status !== 'ERROR');
      } catch {
        return false;
      }
    });
    syncQueueLen();
    if (result.sent > 0) {
      refreshStats();
      refreshEvents();
    }
  }, [postScan, refreshEvents, refreshStats, syncQueueLen]);

  const submitCode = useCallback(
    async (code: string, method: 'QR' | 'MANUAL' = 'QR') => {
      const trimmed = code.trim();
      if (!trimmed || busy) return;

      const now = Date.now();
      if (trimmed === lastCodeRef.current && now - lastAtRef.current < 4000) {
        return;
      }
      lastCodeRef.current = trimmed;
      lastAtRef.current = now;

      setBusy(true);
      try {
        if (!navigator.onLine) {
          enqueueScan({
            code: trimmed,
            method,
            bookingId: selectedEventId || undefined,
          });
          syncQueueLen();
          setLast({
            ok: true,
            status: 'QUEUED',
            message: 'Нет сети — сканирование сохранено и отправится позже',
          });
          setShowResult(true);
          beep(true);
          return;
        }

        const { res, data } = await postScan({
          code: trimmed,
          method,
          bookingId: selectedEventId || undefined,
        });
        setLast(data);
        setShowResult(true);
        beep(!!data.ok);
        if (data.ok) {
          if (data.checkInId) {
            ownCheckInIdsRef.current.add(data.checkInId);
            seenLiveIdsRef.current.add(data.checkInId);
          }
          const { reachGoal } = await import('@/components/YandexMetrika');
          reachGoal('ticket_checkin');
          refreshStats();
          refreshEvents();
        } else if (!res.ok && res.status >= 500) {
          enqueueScan({
            code: trimmed,
            method,
            bookingId: selectedEventId || undefined,
          });
          syncQueueLen();
        }
      } catch {
        enqueueScan({
          code: trimmed,
          method,
          bookingId: selectedEventId || undefined,
        });
        syncQueueLen();
        setLast({
          ok: true,
          status: 'QUEUED',
          message: 'Сеть недоступна — код в очереди на отправку',
        });
        setShowResult(true);
        beep(true);
      } finally {
        setBusy(false);
      }
    },
    [busy, postScan, refreshStats, refreshEvents, selectedEventId, syncQueueLen]
  );

  submitCodeRef.current = submitCode;

  useEffect(() => {
    refreshStats();
    refreshEvents();
    syncQueueLen();
  }, [refreshStats, refreshEvents, syncQueueLen]);

  // Live door / other-device check-ins → fullscreen for the checker
  useEffect(() => {
    if (!pageVisible) return;
    const id = window.setInterval(() => {
      void refreshStats();
    }, 2000);
    return () => window.clearInterval(id);
  }, [pageVisible, refreshStats]);

  // Auto-dismiss live pass overlay so camera can resume
  useEffect(() => {
    if (!showResult || last?.status !== 'LIVE') return;
    const t = window.setTimeout(() => setShowResult(false), 4500);
    return () => window.clearTimeout(t);
  }, [showResult, last?.status, last?.checkInId]);

  useEffect(() => {
    if (selectedEventId) return;
    if (events.length === 1) setSelectedEventId(events[0].id);
  }, [events, selectedEventId]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      flushQueue();
    };
    const onOffline = () => setOnline(false);
    setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [flushQueue]);

  useEffect(() => {
    if (!showResult) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowResult(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showResult]);

  useEffect(() => {
    const onVis = () => {
      setPageVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', onVis);
    onVis();
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // html5-qrcode can throw outside React when the camera track dies in a background tab
  useEffect(() => {
    const isCameraNoise = (raw: unknown) => {
      const msg = typeof raw === 'string' ? raw : String((raw as { message?: string })?.message || raw || '');
      return /html5-qrcode|scanning context|NotReadableError|AbortError|Cannot clear|Cannot stop|IndexSizeError|getImageData|play\(\)/i.test(
        msg
      );
    };
    const onError = (event: ErrorEvent) => {
      if (!isCameraNoise(event.error || event.message)) return;
      event.preventDefault();
      if (document.visibilityState === 'hidden') return;
      setCameraError('Камера прервалась. Нажмите «Включить камеру» или вернитесь на вкладку.');
      setCameraPhase('error');
      setCameraOn(false);
    };
    const onReject = (event: PromiseRejectionEvent) => {
      if (!isCameraNoise(event.reason)) return;
      event.preventDefault();
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onReject);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onReject);
    };
  }, []);

  useEffect(() => {
    // Pause cleanly when the tab is hidden — html5-qrcode otherwise throws on a dead stream
    if (!cameraOn || showResult || !pageVisible) {
      if (!cameraOn) setCameraPhase((p) => (p === 'active' || p === 'requesting' ? 'idle' : p));
      return;
    }

    let cancelled = false;
    let scanner: Html5Qrcode | null = null;
    const hostId = viewportId;

    const safeStop = async (instance: Html5Qrcode | null) => {
      if (!instance) return;
      try {
        const state = instance.getState();
        if (
          state === Html5QrcodeScannerState.SCANNING ||
          state === Html5QrcodeScannerState.PAUSED
        ) {
          await instance.stop();
        }
      } catch {
        /* already stopped / stream gone after tab switch */
      }
      try {
        instance.clear();
      } catch {
        /* ignore */
      }
    };

    const waitForLayout = (): Promise<{ width: number; height: number }> =>
      new Promise((resolve) => {
        let attempts = 0;
        const tick = () => {
          const el = boxRef.current;
          const width = el?.clientWidth ?? 0;
          const height = el?.clientHeight ?? 0;
          if (width >= 160 && height >= 160) {
            resolve({ width, height });
            return;
          }
          attempts += 1;
          if (attempts >= 48) {
            resolve({ width: width || 320, height: height || 280 });
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

    const start = async () => {
      setCameraPhase('requesting');
      setCameraError('');
      try {
        const host = document.getElementById(hostId);
        if (!host) return;
        const { width, height } = await waitForLayout();
        if (cancelled) return;
        // Ensure a clean mount point (previous tab switch may leave video nodes)
        host.innerHTML = '';
        scanner = new Html5Qrcode(hostId, { verbose: false });
        if (cancelled) {
          await safeStop(scanner);
          return;
        }
        scannerRef.current = scanner;

        const side = Math.min(width, height);
        const boxSize = compact
          ? Math.max(180, Math.min(260, Math.floor(side * 0.72)))
          : Math.max(180, Math.min(280, Math.floor(side * 0.7)));

        const config = { fps: 8, qrbox: { width: boxSize, height: boxSize } };
        const onSuccess = (decoded: string) => {
          if (!cancelled) void submitCodeRef.current(decoded, 'QR');
        };
        const onFail = () => undefined;

        const tryStart = async (cameraConfig: string | MediaTrackConstraints) => {
          await scanner!.start(cameraConfig, config, onSuccess, onFail);
        };

        try {
          await tryStart({ facingMode: 'environment' });
        } catch (firstErr) {
          // Fallback: user camera, then first available device
          try {
            await tryStart({ facingMode: 'user' });
          } catch {
            const cameras = await Html5Qrcode.getCameras().catch(() => []);
            if (!cameras?.length) throw firstErr;
            await tryStart(cameras[0].id);
          }
        }
        if (cancelled) {
          await safeStop(scanner);
          return;
        }
        setCameraError('');
        setCameraPhase('active');
      } catch (err: unknown) {
        if (cancelled) return;
        const message =
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message?: unknown }).message || '')
            : String(err || '');
        const denied =
          /NotAllowedError|Permission|Permissions policy|Permission denied|NotReadableError|security/i.test(
            message
          );
        setCameraPhase(denied ? 'denied' : 'error');
        setCameraError(
          denied
            ? 'Нет доступа к камере. Разрешите камеру для этого сайта (замок у адреса → Камера) и снова нажмите «Включить камеру». Или введите / вставьте код TICKET-… вручную.'
            : message || 'Не удалось открыть камеру. Разрешите доступ или введите код вручную.'
        );
        await safeStop(scanner);
        scannerRef.current = null;
        setCameraOn(false);
      }
    };

    void start();

    return () => {
      cancelled = true;
      const instance = scanner || scannerRef.current;
      scannerRef.current = null;
      void safeStop(instance);
    };
  }, [cameraOn, showResult, compact, pageVisible, viewportId]);

  const ok = last?.ok;
  const selectedEvent = events.find((e) => e.id === selectedEventId);

  return (
    <div className={compact ? 'scanner-page scanner-page--compact' : 'scanner-page'}>
      <div className="scanner-header">
        <div className="scanner-title-row">
          <div className="scanner-title">
            <ScanLine size={compact ? 22 : 26} color="var(--primary)" /> Сканер билетов
          </div>
          {!compact ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm scanner-logout"
              onClick={() => void signOutLogged({ callbackUrl: '/login' })}
            >
              <LogOut size={15} aria-hidden /> Выйти
            </button>
          ) : null}
        </div>
        <p className="scanner-subtitle">
          Режим входа · сегодня: <strong>{todayCount}</strong>
          {eventStats ? (
            <>
              {' · событие: '}
              <strong>
                {eventStats.checkedCount}/{eventStats.registeredCount}
              </strong>
            </>
          ) : null}
          {' · '}
          {online ? (
            <span style={{ color: '#15803d', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Wifi size={14} /> онлайн
            </span>
          ) : (
            <span style={{ color: '#b45309', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <CloudOff size={14} /> офлайн
            </span>
          )}
          {queueLen > 0 && (
            <span style={{ marginLeft: 8, color: '#b45309', fontWeight: 600 }}>
              очередь: {queueLen}
            </span>
          )}
        </p>
      </div>

      {todayCount > 0 ? (
        <div
          className="card-surface"
          style={{
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.65rem 1rem',
            fontSize: '0.85rem',
          }}
        >
          <span>
            <strong>Сегодня</strong>: {todayCount}
          </span>
          {Object.entries(byMethod).map(([m, n]) => (
            <span key={m} style={{ color: 'var(--muted)' }}>
              {methodLabel(m)}: <strong style={{ color: 'var(--foreground)' }}>{n}</strong>
            </span>
          ))}
        </div>
      ) : null}

      {queueLen > 0 && (
        <div className="card-surface" style={{ padding: '0.85rem 1rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.9rem' }}>
            В очереди {queueLen} сканирований — отправятся при появлении сети
          </span>
          <button type="button" className="btn btn-secondary" onClick={() => flushQueue()} disabled={!online}>
            Отправить сейчас
          </button>
        </div>
      )}

      <div className="scanner-event card-surface">
        <label htmlFor="scanner-event-select">
          <Calendar size={16} /> Мероприятие (необязательно)
        </label>
        <select
          id="scanner-event-select"
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
        >
          <option value="">Авто: любой билет портала</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title}
              {ev.space?.title ? ` · ${ev.space.title}` : ''}
              {` · ${ev.checkedCount}/${ev.registeredCount}`}
            </option>
          ))}
        </select>
        {selectedEvent ? (
          <p className="scanner-event-hint">
            Фильтр: только «{selectedEvent.title}». Проверено: {selectedEvent.checkedCount} / {selectedEvent.registeredCount}
          </p>
        ) : (
          <p className="scanner-event-hint">
            QR уже содержит мероприятие — достаточно навести камеру. Фильтр нужен только если идут несколько событий сразу.
          </p>
        )}
      </div>

      <div
        className="scanner-camera card-surface"
        ref={boxRef}
        style={{ minHeight: compact ? 240 : 280 }}
      >
        <div id={viewportId} className="scanner-camera__viewport" />
        {!cameraOn && !cameraError && (
          <div className="scanner-camera-idle">
            <Camera size={36} aria-hidden />
            <p>Камера выключена — нажмите «Включить камеру», чтобы отсканировать QR с экрана или бумаги.</p>
            <p className="scanner-camera-idle__hint">Или введите / вставьте код вида TICKET-… ниже.</p>
          </div>
        )}
        {cameraPhase === 'requesting' && cameraOn && (
          <div className="scanner-camera-idle">
            <p>Запрашиваем доступ к камере…</p>
          </div>
        )}
        {cameraError && (
          <div className="scanner-camera-error">{cameraError}</div>
        )}
        {!pageVisible && cameraOn && !showResult && (
          <div className="scanner-camera-error" style={{ position: 'relative' }}>
            Камера на паузе, пока вкладка в фоне — вернитесь сюда, чтобы продолжить сканирование.
          </div>
        )}
      </div>

      <div className="scanner-actions">
        <button
          type="button"
          className={`btn ${cameraOn ? 'btn-secondary' : 'btn-primary'}`}
          onClick={() => {
            setCameraError('');
            setCameraOn((v) => !v);
          }}
        >
          <Camera size={16} aria-hidden />
          {cameraOn ? 'Пауза камеры' : 'Включить камеру'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            refreshStats();
            refreshEvents();
            flushQueue();
          }}
        >
          <RefreshCw size={16} /> Обновить
        </button>
      </div>

      <form
        className="scanner-manual"
        onSubmit={(e) => {
          e.preventDefault();
          submitCode(manual, 'MANUAL');
          setManual('');
        }}
      >
        <div className="scanner-manual__row">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="TICKET-… (ввод или вставка)"
            aria-label="Код билета TICKET"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
          />
          <button
            type="button"
            className="btn btn-secondary"
            title="Вставить из буфера"
            aria-label="Вставить код из буфера"
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText();
                if (text?.trim()) setManual(text.trim());
              } catch {
                setCameraError('Не удалось прочитать буфер — вставьте код вручную (Ctrl+V / ⌘V).');
              }
            }}
          >
            <ClipboardPaste size={16} aria-hidden />
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !manual.trim()}>
            Проверить
          </button>
        </div>
        <p className="scanner-manual__hint">
          Тот же код, что в QR на экране и в распечатке. Случайные строки и коды YM-… — неверный формат.
        </p>
      </form>

      {recent.length > 0 && (
        <div className="card-surface" style={{ marginTop: '1.25rem', padding: '1rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700 }}>Последние проходы</h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {recent.slice(0, 12).map((r) => (
              <li key={r.id} style={{ fontSize: '0.88rem', color: 'var(--muted)', borderBottom: '1px solid rgba(15,23,42,0.06)', paddingBottom: '0.4rem' }}>
                <strong style={{ color: 'var(--foreground)' }}>{r.user?.name || 'Гость'}</strong>
                {r.user?.phone ? ` · ${r.user.phone}` : ''}
                {r.booking?.title ? ` · ${r.booking.title}` : ''}
                {' · '}
                <span>{methodLabel(r.method)}</span>
                {' · '}
                {new Date(r.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showResult && last && (
        <div
          className={`scanner-result-overlay ${
            last.status === 'ALREADY_CHECKED' ? 'is-warn' : ok ? 'is-ok' : 'is-bad'
          }`}
          role="dialog"
          aria-modal="true"
          onClick={() => setShowResult(false)}
        >
          <div className="scanner-result-panel" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="scanner-result-close"
              onClick={() => setShowResult(false)}
              aria-label="Закрыть"
            >
              <X size={22} />
            </button>
            <div className="scanner-result-icon">
              {ok || last.status === 'ALREADY_CHECKED' ? <CheckCircle2 size={64} /> : <XCircle size={64} />}
            </div>
            <p className="scanner-result-status">{last.status}</p>
            <h2>{statusHeadline(last.status, last.message)}</h2>
            {last.message && last.status !== 'OK' && last.status !== 'LIVE' ? (
              <p className="scanner-result-message">{last.message}</p>
            ) : null}
            {last.guest?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="scanner-result-avatar"
                src={last.guest.image}
                alt=""
                width={72}
                height={72}
              />
            ) : null}
            {last.guest?.name && (
              <p className="scanner-result-guest">
                <strong>{last.guest.name}</strong>
                {last.guest.phone ? ` · ${last.guest.phone}` : ''}
              </p>
            )}
            {last.event?.title && (
              <p className="scanner-result-event">
                {last.event.title}
                {typeof last.event.space === 'object' && last.event.space?.title
                  ? ` · ${last.event.space.title}`
                  : typeof last.event.space === 'string' && last.event.space
                    ? ` · ${last.event.space}`
                    : ''}
              </p>
            )}
            {last.status === 'ALREADY_CHECKED' && last.checkedAt ? (
              <p className="scanner-result-stats">Первая отметка: {formatCheckedAt(last.checkedAt)}</p>
            ) : last.checkedAt && last.status === 'OK' ? (
              <p className="scanner-result-stats">Отмечен: {formatCheckedAt(last.checkedAt)}</p>
            ) : null}
            {last.stats ? (
              <p className="scanner-result-stats">
                На мероприятии: {last.stats.checkedCount} / {last.stats.registeredCount}
              </p>
            ) : eventStats ? (
              <p className="scanner-result-stats">
                На мероприятии: {eventStats.checkedCount} / {eventStats.registeredCount}
              </p>
            ) : (
              <p className="scanner-result-stats">Сегодня проходов: {todayCount}</p>
            )}
            <button type="button" className="btn btn-primary" onClick={() => setShowResult(false)}>
              Дальше
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
