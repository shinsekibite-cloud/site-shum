import { getAchievement } from '@/lib/achievements';
import type { PortfolioPayload } from '@/lib/portfolio';

/** Minimal payload shape used for snapshots / diffs (no user block required). */
export type PortfolioSnapshot = {
  headline: string | null;
  summary: string | null;
  coverImage: string | null;
  theme?: string;
  sections: { title: string; body: string; type: string; mediaUrl?: string | null }[];
  certificates: {
    title: string;
    issuer?: string | null;
    issuedAt?: string | null;
    fileUrl?: string | null;
    fileName?: string | null;
    mimeType?: string | null;
  }[];
  achievementCodes: string[];
};

export type PortfolioDiff = {
  isFirstSubmit: boolean;
  headline?: { from: string | null; to: string | null };
  summary?: { from: string | null; to: string | null };
  coverImageChanged?: boolean;
  theme?: { from: string | null; to: string | null };
  sections: { added: string[]; removed: string[]; changed: string[] };
  certificates: { added: string[]; removed: string[]; changed: string[] };
  achievements: { added: string[]; removed: string[] };
  summaryLines: string[];
};

export function snapshotFromPayload(payload: PortfolioPayload | PortfolioSnapshot): PortfolioSnapshot {
  return {
    headline: payload.headline ?? null,
    summary: payload.summary ?? null,
    coverImage: payload.coverImage ?? null,
    theme: payload.theme,
    sections: (payload.sections || []).map((s) => ({
      title: s.title,
      body: s.body,
      type: s.type,
      mediaUrl: s.mediaUrl ?? null,
    })),
    certificates: (payload.certificates || []).map((c) => ({
      title: c.title,
      issuer: c.issuer ?? null,
      issuedAt: c.issuedAt ?? null,
      fileUrl: c.fileUrl ?? null,
      fileName: c.fileName ?? null,
      mimeType: c.mimeType ?? null,
    })),
    achievementCodes: [...(payload.achievementCodes || [])],
  };
}

function norm(s: string | null | undefined) {
  return (s || '').trim();
}

function sectionKey(s: { title: string; body: string; type: string; mediaUrl?: string | null }) {
  return `${s.type}||${norm(s.title)}||${norm(s.body)}||${norm(s.mediaUrl || '')}`;
}

function certKey(c: {
  title: string;
  issuer?: string | null;
  issuedAt?: string | null;
  fileUrl?: string | null;
}) {
  return `${norm(c.title)}||${norm(c.issuer || '')}||${norm((c.issuedAt || '').slice(0, 10))}||${norm(c.fileUrl || '')}`;
}

