import { createHash, createHmac } from 'crypto';
import { PRIVACY_POLICY_VERSION } from '@/lib/consent';
import { prisma } from '@/lib/prisma';
import { htmlToPlainText } from '@/lib/system-pages';
import { escapeHtml } from '@/lib/html-escape';
import { isNextBuildPhase } from '@/lib/build-phase';
import {
  applySitePlaceholders,
  DEFAULT_PUBLIC_ORIGIN,
  DEFAULT_SITE_NAME,
  getSiteIdentity,
} from '@/lib/site-identity';

export const PRIVACY_POLICY_TITLE = 'Политика конфиденциальности';

export function privacyIssuer(siteName: string) {
  return `Портал «${siteName || DEFAULT_SITE_NAME}»`;
}

export function privacySource(origin: string) {
  return `${(origin || DEFAULT_PUBLIC_ORIGIN).replace(/\/$/, '')}/privacy`;
}

/** Fallback body if CMS page is missing. */
export const PRIVACY_POLICY_BODY = `Редакция от 15.08.2026-members (РКН). Политика обработки персональных данных портала {{SITE_HOST}} («{{SITE_NAME}}»).

1. Оператор
Оператор — организация или ИП, администрирующая Портал. Реквизиты и email ответственного за ПДн — в разделе «Контакты» и настройках сайта. При необходимости оператор уведомляет Роскомнадзор об обработке ПДн.

2. Какие данные собираем
• Идентификационные: имя, фамилия, email, телефон.
• Профиль: дата рождения, пол (женский/мужской, опционально), город, фото аватара, личная галерея, «о себе», увлечения, интересы.
• Учётные: хэш пароля, роль, статус; хэш фразы восстановления (без открытого текста фразы).
• Участие: заявки, записи на мероприятия, брони, QR-/ручной check-in.
• Конкурсы (после входа): работы (фото, название, описание) и факты голосования.
• Вакансии (после входа): отклики и сведения в заявке.
• Портфолио и награды: загруженные файлы и описания опыта/грамот.
• Игры: рекорды и время прохождения.
• Социальные: друзья, личные сообщения; приглашения сходить в места каталога.
• Каталог «Куда сходить»: избранное, оценки, отзывы (до и после модерации).
• Галерея организации на главной и личная галерея пользователя.
• Технические: IP, сведения об устройстве/браузере, отпечаток устройства.
• Согласия: дата, версия и цифровая подпись политики, правил и cookie.
• мбаллы и купленная косметика профиля (виртуальные награды, не деньги).
Спецкатегории ПДн (здоровье, биометрия и т.п.) не запрашиваются.

3. Цели и основания
Согласие субъекта (в т.ч. отдельное согласие на обработку ПДн при регистрации), правила Портала, требования закона.
Цели: личный кабинет; заявки и мероприятия; конкурсы и вакансии для авторизованных участников; портфолио; мини-игры; эко-магазин оформления; email-уведомления; друзья и сообщения; гид по местам Сочи; безопасность аккаунта; Яндекс.Метрика только после согласия на аналитические cookie; ответы регуляторам и субъектам ПДн.

4. Cookies и метрика
Необходимые cookie — сессия и безопасность. Аналитика (Яндекс.Метрика) — только после согласия («Принять все» или категория «Аналитика»). Предпочтения интерфейса — отдельная категория. «Только необходимые» отключает аналитику и предпочтения. Изменить выбор: «Настройки cookie» в подвале. Google Analytics не используется.

5. Передача и поручение
Данные не продаются. Возможны: хостинг (РФ), почтовый сервис, Яндекс.Метрика (при согласии), требования органов власти РФ. Маршруты в Яндекс.Картах передают только выбранную точку, не анкету. Трансграничная передача — только по ст. 12 152-ФЗ.

6. Локализация баз данных
Запись, хранение и связанные операции с ПДн граждан РФ при сборе через Портал выполняются с использованием БД на территории РФ (ч. 5 ст. 18 152-ФЗ), кроме случаев, прямо указанных в законе.

7. Сроки хранения
• Активный аккаунт — пока нужен для целей обработки.
• Удаление: 30 дней на отзыв заявки, затем обезличивание.
• Служебный архив факта удаления — до 5 лет, затем уничтожение.
• Устройства и журналы входов — пока нужны для безопасности или до отзыва доверия.

8. Права субъекта
Сведения об обработке, уточнение, блокирование, уничтожение (в пределах закона), отзыв согласия, жалоба в Роскомнадзор или суд. Кабинет и {{SITE_ORIGIN}}/contacts.

9. Конфиденциальность профиля
Открытый / только друзья / закрытый. При скрытой видимости чужим могут показываться сказочный псевдоним и аватар-псевдоним.

10. Безопасность
HTTPS, роли, хэш паролей, фиксация согласий, ограничение действий с нового устройства (7 дней), лимиты запросов.

11. Изменения
Актуальная редакция — на странице политики. При смене версии согласия портал запрашивает повторное подтверждение. Версия согласия: 2026-08-15-members-engage.

12. Контакты
{{SITE_ORIGIN}}/contacts. Подписанный текст политики можно скачать на странице /privacy.`;

export type PrivacyCmsContent = {
  title: string;
  html: string;
  body: string;
  version: string;
  updatedAt: Date | null;
};

