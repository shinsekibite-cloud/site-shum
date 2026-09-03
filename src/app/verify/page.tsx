'use client';

import { useSafeSearchParams } from '@/lib/use-safe-search-params';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { safeCallbackUrl } from '@/lib/safe-callback-url';

function VerifyForm() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSafeSearchParams();
  const email = searchParams.get('email');
  const callbackUrl = safeCallbackUrl(searchParams.get('callbackUrl'), '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Отсутствует email для подтверждения');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });

      if (res.ok) {
        setSuccess(true);
        const loginPath = callbackUrl
          ? `/login?registered=1&callbackUrl=${encodeURIComponent(callbackUrl)}`
          : '/login?registered=1';
        setTimeout(() => router.push(loginPath), 2000);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.message || 'Неверный код');
      }
    } catch {
      setError('Произошла ошибка при отправке данных');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      className="glass"
      style={{ width: '100%', maxWidth: '450px', padding: '1.25rem' }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h1 className="text-gradient auth-form-title">
        Подтверждение
      </h1>

      <p style={{ textAlign: 'center', color: 'var(--muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
        {email ? (
          <>
            Код отправлен на <strong>{email}</strong>.
          </>
        ) : (
          'Введите код из письма.'
        )}
      </p>
      <p style={{ textAlign: 'center', color: 'var(--muted)', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
        Если письма нет — проверьте «Спам» или обратитесь к администратору.
      </p>

      {success && (
        <div
          style={{
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            color: '#15803d',
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1rem',
            fontSize: '0.9rem',
            fontWeight: 500,
            textAlign: 'center',
          }}
        >
          Email подтверждён! Переход на страницу входа...
        </div>
      )}

      {error && (
        <div
          style={{
            backgroundColor: 'rgba(244, 63, 94, 0.1)',
            color: 'var(--accent)',
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1rem',
            fontSize: '0.9rem',
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.9rem' }}>
            Код подтверждения из Email
          </label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
            required
            disabled={success}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(0,0,0,0.1)',
              outline: 'none',
              textAlign: 'center',
              letterSpacing: '0.15em',
              fontSize: '1.35rem',
            }}
            placeholder="12345678"
            maxLength={8}
          />
        </div>

        <button type="submit" disabled={loading || success} className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
          {loading ? 'Проверка...' : 'Подтвердить'}
        </button>
      </form>
    </motion.div>
  );
}

export default function VerifyPage() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 'calc(100vh - 4rem - 100px)',
        padding: '1rem',
      }}
    >
      <VerifyForm />
    </div>
  );
}
