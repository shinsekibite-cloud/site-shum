/** Russian email domains / TLDs for registration */

const RU_FREE_HOSTS = new Set([
  'mail.ru',
  'bk.ru',
  'list.ru',
  'inbox.ru',
  'internet.ru',
  'yandex.ru',
  'ya.ru',
  'yandex.com',
  'yandex.by',
  'yandex.kz',
  'rambler.ru',
  'lenta.ru',
  'autorambler.ru',
  'myrambler.ru',
  'ro.ru',
  'vk.com',
  'ok.ru',
]);

const RU_TLDS = ['.ru', '.su', '.рф'];

export function isRussianEmail(email: string): boolean {
  const normalized = String(email || '')
    .trim()
    .toLowerCase();
  if (!normalized.includes('@')) return false;
  const host = normalized.split('@').pop() || '';
  if (!host || host.includes('..')) return false;
  if (RU_FREE_HOSTS.has(host)) return true;
  // punycode for .рф
  if (host.endsWith('.xn--p1ai')) return true;
  return RU_TLDS.some((tld) => host.endsWith(tld));
}

export const RU_EMAIL_HINT =
  'Регистрация только с российских почт: .ru, .su, .рф или Mail/Yandex/Rambler и др.';
