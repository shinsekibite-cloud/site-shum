'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Home,
  Maximize2,
  MessageCircle,
  Minus,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';

type LegendItem = { type: string; label: string; color: string };
type Node = {
  id: string;
  label: string;
  role: string;
  code: string | null;
  ecoPoints: number;
  degree: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
};
type Edge = {
  source: string;
  target: string;
  weight: number;
  types: string[];
  detail: {
    events?: string[];
    clubs?: string[];
    projects?: string[];
    dmCount?: number;
    ips?: string[];
  };
};
type Payload = {
  generatedAt: string;
  days: number;
  nodeCount: number;
  edgeCount: number;
  legend: LegendItem[];
  nodes: Node[];
  edges: Edge[];
};

const ALL_TYPES = [
  { id: 'friend', label: 'Дружба' },
  { id: 'event', label: 'События' },
  { id: 'club', label: 'Клубы' },
  { id: 'project', label: 'Проекты' },
  { id: 'dm', label: 'Переписка' },
  { id: 'referral', label: 'Рефералы' },
  { id: 'same_ip', label: 'Общий IP' },
];

const ROLE_RU: Record<string, string> = {
  USER: 'Пользователь',
  PARTICIPANT: 'Участник',
  MODERATOR: 'Модератор',
  ADMIN: 'Админ',
  SCANNER: 'Сканер',
  TECH: 'Tech',
};

function edgeKey(e: Edge) {
  return e.source < e.target ? `${e.source}|${e.target}` : `${e.target}|${e.source}`;
}

function typeLabel(t: string) {
  return ALL_TYPES.find((x) => x.id === t)?.label || t;
}

/** One curved path per link — professionals avoid parallel straight “spiderwebs”. */
function curvePath(x1: number, y1: number, x2: number, y2: number, bend: number) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const cx = mx - (dy / len) * bend;
  const cy = my + (dx / len) * bend;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

function bendForKey(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return ((h % 17) - 8) * 4.5;
}

