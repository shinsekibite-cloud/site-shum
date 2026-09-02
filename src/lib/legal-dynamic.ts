import type { AccessSettings } from '@/lib/access-settings';
import type { ModerationConfig } from '@/lib/moderation-config';
import { DEFAULT_MODERATION_CONFIG } from '@/lib/moderation-config';
import type { ModuleFlags, ModuleFlagKey } from '@/lib/module-flags';
import { MODULE_FLAG_META } from '@/lib/module-flags';

export type LegalDynamicInput = {
  siteName: string;
  operatorName: string | null;
  operatorInn: string | null;
  operatorOgrn: string | null;
  pdnResponsibleEmail: string | null;
  contactEmail: string | null;
  address: string | null;
  cookieBannerEnabled: boolean;
  analyticsConsentRequired: boolean;
  copyProtectionEnabled: boolean;
  access: AccessSettings;
  moderation: ModerationConfig;
  modules?: ModuleFlags;
};

const MODULE_ORDER: ModuleFlagKey[] = [
  'registration',
  'messaging',
  'friends',
  'events',
  'tickets_scan',
  'places',
  'gallery',
  'projects',
  'clubs',
  'spaces',
  'grants',
  'dobro',
  'self_gov',
  'vacancies',
  'contests',
  'games',
  'news',
  'portfolio',
  'eco',
  'achievements',
  'ratings',
  'club_chat',
  'applications',
  'notifications',
  'documents',
  'referrals',
  'faq',
  'presentation',
  'server_status',
  'bots',
  'maintenance',
];

