'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useSafeSearchParams } from '@/lib/use-safe-search-params';
import { ArrowRight } from 'lucide-react';
import EntityCoverImage from '@/components/EntityCoverImage';
import CatalogFilterPopover from '@/components/CatalogFilterPopover';
import CatalogPagination from '@/components/CatalogPagination';
import { encodeRouteParam } from '@/lib/route-id';
import { projectCover } from '@/lib/theme-covers';
import { CATALOG_PAGE_SIZE, catalogSlice, totalPages } from '@/lib/pagination';
import {
  PROJECT_SOFT_CATEGORIES,
  softCategoryIdsFor,
} from '@/lib/catalog-soft-categories';
import type { PublicProjectCard } from '@/lib/public-catalogs';

function stripHtml(html: string | null | undefined) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type SortKey = 'title' | 'new' | 'popular';

export default function ProjectsCatalogClient({ items }: { items: PublicProjectCard[] }) {
  const sp = useSafeSearchParams();
  const query = (sp.get('q') || '').trim().toLowerCase();
  const statusFilter = sp.get('status') || 'ALL';
  const sort = (['title', 'new', 'popular'].includes(sp.get('sort') || '')
    ? sp.get('sort')
    : 'title') as SortKey;
  const cat = sp.get('cat') || 'ALL';
  const page = catalogSlice(sp.get('page') || '1').page;

  const filtered = useMemo(() => {
    let list = items.slice();
    if (query) {
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          stripHtml(p.description).toLowerCase().includes(query)
      );
    }
    if (statusFilter !== 'ALL') {
      list = list.filter((p) => p.status === statusFilter);
    }
    if (cat !== 'ALL') {
      list = list.filter((p) =>
        softCategoryIdsFor(`${p.title} ${stripHtml(p.description)}`, PROJECT_SOFT_CATEGORIES).includes(cat)
      );
    }
    if (sort === 'new') {
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } else if (sort === 'popular') {
      list.sort((a, b) => b.viewCount - a.viewCount || a.title.localeCompare(b.title, 'ru'));
    } else {
      list.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    }
    return list;
  }, [items, query, statusFilter, sort, cat]);

  const total = filtered.length;
  const { skip, take } = catalogSlice(page);
  const projects = filtered.slice(skip, skip + take);
  const pages = totalPages(total, CATALOG_PAGE_SIZE);
  const listQuery = {
    q: query || undefined,
    status: statusFilter !== 'ALL' ? statusFilter : undefined,
    sort: sort !== 'title' ? sort : undefined,
    cat: cat !== 'ALL' ? cat : undefined,
  };
  const categoryOptions = PROJECT_SOFT_CATEGORIES.map((c) => ({ key: c.id, label: c.label }));

  return (
    <div className="container catalog-page">
      <div className="catalog-page-header">
        <div className="catalog-page-header__intro">
          <h1 className="page-hero-title">Молодёжные проекты</h1>
          <p className="catalog-page-header__count">
            {total ? `${total} ${total === 1 ? 'проект' : total < 5 ? 'проекта' : 'проектов'}` : 'Каталог проектов'}
          </p>
        </div>
        <div className="catalog-page-header__search">
          <CatalogFilterPopover placeholder="Поиск проектов…" categoryOptions={categoryOptions} />
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="catalog-empty">
          <h3>{items.length === 0 ? 'Каталог временно недоступен' : 'Проектов не найдено'}</h3>
          <p>
            {items.length === 0
              ? 'Обновите страницу или попробуйте позже.'
              : 'Попробуйте другой запрос, категорию или статус.'}
          </p>
          {items.length === 0 ? (
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Повторить
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="grid-cards">
            {projects.map((project, projectIdx) => {
              const cats = softCategoryIdsFor(
                `${project.title} ${stripHtml(project.description)}`,
                PROJECT_SOFT_CATEGORIES
              );
              const catLabel = PROJECT_SOFT_CATEGORIES.find((c) => c.id === cats[0])?.label;
              return (
                <Link key={project.id} href={`/projects/${encodeRouteParam(project.id)}`} className="catalog-card">
                  <div className={`catalog-badge${project.status === 'COMPLETED' ? ' status-completed' : ''}`}>
                    {project.status === 'COMPLETED' ? 'Завершен' : 'Активный'}
                  </div>
                  <div className="catalog-img-wrap" style={{ position: 'relative' }}>
                    <EntityCoverImage
                      src={projectCover(project, skip + projectIdx)}
                      alt={project.title}
                      fallback={projectCover(project, skip + projectIdx + 5)}
                      className="catalog-img"
                      sizes="(max-width: 768px) 100vw, 33vw"
                    />
                  </div>
                  <div className="catalog-card__body">
                    {catLabel ? <span className="catalog-card__cat">{catLabel}</span> : null}
                    <h3>{project.title.replace(/^Проект:\s*/i, '')}</h3>
                    <p className="line-clamp-3">{stripHtml(project.description)}</p>
                    <div className="catalog-card-meta">
                      <span>{project.applicationsCount} заявок</span>
                      <span>
                        Подробнее <ArrowRight size={16} />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          <CatalogPagination page={page} totalPages={pages} basePath="/projects" query={listQuery} />
        </>
      )}
    </div>
  );
}