function layoutGraph(nodes: Node[], edges: Edge[], w: number, h: number) {
  const n = nodes.map((node, i) => {
    const a = (i / Math.max(1, nodes.length)) * Math.PI * 2;
    return { ...node, x: Math.cos(a) * 200, y: Math.sin(a) * 200, vx: 0, vy: 0 };
  });
  const idx = new Map(n.map((node, i) => [node.id, i]));
  const links = edges
    .map((e) => ({ ...e, si: idx.get(e.source), ti: idx.get(e.target) }))
    .filter((e) => e.si != null && e.ti != null) as Array<Edge & { si: number; ti: number }>;

  for (let t = 0; t < 200; t++) {
    const alpha = 1 - t / 200;
    for (let i = 0; i < n.length; i++) {
      for (let j = i + 1; j < n.length; j++) {
        const a = n[i];
        const b = n[j];
        let dx = (a.x || 0) - (b.x || 0);
        let dy = (a.y || 0) - (b.y || 0);
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const force = (2400 / (dist * dist)) * alpha;
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        a.vx = (a.vx || 0) + dx;
        a.vy = (a.vy || 0) + dy;
        b.vx = (b.vx || 0) - dx;
        b.vy = (b.vy || 0) - dy;
      }
    }
    for (const link of links) {
      const a = n[link.si];
      const b = n[link.ti];
      let dx = (b.x || 0) - (a.x || 0);
      let dy = (b.y || 0) - (a.y || 0);
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const target = 140 + link.weight * 6;
      const force = (dist - target) * 0.055 * alpha;
      dx = (dx / dist) * force;
      dy = (dy / dist) * force;
      a.vx = (a.vx || 0) + dx;
      a.vy = (a.vy || 0) + dy;
      b.vx = (b.vx || 0) - dx;
      b.vy = (b.vy || 0) - dy;
    }
    for (const node of n) {
      node.vx = (node.vx || 0) * 0.82 - (node.x || 0) * 0.01;
      node.vy = (node.vy || 0) * 0.82 - (node.y || 0) * 0.01;
      node.x = (node.x || 0) + (node.vx || 0);
      node.y = (node.y || 0) + (node.vy || 0);
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of n) {
    minX = Math.min(minX, node.x || 0);
    minY = Math.min(minY, node.y || 0);
    maxX = Math.max(maxX, node.x || 0);
    maxY = Math.max(maxY, node.y || 0);
  }
  const pad = 64;
  const bw = Math.max(40, maxX - minX);
  const bh = Math.max(40, maxY - minY);
  const scale = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
  const ox = (w - bw * scale) / 2 - minX * scale;
  const oy = (h - bh * scale) / 2 - minY * scale;
  for (const node of n) {
    node.x = (node.x || 0) * scale + ox;
    node.y = (node.y || 0) * scale + oy;
  }
  return n;
}

export default function OpsTopologyClient({ onBack }: { onBack?: () => void }) {
  const [days, setDays] = useState(90);
  const [minWeight, setMinWeight] = useState(2);
  const [types, setTypes] = useState<string[]>([
    'friend',
    'event',
    'club',
    'project',
    'dm',
    'referral',
  ]);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusEdge, setFocusEdge] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 390, h: 640 });
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const dragRef = useRef<{
    mode: 'pan' | 'node';
    id?: string;
    sx: number;
    sy: number;
    vx: number;
    vy: number;
    moved: boolean;
  } | null>(null);
  const pinchRef = useRef<{ dist: number; k: number; cx: number; cy: number } | null>(null);
  const [dragNodes, setDragNodes] = useState<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize({
        w: Math.max(280, Math.floor(r.width)),
        h: Math.max(320, Math.floor(r.height)),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    setDragNodes((prev) => (Object.keys(prev).length ? {} : prev));
  }, [size.w, size.h]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const sp = new URLSearchParams({
        days: String(days),
        minWeight: String(minWeight),
        maxNodes: '80',
        types: types.join(','),
      });
      const res = await fetch(`/api/ops/topology?${sp}`, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Ошибка загрузки');
      setData(json as Payload);
      setSelectedId(null);
      setSelectedEdge(null);
      setFocusEdge(null);
      setDragNodes({});
      setView({ x: 0, y: 0, k: 1 });
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  }, [days, minWeight, types]);

  useEffect(() => {
    void load();
  }, [load]);

  const laidOut = useMemo(() => {
    if (!data?.nodes?.length) return [] as Node[];
    const base = layoutGraph(data.nodes, data.edges as Edge[], size.w, size.h);
    return base.map((n) => {
      const d = dragNodes[n.id];
      return d ? { ...n, x: d.x, y: d.y } : n;
    });
  }, [data, size.w, size.h, dragNodes]);

  const nodeMap = useMemo(() => new Map(laidOut.map((n) => [n.id, n])), [laidOut]);
  const colorOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of data?.legend || []) m.set(l.type, l.color);
    return m;
  }, [data]);

  const maxWeight = useMemo(() => {
    let m = 1;
    for (const e of data?.edges || []) m = Math.max(m, e.weight);
    return m;
  }, [data]);

  const neighborIds = useMemo(() => {
    const set = new Set<string>();
    if (!data) return set;
    if (selectedId) {
      set.add(selectedId);
      for (const e of data.edges) {
        if (e.source === selectedId) set.add(e.target);
        if (e.target === selectedId) set.add(e.source);
      }
    }
    if (selectedEdge) {
      const e = data.edges.find((row) => edgeKey(row) === selectedEdge);
      if (e) {
        set.add(e.source);
        set.add(e.target);
      }
    }
    return set;
  }, [selectedId, selectedEdge, data]);

  const filteredIds = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return null as Set<string> | null;
    return new Set(
      laidOut
        .filter(
          (n) =>
            n.label.toLowerCase().includes(needle) ||
            (n.code || '').toLowerCase().includes(needle)
        )
        .map((n) => n.id)
    );
  }, [q, laidOut]);

  const labelIds = useMemo(() => {
    const set = new Set<string>();
    if (selectedId) set.add(selectedId);
    if (hoverId) set.add(hoverId);
    if (selectedEdge) {
      for (const id of neighborIds) set.add(id);
    }
    if (filteredIds) for (const id of filteredIds) set.add(id);
    if (laidOut.length <= 24) {
      for (const n of laidOut) set.add(n.id);
    } else {
      for (const n of [...laidOut].sort((a, b) => b.degree - a.degree).slice(0, 10)) {
        set.add(n.id);
      }
    }
    return set;
  }, [selectedId, hoverId, selectedEdge, neighborIds, filteredIds, laidOut]);

  const selectedNode = selectedId ? nodeMap.get(selectedId) : null;
  const activeEdge = useMemo(() => {
    if (!selectedEdge || !data) return null;
    return data.edges.find((e) => edgeKey(e) === selectedEdge) || null;
  }, [selectedEdge, data]);

  const related = useMemo(() => {
    if (!selectedId || !data) return [] as Edge[];
    return data.edges
      .filter((e) => e.source === selectedId || e.target === selectedId)
      .slice()
      .sort((a, b) => b.weight - a.weight);
  }, [selectedId, data]);

  const dockOpen = Boolean(selectedNode || activeEdge);

  const toggleType = (id: string) => {
    setTypes((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  };

  const zoomAt = (factor: number, clientX?: number, clientY?: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    setView((v) => {
      const k = Math.min(4.5, Math.max(0.28, v.k * factor));
      if (!rect || clientX == null || clientY == null) return { ...v, k };
      const mx = clientX - rect.left;
      const my = clientY - rect.top;
      const wx = (mx - v.x) / v.k;
      const wy = (my - v.y) / v.k;
      return { k, x: mx - wx * k, y: my - wy * k };
    });
  };

  const fitView = () => setView({ x: 0, y: 0, k: 1 });

  const onWheel = (e: ReactWheelEvent) => {
    e.preventDefault();
    zoomAt(e.deltaY > 0 ? 0.9 : 1.12, e.clientX, e.clientY);
  };

  const touchDist = (a: { clientX: number; clientY: number }, b: { clientX: number; clientY: number }) => {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.sqrt(dx * dx + dy * dy) || 1;
  };

  const onTouchStart = (e: ReactTouchEvent) => {
    if (e.touches.length === 2) {
      dragRef.current = null;
      const rect = wrapRef.current?.getBoundingClientRect();
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      pinchRef.current = {
        dist: touchDist(e.touches[0], e.touches[1]),
        k: viewRef.current.k,
        cx: rect ? cx - rect.left : cx,
        cy: rect ? cy - rect.top : cy,
      };
    }
  };

  const onTouchMove = (e: ReactTouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const d = touchDist(e.touches[0], e.touches[1]);
      const factor = d / pinchRef.current.dist;
      const k = Math.min(4.5, Math.max(0.28, pinchRef.current.k * factor));
      const { cx, cy } = pinchRef.current;
      setView((v) => {
        const wx = (cx - v.x) / v.k;
        const wy = (cy - v.y) / v.k;
        return { k, x: cx - wx * k, y: cy - wy * k };
      });
    }
  };

  const onTouchEnd = () => {
    if (pinchRef.current) pinchRef.current = null;
  };

  const clearSelection = () => {
    setSelectedId(null);
    setSelectedEdge(null);
    setFocusEdge(null);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (pinchRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      mode: 'pan',
      sx: e.clientX,
      sy: e.clientY,
      vx: viewRef.current.x,
      vy: viewRef.current.y,
      moved: false,
    };
  };

  const onNodePointerDown = (e: ReactPointerEvent<SVGGElement>, id: string) => {
    e.stopPropagation();
    wrapRef.current?.setPointerCapture(e.pointerId);
    const n = nodeMap.get(id);
    dragRef.current = {
      mode: 'node',
      id,
      sx: e.clientX,
      sy: e.clientY,
      vx: n?.x || 0,
      vy: n?.y || 0,
      moved: false,
    };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d || pinchRef.current) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 5) d.moved = true;
    if (d.mode === 'pan') {
      setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
    } else if (d.id) {
      const k = viewRef.current.k;
      setDragNodes((prev) => ({
        ...prev,
        [d.id!]: { x: d.vx + dx / k, y: d.vy + dy / k },
      }));
    }
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.moved) return;
    if (d.mode === 'node' && d.id) {
      setFiltersOpen(false);
      setFocusEdge(null);
      setSelectedEdge(null);
      // Same node again → deselect; otherwise select + open bottom dock
      if (selectedId === d.id) clearSelection();
      else setSelectedId(d.id);
      return;
    }
    clearSelection();
  };

  const selectEdge = (e: Edge) => {
    const key = edgeKey(e);
    setFiltersOpen(false);
    setFocusEdge(null);
    if (selectedEdge === key) {
      clearSelection();
      return;
    }
    setSelectedId(null);
    setSelectedEdge(key);
  };

  const primaryType = (e: Edge) => e.types[0] || 'friend';

  return (
    <div className={`god-map${dockOpen ? ' has-dock' : ''}`}>
      <div
        ref={wrapRef}
        className="god-map__stage"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="god-map__hud" onPointerDown={(e) => e.stopPropagation()}>
          {onBack ? (
            <button type="button" className="god-map__fab" onClick={onBack} aria-label="Назад к Ops">
              <ArrowLeft size={18} />
            </button>
          ) : null}
          <Link href="/" className="god-map__fab god-map__fab-home" aria-label="На главную сайта" title="На сайт">
            <Home size={18} />
          </Link>
          <div className="god-map__search">
            <Search size={16} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск…"
              enterKeyHint="search"
            />
            {q ? (
              <button type="button" className="god-map__icon-clear" onClick={() => setQ('')} aria-label="Очистить">
                <X size={14} />
              </button>
            ) : null}
          </div>
          <button
            type="button"
            className={`god-map__fab${filtersOpen ? ' is-on' : ''}`}
            onClick={() => setFiltersOpen((v) => !v)}
            aria-label="Фильтры"
          >
            <SlidersHorizontal size={18} />
          </button>
          <button
            type="button"
            className="god-map__fab"
            disabled={loading}
            onClick={() => void load()}
            aria-label="Обновить"
          >
            <RefreshCw size={18} className={loading ? 'god-map__spin' : undefined} />
          </button>
        </div>

        <div className="god-map__meta" onPointerDown={(e) => e.stopPropagation()}>
          {data ? `${data.nodeCount} чел. · ${data.edgeCount} связей · ${data.days}д` : loading ? '…' : '—'}
        </div>

        <div className="god-map__zoom" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" aria-label="Приблизить" onClick={() => zoomAt(1.25)}>
            <Plus size={18} />
          </button>
          <button type="button" aria-label="Отдалить" onClick={() => zoomAt(0.8)}>
            <Minus size={18} />
          </button>
          <button type="button" aria-label="Вписать" onClick={fitView}>
            <Maximize2 size={16} />
          </button>
        </div>

        {filtersOpen ? (
          <div className="god-map__filters" onPointerDown={(e) => e.stopPropagation()}>
            <div className="god-map__filters-row">
              <label>
                Дней
                <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                  {[30, 60, 90, 180, 365].map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Вес ≥
                <select value={minWeight} onChange={(e) => setMinWeight(Number(e.target.value))}>
                  {[1, 2, 3, 5, 8].map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="god-map__chips">
              {ALL_TYPES.map((t) => {
                const on = types.includes(t.id);
                return (
                  <button key={t.id} type="button" className={on ? 'is-on' : undefined} onClick={() => toggleType(t.id)}>
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {error ? <p className="god-map__error">{error}</p> : null}

        {!loading && laidOut.length === 0 ? (
          <p className="god-map__empty">Мало связей — откройте фильтры и снизьте вес.</p>
        ) : (
          <svg width={size.w} height={size.h} className="god-map__svg" role="img" aria-label="Карта связей">
            <defs>
              <radialGradient id="godGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#0d9488" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#0d9488" stopOpacity="0" />
              </radialGradient>
              <filter id="godSoft" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#0d9488" floodOpacity="0.3" />
              </filter>
            </defs>
            <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
              {(data?.edges || []).map((e) => {
                const a = nodeMap.get(e.source);
                const b = nodeMap.get(e.target);
                if (!a || !b) return null;
                const key = edgeKey(e);
                const dimSearch =
                  filteredIds && !filteredIds.has(e.source) && !filteredIds.has(e.target);
                const hasFocus = Boolean(selectedId || selectedEdge || focusEdge);
                const inNodeSel =
                  Boolean(selectedId) &&
                  neighborIds.has(e.source) &&
                  neighborIds.has(e.target);
                const hot = selectedEdge === key || focusEdge === key || inNodeSel;
                const faded = Boolean(dimSearch) || (hasFocus && !hot);
                const color = colorOf.get(primaryType(e)) || '#64748b';
                const sw = Math.max(2, Math.min(12, 2 + (e.weight / maxWeight) * 9));
                const d = curvePath(a.x || 0, a.y || 0, b.x || 0, b.y || 0, bendForKey(key));
                return (
                  <g
                    key={key}
                    onPointerDown={(ev) => {
                      ev.stopPropagation();
                      selectEdge(e);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(28, sw + 16)} />
                    <path
                      d={d}
                      fill="none"
                      stroke={color}
                      strokeWidth={hot ? sw : Math.max(1.5, sw * 0.4)}
                      strokeOpacity={faded ? 0.04 : hot ? 0.95 : 0.22}
                      strokeLinecap="round"
                    />
                    {hot && !faded ? (
                      <path
                        d={d}
                        fill="none"
                        stroke={color}
                        strokeWidth={Math.max(1.5, sw * 0.35)}
                        strokeOpacity={0.9}
                        strokeLinecap="round"
                        strokeDasharray="5 9"
                        className="god-map__flow"
                      />
                    ) : null}
                  </g>
                );
              })}

              {laidOut.map((n) => {
                const r = 13 + Math.min(12, Math.sqrt(n.degree) * 1.1);
                const dimSearch = filteredIds && !filteredIds.has(n.id);
                const hasFocus = Boolean(selectedId || selectedEdge);
                const inFocus = !hasFocus || neighborIds.has(n.id);
                const hot =
                  selectedId === n.id ||
                  hoverId === n.id ||
                  Boolean(selectedEdge && neighborIds.has(n.id));
                const faded = Boolean(hasFocus && !inFocus) || Boolean(dimSearch);
                const showLabel = labelIds.has(n.id);
                return (
                  <g
                    key={n.id}
                    opacity={faded ? 0.12 : 1}
                    onPointerDown={(e) => onNodePointerDown(e, n.id)}
                    onPointerEnter={() => setHoverId(n.id)}
                    onPointerLeave={() => setHoverId((h) => (h === n.id ? null : h))}
                    style={{ cursor: 'grab' }}
                  >
                    {hot ? <circle cx={n.x} cy={n.y} r={r + 14} fill="url(#godGlow)" /> : null}
                    <circle cx={n.x} cy={n.y} r={r + 12} fill="transparent" />
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={r}
                      fill={hot ? 'var(--primary)' : 'var(--primary-hover)'}
                      stroke={hot ? '#99f6e4' : 'rgba(231,243,241,0.4)'}
                      strokeWidth={hot ? 2.5 : 1.5}
                      filter="url(#godSoft)"
                    />
                    <text
                      x={n.x}
                      y={n.y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={Math.max(10, Math.min(13, r * 0.55))}
                      fill="#ecfeff"
                      fontWeight={700}
                      pointerEvents="none"
                    >
                      {(n.label.replace(/\s+/g, ' ').trim()[0] || '?').toUpperCase()}
                    </text>
                    {showLabel ? (
                      <g pointerEvents="none">
                        <rect
                          x={(n.x || 0) - 70}
                          y={(n.y || 0) + r + 8}
                          width={140}
                          height={20}
                          rx={6}
                          fill="rgba(12,31,28,0.9)"
                          stroke="rgba(13,148,136,0.35)"
                        />
                        <text
                          x={n.x}
                          y={(n.y || 0) + r + 21}
                          textAnchor="middle"
                          fontSize={10}
                          fill="#e7f3f1"
                          fontWeight={600}
                        >
                          {n.label.length > 22 ? `${n.label.slice(0, 21)}…` : n.label}
                        </text>
                      </g>
                    ) : null}
                  </g>
                );
              })}
            </g>
          </svg>
        )}

        {!filtersOpen ? (
          <div className="god-map__legend-bar" onPointerDown={(e) => e.stopPropagation()}>
            {(data?.legend || []).map((l) => (
              <span key={l.type}>
                <i style={{ background: l.color }} />
                {l.label}
              </span>
            ))}
            <span className="god-map__legend-note">толще = чаще</span>
          </div>
        ) : null}
      </div>

      {dockOpen ? (
        <aside className="god-map__dock" aria-live="polite" onPointerDown={(e) => e.stopPropagation()}>
          <div className="god-map__dock-handle" />
          <button type="button" className="god-map__sheet-x" aria-label="Закрыть" onClick={clearSelection}>
            <X size={16} />
          </button>

          {selectedNode ? (
            <>
              <div className="god-map__dock-head">
                <div className="god-map__avatar">{selectedNode.label[0]?.toUpperCase()}</div>
                <div>
                  <h3>{selectedNode.label}</h3>
                  <p className="god-map__muted">
                    {ROLE_RU[selectedNode.role] || selectedNode.role}
                    {selectedNode.code ? ` · #${selectedNode.code}` : ''}
                    {` · ${related.length} связей`}
                  </p>
                  <p className="god-map__eco">
                    {selectedNode.ecoPoints.toLocaleString('ru-RU')} эко
                  </p>
                </div>
                <Link
                  href={`/u/${selectedNode.code || selectedNode.id}`}
                  className="god-map__cta"
                  target="_blank"
                >
                  Профиль
                </Link>
                <Link
                  href={`/messages?with=${encodeURIComponent(selectedNode.id)}`}
                  className="god-map__cta"
                  title="Написать"
                >
                  <MessageCircle size={14} />
                  Написать
                </Link>
              </div>
              <ul className="god-map__dock-list">
                {related.map((e) => {
                  const otherId = e.source === selectedId ? e.target : e.source;
                  const other = nodeMap.get(otherId);
                  const k = edgeKey(e);
                  const color = colorOf.get(primaryType(e)) || '#64748b';
                  const pct = Math.round((e.weight / maxWeight) * 100);
                  return (
                    <li
                      key={k}
                      className={focusEdge === k ? 'is-focus' : undefined}
                      onPointerEnter={() => setFocusEdge(k)}
                      onPointerLeave={() => setFocusEdge((cur) => (cur === k ? null : cur))}
                      onClick={() => {
                        setSelectedEdge(k);
                        setSelectedId(null);
                      }}
                    >
                      <div className="god-map__dock-row">
                        <strong>{other?.label || otherId}</strong>
                        <span className="god-map__weight">×{e.weight}</span>
                      </div>
                      <div className="god-map__type-row">
                        {e.types.map((t) => (
                          <span
                            key={t}
                            className="god-map__type-pill"
                            style={{
                              borderColor: colorOf.get(t) || '#64748b',
                              color: colorOf.get(t) || '#64748b',
                            }}
                          >
                            <i style={{ background: colorOf.get(t) || '#64748b' }} />
                            {typeLabel(t)}
                          </span>
                        ))}
                      </div>
                      <div className="god-map__bar" aria-hidden>
                        <i style={{ width: `${pct}%`, background: color }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : activeEdge ? (
            <>
              <div className="god-map__dock-head">
                <div>
                  <h3>Связь</h3>
                  <p className="god-map__muted">вес {activeEdge.weight}</p>
                </div>
              </div>
              <div className="god-map__ends">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(activeEdge.source);
                    setSelectedEdge(null);
                  }}
                >
                  {nodeMap.get(activeEdge.source)?.label || activeEdge.source}
                </button>
                <span>↔</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(activeEdge.target);
                    setSelectedEdge(null);
                  }}
                >
                  {nodeMap.get(activeEdge.target)?.label || activeEdge.target}
                </button>
              </div>
              <div className="god-map__type-row" style={{ marginTop: 8 }}>
                {activeEdge.types.map((t) => (
                  <span
                    key={t}
                    className="god-map__type-pill"
                    style={{
                      borderColor: colorOf.get(t) || '#64748b',
                      color: colorOf.get(t) || '#64748b',
                    }}
                  >
                    <i style={{ background: colorOf.get(t) || '#64748b' }} />
                    {typeLabel(t)}
                  </span>
                ))}
              </div>
              {activeEdge.detail.events?.length ? (
                <p className="god-map__dock-detail">События: {activeEdge.detail.events.join('; ')}</p>
              ) : null}
              {activeEdge.detail.clubs?.length ? (
                <p className="god-map__dock-detail">Клубы: {activeEdge.detail.clubs.join('; ')}</p>
              ) : null}
              {activeEdge.detail.projects?.length ? (
                <p className="god-map__dock-detail">Проекты: {activeEdge.detail.projects.join('; ')}</p>
              ) : null}
              {activeEdge.detail.dmCount ? (
                <p className="god-map__dock-detail">Сообщений: {activeEdge.detail.dmCount}</p>
              ) : null}
              {activeEdge.detail.ips?.length ? (
                <p className="god-map__dock-detail god-map__danger">IP: {activeEdge.detail.ips.join(', ')}</p>
              ) : null}
            </>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}
