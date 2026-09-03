'use client';

export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
  checks: { ok: boolean; text: string }[];
};

export function scorePassword(password: string): PasswordStrength {
  const checks = [
    { ok: password.length >= 10, text: 'Не меньше 10 символов' },
    { ok: /[A-Za-zА-Яа-яЁё]/.test(password), text: 'Есть буква' },
    { ok: /\d/.test(password), text: 'Есть цифра' },
    { ok: password.length >= 12 || /[^A-Za-zА-Яа-яЁё0-9]/.test(password), text: '12+ символов или спецсимвол' },
  ];
  const n = checks.filter((c) => c.ok).length;
  const score = (n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n === 3 ? 3 : 4) as 0 | 1 | 2 | 3 | 4;
  const map = [
    { label: 'Слишком короткий', color: '#94a3b8' },
    { label: 'Слабый', color: '#dc2626' },
    { label: 'Средний', color: '#d97706' },
    { label: 'Хороший', color: '#15803d' },
    { label: 'Надёжный', color: '#0f766e' },
  ] as const;
  return { score, label: map[score].label, color: map[score].color, checks };
}

export default function PasswordMeter({ password }: { password: string }) {
  const s = scorePassword(password);
  return (
    <div style={{ display: 'grid', gap: '0.35rem' }}>
      <div
        style={{
          height: 6,
          borderRadius: 99,
          background: '#e2e8f0',
          overflow: 'hidden',
        }}
        aria-hidden
      >
        <div
          style={{
            width: `${(s.score / 4) * 100}%`,
            height: '100%',
            background: s.color,
            transition: 'width 0.2s ease',
          }}
        />
      </div>
      <p style={{ margin: 0, fontSize: '0.8rem', color: s.color, fontWeight: 600 }}>{s.label}</p>
      <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.78rem', color: '#64748b' }}>
        {s.checks.map((c) => (
          <li key={c.text} style={{ color: c.ok ? '#15803d' : '#64748b' }}>
            {c.ok ? '✓' : '○'} {c.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
