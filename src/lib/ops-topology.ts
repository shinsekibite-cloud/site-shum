/**
 * TECH ops: user relationship topology from real portal activity.
 * Undirected weighted edges — for investigation, not end-user social.
 */
import { prisma } from '@/lib/prisma';

export const TOPOLOGY_EDGE_TYPES = [
  'friend',
  'event',
  'club',
  'project',
  'dm',
  'referral',
  'same_ip',
] as const;

export type TopologyEdgeType = (typeof TOPOLOGY_EDGE_TYPES)[number];

export const TOPOLOGY_EDGE_META: Record<
  TopologyEdgeType,
  { label: string; color: string; baseWeight: number }
> = {
  friend: { label: 'Дружба', color: '#0d9488', baseWeight: 5 },
  event: { label: 'Общие события', color: '#0284c7', baseWeight: 2 },
  club: { label: 'Общий клуб', color: '#0e7490', baseWeight: 3 },
  project: { label: 'Общий проект', color: '#059669', baseWeight: 3 },
  dm: { label: 'Переписка', color: '#ea580c', baseWeight: 1 },
  referral: { label: 'Реферал', color: '#ca8a04', baseWeight: 4 },
  same_ip: { label: 'Общий IP (действия)', color: '#dc2626', baseWeight: 2 },
};

type EdgeAcc = {
  types: Set<TopologyEdgeType>;
  weight: number;
  events: string[];
  clubs: string[];
  projects: string[];
  dmCount: number;
  ips: string[];
};

function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function parsePair(key: string): [string, string] {
  const i = key.indexOf('|');
  return [key.slice(0, i), key.slice(i + 1)];
}

function bump(
  map: Map<string, EdgeAcc>,
  a: string,
  b: string,
  type: TopologyEdgeType,
  extra = 0,
  detail?: { title?: string; ip?: string; dm?: number }
) {
  if (!a || !b || a === b) return;
  const key = pairKey(a, b);
  let row = map.get(key);
  if (!row) {
    row = {
      types: new Set(),
      weight: 0,
      events: [],
      clubs: [],
      projects: [],
      dmCount: 0,
      ips: [],
    };
    map.set(key, row);
  }
  const meta = TOPOLOGY_EDGE_META[type];
  if (!row.types.has(type)) {
    row.types.add(type);
    row.weight += meta.baseWeight;
  }
  row.weight += extra;
  if (detail?.title) {
    if (type === 'event' && row.events.length < 6 && !row.events.includes(detail.title)) {
      row.events.push(detail.title);
    }
    if (type === 'club' && row.clubs.length < 6 && !row.clubs.includes(detail.title)) {
      row.clubs.push(detail.title);
    }
    if (type === 'project' && row.projects.length < 6 && !row.projects.includes(detail.title)) {
      row.projects.push(detail.title);
    }
  }
  if (detail?.dm) row.dmCount = Math.max(row.dmCount, detail.dm);
  if (detail?.ip && row.ips.length < 4 && !row.ips.includes(detail.ip)) row.ips.push(detail.ip);
}

export type TopologyQuery = {
  days?: number;
  maxNodes?: number;
  minWeight?: number;
  types?: TopologyEdgeType[];
};

