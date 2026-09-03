/** Parse maintenance/contest ETA into a future Date, or null if not countdown-capable. */

export function parseEtaDeadline(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  // Pure minutes duration (legacy text like "30")
  if (/^\d{1,5}$/.test(trimmed)) {
    const minutes = Number(trimmed);
    if (minutes > 0 && minutes <= 60 * 24 * 30) {
      return new Date(Date.now() + minutes * 60_000);
    }
  }

  const ms = Date.parse(trimmed);
  if (!Number.isNaN(ms)) return new Date(ms);
  return null;
}

export function formatCountdown(msLeft: number): string {
  if (msLeft <= 0) return '00:00:00';
  const totalSec = Math.floor(msLeft / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (d > 0) return `${d}д ${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
