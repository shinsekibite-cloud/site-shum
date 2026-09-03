/**
 * True while `next build` is compiling / prerendering.
 * Docker builder has no Postgres — skip Prisma calls to avoid noisy errors.
 */
export function isNextBuildPhase(): boolean {
  if (process.env.SKIP_DB_AT_BUILD === '1') return true;
  // Next.js sets this during `next build`
  if (process.env.NEXT_PHASE === 'phase-production-build') return true;
  return false;
}