export function buildPortfolioDiff(
  previous: PortfolioSnapshot | null | undefined,
  next: PortfolioSnapshot
): PortfolioDiff {
  const isFirstSubmit = !previous;
  const summaryLines: string[] = [];

  if (isFirstSubmit) {
    summaryLines.push('Первая отправка на проверку');
    if (next.headline) summaryLines.push(`Заголовок: «${next.headline}»`);
    if (next.sections.length) summaryLines.push(`Разделов: ${next.sections.length}`);
    if (next.certificates.length) summaryLines.push(`Грамот: ${next.certificates.length}`);
    if (next.achievementCodes.length) {
      summaryLines.push(`Достижений: ${next.achievementCodes.length}`);
    }
    return {
      isFirstSubmit: true,
      sections: {
        added: next.sections.map((s) => s.title),
        removed: [],
        changed: [],
      },
      certificates: {
        added: next.certificates.map((c) => c.title),
        removed: [],
        changed: [],
      },
      achievements: {
        added: next.achievementCodes.map((code) => getAchievement(code)?.title || code),
        removed: [],
      },
      summaryLines,
    };
  }

  const prev = previous!;
  const diff: PortfolioDiff = {
    isFirstSubmit: false,
    sections: { added: [], removed: [], changed: [] },
    certificates: { added: [], removed: [], changed: [] },
    achievements: { added: [], removed: [] },
    summaryLines: [],
  };

  if (norm(prev.headline) !== norm(next.headline)) {
    diff.headline = { from: prev.headline, to: next.headline };
    summaryLines.push(`Заголовок: «${prev.headline || '—'}» → «${next.headline || '—'}»`);
  }
  if (norm(prev.summary) !== norm(next.summary)) {
    diff.summary = { from: prev.summary, to: next.summary };
    summaryLines.push('Изменено описание');
  }
  if (norm(prev.coverImage) !== norm(next.coverImage)) {
    diff.coverImageChanged = true;
    summaryLines.push('Изменена обложка');
  }
  if ((prev.theme || 'MODERN') !== (next.theme || 'MODERN')) {
    diff.theme = { from: prev.theme || null, to: next.theme || null };
    summaryLines.push(`Тема: ${prev.theme || '—'} → ${next.theme || '—'}`);
  }

  const prevSectionsByTitle = new Map(prev.sections.map((s) => [norm(s.title).toLowerCase(), s]));
  const nextSectionsByTitle = new Map(next.sections.map((s) => [norm(s.title).toLowerCase(), s]));
  for (const [key, s] of nextSectionsByTitle) {
    const old = prevSectionsByTitle.get(key);
    if (!old) diff.sections.added.push(s.title);
    else if (sectionKey(old) !== sectionKey(s)) diff.sections.changed.push(s.title);
  }
  for (const [key, s] of prevSectionsByTitle) {
    if (!nextSectionsByTitle.has(key)) diff.sections.removed.push(s.title);
  }
  if (diff.sections.added.length) {
    summaryLines.push(`Разделы +: ${diff.sections.added.join(', ')}`);
  }
  if (diff.sections.changed.length) {
    summaryLines.push(`Разделы ~: ${diff.sections.changed.join(', ')}`);
  }
  if (diff.sections.removed.length) {
    summaryLines.push(`Разделы −: ${diff.sections.removed.join(', ')}`);
  }

  const prevCertsByTitle = new Map(prev.certificates.map((c) => [norm(c.title).toLowerCase(), c]));
  const nextCertsByTitle = new Map(next.certificates.map((c) => [norm(c.title).toLowerCase(), c]));
  for (const [key, c] of nextCertsByTitle) {
    const old = prevCertsByTitle.get(key);
    if (!old) diff.certificates.added.push(c.title);
    else if (certKey(old) !== certKey(c)) diff.certificates.changed.push(c.title);
  }
  for (const [key, c] of prevCertsByTitle) {
    if (!nextCertsByTitle.has(key)) diff.certificates.removed.push(c.title);
  }
  if (diff.certificates.added.length) {
    summaryLines.push(`Грамоты +: ${diff.certificates.added.join(', ')}`);
  }
  if (diff.certificates.changed.length) {
    summaryLines.push(`Грамоты ~: ${diff.certificates.changed.join(', ')}`);
  }
  if (diff.certificates.removed.length) {
    summaryLines.push(`Грамоты −: ${diff.certificates.removed.join(', ')}`);
  }

  const prevAch = new Set(prev.achievementCodes);
  const nextAch = new Set(next.achievementCodes);
  for (const code of nextAch) {
    if (!prevAch.has(code)) {
      diff.achievements.added.push(getAchievement(code)?.title || code);
    }
  }
  for (const code of prevAch) {
    if (!nextAch.has(code)) {
      diff.achievements.removed.push(getAchievement(code)?.title || code);
    }
  }
  if (diff.achievements.added.length) {
    summaryLines.push(`Достижения +: ${diff.achievements.added.join(', ')}`);
  }
  if (diff.achievements.removed.length) {
    summaryLines.push(`Достижения −: ${diff.achievements.removed.join(', ')}`);
  }

  if (!summaryLines.length) {
    summaryLines.push('Изменений относительно одобренной версии не видно (возможно, только порядок)');
  }
  diff.summaryLines = summaryLines;
  return diff;
}

export function parsePortfolioSnapshot(raw: string | null | undefined): PortfolioSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PortfolioSnapshot;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      headline: parsed.headline ?? null,
      summary: parsed.summary ?? null,
      coverImage: parsed.coverImage ?? null,
      theme: parsed.theme,
      sections: Array.isArray(parsed.sections) ? parsed.sections : [],
      certificates: Array.isArray(parsed.certificates) ? parsed.certificates : [],
      achievementCodes: Array.isArray(parsed.achievementCodes) ? parsed.achievementCodes : [],
    };
  } catch {
    return null;
  }
}

export function parsePortfolioDiff(raw: string | null | undefined): PortfolioDiff | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PortfolioDiff;
  } catch {
    return null;
  }
}

/** Next allowed submit time from last submittedAt and cooldown days (0 = unlimited). */
export function nextPortfolioSubmitAt(
  submittedAt: Date | string | null | undefined,
  cooldownDays: number
): Date | null {
  const days = Math.max(0, Math.floor(Number(cooldownDays) || 0));
  if (!days || !submittedAt) return null;
  const base = submittedAt instanceof Date ? submittedAt : new Date(submittedAt);
  if (!Number.isFinite(base.getTime())) return null;
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}
