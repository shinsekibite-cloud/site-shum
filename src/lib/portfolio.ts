import { createHash, createHmac } from 'crypto';
import { getSiteIdentity } from '@/lib/site-identity';
import { ACHIEVEMENTS, CATEGORY_META, groupByAchievementCategory } from '@/lib/achievements';
import { prisma } from '@/lib/prisma';
import { escapeHtml } from '@/lib/html-escape';

export type PortfolioPayload = {
  headline: string | null;
  summary: string | null;
  coverImage: string | null;
  theme: string;
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
  user: {
    name: string | null;
    nickname?: string | null;
    city?: string | null;
    image?: string | null;
    publicCode?: string | null;
  };
};

function signingSecret() {
  return (
    process.env.DOCUMENT_SIGNING_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    'youngportal-dev-document-signing-key'
  );
}

export function hashPortfolioContent(payload: PortfolioPayload) {
  return createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex').slice(0, 48);
}

export function signPortfolioDocument(opts: {
  contentHash: string;
  userId: string;
  issuedAt: string;
}) {
  const payload = `${opts.contentHash}|${opts.userId}|${opts.issuedAt}`;
  return createHmac('sha256', signingSecret()).update(payload, 'utf8').digest('hex').slice(0, 40);
}

export function verifyPortfolioSignature(opts: {
  contentHash: string;
  userId: string;
  issuedAt: string;
  signature: string;
}) {
  const expected = signPortfolioDocument(opts);
  return expected === opts.signature;
}

