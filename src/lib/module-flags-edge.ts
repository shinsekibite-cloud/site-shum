/** Edge-safe path→module map (no Prisma/Redis). Keep in sync with module-flags.ts */

export type ModuleFlagKey =
  | 'registration'
  | 'messaging'
  | 'events'
  | 'tickets_scan'
  | 'places'
  | 'gallery'
  | 'projects'
  | 'clubs'
  | 'spaces'
  | 'grants'
  | 'dobro'
  | 'self_gov'
  | 'vacancies'
  | 'contests'
  | 'friends'
  | 'games'
  | 'news'
  | 'portfolio'
  | 'eco'
  | 'achievements'
  | 'ratings'
  | 'club_chat'
  | 'applications'
  | 'notifications'
  | 'documents'
  | 'referrals'
  | 'faq'
  | 'presentation'
  | 'server_status'
  | 'bots'
  | 'maintenance';

export type ModuleOffMode = 'soon' | 'hide';

export const PATH_MODULE_RULES: Array<{ prefix: string; key: ModuleFlagKey }> = [
  { prefix: '/register', key: 'registration' },
  { prefix: '/api/register', key: 'registration' },
  { prefix: '/messages', key: 'messaging' },
  { prefix: '/api/messages', key: 'messaging' },
  { prefix: '/api/dm', key: 'messaging' },
  { prefix: '/events', key: 'events' },
  { prefix: '/tickets', key: 'events' },
  { prefix: '/check-in', key: 'events' },
  { prefix: '/api/events', key: 'events' },
  { prefix: '/api/bookings', key: 'events' },
  { prefix: '/api/check-in', key: 'events' },
  { prefix: '/api/user/bookings', key: 'events' },
  { prefix: '/scanner', key: 'tickets_scan' },
  { prefix: '/scan', key: 'tickets_scan' },
  { prefix: '/admin/scanner', key: 'tickets_scan' },
  { prefix: '/api/scanner', key: 'tickets_scan' },
  { prefix: '/api/scan', key: 'tickets_scan' },
  { prefix: '/coworking', key: 'spaces' },
  { prefix: '/api/coworking', key: 'spaces' },
  { prefix: '/api/presence-qr', key: 'spaces' },
  { prefix: '/c/', key: 'spaces' },
  { prefix: '/places', key: 'places' },
  { prefix: '/api/places', key: 'places' },
  { prefix: '/api/user/places', key: 'places' },
  { prefix: '/gallery', key: 'gallery' },
  { prefix: '/api/user/gallery', key: 'gallery' },
  { prefix: '/projects', key: 'projects' },
  { prefix: '/clubs', key: 'clubs' },
  { prefix: '/spaces', key: 'spaces' },
  { prefix: '/grants', key: 'grants' },
  { prefix: '/dobro', key: 'dobro' },
  { prefix: '/self-gov', key: 'self_gov' },
  { prefix: '/vacancies', key: 'vacancies' },
  { prefix: '/api/vacancies', key: 'vacancies' },
  { prefix: '/api/employers', key: 'vacancies' },
  { prefix: '/admin/vacancies', key: 'vacancies' },
  { prefix: '/contests', key: 'contests' },
  { prefix: '/api/contests', key: 'contests' },
  { prefix: '/admin/contests', key: 'contests' },
  { prefix: '/friends', key: 'friends' },
  { prefix: '/api/friends', key: 'friends' },
  { prefix: '/games', key: 'games' },
  { prefix: '/dashboard/games', key: 'games' },
  { prefix: '/api/games', key: 'games' },
  { prefix: '/api/user/games', key: 'games' },
  { prefix: '/news', key: 'news' },
  { prefix: '/api/news', key: 'news' },
  { prefix: '/portfolio', key: 'portfolio' },
  { prefix: '/dashboard/portfolio', key: 'portfolio' },
  { prefix: '/api/portfolio', key: 'portfolio' },
  { prefix: '/api/user/portfolio', key: 'portfolio' },
  { prefix: '/dashboard/shop', key: 'eco' },
  { prefix: '/api/user/eco', key: 'eco' },
  { prefix: '/api/user/collectibles', key: 'eco' },
  { prefix: '/api/eco', key: 'eco' },
  { prefix: '/api/admin/eco', key: 'eco' },
  { prefix: '/dashboard/achievements', key: 'achievements' },
  { prefix: '/dashboard/awards', key: 'achievements' },
  { prefix: '/api/user/achievements', key: 'achievements' },
  { prefix: '/api/user/awards', key: 'achievements' },
  { prefix: '/api/awards', key: 'achievements' },
  { prefix: '/api/admin/awards', key: 'achievements' },
  { prefix: '/api/user/reputation', key: 'ratings' },
  { prefix: '/api/group-chat', key: 'club_chat' },
  { prefix: '/dashboard/applications', key: 'applications' },
  { prefix: '/api/applications', key: 'applications' },
  { prefix: '/api/user/applications', key: 'applications' },
  { prefix: '/dashboard/notifications', key: 'notifications' },
  { prefix: '/api/user/notifications', key: 'notifications' },
  { prefix: '/api/user/notification-prefs', key: 'notifications' },
  { prefix: '/api/user/push', key: 'notifications' },
  { prefix: '/documents', key: 'documents' },
  { prefix: '/api/documents', key: 'documents' },
  { prefix: '/dashboard/referrals', key: 'referrals' },
  { prefix: '/api/referrals', key: 'referrals' },
  { prefix: '/faq', key: 'faq' },
  { prefix: '/presentation', key: 'presentation' },
  { prefix: '/downloads/youngportal-presentation', key: 'presentation' },
  { prefix: '/admin/system', key: 'server_status' },
  { prefix: '/api/admin/system', key: 'server_status' },
  { prefix: '/admin/bots', key: 'bots' },
  { prefix: '/api/admin/bots', key: 'bots' },
  { prefix: '/api/integrations/telegram', key: 'bots' },
  { prefix: '/api/integrations/max', key: 'bots' },
  { prefix: '/api/public/bots', key: 'bots' },
];

export function moduleKeyForPath(pathname: string): ModuleFlagKey | null {
  for (const rule of PATH_MODULE_RULES) {
    if (pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)) {
      return rule.key;
    }
  }
  return null;
}
