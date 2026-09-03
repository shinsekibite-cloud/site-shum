import {
  ArrowLeft,
  CheckCircle,
  Users,
} from 'lucide-react';
import ContentRenderer from '@/components/ContentRenderer';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { notFound, permanentRedirect } from 'next/navigation';
import ShareButton from '@/components/ShareButton';
import PhotoGallery from '@/components/PhotoGallery';
import EntityPlanPanel, { EntityPlanSummary } from '@/components/entity/EntityPlanPanel';
import { EntityApplyStatus, EntityMembersPanel } from '@/components/entity/EntityAuthIslands';
import { Metadata } from 'next';
import { findProjectByRouteId } from '@/lib/resolve-entity';
import { decodeRouteParam, encodeRouteParam } from '@/lib/route-id';
import { projectCover } from '@/lib/theme-covers';
import { galleryUrls, parseGalleryItems } from '@/lib/gallery-shared';
import ViewBeacon from '@/components/ViewBeacon';
import { staticProjectParams } from '@/lib/generate-public-static-params';

export const revalidate = 60;
export const dynamic = 'force-static';
export const dynamicParams = true;

export async function generateStaticParams() {
  return staticProjectParams();
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const resolvedParams = await params;
  const project = await findProjectByRouteId(resolvedParams.id);

  if (!project) return { title: 'Проект не найден' };

  const { withSiteBrand, getSiteIdentity } = await import('@/lib/site-identity');
  const { siteName, publicOrigin } = await getSiteIdentity();
  return {
    title: withSiteBrand(project.title, siteName),
    description: project.description.substring(0, 160),
    alternates: { canonical: `${publicOrigin}/projects/${encodeRouteParam(project.id)}` },
    openGraph: {
      title: project.title,
      description: project.description.substring(0, 160),
      url: `${publicOrigin}/projects/${encodeRouteParam(project.id)}`,
      images: project.image ? [project.image] : [],
    },
  };
}

export default async function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;

  const projectRow = await findProjectByRouteId(resolvedParams.id);

  if (!projectRow) {
    notFound();
  }

  if (decodeRouteParam(resolvedParams.id) !== projectRow.id) {
    permanentRedirect(`/projects/${encodeRouteParam(projectRow.id)}`);
  }

  const project = await prisma.project.findUnique({
    where: { id: projectRow.id },
    include: {
      _count: {
        select: { applications: { where: { status: 'APPROVED' } } },
      },
    },
  });

  if (!project) notFound();

  const galleryImages = galleryUrls(parseGalleryItems(project.gallery, 24));
  const memberCount = project._count.applications;
  const open = project.status !== 'COMPLETED';

  return (
    <div style={{ minHeight: 'auto', paddingBottom: '4rem', backgroundColor: '#f8fafc' }}>
      <div
        className="project-hero"
        style={{
          position: 'relative',
          width: '100%',
          minHeight: 360,
          backgroundImage: `url(${projectCover(project, 0)})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to top, rgba(15,23,42,0.92) 0%, rgba(15,23,42,0.35) 55%, rgba(15,23,42,0.15) 100%)',
          }}
          aria-hidden
        />

        <div
          className="container"
          style={{
            position: 'relative',
            zIndex: 20,
            paddingTop: '1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Link
            href="/projects"
            style={{
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            <ArrowLeft size={18} /> К проектам
          </Link>
          <ShareButton title={project.title} />
        </div>

        <div
          className="container"
          style={{
            position: 'relative',
            zIndex: 20,
            paddingBottom: '2rem',
            paddingTop: '4rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
            gap: '1.25rem',
          }}
        >
          <div style={{ flex: '1 1 280px' }}>
            <h1
              style={{
                fontSize: 'clamp(1.85rem, 5vw, 2.75rem)',
                fontWeight: 800,
                color: 'white',
                marginBottom: '0.5rem',
                lineHeight: 1.1,
              }}
            >
              {project.title}
            </h1>
            <ViewBeacon type="PROJECT" id={project.id} initialCount={project.viewCount ?? 0} style={{ color: 'rgba(255,255,255,0.75)', marginBottom: '0.5rem' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              {open ? (
                <span
                  style={{
                    color: '#86efac',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    background: 'rgba(34, 197, 94, 0.2)',
                    padding: '0.2rem 0.8rem',
                    borderRadius: '100px',
                    fontSize: '0.88rem',
                  }}
                >
                  <CheckCircle size={16} /> Открыто
                </span>
              ) : (
                <span
                  style={{
                    color: '#fca5a5',
                    fontWeight: 600,
                    background: 'rgba(239, 68, 68, 0.2)',
                    padding: '0.2rem 0.8rem',
                    borderRadius: '100px',
                    fontSize: '0.88rem',
                  }}
                >
                  Завершено
                </span>
              )}
              <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Users size={15} /> {memberCount} в команде
              </span>
            </div>
            <EntityPlanSummary goal={project.goal} mission={project.mission} />
          </div>

          {open && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
              <EntityApplyStatus kind="project" id={project.id} open={open} />
            </div>
          )}
        </div>
      </div>

      <div className="container project-detail-wrap">
        <div className="project-detail-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <EntityPlanPanel
              entityKind="project"
              entityTitle={project.title}
              goal={project.goal}
              mission={project.mission}
              roadmapJson={project.roadmapJson}
              rolesJson={project.rolesJson}
              tasksJson={project.tasksJson}
            />

            {galleryImages.length > 0 && (
              <section
                id="project-gallery"
                style={{
                  background: '#fff',
                  padding: 'clamp(1.15rem, 3vw, 1.5rem)',
                  borderRadius: 16,
                  border: '1px solid rgba(15,23,42,0.06)',
                }}
              >
                <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '0 0 0.85rem' }}>Галерея</h2>
                <PhotoGallery images={galleryImages} />
              </section>
            )}

            <section
              id="project-details"
              style={{
                background: '#fff',
                padding: 'clamp(1.25rem, 4vw, 2rem)',
                borderRadius: 16,
                border: '1px solid rgba(15,23,42,0.06)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
              }}
            >
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '1rem' }}>Подробности</h2>
              <div style={{ fontSize: '1.05rem', lineHeight: 1.75, color: '#334155' }}>
                <ContentRenderer template={project.template || 'DEFAULT'} content={project.description} />
              </div>
            </section>
          </div>

          <aside style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <EntityMembersPanel
              kind="project"
              id={project.id}
              title={project.title}
              memberCount={memberCount}
              open={open}
            />
          </aside>
        </div>
      </div>

      <style>{`
        @media (max-width: 860px) {
          .project-detail-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
