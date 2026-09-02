/**
 * Viewport / responsive checklist for local Playwright or manual QA.
 * Not executed by default — import from future e2e.
 *
 * Usage later:
 *   import { VIEWPORTS, RESPONSIVE_CHECKS } from './qa-responsive-matrix.mjs'
 */
export const VIEWPORTS = [
  { id: 'desktop-fhd', w: 1920, h: 1080 },
  { id: 'laptop-1440', w: 1440, h: 900 },
  { id: 'laptop-1366', w: 1366, h: 768 },
  { id: 'tablet-landscape', w: 1024, h: 768 },
  { id: 'tablet-portrait', w: 768, h: 1024 },
  { id: 'mobile-430', w: 430, h: 932 },
  { id: 'mobile-390', w: 390, h: 844 },
  { id: 'mobile-375', w: 375, h: 812 },
  { id: 'mobile-360', w: 360, h: 800 },
  { id: 'mobile-320', w: 320, h: 568 },
];

export const RESPONSIVE_CHECKS = [
  { id: 'no-h-scroll', assert: 'document.documentElement.scrollWidth <= window.innerWidth + 1' },
  { id: 'tap-targets', note: 'Interactive controls >= 44x44 where feasible' },
  { id: 'sticky-nav', paths: ['/', '/events', '/dashboard'] },
  { id: 'footer-chips', paths: ['/'], note: 'No zig-zag empty columns; readable gaps' },
  { id: 'event-carousel', paths: ['/'], note: 'Actions compact; arrows tappable' },
  { id: 'forms', paths: ['/login', '/register', '/forgot-password'] },
  { id: 'modals', note: 'Cookie / legal / invite popovers fit viewport' },
];

export const ROLE_SCENARIOS = [
  { role: 'guest', paths: ['/', '/events', '/games', '/login'], expect: 'public ok; dashboard redirect' },
  { role: 'user', paths: ['/dashboard', '/messages', '/tickets'], expect: '200 authenticated' },
  { role: 'violator', actions: ['burst /api/views', 'double POST /api/messages'], expect: '429/dedupe, no 500' },
  { role: 'moderator', paths: ['/admin/moderation', '/admin/applications'], expect: 'permission-scoped' },
  { role: 'admin', paths: ['/admin/users', '/admin/pii-access', '/admin/activity'], expect: 'full staff' },
  { role: 'tech', paths: ['/ops', '/ops/topology', '/ops/modules'], expect: 'ops only; admin blocked' },
];
