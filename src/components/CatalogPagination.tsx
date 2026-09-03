import Link from "next/link";

type Props = {
  page: number;
  totalPages: number;
  basePath: string;
  query?: Record<string, string | undefined>;
};

function hrefFor(basePath: string, page: number, query?: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v) params.set(k, v);
    }
  }
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export default function CatalogPagination({ page, totalPages, basePath, query }: Props) {
  if (totalPages <= 1) return null;

  const prev = page > 1 ? page - 1 : null;
  const next = page < totalPages ? page + 1 : null;
  const windowStart = Math.max(1, page - 2);
  const windowEnd = Math.min(totalPages, page + 2);
  const pages: number[] = [];
  for (let p = windowStart; p <= windowEnd; p += 1) pages.push(p);

  return (
    <nav className="catalog-pagination" aria-label="Страницы">
      {prev ? (
        <Link href={hrefFor(basePath, prev, query)} className="catalog-pagination__btn" rel="prev">
          ← Назад
        </Link>
      ) : (
        <span className="catalog-pagination__btn is-disabled">← Назад</span>
      )}
      <div className="catalog-pagination__pages">
        {windowStart > 1 && (
          <>
            <Link href={hrefFor(basePath, 1, query)} className="catalog-pagination__num">
              1
            </Link>
            {windowStart > 2 ? <span className="catalog-pagination__dots">…</span> : null}
          </>
        )}
        {pages.map((p) =>
          p === page ? (
            <span key={p} className="catalog-pagination__num is-active" aria-current="page">
              {p}
            </span>
          ) : (
            <Link key={p} href={hrefFor(basePath, p, query)} className="catalog-pagination__num">
              {p}
            </Link>
          )
        )}
        {windowEnd < totalPages && (
          <>
            {windowEnd < totalPages - 1 ? <span className="catalog-pagination__dots">…</span> : null}
            <Link href={hrefFor(basePath, totalPages, query)} className="catalog-pagination__num">
              {totalPages}
            </Link>
          </>
        )}
      </div>
      {next ? (
        <Link href={hrefFor(basePath, next, query)} className="catalog-pagination__btn" rel="next">
          Далее →
        </Link>
      ) : (
        <span className="catalog-pagination__btn is-disabled">Далее →</span>
      )}
    </nav>
  );
}
