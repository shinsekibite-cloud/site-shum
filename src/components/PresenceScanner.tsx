'use client';

import { useCallback, useEffect, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import Link from 'next/link';

type ScanResult = {
  ok?: boolean;
  already?: boolean;
  message?: string;
  code?: string;
  canWalkIn?: boolean;
  user?: {
    displayName?: string;
    publicCode?: string | null;
    image?: string | null;
    mBall?: number;
    ecoBall?: number;
  };
  scores?: { mBall: number; ecoBall: number };
  context?: unknown;
};

export default function PresenceScanner() {
  const [manual, setManual] = useState('');
  const [spaceId, setSpaceId] = useState('');
  const [spaces, setSpaces] = useState<Array<{ id: string; title: string }>>([]);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/coworking')
      .then((r) => r.json())
      .then((d) => setSpaces((d.spaces || []).map((s: { id: string; title: string }) => ({ id: s.id, title: s.title }))))
      .catch(() => undefined);
  }, []);

  const submit = useCallback(
    async (token: string, walkIn = false) => {
      if (!token || busy) return;
      setBusy(true);
      setResult(null);
      try {
        const r = await fetch('/api/scan/check', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, spaceId: spaceId || null, walkIn }),
        });
        const data = await r.json();
        setResult(data);
      } catch {
        setResult({ ok: false, message: 'Сеть недоступна' });
      } finally {
        setBusy(false);
      }
    },
    [busy, spaceId]
  );

  useEffect(() => {
    let scanner: Html5Qrcode | null = null;
    let stopped = false;
    (async () => {
      try {
        scanner = new Html5Qrcode('presence-qr-reader');
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 8, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            if (!stopped) void submit(decoded);
          },
          () => undefined
        );
      } catch (e) {
        setCamError((e as Error).message || 'Камера недоступна — введите код вручную');
      }
    })();
    return () => {
      stopped = true;
      if (scanner) {
        scanner
          .stop()
          .then(() => scanner?.clear())
          .catch(() => undefined);
      }
    };
  }, [submit]);

  return (
    <div className="presence-scan">
      <div className="presence-scan-head">
        <h1>Скан пропуска</h1>
        <p>Личный QR участника · чек-ин и баллы</p>
        <Link href="/scanner" className="btn btn-secondary">
          К сканеру билетов
        </Link>
      </div>

      <label className="cw-field">
        <span>Площадка (для walk-in)</span>
        <select value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
          <option value="">— авто —</option>
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </label>

      <div id="presence-qr-reader" className="presence-scan-cam" />
      {camError ? <p className="cw-error">{camError}</p> : null}

      <form
        className="presence-scan-manual"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(manual);
        }}
      >
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Вставьте ссылку /c/… или токен"
          aria-label="Код QR"
        />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          Проверить
        </button>
      </form>

      {result ? (
        <div className={`presence-scan-result ${result.ok ? 'is-ok' : 'is-bad'}`}>
          <strong>{result.message}</strong>
          {result.user ? (
            <div className="presence-scan-user">
              {result.user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={result.user.image} alt="" width={56} height={56} />
              ) : (
                <div className="presence-scan-avatar" />
              )}
              <div>
                <div>{result.user.displayName}</div>
                <div className="presence-muted">{result.user.publicCode}</div>
                {result.scores ? (
                  <div>
                    +{result.scores.mBall} М-балл
                    {result.scores.ecoBall ? ` · +${result.scores.ecoBall} Зел.` : ''}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          {result.canWalkIn ? (
            <button type="button" className="btn btn-primary" disabled={busy || !spaceId} onClick={() => submit(manual, true)}>
              Посадить walk-in
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
