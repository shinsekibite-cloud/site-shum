import Link from 'next/link';

export type RelatedItem = {
  href: string;
  title: string;
  meta?: string | null;
};

/** Internal linking block — similar / nearby / same theme. */
export default function RelatedLinks({
  title = 'Похожие материалы',
  items,
}: {
  title?: string;
  items: RelatedItem[];
}) {
  if (!items.length) return null;
  return (
    <section className="yp-related" aria-label={title}>
      <h2 className="yp-related__title">{title}</h2>
      <ul className="yp-related__list">
        {items.map((it) => (
          <li key={it.href}>
            <Link href={it.href}>
              <strong>{it.title}</strong>
              {it.meta ? <small>{it.meta}</small> : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
