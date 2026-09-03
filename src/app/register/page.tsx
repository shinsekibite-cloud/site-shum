'use client';

import AuthHomeLink from '@/components/AuthHomeLink';
import CaptchaField from '@/components/CaptchaField';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { RU_EMAIL_HINT, isRussianEmail } from '@/lib/ru-email';
import { safeCallbackUrl } from '@/lib/safe-callback-url';
import { useSafeSearchParams } from '@/lib/use-safe-search-params';
import { formatPhoneMaskInput, normalizePhone } from '@/lib/phone';
import PasswordMeter from '@/components/PasswordMeter';

function RegisterForm() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [pdConsentAccepted, setPdConsentAccepted] = useState(false);
  const [error, setError] = useState('');
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const router = useRouter();
  const searchParams = useSafeSearchParams();
  const refFromUrl = (searchParams.get('ref') || '').trim();
  function readRefCookie() {
    try {
      const m = document.cookie.match(/(?:^|; )yp_ref=([^;]*)/);
      return m ? decodeURIComponent(m[1]) : '';
    } catch {
      return '';
    }
  }
  const callbackUrl = safeCallbackUrl(searchParams.get('callbackUrl'), '');
  // empty fallback: register may omit redirect

  useEffect(() => {
    fetch('/api/public/status')
      .then((r) => r.json())
      .then((d) => {
        if (d && d.registrationEnabled === false) setRegistrationEnabled(false);
      })
      .catch(() => undefined);
  }, []);

  const withCallback = (path: string) => {
    const safe = safeCallbackUrl(callbackUrl, '');
    if (!safe) return path;
    const join = path.includes('?') ? '&' : '?';
    return `${path}${join}callbackUrl=${encodeURIComponent(safe)}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const nextErr: Record<string, string> = {};

    if (!firstName.trim() || !lastName.trim()) {
      nextErr.name = 'Имя и фамилия обязательны';
    }
    if (!isRussianEmail(email)) {
      nextErr.email = RU_EMAIL_HINT;
    }
    if (password.length < 10) {
      nextErr.password = 'Пароль — минимум 10 символов';
    } else if (!/[A-Za-zА-Яа-яЁё]/.test(password) || !/\d/.test(password)) {
      nextErr.password = 'Пароль должен содержать буквы и цифры';
    }
    if (password !== password2) {
      nextErr.password2 = 'Пароли не совпадают';
    }
    if (normalizePhone(phone).length < 11) {
      nextErr.phone = 'Укажите телефон в формате +7 (XXX) XXX-XX-XX';
    }
    if (!privacyAccepted) {
      nextErr.privacy = 'Примите политику и правила';
    }
    if (!pdConsentAccepted) {
      nextErr.pd = 'Нужно согласие на обработку персональных данных';
    }
    if (!captchaToken) {
      nextErr.captcha = 'Пройдите проверку «я не робот»';
    }
    setFieldErr(nextErr);
    if (Object.keys(nextErr).length) {
      setError(Object.values(nextErr)[0]);
      return;
    }
    if (!birthDate) {
      setError('Укажите дату рождения');
      return;
    }
    {
      const d = new Date(birthDate);
      if (Number.isNaN(d.getTime())) {
        setError('Некорректная дата рождения');
        return;
      }
      const now = new Date();
      let age = now.getFullYear() - d.getFullYear();
      const m = now.getMonth() - d.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
      if (age < 14) {
        setError('Регистрация доступна с 14 лет');
        return;
      }
    }
    if (phone.replace(/\D/g, '').length < 11) {
      setError('Укажите корректный российский телефон');
      return;
    }
    if (!captchaToken) {
      setError('Пройдите проверку «я не робот»');
      return;
    }

    setLoading(true);

    try {
      const name = `${firstName.trim()} ${lastName.trim()}`;
      let fingerprint: string | undefined;
      try {
        const { collectDeviceFingerprint } = await import('@/lib/device-fingerprint');
        fingerprint = await collectDeviceFingerprint();
      } catch {
        fingerprint = undefined;
      }
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          phone,
          password,
          birthDate,
          privacyAccepted: true,
          personalDataConsent: true,
          captchaToken,
          website: '',
          ref: refFromUrl || readRefCookie() || undefined,
          fingerprint,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const { reachGoal } = await import('@/components/YandexMetrika');
        reachGoal('register');
        try {
          const { writeCookieConsent } = await import('@/lib/cookie-consent');
          const { COOKIES_POLICY_VERSION } = await import('@/lib/consent-versions');
          // Necessary cookies only at signup; analytics — via ConsentBanner («Принять все»)
          writeCookieConsent({ analytics: false, preferences: false }, COOKIES_POLICY_VERSION);
        } catch {
          /* ignore */
        }
        if (data.requiresVerification) {
          router.push(withCallback('/verify?email=' + encodeURIComponent(data.email)));
        } else {
          const { signIn } = await import('next-auth/react');
          const loginRes = await signIn('credentials', {
            redirect: false,
            email: email.trim().toLowerCase(),
            password,
          });
          if (loginRes?.ok) {
            window.location.assign(safeCallbackUrl(callbackUrl, '/dashboard'));
            return;
          }
          router.push(withCallback('/login?registered=1'));
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.message || 'Ошибка при регистрации');
      }
    } catch {
      setError('Произошла ошибка при отправке данных');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="yp-auth-shell">
      <motion.div
        className="yp-auth-card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <AuthHomeLink />
        <p className="yp-auth-brand">Молодёжь Сочи</p>
        <h1 className="yp-auth-title">Регистрация</h1>
        <p className="yp-auth-lead">
          Простая форма, жёсткая проверка: email-код, возраст 14+, согласия и пароль с буквами и цифрами.
        </p>

        {!registrationEnabled ? (
          <div className="yp-auth-alert yp-auth-alert--warn">
            Регистрация временно закрыта администрацией. Если у вас уже есть аккаунт —{' '}
            <Link href={withCallback('/login')}>войдите</Link>
            . Вопросы — через <Link href="/contacts">контакты</Link>.
          </div>
        ) : null}

        {error && <div className="yp-auth-alert yp-auth-alert--error">{error}</div>}

        <form
          onSubmit={handleSubmit}
          className="yp-auth-form"
          style={{ display: registrationEnabled ? 'flex' : 'none' }}
          aria-busy={loading}
        >
          <div className="yp-auth-grid-2">
            <div>
              <label className="yp-auth-label">Имя *</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => {
                setFirstName(e.target.value);
                setFieldErr((p) => ({ ...p, name: '' }));
              }}
                required
                disabled={loading}
                className="yp-auth-input"
                placeholder="Иван"
              />
            </div>
            <div>
              <label className="yp-auth-label">Фамилия *</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                disabled={loading}
                className="yp-auth-input"
                placeholder="Иванов"
              />
            </div>
          </div>

          <div>
            <label className="yp-auth-label">Email (РФ)</label>
            <input
              type="email"
              autoComplete="email"
              name="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFieldErr((p) => {
                  const next = { ...p };
                  if (e.target.value && !isRussianEmail(e.target.value)) next.email = RU_EMAIL_HINT;
                  else delete next.email;
                  return next;
                });
              }}
              required
              disabled={loading}
              className="yp-auth-input"
              placeholder="vash@mail.ru"
            />
            {fieldErr.email ? <p className="yp-auth-hint" style={{ color: '#b91c1c' }}>{fieldErr.email}</p> : (
            <p className="yp-auth-hint">{RU_EMAIL_HINT}</p>
            )}
          </div>

          <div>
            <label className="yp-auth-label">Телефон</label>
            <input
              type="tel"
              autoComplete="tel"
              name="phone"
              value={phone}
              onChange={(e) => {
                setPhone(formatPhoneMaskInput(e.target.value));
                setFieldErr((p) => ({ ...p, phone: '' }));
              }}
              required
              disabled={loading}
              className="yp-auth-input"
              placeholder="+7 (999) 000-00-00"
            />
            {fieldErr.phone ? <p className="yp-auth-hint" style={{ color: '#b91c1c' }}>{fieldErr.phone}</p> : null}
          </div>

          <div>
            <label className="yp-auth-label">Пароль</label>
            <input
              type="password"
              autoComplete="new-password"
              name="password"
              minLength={10}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setFieldErr((p) => {
                  const next = { ...p };
                  if (e.target.value.length && e.target.value.length < 10) next.password = 'Пароль — минимум 10 символов';
                  else delete next.password;
                  return next;
                });
              }}
              required
              disabled={loading}
              className="yp-auth-input"
              placeholder="минимум 10 символов"
            />
            <PasswordMeter password={password} />
            {fieldErr.password ? <p className="yp-auth-hint" style={{ color: '#b91c1c' }}>{fieldErr.password}</p> : (
            <p className="yp-auth-hint">Буквы и цифры обязательны. Подтверждение придёт на email.</p>
            )}
          </div>

          <div>
            <label className="yp-auth-label">Повтор пароля</label>
            <input
              type="password"
              autoComplete="new-password"
              name="password2"
              minLength={10}
              value={password2}
              onChange={(e) => {
                setPassword2(e.target.value);
                setFieldErr((p) => ({
                  ...p,
                  password2: e.target.value && e.target.value !== password ? 'Пароли не совпадают' : '',
                }));
              }}
              required
              disabled={loading}
              className="yp-auth-input"
              placeholder="••••••••••"
            />
            {fieldErr.password2 ? <p className="yp-auth-hint" style={{ color: '#b91c1c' }}>{fieldErr.password2}</p> : null}
          </div>

          <div>
            <label className="yp-auth-label">Дата рождения *</label>
            <input
              type="date"
              name="birthDate"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              required
              disabled={loading}
              max={new Date().toISOString().slice(0, 10)}
              className="yp-auth-input"
            />
            <p className="yp-auth-hint">Регистрация доступна с 14 лет (152-ФЗ).</p>
          </div>

          <label className="yp-auth-check" style={{ fontSize: '0.95rem', lineHeight: 1.5 }}>
            <input
              type="checkbox"
              checked={privacyAccepted}
              onChange={(e) => setPrivacyAccepted(e.target.checked)}
              required
            />
            <span>
              Я принимаю{' '}
              <Link href="/privacy" target="_blank" rel="noreferrer" style={{ fontWeight: 800, textDecoration: 'underline' }}>
                Политику конфиденциальности
              </Link>
              {', '}
              <Link href="/rules" target="_blank" rel="noreferrer" style={{ fontWeight: 800, textDecoration: 'underline' }}>
                Правила сайта
              </Link>
              {' и '}
              <Link href="/terms" target="_blank" rel="noreferrer" style={{ fontWeight: 800, textDecoration: 'underline' }}>
                Пользовательское соглашение
              </Link>
              .
            </span>
          </label>
          {fieldErr.privacy ? <p className="yp-auth-hint" style={{ color: '#b91c1c' }}>{fieldErr.privacy}</p> : null}

          <label className="yp-auth-check">
            <input
              type="checkbox"
              checked={pdConsentAccepted}
              onChange={(e) => setPdConsentAccepted(e.target.checked)}
              required
            />
            <span>
              Отдельно даю согласие на обработку персональных данных в целях работы портала согласно{' '}
              <Link href="/privacy" target="_blank">политике конфиденциальности</Link>.
            </span>
          </label>

          <CaptchaField onToken={setCaptchaToken} />
          <button
            type="submit"
            disabled={loading || !privacyAccepted || !pdConsentAccepted}
            className="btn btn-primary yp-auth-submit"
          >
            {loading ? 'Отправляем…' : 'Зарегистрироваться'}
          </button>
        </form>

        <p className="yp-auth-footer">
          Уже есть аккаунт?{' '}
          <Link href={callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : '/login'}>
            Войти
          </Link>
        </p>
      </motion.div>
    </div>
  );
}

export default function Register() {
  return <RegisterForm />;
}