export async function buildPortfolioHtml(opts: {
  payload: PortfolioPayload;
  contentHash: string;
  userId: string;
  issuedAt?: string;
  /** view | print (auto print) | download (auto save HTML file) */
  mode?: 'view' | 'print' | 'download';
}) {
  const identity = await getSiteIdentity();
  let logoUrl: string | null = null;
  try {
    const s = await prisma.siteSettings.findUnique({
      where: { id: '1' },
      select: { logoUrl: true },
    });
    logoUrl = s?.logoUrl || null;
  } catch {
    logoUrl = null;
  }
  const issuedAt = opts.issuedAt || new Date().toISOString();
  const signature = signPortfolioDocument({
    contentHash: opts.contentHash,
    userId: opts.userId,
    issuedAt,
  });
  const verifyUrl = `${identity.publicOrigin}/portfolio/verify?u=${encodeURIComponent(opts.userId)}&h=${opts.contentHash}&t=${encodeURIComponent(issuedAt)}&s=${encodeURIComponent(signature)}`;
  const p = opts.payload;
  const displayName = p.user.nickname || p.user.name || 'Участник';
  const avatarAbs = (() => {
    const img = p.user.image;
    if (!img) return '';
    if (img.startsWith('http')) return img;
    return `${identity.publicOrigin}${img.startsWith('/') ? img : `/${img}`}`;
  })();
  const achievementTitles = p.achievementCodes
    .map((code) => ACHIEVEMENTS.find((a) => a.code === code)?.title || code)
    .filter(Boolean);

  const certsHtml = p.certificates.length
    ? `<section class="block certs-block print-section">
        <h2>Грамоты, сертификаты, дипломы</h2>
        <div class="cert-list">
          ${p.certificates
            .map((c, idx) => {
              const meta = [c.issuer, c.issuedAt ? c.issuedAt.slice(0, 10) : null]
                .filter((x): x is string => Boolean(x))
                .map(escapeHtml)
                .join(' · ');
              const mime = (c.mimeType || '').toLowerCase();
              const nameHint = `${c.fileUrl || ''} ${c.fileName || ''}`.toLowerCase();
              const isImg =
                Boolean(c.fileUrl) &&
                (/^image\//.test(mime) ||
                  /\.(jpe?g|png|webp|gif)(\?|$)/i.test(nameHint));
              const isPdf =
                Boolean(c.fileUrl) &&
                (mime.includes('pdf') || /\.pdf(\?|$)/i.test(nameHint));
              const absFile =
                c.fileUrl && c.fileUrl.startsWith('http')
                  ? c.fileUrl
                  : c.fileUrl
                    ? `${identity.publicOrigin}${c.fileUrl.startsWith('/') ? c.fileUrl : `/${c.fileUrl}`}`
                    : '';
              const label = escapeHtml(c.fileName || c.title || 'Файл');
              let media = `<div class="cert-media is-empty">Файл не прикреплён</div>`;
              if (isImg && absFile) {
                media = `<div class="cert-media is-image">
                  <img src="${escapeHtml(absFile)}" alt="${escapeHtml(c.title)}" loading="eager"/>
                </div>`;
              } else if (isPdf && absFile) {
                media = `<div class="cert-media is-pdf" data-pdf-url="${escapeHtml(absFile)}">
                  <div class="cert-pdf-pages" data-pdf-pages></div>
                  <p class="cert-pdf-status no-print">Готовим страницы PDF для печати…</p>
                  <p class="cert-pdf-note no-print"><a href="${escapeHtml(absFile)}" target="_blank" rel="noopener">Открыть исходный PDF</a> · ${label}</p>
                </div>`;
              } else if (absFile) {
                media = `<div class="cert-media is-file">
                  <a href="${escapeHtml(absFile)}" target="_blank" rel="noopener">${label}</a>
                  <p class="cert-print-link">${escapeHtml(absFile)}</p>
                </div>`;
              }
              return `<article class="cert-card" id="cert-${idx + 1}">
                <div class="cert-meta">
                  <strong>${escapeHtml(c.title)}</strong>
                  ${meta ? `<div class="muted">${meta}</div>` : ''}
                </div>
                ${media}
              </article>`;
            })
            .join('')}
        </div>
      </section>`
    : '';

  const achGroups = groupByAchievementCategory(p.achievementCodes.map((code) => ({ code })));
  const achHtml = achGroups.length
    ? `<section class="block achs-block print-section">
        <h2>Достижения портала</h2>
        ${achGroups
          .map((group) => {
            const chips = group.items
              .map(({ code }) => {
                const def = ACHIEVEMENTS.find((a) => a.code === code);
                const title = escapeHtml(def?.title || code);
                const tier = def?.tier || 'bronze';
                return `<span class="ach-chip tier-${tier}">${title}</span>`;
              })
              .join('');
            return `<div class="ach-cat">
              <h3>${escapeHtml(CATEGORY_META[group.category].label)} <em>${group.items.length}</em></h3>
              <div class="ach-grid">${chips}</div>
            </div>`;
          })
          .join('')}
      </section>`
    : '';

  const logoSrc = logoUrl
    ? `${identity.publicOrigin}${logoUrl.startsWith('/') ? logoUrl : `/${logoUrl}`}`
    : `${identity.publicOrigin}/brand/logo-mark.png`;

  const issuedLabel = new Date(issuedAt).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  });

  const verifyShort = verifyUrl.replace(/^https?:\/\//, '');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <title>Портфолио — ${escapeHtml(displayName)} | ${escapeHtml(identity.siteName)}</title>
  <style>
    @page { margin: 12mm; size: A4; }
    :root {
      --ink: #0f172a;
      --muted: #64748b;
      --line: #e2e8f0;
      --sky: #0369a1;
      --card: #f8fafc;
    }
    * { box-sizing: border-box; }
    html { overflow-x: hidden; max-width: 100%; }
    body {
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      color: var(--ink);
      line-height: 1.55;
      margin: 0;
      padding: 0;
      background: #eef2f7;
      overflow-x: hidden;
      max-width: 100vw;
      word-wrap: break-word;
      overflow-wrap: anywhere;
    }
    .toolbar {
      position: sticky; top: 0; z-index: 20;
      display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between;
      padding: 12px 14px;
      background: rgba(15, 23, 42, 0.96);
      color: #fff;
      max-width: 100%;
    }
    .toolbar__title { font-size: 0.82rem; font-weight: 650; opacity: 0.9; }
    .toolbar__actions { display: flex; gap: 8px; flex-wrap: wrap; width: 100%; }
    .toolbar button {
      appearance: none; border: 0; cursor: pointer;
      border-radius: 10px; padding: 0.55rem 0.9rem;
      font: inherit; font-weight: 700; font-size: 0.85rem;
      flex: 1 1 auto; justify-content: center;
      display: inline-flex; align-items: center;
    }
    .toolbar .btn-print { background: #fff; color: #0f172a; }
    .toolbar .btn-pdf { background: #2563eb; color: #fff; }
    .toolbar .hint { font-size: 0.72rem; opacity: 0.75; width: 100%; line-height: 1.35; }
    .sheet {
      position: relative; z-index: 1;
      width: 100%;
      max-width: 860px;
      margin: 14px auto 36px;
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 12px 40px rgba(15,23,42,0.1);
      padding: 22px 14px 28px;
      overflow: visible;
    }
    .watermark {
      position: absolute; left: 0; right: 0; top: 28%;
      text-align: center; pointer-events: none; z-index: 0;
      opacity: 0.04; transform: rotate(-24deg);
      font-size: clamp(22px, 5vw, 40px); font-weight: 800;
      letter-spacing: 0.04em; color: #0f172a;
      max-width: 100%;
      padding: 0 8px;
      overflow: hidden;
    }
    .doc { position: relative; z-index: 1; max-width: 100%; overflow-x: clip; overflow-y: visible; }
    .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; min-width: 0; }
    .brand img { width: 40px; height: 40px; object-fit: contain; flex-shrink: 0; }
    .brand strong {
      font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--sky);
      line-height: 1.3; min-width: 0;
    }
    .hero-line {
      height: 4px; width: 64px; border-radius: 999px;
      background: linear-gradient(90deg, #0ea5e9, #2563eb);
      margin: 0 0 14px;
    }
    .hero-user { display:flex; gap:14px; align-items:center; margin:0 0 10px; min-width:0; }
    .hero-user img {
      width:88px; height:88px; border-radius:50%; object-fit:cover; flex-shrink:0;
      border:3px solid #e2e8f0; background:#f1f5f9;
    }
    .hero-user__text { min-width:0; flex:1; }
    h1 { font-size: clamp(1.35rem, 5vw, 1.85rem); margin: 0 0 6px; letter-spacing: -0.02em; overflow-wrap: anywhere; }
    .headline { font-size: 1rem; color: #334155; margin: 0 0 8px; font-weight: 600; overflow-wrap: anywhere; }
    .meta-row { display: flex; flex-wrap: wrap; gap: 6px 12px; color: var(--muted); font-size: 0.84rem; margin-bottom: 14px; }
    .summary {
      font-size: 0.95rem; color: #475569; margin: 0 0 8px;
      padding: 12px 14px; background: var(--card); border-radius: 12px; border: 1px solid var(--line);
      overflow-wrap: anywhere;
    }
    .block { margin: 18px 0 0; padding-top: 14px; border-top: 1px solid var(--line); }
    .block h2 {
      font-size: 0.72rem; margin: 0 0 10px; letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--muted); font-weight: 800;
      break-after: avoid; page-break-after: avoid;
    }
    .body { white-space: pre-wrap; color: #334155; font-size: 0.92rem; overflow-wrap: anywhere; }
    .section-card {
      padding: 12px 14px; border-radius: 12px; border: 1px solid var(--line);
      background: #fff; margin-bottom: 8px;
      break-inside: avoid; page-break-inside: avoid;
    }
    .cert-list { display: flex; flex-direction: column; gap: 16px; }
    .cert-card {
      border: 1px solid var(--line); border-radius: 14px; background: #fff;
      overflow: visible; max-width: 100%;
      break-inside: avoid; page-break-inside: avoid;
    }
    .cert-meta { padding: 10px 12px 8px; break-inside: avoid; page-break-inside: avoid; break-after: avoid; page-break-after: avoid; }
    .cert-meta strong { display: block; font-size: 0.95rem; line-height: 1.3; overflow-wrap: anywhere; }
    .cert-media { width: 100%; max-width: 100%; background: #f8fafc; }
    .cert-media.is-image { padding: 8px; text-align: center; }
    .cert-media.is-image img {
      display: block; width: 100%; max-width: 100%; height: auto;
      max-height: none; object-fit: contain; margin: 0 auto;
      border-radius: 8px;
      break-inside: avoid; page-break-inside: avoid;
    }
    .cert-media.is-pdf { padding: 8px; }
    .cert-pdf-pages { display: flex; flex-direction: column; gap: 10px; align-items: center; }
    .cert-pdf-pages img, .cert-pdf-pages canvas {
      display: block; width: 100%; max-width: 100%; height: auto;
      border-radius: 8px; background: #fff; box-shadow: 0 1px 4px rgba(15,23,42,0.08);
      break-inside: avoid; page-break-inside: avoid;
    }
    .cert-pdf-status {
      margin: 0; padding: 10px 8px 4px; font-size: 0.82rem; text-align: center; color: var(--muted); font-weight: 650;
    }
    .cert-pdf-status.is-ready { color: #0f766e; }
    .cert-pdf-status.is-error { color: #b91c1c; }
    .cert-pdf-note {
      margin: 0; padding: 8px 4px 4px; font-size: 0.8rem; text-align: center;
    }
    .cert-pdf-note a { color: var(--sky); font-weight: 700; }
    .cert-media.is-file, .cert-media.is-empty {
      padding: 28px 14px; text-align: center; font-weight: 700; color: var(--sky); font-size: 0.88rem;
    }
    .ach-cat {
      margin: 0 0 12px;
      break-inside: avoid; page-break-inside: avoid;
    }
    .ach-cat h3 {
      margin: 0 0 6px; font-size: 0.8rem; font-weight: 800; color: #334155;
      display: flex; align-items: baseline; gap: 8px;
      break-after: avoid; page-break-after: avoid;
    }
    .ach-cat h3 em {
      font-style: normal; font-size: 0.72rem; font-weight: 700; color: var(--muted);
    }
    .ach-grid { display: flex; flex-wrap: wrap; gap: 5px; }
    .ach-chip {
      display: inline-flex; align-items: center;
      padding: 0.22rem 0.5rem; border-radius: 999px;
      background: rgba(14,165,233,0.12); color: #0369a1;
      font-size: 0.72rem; font-weight: 700; line-height: 1.2;
      max-width: 100%; overflow-wrap: anywhere;
      break-inside: avoid; page-break-inside: avoid;
    }
    .ach-chip.tier-bronze { background: rgba(180,83,9,0.12); color: #b45309; }
    .ach-chip.tier-silver { background: rgba(100,116,139,0.14); color: #475569; }
    .ach-chip.tier-gold { background: rgba(202,138,4,0.14); color: #a16207; }
    .muted { color: var(--muted); font-size: 0.78rem; overflow-wrap: anywhere; }
    .stamp {
      margin-top: 22px; padding: 14px; border: 1px solid #cbd5e1; border-radius: 12px;
      font-size: 0.75rem; color: #334155; background: #f8fafc;
      max-width: 100%; overflow: hidden;
      break-inside: avoid; page-break-inside: avoid;
    }
    .stamp__title { font-weight: 800; margin-bottom: 8px; font-size: 0.85rem; color: #0f172a; }
    .stamp__grid { display: grid; gap: 6px; }
    .stamp__row { min-width: 0; max-width: 100%; }
    .stamp code, .stamp a, .break {
      display: block; max-width: 100%;
      overflow-wrap: anywhere; word-break: break-all;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.68rem; line-height: 1.4;
    }
    .stamp a { color: var(--sky); }
    .footer-note { margin-top: 12px; font-size: 0.76rem; color: var(--muted); line-height: 1.4; }
    @media print {
      html, body { background: #fff !important; overflow: visible !important; max-width: none !important; }
      .toolbar, .no-print { display: none !important; }
      .sheet {
        margin: 0 !important; box-shadow: none !important; border-radius: 0 !important;
        width: 100% !important; max-width: none !important; padding: 0 !important;
        overflow: visible !important;
      }
      .doc { overflow: visible !important; }
      .watermark { opacity: 0.03; }
      /* Start major blocks on a fresh page when they would orphan */
      .certs-block, .achs-block {
        break-before: page; page-break-before: always;
      }
      .block h2, .ach-cat h3, .cert-meta {
        break-after: avoid; page-break-after: avoid;
      }
      .section-card, .ach-cat, .stamp {
        break-inside: avoid; page-break-inside: avoid;
      }
      /* Image certificates stay together; multi-page PDF may split between pages */
      .cert-card:has(.cert-media.is-image),
      .cert-card:has(.cert-media.is-file),
      .cert-card:has(.cert-media.is-empty) {
        break-inside: avoid; page-break-inside: avoid;
      }
      .cert-card:has(.cert-media.is-pdf) {
        break-inside: auto; page-break-inside: auto;
      }
      .cert-card {
        margin-bottom: 14px; border: 1px solid #cbd5e1;
        overflow: visible !important;
      }
      .hero-user { break-inside: avoid; page-break-inside: avoid; }
      .hero-user img {
        width: 96px !important; height: 96px !important;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
      }
      .cert-media.is-image img,
      .cert-pdf-pages img {
        max-width: 100% !important;
        width: 100% !important;
        height: auto !important;
        max-height: 240mm !important;
        object-fit: contain !important;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
        break-inside: avoid; page-break-inside: avoid;
      }
      .ach-chip { break-inside: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      a { color: inherit; }
    }
    @media (max-width: 640px) {
      body { padding: 0; }
      .sheet { margin: 8px 8px 28px; padding: 16px 12px 22px; width: auto; max-width: none; }
      .toolbar__actions { flex-direction: column; }
      .toolbar button { width: 100%; }
    }
  </style>
</head>
<body data-mode="${escapeHtml(opts.mode || 'view')}" data-filename="portfolio-${escapeHtml(p.user.publicCode || opts.userId)}.html">
  <div class="toolbar no-print">
    <div style="min-width:0;flex:1">
      <div class="toolbar__title">Официальный документ портфолио</div>
      <div class="hint" id="yp-doc-hint">Готовим грамоты PDF… затем можно печатать или скачать файл</div>
    </div>
    <div class="toolbar__actions">
      <button type="button" class="btn-print" id="yp-btn-print" disabled>Распечатать</button>
      <button type="button" class="btn-pdf" id="yp-btn-download" disabled>Скачать файл</button>
    </div>
  </div>
  <div class="sheet">
    <div class="watermark">${escapeHtml(identity.siteName)}</div>
    <div class="doc">
      <div class="brand">
        <img src="${escapeHtml(logoSrc)}" alt=""/>
        <strong>${escapeHtml(identity.siteName)}</strong>
      </div>
      <div class="hero-line"></div>
      <div class="hero-user">
        ${avatarAbs ? `<img src="${escapeHtml(avatarAbs)}" alt=""/>` : `<div style="width:88px;height:88px;border-radius:50%;background:#e2e8f0;display:grid;place-items:center;font-weight:800;color:#64748b;flex-shrink:0;border:3px solid #e2e8f0">${escapeHtml((displayName||'?').slice(0,1))}</div>`}
        <div class="hero-user__text">
          <h1>${escapeHtml(displayName)}</h1>
          ${p.headline ? `<p class="headline">${escapeHtml(p.headline)}</p>` : ''}
        </div>
      </div>
      <div class="meta-row">
        ${p.user.city ? `<span>${escapeHtml(p.user.city)}</span>` : ''}
        ${p.user.publicCode ? `<span>ID ${escapeHtml(p.user.publicCode)}</span>` : ''}
        <span>Документ от ${escapeHtml(issuedLabel)} (МСК)</span>
      </div>
      ${p.summary ? `<p class="summary">${escapeHtml(p.summary).replace(/\n/g, '<br/>')}</p>` : ''}
      ${p.sections
        .map(
          (s) => `<section class="block">
        <h2>${escapeHtml(s.title)}</h2>
        <div class="section-card">
          <div class="body">${escapeHtml(s.body).replace(/\n/g, '<br/>')}</div>
        </div>
      </section>`
        )
        .join('')}
      ${certsHtml}
      ${achHtml}
      <div class="stamp">
        <div class="stamp__title">Электронная подпись портала</div>
        <div class="stamp__grid">
          <div class="stamp__row">Выдано: <strong>${escapeHtml(issuedLabel)} (МСК)</strong></div>
          <div class="stamp__row">Хеш: <code class="break">${escapeHtml(opts.contentHash)}</code></div>
          <div class="stamp__row">Подпись: <code class="break">${escapeHtml(signature)}</code></div>
          <div class="stamp__row">Проверка: <a class="break" href="${escapeHtml(verifyUrl)}">${escapeHtml(verifyShort)}</a></div>
        </div>
      </div>
      <p class="footer-note no-print">«Распечатать» открывает диалог печати. «Скачать файл» сохраняет HTML с картинками грамот (в т.ч. из PDF). Для PDF-файла в диалоге печати выберите «Сохранить как PDF».</p>
    </div>
  </div>
  <script type="module">
  const mode = document.body.dataset.mode || 'view';
  const filename = document.body.dataset.filename || 'portfolio.html';
  const hint = document.getElementById('yp-doc-hint');
  const btnPrint = document.getElementById('yp-btn-print');
  const btnDownload = document.getElementById('yp-btn-download');

  function setHint(text) { if (hint) hint.textContent = text; }

  function enableActions() {
    if (btnPrint) btnPrint.disabled = false;
    if (btnDownload) btnDownload.disabled = false;
  }

  function downloadFile() {
    // Replace canvases with images so the saved file is self-contained
    document.querySelectorAll('.cert-pdf-pages canvas').forEach((canvas) => {
      try {
        const img = document.createElement('img');
        img.src = canvas.toDataURL('image/jpeg', 0.92);
        img.alt = canvas.getAttribute('aria-label') || 'Страница PDF';
        canvas.replaceWith(img);
      } catch (e) { /* keep canvas */ }
    });
    const html = '<!DOCTYPE html>\\n' + document.documentElement.outerHTML;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setHint('Файл скачан. Откройте его или сохраните как PDF через печать.');
  }

  btnPrint?.addEventListener('click', () => window.print());
  btnDownload?.addEventListener('click', () => downloadFile());

  async function renderPdfs() {
    const blocks = Array.from(document.querySelectorAll('[data-pdf-url]'));
    if (!blocks.length) {
      setHint('Документ готов — распечатайте или скачайте файл');
      enableActions();
      return;
    }
    try {
      const pdfjs = await import('/pdfjs/pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      for (const block of blocks) {
        const url = block.getAttribute('data-pdf-url');
        const host = block.querySelector('[data-pdf-pages]');
        const status = block.querySelector('.cert-pdf-status');
        if (!url || !host) continue;
        try {
          const pdf = await pdfjs.getDocument({
            url,
            withCredentials: false,
            standardFontDataUrl: '/pdfjs/standard_fonts/',
          }).promise;
          const maxPages = Math.min(pdf.numPages, 8);
          for (let i = 1; i <= maxPages; i++) {
            const page = await pdf.getPage(i);
            const base = page.getViewport({ scale: 1 });
            const scale = Math.min(1.6, 900 / base.width);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { alpha: false });
            if (!ctx) continue;
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            canvas.style.width = '100%';
            canvas.style.height = 'auto';
            canvas.setAttribute('aria-label', 'PDF стр. ' + i);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport }).promise;
            host.appendChild(canvas);
          }
          if (status) {
            status.textContent = maxPages < pdf.numPages
              ? ('Показаны стр. 1–' + maxPages + ' из ' + pdf.numPages)
              : ('PDF: ' + pdf.numPages + ' стр. готовы к печати');
            status.classList.add('is-ready');
          }
        } catch (err) {
          if (status) {
            status.textContent = 'Не удалось отрисовать PDF — откройте исходный файл по ссылке';
            status.classList.add('is-error');
          }
          console.warn('pdf render', err);
        }
      }
      setHint('Грамоты из PDF готовы — можно печатать или скачать');
      enableActions();
    } catch (err) {
      console.warn('pdfjs', err);
      setHint('Документ готов (PDF-просмотр недоступен в этом браузере)');
      enableActions();
    }
  }

  await renderPdfs();
  // Wait a tick so rasterized images settle in layout before print/download
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  if (mode === 'print') {
    window.print();
  } else if (mode === 'download') {
    downloadFile();
  }
  </script>
</body>
</html>`;
}

export function toPortfolioPayload(row: {
  headline: string | null;
  summary: string | null;
  coverImage: string | null;
  theme: string;
  sections: { title: string; body: string; type: string; mediaUrl: string | null; isVisible: boolean; sortOrder: number }[];
  certificates: {
    title: string;
    issuer: string | null;
    issuedAt: Date | null;
    fileUrl: string | null;
    fileName: string | null;
    mimeType: string | null;
    isVisible: boolean;
    sortOrder: number;
  }[];
  achievementLinks: { code: string; sortOrder: number }[];
  user: {
    name: string | null;
    nickname: string | null;
    city: string | null;
    image: string | null;
    publicCode: string | null;
  };
}): PortfolioPayload {
  return {
    headline: row.headline,
    summary: row.summary,
    coverImage: row.coverImage,
    theme: row.theme,
    sections: [...row.sections]
      .filter((s) => s.isVisible)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({ title: s.title, body: s.body, type: s.type, mediaUrl: s.mediaUrl })),
    certificates: [...row.certificates]
      .filter((c) => c.isVisible)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => ({
        title: c.title,
        issuer: c.issuer,
        issuedAt: c.issuedAt ? c.issuedAt.toISOString() : null,
        fileUrl: c.fileUrl,
        fileName: c.fileName,
        mimeType: c.mimeType,
      })),
    achievementCodes: [...row.achievementLinks]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((a) => a.code),
    user: {
      name: row.user.name,
      nickname: row.user.nickname,
      city: row.user.city,
      image: row.user.image,
      publicCode: row.user.publicCode,
    },
  };
}