export async function buildUserTopology(q: TopologyQuery = {}) {
  const days = Math.min(365, Math.max(7, q.days ?? 90));
  const maxNodes = Math.min(120, Math.max(20, q.maxNodes ?? 60));
  const minWeight = Math.max(1, q.minWeight ?? 2);
  const want = new Set<TopologyEdgeType>(
    q.types?.length ? q.types : TOPOLOGY_EDGE_TYPES.filter((t) => t !== 'same_ip')
  );
  const since = new Date(Date.now() - days * 86400000);
  const edges = new Map<string, EdgeAcc>();

  if (want.has('friend')) {
    const friends = await prisma.friendship.findMany({
      where: { status: 'ACCEPTED' },
      select: { requesterId: true, addresseeId: true },
      take: 2000,
    });
    for (const f of friends) bump(edges, f.requesterId, f.addresseeId, 'friend');
  }

  if (want.has('event')) {
    const parts = await prisma.bookingParticipant.findMany({
      where: {
        createdAt: { gte: since },
        booking: { startTime: { gte: since } },
      },
      select: {
        userId: true,
        bookingId: true,
        booking: { select: { title: true } },
      },
      take: 8000,
    });
    const byBooking = new Map<string, { title: string; users: string[] }>();
    for (const p of parts) {
      let g = byBooking.get(p.bookingId);
      if (!g) {
        g = { title: p.booking.title || 'Событие', users: [] };
        byBooking.set(p.bookingId, g);
      }
      if (!g.users.includes(p.userId)) g.users.push(p.userId);
    }
    for (const g of byBooking.values()) {
      if (g.users.length < 2 || g.users.length > 40) continue;
      for (let i = 0; i < g.users.length; i++) {
        for (let j = i + 1; j < g.users.length; j++) {
          bump(edges, g.users[i], g.users[j], 'event', 1, { title: g.title });
        }
      }
    }
  }

  if (want.has('club') || want.has('project')) {
    const apps = await prisma.application.findMany({
      where: {
        status: 'APPROVED',
        OR: [{ clubId: { not: null } }, { projectId: { not: null } }],
      },
      select: {
        userId: true,
        clubId: true,
        projectId: true,
        club: { select: { title: true } },
        project: { select: { title: true } },
      },
      take: 6000,
    });
    if (want.has('club')) {
      const byClub = new Map<string, { title: string; users: string[] }>();
      for (const a of apps) {
        if (!a.clubId) continue;
        let g = byClub.get(a.clubId);
        if (!g) {
          g = { title: a.club?.title || 'Клуб', users: [] };
          byClub.set(a.clubId, g);
        }
        if (!g.users.includes(a.userId)) g.users.push(a.userId);
      }
      for (const g of byClub.values()) {
        if (g.users.length < 2 || g.users.length > 50) continue;
        for (let i = 0; i < g.users.length; i++) {
          for (let j = i + 1; j < g.users.length; j++) {
            bump(edges, g.users[i], g.users[j], 'club', 0, { title: g.title });
          }
        }
      }
    }
    if (want.has('project')) {
      const byProj = new Map<string, { title: string; users: string[] }>();
      for (const a of apps) {
        if (!a.projectId) continue;
        let g = byProj.get(a.projectId);
        if (!g) {
          g = { title: a.project?.title || 'Проект', users: [] };
          byProj.set(a.projectId, g);
        }
        if (!g.users.includes(a.userId)) g.users.push(a.userId);
      }
      for (const g of byProj.values()) {
        if (g.users.length < 2 || g.users.length > 50) continue;
        for (let i = 0; i < g.users.length; i++) {
          for (let j = i + 1; j < g.users.length; j++) {
            bump(edges, g.users[i], g.users[j], 'project', 0, { title: g.title });
          }
        }
      }
    }
  }

  if (want.has('dm')) {
    const dms = await prisma.conversation.findMany({
      where: { kind: 'DM', updatedAt: { gte: since } },
      select: {
        pairKey: true,
        _count: { select: { messages: true } },
      },
      take: 1500,
      orderBy: { updatedAt: 'desc' },
    });
    for (const c of dms) {
      const ids = c.pairKey.split('_');
      if (ids.length !== 2) continue;
      const n = c._count.messages;
      if (n < 1) continue;
      const extra = Math.min(7, Math.floor(Math.log2(n + 1)));
      bump(edges, ids[0], ids[1], 'dm', extra, { dm: n });
    }
  }

  if (want.has('referral')) {
    const refs = await prisma.referral.findMany({
      where: { createdAt: { gte: since } },
      select: { referrerId: true, refereeId: true },
      take: 1000,
    });
    for (const r of refs) {
      bump(edges, r.referrerId, r.refereeId, 'referral');
    }
  }

  if (want.has('same_ip')) {
    const logs = await prisma.userActionLog.findMany({
      where: {
        createdAt: { gte: since },
        userId: { not: null },
        ip: { not: null },
        success: true,
      },
      select: { userId: true, ip: true },
      take: 12000,
      orderBy: { createdAt: 'desc' },
    });
    const byIp = new Map<string, Set<string>>();
    for (const row of logs) {
      if (!row.userId || !row.ip) continue;
      const ip = row.ip.trim();
      if (!ip || ip === '127.0.0.1' || ip.startsWith('10.') || ip.startsWith('192.168.')) continue;
      let set = byIp.get(ip);
      if (!set) {
        set = new Set();
        byIp.set(ip, set);
      }
      set.add(row.userId);
    }
    for (const [ip, users] of byIp) {
      const list = [...users];
      if (list.length < 2 || list.length > 12) continue;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          bump(edges, list[i], list[j], 'same_ip', 0, { ip });
        }
      }
    }
  }

  const ranked = [...edges.entries()]
    .map(([key, v]) => ({ key, ...v, weight: Math.min(40, v.weight) }))
    .filter((e) => e.weight >= minWeight)
    .sort((a, b) => b.weight - a.weight);

  const nodeDegree = new Map<string, number>();
  const selectedKeys: string[] = [];
  for (const e of ranked) {
    const [a, b] = parsePair(e.key);
    const next = new Set(nodeDegree.keys());
    if (!next.has(a)) next.add(a);
    if (!next.has(b)) next.add(b);
    if (next.size > maxNodes && (!nodeDegree.has(a) || !nodeDegree.has(b))) {
      if (selectedKeys.length > 40) continue;
    }
    selectedKeys.push(e.key);
    nodeDegree.set(a, (nodeDegree.get(a) || 0) + e.weight);
    nodeDegree.set(b, (nodeDegree.get(b) || 0) + e.weight);
    if (nodeDegree.size >= maxNodes && selectedKeys.length >= 30) break;
  }

  const nodeIds = [...nodeDegree.keys()];
  const users = nodeIds.length
    ? await prisma.user.findMany({
        where: { id: { in: nodeIds }, deletedAt: null },
        select: {
          id: true,
          name: true,
          nickname: true,
          email: true,
          role: true,
          publicCode: true,
          ecoPoints: true,
        },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const nodes = nodeIds
    .map((id) => {
      const u = userMap.get(id);
      if (!u) return null;
      const label = (u.nickname || u.name || u.email || u.publicCode || id).slice(0, 40);
      return {
        id,
        label,
        role: u.role,
        code: u.publicCode,
        ecoPoints: u.ecoPoints ?? 0,
        degree: nodeDegree.get(id) || 0,
      };
    })
    .filter(Boolean) as Array<{
    id: string;
    label: string;
    role: string;
    code: string | null;
    ecoPoints: number;
    degree: number;
  }>;

  const nodeSet = new Set(nodes.map((n) => n.id));
  const outEdges = selectedKeys
    .map((key) => {
      const [source, target] = parsePair(key);
      if (!nodeSet.has(source) || !nodeSet.has(target)) return null;
      const e = edges.get(key)!;
      return {
        source,
        target,
        weight: Math.min(40, e.weight),
        types: [...e.types],
        detail: {
          events: e.events,
          clubs: e.clubs,
          projects: e.projects,
          dmCount: e.dmCount || undefined,
          ips: e.ips.length ? e.ips : undefined,
        },
      };
    })
    .filter(Boolean);

  return {
    generatedAt: new Date().toISOString(),
    days,
    minWeight,
    maxNodes,
    nodeCount: nodes.length,
    edgeCount: outEdges.length,
    legend: TOPOLOGY_EDGE_TYPES.filter((t) => want.has(t)).map((t) => ({
      type: t,
      ...TOPOLOGY_EDGE_META[t],
    })),
    nodes,
    edges: outEdges,
  };
}
