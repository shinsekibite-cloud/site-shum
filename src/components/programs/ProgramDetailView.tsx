import Link from 'next/link';
import { ArrowLeft, Calendar, ExternalLink, MapPin, Users, Wallet } from 'lucide-react';
import ApplyButton from '@/components/ApplyButton';
import ShareButton from '@/components/ShareButton';
import ContentRenderer from '@/components/ContentRenderer';
import {
  BODY_TYPE_LABELS,
  PROGRAM_KIND_META,
  PROGRAM_STATUS_LABELS,
  formatProgramDate,
  programIsApplyOpen,
  programPublicPath,
  type ProgramKind,
} from '@/lib/programs';
import { programCover } from '@/lib/theme-covers';

type Program = {
  id: string;
  kind: string;
  title: string;
  summary: string | null;
  description: string;
  image: string | null;
  status: string;
  organizer: string | null;
  place: string | null;
  externalUrl: string | null;
  amountLabel: string | null;
  bodyType: string | null;
  seats: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
};

export default function ProgramDetailView({
  program,
  applicationStatus,
  approvedCount,
}: {
  program: Program;
  applicationStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedCount: number;
}) {
  const kind = program.kind as ProgramKind;
  const meta = PROGRAM_KIND_META[kind];
  const canApply = programIsApplyOpen(program.status, program.endsAt);
  const ends = formatProgramDate(program.endsAt);
  const starts = formatProgramDate(program.startsAt);
  const body = program.bodyType ? BODY_TYPE_LABELS[program.bodyType] : null;
  const seatsLeft =
    typeof program.seats === 'number' ? Math.max(0, program.seats - approvedCount) : null;

  const cover = programCover(program, 0);

  return (
    <div style={{ minHeight: 'auto', paddingBottom: '5rem', backgroundColor: '#fafafa' }}>
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 'min(420px, 55vh)',
          backgroundImage: `url(${cover})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to top, rgba(15,23,42,0.92) 0%, rgba(15,23,42,0.25) 55%, rgba(15,23,42,0.35) 100%)',
          }}
        />
        <div
          className="container"
          style={{
            position: 'absolute',
            top: '1.5rem',
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'space-between',
            zIndex: 20,
          }}
        >
          <Link
            href={programPublicPath(kind)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              color: '#fff',
              fontWeight: 600,
              textDecoration: 'none',
              background: 'rgba(15,23,42,0.35)',
              padding: '0.45rem 0.85rem',
              borderRadius: 999,
              backdropFilter: 'blur(6px)',
            }}
          >
            <ArrowLeft size={18} /> {meta.title}
          </Link>
          <ShareButton title={program.title} />
        </div>
        <div
          className="container"
          style={{
            position: 'absolute',
            bottom: '1.75rem',
            left: 0,
            right: 0,
            zIndex: 10,
            color: '#fff',
          }}
        >
          <div
            style={{
              display: 'inline-block',
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              opacity: 0.9,
              marginBottom: '0.65rem',
              background: 'rgba(255,255,255,0.15)',
              padding: '0.25rem 0.65rem',
              borderRadius: 999,
            }}
          >
            {PROGRAM_STATUS_LABELS[program.status] || program.status}
          </div>
          <h1 style={{ fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', fontWeight: 800, margin: 0, lineHeight: 1.2 }}>
            {program.title}
          </h1>
          {program.summary && (
            <p style={{ margin: '0.75rem 0 0', maxWidth: 640, opacity: 0.92, fontSize: '1.05rem', lineHeight: 1.5 }}>
              {program.summary}
            </p>
          )}
        </div>
      </div>

      <div className="container" style={{ marginTop: '-1.5rem', position: 'relative', zIndex: 5 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 320px)',
            gap: '1.25rem',
            alignItems: 'start',
          }}
          className="program-detail-grid"
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 'var(--radius-lg)',
              padding: '1.5rem 1.35rem',
              border: '1px solid rgba(15,23,42,0.06)',
              boxShadow: '0 8px 30px rgba(15,23,42,0.04)',
            }}
          >
            <ContentRenderer content={program.description} template="DEFAULT" />
          </div>

          <aside
            style={{
              background: '#fff',
              borderRadius: 'var(--radius-lg)',
              padding: '1.25rem',
              border: '1px solid rgba(15,23,42,0.06)',
              boxShadow: '0 8px 30px rgba(15,23,42,0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem',
              position: 'sticky',
              top: '5.5rem',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Условия</h2>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.65rem' }}>
              {program.organizer && (
                <li style={{ color: 'var(--muted)', fontSize: '0.92rem' }}>
                  <strong style={{ color: 'var(--foreground)' }}>Организатор:</strong> {program.organizer}
                </li>
              )}
              {program.amountLabel && (
                <li style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.92rem' }}>
                  <Wallet size={16} color="var(--primary)" /> {program.amountLabel}
                </li>
              )}
              {starts && (
                <li style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.92rem' }}>
                  <Calendar size={16} color="var(--primary)" /> Старт: {starts}
                </li>
              )}
              {ends && (
                <li style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.92rem' }}>
                  <Calendar size={16} color="var(--primary)" />
                  {kind === 'GRANT' ? `Дедлайн: ${ends}` : `До: ${ends}`}
                </li>
              )}
              {program.place && (
                <li style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.92rem' }}>
                  <MapPin size={16} color="var(--primary)" /> {program.place}
                </li>
              )}
              {body && (
                <li style={{ fontSize: '0.92rem' }}>
                  <strong>Формат:</strong> {body}
                </li>
              )}
              {typeof program.seats === 'number' && (
                <li style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.92rem' }}>
                  <Users size={16} color="var(--primary)" />
                  {seatsLeft != null ? `Свободно мест: ${seatsLeft} из ${program.seats}` : `Мест: ${program.seats}`}
                </li>
              )}
            </ul>

            {program.externalUrl && (
              <a
                href={program.externalUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '0.7rem 1rem',
                }}
              >
                Внешняя ссылка <ExternalLink size={16} />
              </a>
            )}

            <div style={{ borderTop: '1px solid rgba(15,23,42,0.06)', paddingTop: '0.85rem' }}>
              {canApply || applicationStatus !== 'NONE' ? (
                <ApplyButton
                  programId={program.id}
                  initialStatus={applicationStatus}
                  withMessage
                  applyLabel={meta.applyLabel}
                  approvedLabel={meta.approvedLabel}
                  messagePlaceholder={
                    kind === 'GRANT'
                      ? 'Кратко о проекте и команде (необязательно)'
                      : kind === 'DOBRO'
                        ? 'Опыт, удобные даты смен (необязательно)'
                        : 'О себе и направлении интересов (необязательно)'
                  }
                />
              ) : (
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>
                  Набор сейчас закрыт. Следите за обновлениями в разделе «{meta.title}».
                </p>
              )}
            </div>

            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.45 }}>
              Заявки рассматривает администратор портала. Статус появится в личном кабинете.
            </p>
          </aside>
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
          @media (max-width: 900px) {
            .program-detail-grid {
              grid-template-columns: 1fr !important;
            }
            .program-detail-grid aside {
              position: static !important;
            }
          }
        `,
        }}
      />
    </div>
  );
}
