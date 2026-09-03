export const RKN_CHECK_LABELS: Record<string, string> = {
  operatorFilled: 'Реквизиты оператора заполнены',
  categoriesOk: 'Категории ПДн сверены',
  purposesOk: 'Цели обработки описаны',
  localizationOk: 'Локализация БД в РФ подтверждена',
  thirdPartiesOk: 'Третьи лица / поручение указаны',
  measuresOk: 'Меры защиты описаны',
  privacyPublished: 'Политика /privacy опубликована',
  rulesPublished: 'Правила /rules опубликованы',
  contactsPublished: 'Контакты с реквизитами опубликованы',
};

export const RKN_CHECK_KEYS = Object.keys(RKN_CHECK_LABELS);

export type RknPackDraft = {
  operatorFullName: string;
  operatorShortName: string;
  inn: string;
  ogrn: string;
  legalAddress: string;
  postalAddress: string;
  pdnEmail: string;
  pdnPhone: string;
  websiteUrl: string;
  purposeNotes: string;
  categoriesNotes: string;
  thirdPartiesNotes: string;
  localizationNotes: string;
  measuresNotes: string;
  preparedBy: string;
  preparedAt: string;
  checklist: Record<string, boolean>;
};

export const DEFAULT_RKN_PACK: RknPackDraft = {
  operatorFullName: '',
  operatorShortName: '',
  inn: '',
  ogrn: '',
  legalAddress: '',
  postalAddress: '',
  pdnEmail: '',
  pdnPhone: '',
  websiteUrl: '',
  purposeNotes:
    'Регистрация и личный кабинет; заявки и мероприятия; уведомления; безопасность; друзья/сообщения по желанию; аналитика после согласия; исполнение закона.',
  categoriesNotes:
    'ФИО, email, телефон; профиль; учётные данные; участие; сообщения; технические (IP/UA); согласия. Спецкатегории не собираются.',
  thirdPartiesNotes: 'Хостинг VPS (РФ); SMTP; Яндекс.Метрика (после opt-in).',
  localizationNotes: 'БД и сервер на территории РФ (ч. 5 ст. 18 152-ФЗ).',
  measuresNotes:
    'HTTPS, хеширование паролей, журнал входов, модерация, шифрованная выдача ПДн по запросу органов, резервное копирование.',
  preparedBy: '',
  preparedAt: '',
  checklist: {
    operatorFilled: false,
    categoriesOk: false,
    purposesOk: false,
    localizationOk: false,
    thirdPartiesOk: false,
    measuresOk: false,
    privacyPublished: false,
    rulesPublished: false,
    contactsPublished: false,
  },
};

export function parseRknPack(raw: string | null | undefined): RknPackDraft {
  const d = DEFAULT_RKN_PACK;
  if (!raw?.trim()) return { ...d, checklist: { ...d.checklist } };
  try {
    const j = JSON.parse(raw) as Partial<RknPackDraft>;
    return {
      ...d,
      ...j,
      checklist: { ...d.checklist, ...(j.checklist || {}) },
    };
  } catch {
    return { ...d, checklist: { ...d.checklist } };
  }
}

export function serializeRknPack(pack: RknPackDraft): string {
  return JSON.stringify(pack);
}

/** HTML document ready to print / save as PDF for RKN filing prep. */
export function buildRknDocumentHtml(pack: RknPackDraft, siteName: string): string {
  const rows = [
    ['Полное наименование', pack.operatorFullName],
    ['Краткое наименование', pack.operatorShortName],
    ['ИНН', pack.inn],
    ['ОГРН / ОГРНИП', pack.ogrn],
    ['Юридический адрес', pack.legalAddress],
    ['Почтовый адрес', pack.postalAddress],
    ['Email ответственного за ПДн', pack.pdnEmail],
    ['Телефон', pack.pdnPhone],
    ['Сайт', pack.websiteUrl],
    ['Цели обработки', pack.purposeNotes],
    ['Категории ПДн', pack.categoriesNotes],
    ['Третьи лица', pack.thirdPartiesNotes],
    ['Локализация', pack.localizationNotes],
    ['Меры защиты', pack.measuresNotes],
  ];
  const checklistHtml = Object.entries(pack.checklist)
    .map(([k, v]) => {
      const label = RKN_CHECK_LABELS[k] || k;
      return `<li>${v ? '☑' : '☐'} ${escape(label)}</li>`;
    })
    .join('');

  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"/><title>Подготовка уведомления РКН — ${escape(siteName)}</title>
<style>
body{font-family:Segoe UI,system-ui,sans-serif;max-width:820px;margin:24px auto;padding:0 16px;color:#0f172a;line-height:1.5}
h1{font-size:1.35rem} table{width:100%;border-collapse:collapse;margin:16px 0}
td,th{border:1px solid #cbd5e1;padding:8px 10px;vertical-align:top;font-size:0.9rem}
th{width:32%;background:#f8fafc;text-align:left}
.note{font-size:0.82rem;color:#64748b;margin-top:18px}
@media print{body{margin:0}}
</style></head><body>
<h1>Черновик материалов для уведомления оператора ПДн (Роскомнадзор)</h1>
<p>Портал: <strong>${escape(siteName)}</strong>. Документ подготовлен в панели управления для заполнения формы на pd.rkn.gov.ru. Не заменяет юридическую консультацию.</p>
<table>${rows
    .map(
      ([k, v]) =>
        `<tr><th>${escape(k)}</th><td>${escape(v || '— (заполнить)')}</td></tr>`
    )
    .join('')}</table>
<h2>Внутренний чеклист</h2>
<ul>${checklistHtml}</ul>
<p class="note">Подготовил: ${escape(pack.preparedBy || '—')} · ${escape(pack.preparedAt || new Date().toISOString())}</p>
</body></html>`;
}

function escape(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
