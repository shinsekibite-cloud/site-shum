import Link from 'next/link';
import { ExternalLink, MessageCircle, Phone } from 'lucide-react';
import {
  activeGovWidgets,
  parseGovWidgetsJson,
  type GovWidget,
} from '@/lib/gov-widgets';

type Props = {
  enabled: boolean;
  title?: string | null;
  widgetsJson?: string | null;
  /** compact = slim strip (home); full = section with heading */
  variant?: 'compact' | 'full';
};

function WidgetLink({ widget }: { widget: GovWidget }) {
  if (widget.kind === 'iframe') {
    return (
      <div className="gov-widget-card">
        <div className="gov-widget-card-head">
          <h3>{widget.title}</h3>
        </div>
        <div className="gov-widget-frame-wrap">
          <iframe
            title={widget.title}
            src={widget.url}
            className="gov-widget-frame"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          />
        </div>
        {widget.note ? <p className="gov-widget-note">{widget.note}</p> : null}
      </div>
    );
  }

  const isVk = /vk\.(com|ru)/i.test(widget.url);
  const Icon = isVk ? MessageCircle : Phone;

  return (
    <a href={widget.url} target="_blank" rel="noopener noreferrer" className="gov-chip">
      <span className="gov-chip-icon" aria-hidden>
        <Icon size={16} />
      </span>
      <span className="gov-chip-text">
        <strong>{widget.title}</strong>
        {widget.note ? <span>{widget.note}</span> : null}
      </span>
      <ExternalLink size={14} className="gov-chip-ext" aria-hidden />
    </a>
  );
}

export default function GovWidgetsSection({
  enabled,
  title,
  widgetsJson,
  variant = 'compact',
}: Props) {
  if (!enabled) return null;
  const widgets = activeGovWidgets(parseGovWidgetsJson(widgetsJson));
  if (widgets.length === 0) return null;

  if (variant === 'compact') {
    return (
      <aside className="gov-strip" aria-label={title?.trim() || 'Госуслуги'}>
        <div className="gov-strip-label">
          <span className="gov-strip-kicker">{title?.trim() || 'Госуслуги'}</span>
          <span className="gov-strip-hint">официальные сервисы</span>
        </div>
        <div className="gov-strip-actions">
          {widgets.map((w) => (
            <WidgetLink key={w.id} widget={w} />
          ))}
        </div>
      </aside>
    );
  }

  return (
    <section className="home-section gov-widgets-section" aria-label="Государственные сервисы">
      <div className="home-section-head">
        <div>
          <h2 className="home-section-title">{title?.trim() || 'Государственные сервисы'}</h2>
          <p className="home-section-sub">Официальные сервисы для молодёжи</p>
        </div>
        <Link href="https://www.gosuslugi.ru/" className="home-section-link" target="_blank" rel="noopener noreferrer">
          Госуслуги <ExternalLink size={16} />
        </Link>
      </div>
      <div className="gov-widgets-grid">
        {widgets.map((w) => (
          <WidgetLink key={w.id} widget={w} />
        ))}
      </div>
    </section>
  );
}
