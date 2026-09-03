import type { ReactNode } from 'react';

type IconProps = { size?: number; className?: string };

function VkIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12.785 16.241s.288-.032.436-.194c.136-.148.132-.427.132-.427s-.02-1.304.586-1.496c.595-.19 1.36 1.26 2.17 1.816.613.42 1.078.328 1.078.328l2.164-.03s1.132-.07.595-.96c-.044-.073-.312-.657-1.607-1.856-1.356-1.255-1.174-.526.458-1.61.998-.666 1.397-1.073 1.271-1.32-.12-.236-.86-.174-.86-.174l-2.437.015s-.18-.025-.314.056c-.13.078-.214.26-.214.26s-.383.98-.893 1.814c-1.076 1.758-1.507 1.851-1.683 1.742-.41-.254-.307-1.02-.307-1.564 0-1.701.258-2.41-.503-2.594-.252-.06-.438-.1-1.083-.106-.828-.008-1.528.003-1.924.197-.264.128-.467.414-.343.43.154.02.502.094.687.346.238.325.23 1.055.23 1.055s.136 2.006-.318 2.255c-.312.171-.74-.178-1.66-1.772-.47-.82-.825-1.727-.825-1.727s-.068-.168-.19-.258c-.147-.11-.353-.145-.353-.145l-2.316.015s-.347.01-.475.161c-.114.134-.009.411-.009.411s1.795 4.2 3.826 6.317c1.862 1.94 3.974 1.812 3.974 1.812h.958z" />
    </svg>
  );
}

function TgIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M21.94 4.32 18.6 19.57c-.24 1.06-.87 1.32-1.76.82l-4.86-3.58-2.34 2.25c-.26.26-.48.48-.98.48l.35-4.95 9.01-8.14c.39-.35-.09-.54-.6-.2L6.55 12.7 1.75 11.2c-1.04-.32-1.06-1.04.22-1.57L20.6 3.4c.87-.32 1.63.2 1.34.92z" />
    </svg>
  );
}

function OkIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 9.75a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5zm0 1.5c-2.9 0-5.25-2.35-5.25-5.25S9.1.75 12 .75s5.25 2.35 5.25 5.25S14.9 11.25 12 11.25zm-3.58 3.05a.75.75 0 0 1 1.06.02c.7.73 1.58 1.1 2.52 1.1s1.82-.37 2.52-1.1a.75.75 0 1 1 1.08 1.04c-.98 1.02-2.24 1.56-3.6 1.56s-2.62-.54-3.6-1.56a.75.75 0 0 1 .02-1.06zm-.5 2.54a.75.75 0 0 1 1.06 0L12 19.86l3.02-3.02a.75.75 0 1 1 1.06 1.06l-3.02 3.02 1.76 1.76a.75.75 0 1 1-1.06 1.06L12 22.02l-1.76 1.76a.75.75 0 1 1-1.06-1.06l1.76-1.76-3.02-3.02a.75.75 0 0 1 0-1.06z" />
    </svg>
  );
}

function WaIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.91-7.01A9.86 9.86 0 0 0 12.04 2zm0 1.82c4.46 0 8.09 3.63 8.09 8.09 0 4.46-3.63 8.09-8.09 8.09-1.42 0-2.8-.37-4.01-1.07l-.29-.17-3.12.82.83-3.04-.18-.31a8.04 8.04 0 0 1-1.23-4.32c0-4.46 3.63-8.09 8.09-8.09zm4.52 10.3c-.25-.12-1.47-.72-1.7-.8-.23-.08-.39-.12-.56.12-.17.25-.64.8-.79.96-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.39-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.42h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74 2.49 1.07 2.49.71 2.94.67.45-.04 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.23-.17-.48-.29z" />
    </svg>
  );
}

function RutubeIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5v-13zm6.2 3.1v6.8l5.8-3.4-5.8-3.4z" />
    </svg>
  );
}

/** Official MAX messenger mark (go.max.ru/brandbook) — chat-bubble silhouette */
function MaxIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M50.7571 0.261719C78.2929 0.261719 99.8857 22.5974 99.8857 50.1474C99.8857 77.6974 77.6071 99.4903 51.0214 99.4903C41.5857 99.4903 37.0143 98.1617 29.65 92.9474C29.1429 92.5903 28.45 92.6831 28.0214 93.1403C22.3571 99.1831 7.85 103.426 7.18571 95.176C7.18571 80.7903 0 71.4474 0 49.876C0 21.5546 23.2214 0.261719 50.7571 0.261719ZM51.5286 24.8117C38.4643 24.126 28.2643 33.1974 26.0143 47.3831C24.15 59.1332 27.45 73.4546 30.2786 74.176C31.4786 74.4832 34.3571 72.276 36.4571 70.2974C36.85 69.926 37.45 69.8617 37.9071 70.1474C41.1786 72.1474 44.8786 73.6474 48.9571 73.8617C62.3714 74.5617 74.2571 64.0617 74.9643 50.6474C75.6643 37.2331 64.9429 25.5046 51.5286 24.8046V24.8117Z"
      />
    </svg>
  );
}

export type SocialKind = 'vk' | 'tg' | 'ok' | 'whatsapp' | 'rutube' | 'max';

/** Brand blue «Синий гигант» from MAX brandbook */
export const MAX_BRAND_COLOR = '#471AFF';

const META: Record<
  SocialKind,
  { label: string; color: string; Icon: (p: IconProps) => ReactNode }
> = {
  vk: { label: 'ВКонтакте', color: '#0077FF', Icon: VkIcon },
  tg: { label: 'Telegram', color: '#0088cc', Icon: TgIcon },
  ok: { label: 'Одноклассники', color: '#EE8208', Icon: OkIcon },
  whatsapp: { label: 'WhatsApp', color: '#25D366', Icon: WaIcon },
  rutube: { label: 'Rutube', color: '#1a1a1a', Icon: RutubeIcon },
  max: { label: 'MAX', color: MAX_BRAND_COLOR, Icon: MaxIcon },
};

export function SocialIconLink({
  kind,
  href,
  size = 40,
}: {
  kind: SocialKind;
  href: string;
  size?: number;
}) {
  const m = META[kind];
  const Icon = m.Icon;
  const iconSize = kind === 'max' ? Math.round(size * 0.52) : Math.round(size * 0.45);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={m.label}
      title={m.label}
      className="social-icon-link"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: '#f1f5f9',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: m.color,
        transition: 'transform 0.15s, background-color 0.15s',
        textDecoration: 'none',
        flexShrink: 0,
      }}
    >
      <Icon size={iconSize} />
    </a>
  );
}
