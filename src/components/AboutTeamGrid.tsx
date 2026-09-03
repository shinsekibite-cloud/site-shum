import Link from 'next/link';
import UserAvatar from '@/components/UserAvatar';

export type AboutTeamMember = {
  id: string;
  roleTitle: string;
  user: {
    id: string;
    name: string | null;
    nickname: string | null;
    image: string | null;
    publicCode: string | null;
    city: string | null;
  };
};

export default function AboutTeamGrid({ members }: { members: AboutTeamMember[] }) {
  if (!members.length) return null;

  return (
    <section className="about-team-section" aria-labelledby="about-team-title">
      <h2 id="about-team-title" className="about-section__title">
        Команда портала
      </h2>
      <p className="about-section__sub">Люди, которые делают портал живым.</p>
      <div className="team-grid">
        {members.map((m) => {
          const href = `/u/${m.user.publicCode || m.user.id}`;
          const name = m.user.nickname || m.user.name || 'Участник';
          return (
            <Link key={m.id} href={href} className="team-card">
              <UserAvatar name={name} image={m.user.image} size={52} />
              <div className="team-card__meta">
                <strong>{name}</strong>
                <span>{m.roleTitle}</span>
                {m.user.city ? <span className="team-card__city">{m.user.city}</span> : null}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