function escape(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function moduleLines(modules?: ModuleFlags) {
  if (!modules) return '';
  const on: string[] = [];
  const off: string[] = [];
  for (const key of MODULE_ORDER) {
    if (key === 'maintenance' || key === 'server_status' || key === 'bots') continue;
    const meta = MODULE_FLAG_META[key];
    const label = meta?.label || key;
    if (modules[key]) on.push(label);
    else off.push(label);
  }
  // modules.maintenance === true → сайт в штатном режиме (НЕ на техработах)
  const maint =
    modules.maintenance === false
      ? '<li><strong>Технические работы:</strong> сайт временно на обслуживании — публичный доступ ограничен.</li>'
      : '';
  return `
    <li><strong>Доступные разделы сейчас:</strong> ${on.length ? escape(on.join(', ')) : 'нет'}.</li>
    <li><strong>Временно недоступные разделы:</strong> ${off.length ? escape(off.join(', ')) : 'нет'}.</li>
    ${maint}
    <li>Если раздел отключён, связанные возможности (общение, заявки, мбаллы, достижения и т.п.) <strong>недоступны</strong>, пока оператор не включит их снова. Базовые тексты Политики и Правил описывают полный функционал; этот блок отражает <em>текущий</em> контекст.</li>
  `;
}

/** Auto-generated appendix that reflects live SiteSettings + module flags. */
export function buildLegalDynamicAppendix(input: LegalDynamicInput): string {
  const op = [
    input.operatorName || 'оператор Портала (реквизиты уточняются в разделе «Контакты»)',
    input.operatorInn ? `ИНН ${input.operatorInn}` : null,
    input.operatorOgrn ? `ОГРН/ОГРНИП ${input.operatorOgrn}` : null,
    input.pdnResponsibleEmail || input.contactEmail
      ? `email: ${input.pdnResponsibleEmail || input.contactEmail}`
      : null,
    input.address || null,
  ]
    .filter(Boolean)
    .join('; ');

  const reg = input.access.registrationEnabled
    ? 'Самостоятельная регистрация на Портале <strong>открыта</strong>.'
    : 'Самостоятельная регистрация на Портале <strong>временно закрыта</strong>. Новые аккаунты создаются только по решению оператора.';

  const msg = input.access.messagingEnabled
    ? 'Личные сообщения и чаты клубов/проектов <strong>доступны</strong> при включённых соответствующих разделах (личные — как правило друзьям; командные — участникам).'
    : 'Сейчас действует <strong>режим тишины</strong>: личные сообщения между обычными пользователями <strong>недоступны</strong>. Сотрудники могут продолжать служебную переписку.';

  const mod = input.moderation.enabled
    ? `Автопроверка переписок <strong>включена</strong> (скрытие запрещённого контента, предупреждения` +
      (input.moderation.autoBlockWarnThreshold > 0
        ? `, возможная блокировка после ${input.moderation.autoBlockWarnThreshold} предупреждений`
        : '') +
      ').'
    : 'Автопроверка переписок <strong>отключена</strong> в настройках.';

  const cookies = input.cookieBannerEnabled
    ? input.analyticsConsentRequired
      ? 'Баннер cookie включён; аналитика загружается только после согласия.'
      : 'Баннер cookie включён; требование согласия на аналитику ослаблено в настройках (уточняйте у оператора).'
    : 'Баннер cookie отключён в настройках — оператор несёт ответственность за соответствие 152-ФЗ.';

  const copy = input.copyProtectionEnabled
    ? 'На Портале включена защита контента от массового копирования.'
    : 'Защита от копирования контента отключена.';

  const twoFa = `<li><strong>Двухфакторная защита:</strong> в настройках кабинета можно включить подтверждение входа по одноразовому коду из приложения-аутентификатора. Храните секрет и фразу восстановления в безопасности; при утрате доступа обратитесь в поддержку.</li>`;

  const faqLine =
    input.modules?.faq === false
      ? '<li><strong>Вопросы и ответы:</strong> раздел временно недоступен.</li>'
      : '<li><strong>Вопросы и ответы:</strong> частые вопросы — на странице <a href="/faq">«Часто задаваемые вопросы»</a>.</li>';

  return `
<section data-legal-dynamic="1" class="legal-dynamic-block">
  <h2 id="legal-live-settings">Актуальные параметры Портала (автообновление)</h2>
  <p>Раздел формируется автоматически по настройкам сайта «${escape(input.siteName)}» и текущему составу доступных разделов. При изменении настроек администрацией текст ниже обновляется без правки CMS и без смены версии согласия.</p>
  <ul>
    <li><strong>Оператор / реквизиты:</strong> ${escape(op)}</li>
    <li><strong>Регистрация:</strong> ${reg}</li>
    <li><strong>Сообщения:</strong> ${msg}</li>
    <li><strong>Модерация:</strong> ${mod}</li>
    <li><strong>Cookie и аналитика:</strong> ${cookies}</li>
    <li><strong>Защита контента:</strong> ${copy}</li>
    <li><strong>Лимиты сообщений (при включённой модерации):</strong> до ${input.moderation.rateLimits.perMinute}/мин и ${input.moderation.rateLimits.perHour}/час; макс. длина ${input.moderation.maxMessageLength} символов.</li>
    ${twoFa}
    ${faqLine}
    ${input.modules?.contests !== false ? '<li><strong>Конкурсы:</strong> каталог, подача работ и голосование доступны только участникам после входа. Обрабатываются работы (фото, название, описание) и факты голоса.</li>' : ''}
    ${input.modules?.vacancies !== false ? '<li><strong>Вакансии:</strong> просмотр и отклики доступны только после входа. В заявке обрабатываются указанные соискателем сведения.</li>' : ''}
    ${input.modules?.portfolio !== false ? '<li><strong>Портфолио:</strong> загруженные файлы и описания опыта/грамот обрабатываются для витрины профиля (после модерации, с учётом настроек видимости).</li>' : ''}
    ${input.modules?.games !== false ? '<li><strong>Игры:</strong> рекорды и время прохождения сохраняются на устройстве и в рейтинге аккаунта.</li>' : ''}
    ${moduleLines(input.modules)}
  </ul>
  <p>Передача персональных данных по законному требованию органов власти РФ оформляется оператором с фиксацией выдачи. Подробности — у ответственного за ПДн.</p>
</section>`.trim();
}

export function buildRulesDynamicAppendix(input: LegalDynamicInput): string {
  const parts: string[] = [];
  if (!input.access.registrationEnabled || input.modules?.registration === false) {
    parts.push(
      'Регистрация новых пользователей закрыта. Попытки обойти ограничение могут рассматриваться как нарушение правил.'
    );
  }
  if (!input.access.messagingEnabled || input.modules?.messaging === false) {
    parts.push(
      'Действует режим тишины / раздел сообщений отключён: личные сообщения между пользователями недоступны. Обращения к администрации — через контакты или заявки на Портале.'
    );
  } else {
    parts.push(
      'В переписке (личные и командные чаты клубов/проектов) запрещены мат, угрозы, экстремизм и иной контент, запрещённый законодательством РФ. Нарушения влекут предупреждение, снижение авторитета и соцрейтинга, а также блокировку.'
    );
    parts.push(
      'Закрепление и архив диалогов — личные предпочтения inbox и не скрывают переписку от модерации.'
    );
    if (input.modules?.ratings !== false) {
      parts.push(
        'На портале действуют два рейтинга: авторитет (посещаемость и правила) и соцрейтинг (друзья, галерея, общение).'
      );
    }
    if (input.modules?.eco !== false) {
      parts.push('мбаллы начисляются за полезную активность и тратятся на оформление профиля.');
    }
  }
  if (input.modules?.club_chat === false) {
    parts.push('Чаты клубов и проектов временно отключены — командное общение недоступно.');
  }
  if (input.modules?.achievements === false) {
    parts.push('Раздел достижений временно отключён.');
  }
  if (input.modules?.ratings === false) {
    parts.push('Отображение рейтингов временно отключено.');
  }
  if (input.modules?.eco === false) {
    parts.push('мбаллы и магазин оформления временно недоступны.');
  }
  if (input.modules?.faq === false) {
    parts.push('Раздел FAQ временно отключён.');
  }
  if (input.modules?.contests !== false) {
    parts.push(
      'Конкурсы: подача работ и голосование — только после входа. Запрещены чужие работы без права публикации, накрутка голосов и повторные аккаунты.'
    );
  }
  if (input.modules?.vacancies !== false) {
    parts.push(
      'Вакансии и отклики доступны после входа. Указывайте достоверные сведения; обход антибот-защиты запрещён.'
    );
  }
  if (input.modules?.games !== false) {
    parts.push('Мини-игры сохраняют рекорды. Накрутка очков и читы запрещены.');
  }
  if (input.modules?.vacancies === false) {
    parts.push('Раздел вакансий временно отключён — отклики и авто-скрининг недоступны.');
  }
  if (input.modules?.contests === false) {
    parts.push('Раздел конкурсов временно отключён — подача работ и голосование недоступны.');
  }
  if (input.modules?.places === false) {
    parts.push('Раздел «Куда сходить» временно отключён.');
  }
  if (input.modules?.events === false) {
    parts.push('Афиша и запись на мероприятия временно отключены.');
  }
  if (input.modules?.tickets_scan === false) {
    parts.push('Сканирование билетов и QR-вход временно недоступны.');
  }
  if (input.modules?.projects === false) {
    parts.push('Каталог проектов и связанные заявки/чаты временно недоступны.');
  }
  if (input.modules?.clubs === false) {
    parts.push('Каталог клубов и связанные заявки/чаты временно недоступны.');
  }
  if (input.modules?.spaces === false) {
    parts.push('Бронирование пространств временно недоступно.');
  }
  if (input.modules?.grants === false) {
    parts.push('Раздел грантов временно недоступен.');
  }
  if (input.modules?.dobro === false) {
    parts.push('Раздел «Добро» временно недоступен.');
  }
  if (input.modules?.self_gov === false) {
    parts.push('Раздел самоуправления временно недоступен.');
  }
  if (input.modules?.applications === false) {
    parts.push('Подача и просмотр заявок временно отключены.');
  }
  if (input.modules?.notifications === false) {
    parts.push('Уведомления и push временно отключены.');
  }
  if (input.modules?.documents === false) {
    parts.push('Раздел документов временно недоступен.');
  }
  if (input.modules?.referrals === false) {
    parts.push('Реферальная программа временно отключена.');
  }
  if (input.modules?.friends === false) {
    parts.push('Раздел друзей временно отключён.');
  }
  if (input.modules?.gallery === false) {
    parts.push('Галереи временно недоступны.');
  }
  if (input.modules?.games === false) {
    parts.push('Мини-игры временно отключены.');
  }
  if (input.modules?.news === false) {
    parts.push('Лента новостей временно недоступна.');
  }
  if (input.modules?.portfolio === false) {
    parts.push('Портфолио и публичные витрины достижений временно недоступны.');
  }
  // maintenance true = site OK
  if (input.modules?.maintenance === false) {
    parts.push('Объявлен режим технических работ: публичный доступ к Порталу ограничен.');
  }
  // Explicit ON lines so documents always mirror current feature set
  const enabledHints: string[] = [];
  if (input.modules?.events !== false) enabledHints.push('афиша');
  if (input.modules?.projects !== false) enabledHints.push('проекты');
  if (input.modules?.clubs !== false) enabledHints.push('клубы');
  if (input.modules?.spaces !== false) enabledHints.push('пространства');
  if (input.modules?.portfolio !== false) enabledHints.push('портфолио и награды');
  if (input.modules?.contests !== false) enabledHints.push('конкурсы (после входа)');
  if (input.modules?.vacancies !== false) enabledHints.push('вакансии (после входа)');
  if (input.modules?.games !== false) enabledHints.push('мини-игры');
  if (input.modules?.eco !== false) enabledHints.push('эко-магазин');
  if (enabledHints.length) {
    parts.push(`Сейчас доступны в штатном режиме: ${enabledHints.join(', ')}.`);
  }
  if (input.moderation.enabled && input.moderation.autoBlockWarnThreshold > 0) {
    parts.push(
      `После ${input.moderation.autoBlockWarnThreshold} предупреждений модерации аккаунт может быть заблокирован автоматически.`
    );
  }
  parts.push(
    'Рекомендуем включить двухфакторную аутентификацию в настройках кабинета и хранить фразу восстановления отдельно от устройства.'
  );
  parts.push(
    'Если какой‑либо раздел отключён оператором, связанные с ним функции и обязанности пользователя на период отключения не применяются.'
  );
  if (parts.length === 1) {
    parts.unshift('Все основные разделы Портала доступны в штатном режиме. Соблюдайте Правила и законодательство РФ.');
  }

  return `
<section data-legal-dynamic="1" class="legal-dynamic-block">
  <h2 id="rules-live-settings">Текущий режим Портала</h2>
  <p>Блок обновляется по настройкам и статусу разделов «${escape(input.siteName)}». Отключённый раздел означает, что связанные возможности пользователя на период отключения недоступны.</p>
  <ul>${parts.map((p) => `<li>${p}</li>`).join('')}</ul>
</section>`.trim();
}

export function buildTermsDynamicAppendix(input: LegalDynamicInput): string {
  return buildRulesDynamicAppendix(input).replace('id="rules-live-settings"', 'id="terms-live-settings"').replace(
    'Текущий режим Портала',
    'Текущий режим сервиса'
  );
}

export function stripPreviousDynamicBlocks(html: string) {
  return html.replace(/<section[^>]*data-legal-dynamic="1"[^>]*>[\s\S]*?<\/section>/gi, '').trim();
}

export { DEFAULT_MODERATION_CONFIG };