/** Load editable privacy policy from CMS (`PageContent` slug=privacy). */
export async function getPrivacyCmsContent(): Promise<PrivacyCmsContent> {
  if (isNextBuildPhase()) {
    return {
      title: PRIVACY_POLICY_TITLE,
      html: '',
      body: PRIVACY_POLICY_BODY,
      version: PRIVACY_POLICY_VERSION,
      updatedAt: null,
    };
  }
  try {
    const page = await prisma.pageContent.findUnique({ where: { slug: 'privacy' } });
    if (page?.content) {
      const version = page.updatedAt
        ? page.updatedAt.toISOString().slice(0, 10)
        : PRIVACY_POLICY_VERSION;
      return {
        title: page.title || PRIVACY_POLICY_TITLE,
        html: page.content,
        body: htmlToPlainText(page.content) || PRIVACY_POLICY_BODY,
        version,
        updatedAt: page.updatedAt,
      };
    }
  } catch (e) {
    console.warn('getPrivacyCmsContent', e);
  }
  return {
    title: PRIVACY_POLICY_TITLE,
    html: '',
    body: PRIVACY_POLICY_BODY,
    version: PRIVACY_POLICY_VERSION,
    updatedAt: null,
  };
}

function signingSecret() {
  return (
    process.env.DOCUMENT_SIGNING_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    'youngportal-dev-document-signing-key'
  );
}

export function privacyContentHash(body = PRIVACY_POLICY_BODY, version = PRIVACY_POLICY_VERSION) {
  return createHash('sha256').update(`${version}\n${body}`, 'utf8').digest('hex');
}

export function signPrivacyDocument(opts: {
  contentHash: string;
  version: string;
  issuedAt: string;
}) {
  const payload = `privacy|${opts.version}|${opts.contentHash}|${opts.issuedAt}`;
  const sig = createHmac('sha256', signingSecret()).update(payload, 'utf8').digest('hex').slice(0, 40);
  return `yp.doc.privacy.${opts.version}.${sig}`;
}

export function verifyPrivacySignature(opts: {
  contentHash: string;
  version: string;
  issuedAt: string;
  signature: string;
}) {
  const expected = signPrivacyDocument({
    contentHash: opts.contentHash,
    version: opts.version,
    issuedAt: opts.issuedAt,
  });
  return expected === opts.signature;
}

export type PrivacySignedDoc = {
  title: string;
  issuer: string;
  source: string;
  version: string;
  issuedAt: string;
  contentHash: string;
  signature: string;
  body: string;
  verifyUrl: string;
  plainText: string;
  html: string;
};

export async function buildSignedPrivacyDocument(
  issuedAt = new Date().toISOString()
): Promise<PrivacySignedDoc> {
  const identity = await getSiteIdentity();
  const cms = await getPrivacyCmsContent();
  const version = cms.version;
  const body = applySitePlaceholders(cms.body, identity);
  const title = cms.title || PRIVACY_POLICY_TITLE;
  const issuer = privacyIssuer(identity.siteName);
  const source = privacySource(identity.publicOrigin);
  const contentHash = privacyContentHash(body, version);
  const signature = signPrivacyDocument({ contentHash, version, issuedAt });
  const verifyUrl = `${identity.publicOrigin}/privacy/verify?v=${encodeURIComponent(version)}&h=${contentHash}&t=${encodeURIComponent(issuedAt)}&s=${encodeURIComponent(signature)}`;

  const stamp = [
    '────────────────────────────────────────',
    'ОФИЦИАЛЬНЫЙ ДОКУМЕНТ ПОРТАЛА',
    `${issuer}`,
    `Источник: ${source}`,
    `Версия: ${version}`,
    `Выпущено: ${issuedAt}`,
    `Отпечаток содержимого (SHA-256): ${contentHash}`,
    `Электронная подпись портала: ${signature}`,
    `Проверка подлинности: ${verifyUrl}`,
    '',
    'Если текст документа изменят после скачивания, проверка на сайте',
    `${identity.host}/privacy/verify покажет, что подпись не совпадает.`,
  ].join('\n');

  const plainText = [title, issuer, '', body, '', stamp].join('\n');

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} — ${escapeHtml(issuer)}</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; line-height: 1.55; color: #0f172a; max-width: 44rem; margin: 0 auto; padding: 1.5rem 1.1rem 3rem; }
  h1 { font-size: 1.45rem; margin: 0 0 0.35rem; }
  .sub { color: #64748b; margin: 0 0 1.25rem; }
  .body { white-space: pre-wrap; font-size: 0.98rem; }
  .stamp { margin-top: 2rem; padding: 1rem; border: 1px solid #cbd5e1; border-radius: 12px; background: #f8fafc; font-size: 0.82rem; color: #334155; white-space: pre-wrap; word-break: break-word; }
  a { color: #2563eb; }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="sub">${escapeHtml(issuer)} · версия ${escapeHtml(version)}</p>
  <div class="body">${escapeHtml(body)}</div>
  <div class="stamp">${escapeHtml(stamp)}
Проверка: <a href="${escapeHtml(verifyUrl)}">${escapeHtml(verifyUrl)}</a>
  </div>
</body>
</html>`;

  return {
    title,
    issuer,
    source,
    version,
    issuedAt,
    contentHash,
    signature,
    body,
    verifyUrl,
    plainText,
    html,
  };
}

