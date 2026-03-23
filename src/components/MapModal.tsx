import React, { useState, useRef, useCallback } from 'react';
import { X, Search } from 'lucide-react';
import { LorebookEntry, Profile, MemoryEntry } from '../types';

// ─── Constants ───────────────────────────────────────────────────────────────
const SVG_W = 680;
const SVG_H = 520;
const MAP_SCALE = 2.2;
const CLUSTER_THRESHOLD = 20; // 地圖單位，小於此距離的地點合併為一群
const MAP_PALETTE = {
  paper: '#f4ecdc',
  paperDeep: '#e6d6bf',
  know: '#886847',
  ink: '#ddd8d4',
  inkSoft: '#685c57',
  accent: '#376baf',
  accentStrong: '#776c61',
  water: '#9bb6c8',
  pine: '#7a8e7a',
  glow: 'rgba(84, 73, 122, 0.35)',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function toSvg(x: number, y: number, panX: number, panY: number) {
  return {
    cx: SVG_W / 2 + x * MAP_SCALE + panX,
    cy: SVG_H / 2 - y * MAP_SCALE + panY,
  };
}

function starPoints(cx: number, cy: number, r1: number, r2: number, n = 8): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? r1 : r2;
    const angle = (Math.PI / n) * i - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(' ');
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface Cluster {
  primary: LorebookEntry;
  members: LorebookEntry[];
}

interface MapModalProps {
  isOpen: boolean;
  onClose: () => void;
  lorebookEntries: LorebookEntry[];
  currentLocation: string;
  profile: Profile;
  memories: MemoryEntry[];
  onTravel: (destName: string, byCarriage: boolean) => void;
  showToast: (msg: string) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────
export const MapModal: React.FC<MapModalProps> = ({
  isOpen, onClose, lorebookEntries, currentLocation, profile, memories, onTravel, showToast,
}) => {
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const [travelMode, setTravelMode] = useState<'walk' | 'carriage' | null>(null);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [goldWarning, setGoldWarning] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [resetHint, setResetHint] = useState(false);
  const isDragging = useRef(false);
  const lastPan = useRef({ x: 0, y: 0 });
  const panRafRef = useRef<number | null>(null);
  const pendingPan = useRef<{ dx: number; dy: number } | null>(null);

  // ── Drag（必須在 early return 前，否則違反 Rules of Hooks）──────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if ((e.target as Element).closest('[data-node]')) return;
    isDragging.current = true;
    lastPan.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastPan.current.x;
    const dy = e.clientY - lastPan.current.y;
    lastPan.current = { x: e.clientX, y: e.clientY };
    pendingPan.current = { dx, dy };
    if (panRafRef.current !== null) return;
    panRafRef.current = requestAnimationFrame(() => {
      const delta = pendingPan.current;
      panRafRef.current = null;
      pendingPan.current = null;
      if (!delta) return;
      setPanX(p => Math.max(-350, Math.min(350, p + delta.dx)));
      setPanY(p => Math.max(-350, Math.min(350, p + delta.dy)));
    });
  }, []);

  const handlePointerUp = useCallback(() => { isDragging.current = false; }, []);

  if (!isOpen) return null;

  // ── Data ────────────────────────────────────────────────────────────────────
  const mapNodes = lorebookEntries.filter(e => e.category === '地點' && e.mapX != null && e.mapY != null);

  // 座標分群：距離 < CLUSTER_THRESHOLD 的節點合為一群
  const clusters: Cluster[] = [];
  const assignedIds = new Set<number>();
  for (const node of mapNodes) {
    if (assignedIds.has(node.id)) continue;
    const members: LorebookEntry[] = [node];
    assignedIds.add(node.id);
    for (const other of mapNodes) {
      if (assignedIds.has(other.id)) continue;
      const dist = Math.sqrt((other.mapX! - node.mapX!) ** 2 + (other.mapY! - node.mapY!) ** 2);
      if (dist < CLUSTER_THRESHOLD) {
        members.push(other);
        assignedIds.add(other.id);
      }
    }
    clusters.push({ primary: node, members });
  }

  // 找出 selectedTitle 屬於哪個群
  const selectedCluster = selectedTitle
    ? clusters.find(c => c.members.some(m => m.title === selectedTitle)) ?? null
    : null;

  const selectedNode = selectedTitle
    ? mapNodes.find(e => e.title === selectedTitle) ?? null
    : null;

  const isAtSelected = selectedTitle === currentLocation;

  // currentLocation 屬於哪個群（bezier 起點用）
  const currentCluster = clusters.find(c => c.members.some(m => m.title === currentLocation));
  const currentNode = currentCluster?.primary ?? null;
  const selectedPrimary = selectedCluster?.primary ?? null;

  const selectedMemories = selectedNode
    ? memories.filter(m =>
        m.type === 'region' &&
        (m.tags?.locations ?? []).includes(selectedNode.title)
      )
    : [];

  const filteredNodes = searchQuery.trim()
    ? mapNodes.filter(e => e.title.includes(searchQuery) || (e.content || '').includes(searchQuery))
    : mapNodes;

  const routeSegments = (() => {
    const routeMap = new Map<string, LorebookEntry>();
    mapNodes.forEach(node => routeMap.set(node.title, node));
    const seen = new Set<string>();
    const segments: { from: LorebookEntry; to: LorebookEntry }[] = [];

    mapNodes.forEach(node => {
      (node.adjacentTo || []).forEach(adjTitle => {
        const target = routeMap.get(adjTitle);
        if (!target) return;
        const key = [node.title, target.title].sort().join('||');
        if (seen.has(key)) return;
        seen.add(key);
        segments.push({ from: node, to: target });
      });
    });

    if (segments.length === 0) {
      const knownNodes = mapNodes.filter(node => node.mapStatus === 'known' || node.title === currentLocation);
      knownNodes.forEach(node => {
        const nearest = knownNodes
          .filter(other => other.id !== node.id)
          .map(other => ({
            other,
            dist: (other.mapX! - node.mapX!) ** 2 + (other.mapY! - node.mapY!) ** 2,
          }))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 2);

        nearest.forEach(({ other }) => {
          const key = [node.title, other.title].sort().join('||');
          if (seen.has(key)) return;
          seen.add(key);
          segments.push({ from: node, to: other });
        });
      });
    }

    return segments;
  })();

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleClusterClick = (cluster: Cluster, e: React.MouseEvent) => {
    e.stopPropagation();
    setGoldWarning(false);
    setTravelMode(null);
    if (cluster.members.length === 1) {
      setSelectedTitle(prev => prev === cluster.primary.title ? null : cluster.primary.title);
    } else {
      // 多成員群：若已選取該群則取消，否則選取群的 primary
      const alreadySelected = selectedCluster === cluster;
      setSelectedTitle(alreadySelected ? null : cluster.primary.title);
    }
  };

  const handleSubLabelClick = (title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setGoldWarning(false);
    setTravelMode(null);
    setSelectedTitle(prev => prev === title ? null : title);
  };

  const handleDepart = () => {
    if (!selectedTitle || !selectedNode || !travelMode) return;
    if (travelMode === 'carriage') {
      const fare = selectedNode.cartFare ?? 0;
      if (profile.gold < fare) { setGoldWarning(true); return; }
    }
    onTravel(selectedTitle, travelMode === 'carriage');
    setSelectedTitle(null);
    setTravelMode(null);
  };

  const handleCompassClick = () => {
    setPanX(0);
    setPanY(0);
    setResetHint(true);
    showToast('🧭 視角已重置');
    setTimeout(() => setResetHint(false), 1500);
  };

  // ── Bezier ───────────────────────────────────────────────────────────────────
  const bezierPath = (() => {
    if (!currentNode || !selectedPrimary || currentCluster === selectedCluster) return null;
    const p1 = toSvg(currentNode.mapX!, currentNode.mapY!, panX, panY);
    const p2 = toSvg(selectedPrimary.mapX!, selectedPrimary.mapY!, panX, panY);
    const cx1 = p1.cx + (p2.cx - p1.cx) * 0.5;
    const cy1 = p1.cy - 55;
    const cx2 = p2.cx - (p2.cx - p1.cx) * 0.2;
    const cy2 = p2.cy - 55;
    return `M ${p1.cx} ${p1.cy} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${p2.cx} ${p2.cy}`;
  })();

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        className="w-full max-w-5xl rounded-[10px] shadow-[0_0_80px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden h-[87vh]"
        style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border-default)', borderTop: '1.5px solid #fde68a' }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="px-5 py-3 flex items-center gap-3 shrink-0" style={{ borderBottom: '0.5px solid var(--border-default)' }}>
          <h2 className="text-base font-bold tracking-widest shrink-0" style={{ color: '#fde68a', fontFamily: "'Noto Sans TC', sans-serif" }}>
            ✦ 世界地圖
          </h2>
          <div className="flex-1 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="搜尋地點..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-none outline-none bg-transparent"
              style={{ borderBottom: '1px solid var(--border-default)', color: 'var(--text-tab)', fontFamily: "'Noto Sans TC', sans-serif" }}
            />
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full shrink-0 transition"
            style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border-default)', color: '#4a7ac9' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fde68a')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden flex min-h-0">

          {/* ── SVG Map ─────────────────────────────────────────────────── */}
          <div className="flex-[3] relative overflow-hidden select-none" style={{ background: MAP_PALETTE.paper }}>
            <svg
              width="100%" height="100%"
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              preserveAspectRatio="xMidYMid slice"
              style={{ display: 'block' }}
              className="cursor-grab active:cursor-grabbing"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              <defs>
                <pattern id="map-grid" width="48" height="48" patternUnits="userSpaceOnUse">
                  <rect width="48" height="48" fill="rgba(244,236,220,0.6)" />
                  <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(139,123,107,0.18)" strokeWidth="0.6" />
                </pattern>
                <radialGradient id="map-vig" cx="50%" cy="50%" r="70%">
                  <stop offset="45%" stopColor="transparent" />
                  <stop offset="100%" stopColor="rgba(107,90,76,0.35)" />
                </radialGradient>
                {/* 金色暈光 filter */}
                <filter id="glow-gold" x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur stdDeviation="6" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                {/* 深紅暈光 filter */}
                <filter id="glow-red" x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur stdDeviation="5" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                {/* 藍色暈光 filter（hover） */}
                <filter id="glow-blue" x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                {/* 地標針陰影 filter */}
                <filter id="pin-shadow" x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.35" />
                </filter>
              </defs>

              <rect width={SVG_W} height={SVG_H} fill={MAP_PALETTE.paper} />
              <rect width={SVG_W} height={SVG_H} fill="url(#map-grid)" />

              {/* Bezier 曲線 */}
              {bezierPath && (
                <path d={bezierPath} fill="none" stroke={MAP_PALETTE.accentStrong} strokeWidth="2" strokeDasharray="6 4" opacity={0.8} />
              )}

              {/* 節點（只渲染各群的 primary） */}
              {clusters.map((cluster, clusterIndex) => {
                const loc = cluster.primary;
                const { cx, cy } = toSvg(loc.mapX!, loc.mapY!, panX, panY);

                // 判斷此群是否有任一成員是 currentLocation 或 selectedTitle
                const isCurrent = cluster.members.some(m => m.title === currentLocation);
                const isSelected = cluster === selectedCluster;
                const isKnown = cluster.members.some(m => m.mapStatus === 'known') || isCurrent;
                const isMulti = cluster.members.length > 1;

                return (
                  <g
                    key={loc.id}
                    data-node="true"
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => handleClusterClick(cluster, e)}
                  >
                    {/* ── Heard: 虛線圓圈 ── */}
                    {!isKnown && (
                      <>
                        {isSelected && (
                          <circle cx={cx} cy={cy} r={18} fill="rgba(235, 235, 235, 0.18)"
                            stroke={MAP_PALETTE.accentStrong} strokeWidth="0" filter="url(#glow-red)" />
                        )}
                        <circle
                          cx={cx} cy={cy} r={8}
                          fill={isSelected ? 'rgba(199,122,90,0.18)' : MAP_PALETTE.paper}
                          stroke={isSelected ? MAP_PALETTE.accentStrong : MAP_PALETTE.inkSoft}
                          strokeWidth={isSelected ? '1.5' : '1.2'}
                          strokeDasharray="3 2"
                          opacity={isSelected ? 0.85 : 0.38}
                        />
                        <text x={cx} y={cy + 4.5} textAnchor="middle" fontSize="9"
                          fill={isSelected ? MAP_PALETTE.accentStrong : MAP_PALETTE.inkSoft}
                          opacity={isSelected ? 0.9 : 0.5}
                          style={{ pointerEvents: 'none' }}>?</text>
                        <text x={cx} y={cy + 20} textAnchor="middle" fontSize="10"
                          fill={isSelected ? MAP_PALETTE.accentStrong : MAP_PALETTE.inkSoft}
                          style={{ pointerEvents: 'none', fontFamily: "'Noto Sans TC', sans-serif" }}>???</text>
                      </>
                    )}

                    {/* ── Known: 圓形地標與定位針 ── */}
                    {isKnown && (() => {
                      const baseRadius = 6;
                      const starColor = isCurrent ? MAP_PALETTE.accent : isSelected ? MAP_PALETTE.accentStrong : MAP_PALETTE.know;
                      const centerColor = isCurrent ? '#f9e7b4' : isSelected ? '#dfd5cf' : MAP_PALETTE.water;

                      return (
                        <>
                          {/* 基礎圓形地標 */}
                          <circle
                            cx={cx} cy={cy}
                            r={baseRadius}
                            fill={MAP_PALETTE.paperDeep}
                            stroke={starColor}
                            strokeWidth="3.5"
                            opacity={0.7}
                          />
                          <circle cx={cx} cy={cy} r={baseRadius * 0.8} fill={centerColor} opacity={0.8} />

                          {/* 選取/當前位置：浮現定位針 */}
                          {(isCurrent || isSelected) && (
                            <g filter="url(#pin-shadow)">
                              <path
                                d="M 0,0 C -3,-3 -8,-9 -8,-14 A 8,8 0 1 1 8,-14 C 8,-9 3,-3 0,0 Z"
                                transform={`translate(${cx}, ${cy - 4}) scale(${isCurrent ? 1.3 : 1.1})`}
                                fill={starColor}
                                opacity={1}
                              />
                              <circle 
                                cx={cx} 
                                cy={cy - 4 - (isCurrent ? 18.2 : 15.4)} 
                                r={isCurrent ? 3.5 : 3} 
                                fill={centerColor} 
                                opacity={1} 
                              />
                            </g>
                          )}

                          {/* 地名標籤 */}
                          <text
                            x={cx}
                            y={cy + 22}
                            textAnchor="middle"
                            fontSize={isCurrent || isSelected ? '12' : '11'}
                            fontWeight={isCurrent || isSelected ? '700' : '500'}
                            fill={isCurrent ? MAP_PALETTE.accent : isSelected ? MAP_PALETTE.accentStrong : MAP_PALETTE.know}
                            style={{ pointerEvents: 'none', fontFamily: "'Noto Sans TC', sans-serif", textShadow: '0 1px 3px rgba(255, 255, 255, 0.66)' }}
                          >
                            {isKnown ? loc.title : '???'}
                            {isMulti && isKnown && ' ◆'}
                          </text>
                        </>
                      );
                    })()}

                    {/* ── 多成員群選取後：浮現子地名標籤 ── */}
                    {isMulti && isKnown && isSelected && (() => {
                      const r1 = isCurrent ? 14 : 13;
                      return cluster.members.map((member, mi) => {
                        const isActiveSub = selectedTitle === member.title;
                        const offsetX = mi % 2 === 0 ? -50 : 50;
                        const offsetY = -r1 - 30 - Math.floor(mi / 2) * 24;
                        return (
                          <g
                            key={member.id}
                            data-node="true"
                            style={{ cursor: 'pointer' }}
                            onClick={(e) => handleSubLabelClick(member.title, e)}
                          >
                            <rect
                              x={cx + offsetX - 38} y={cy + offsetY - 11}
                              width={76} height={20} rx={4}
                              fill={isActiveSub ? MAP_PALETTE.accentStrong : MAP_PALETTE.paperDeep}
                              stroke={isActiveSub ? '#a39369' : MAP_PALETTE.accentStrong}
                              strokeWidth="0.8"
                              opacity={0.95}
                            />
                            <text
                              x={cx + offsetX} y={cy + offsetY + 3}
                              textAnchor="middle" fontSize="10"
                              fontWeight={isActiveSub ? '700' : '500'}
                              fill={isActiveSub ? MAP_PALETTE.ink : MAP_PALETTE.inkSoft}
                              style={{ pointerEvents: 'none', fontFamily: "'Noto Sans TC', sans-serif" }}
                            >
                              {member.title}
                            </text>
                          </g>
                        );
                      });
                    })()}
                  </g>
                );
              })}

              <rect width={SVG_W} height={SVG_H} fill="url(#map-vig)" style={{ pointerEvents: 'none' }} />
            </svg>

            {/* ── 羅盤 ──────────────────────────────────────────────────── */}
            <button
              className="absolute bottom-[30px] left-[30px] transition-all duration-300 hover:scale-110"
              style={{ 
                opacity: 0.9, 
                background: 'none', 
                border: 'none', 
                padding: 0, 
                cursor: 'pointer',
                filter: 'drop-shadow(0 4px 12px rgb(107, 90, 76))'
              }}
              onClick={handleCompassClick}
              title="重置視角"
            >
              <svg width="60" height="60" viewBox="0 0 60 60">
                <circle cx="30" cy="30" r="26" fill={MAP_PALETTE.paperDeep} stroke={MAP_PALETTE.accent} strokeWidth="1.5" opacity="0.95" />
                <polygon points={starPoints(30, 30, 22, 10, 8)} fill="none" stroke={MAP_PALETTE.inkSoft} strokeWidth="1" opacity="0.6" />
                <polygon points="30,6 26,20 34,20" fill={MAP_PALETTE.accent} />
                <polygon points="30,54 26,40 34,40" fill={MAP_PALETTE.inkSoft} />
                <polygon points="6,30 20,26 20,34" fill={MAP_PALETTE.inkSoft} opacity="0.8" />
                <polygon points="54,30 40,26 40,34" fill={MAP_PALETTE.inkSoft} opacity="0.8" />
                <circle cx="30" cy="30" r="5" fill={MAP_PALETTE.paper} stroke={MAP_PALETTE.accent} strokeWidth="1" />
                <circle cx="30" cy="30" r="2.5" fill="#f3d998" />
                <text x="30" y="5" textAnchor="middle" fontSize="8" fill={MAP_PALETTE.accent} fontWeight="900" style={{ fontFamily: "'Noto Sans TC', sans-serif" }}>N</text>
              </svg>
            </button>

            {resetHint && (
              <div className="absolute bottom-[100px] left-[30px] text-[11px] px-2 py-1 rounded-[8px]"
                style={{ background: 'var(--bg-elevated)', border: '0.5px solid #e7b900', color: '#fde68a' }}>
                視角已重置
              </div>
            )}
          </div>

          {/* ── Right Panel ─────────────────────────────────────────────── */}
          <div
            className="w-64 flex flex-col overflow-hidden shrink-0"
            style={{ background: 'var(--bg-glass-right)', borderLeft: '0.5px solid var(--border-default)' }}
          >
            {selectedNode ? (
              <>
                {/* ── 上：地點資訊（可捲動） ── */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">

                  {/* 地點名稱 */}
                  <div>
                    <div className="flex items-center justify-center gap-1.5 mt-2 mb-5">
                      <h3 className="font-bold leading-snug"
                        style={{ color: 'var(--text-tab)', fontFamily: "'Noto Sans TC', sans-serif" }}>
                        ✦【{selectedNode.title}】
                      </h3>
                 
                    </div>
                    {/* 菱形分隔線 */}
                    <div className="flex items-center gap-1.5 mt-2 mb-5">
                      <div className="flex-1 h-px" style={{ background: 'var(--text-tab)' }} />
                      <span style={{ color: 'var(--text-tab)', fontSize: 12 }}>◆</span>
                      <div className="flex-1 h-px" style={{ background: 'var(--text-tab)' }} />
                    </div>
                  </div>

                  {/* 描述 */}
                  <p className="text-sm leading-relaxed "
                    style={{ color: 'var(--text-body)', fontFamily: "'Noto Sans TC', sans-serif" }}>
                    {selectedNode.content || '這個地方充滿了未知的故事，等待著探索。'}
                  </p>

                  {/* 區域記憶（中間，始終顯示區塊） */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="flex-1 h-px mt-5" style={{ background: 'var(--text-tab)' }} />
                      <h4 className="mt-5 text-base font-bold uppercase tracking-wider"
                        style={{ color: 'var(--text-tab)', fontFamily: "'Noto Sans TC', sans-serif", flexShrink: 0 }}>
                        ✦ 區域記憶
                      </h4>
                      <div className="flex-1 h-px mt-5" style={{ background: 'var(--text-tab)' }} />
                    </div>
                    {selectedMemories.length > 0 ? (
                      <div className="space-y-1.5">
                        {selectedMemories.map(m => (
                          <div key={m.id} className="text-[11px] pl-2.5 py-1.5 pr-2 rounded-r-[8px]"
                            style={{
                              color: 'var(--text-tab)',
                              borderLeft: '2px solid #fde68a',
                              background: 'rgba(74,122,201,0.06)',
                              fontFamily: "'Noto Sans TC', sans-serif",
                              lineHeight: 1.5,
                            }}>
                            {m.content}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-center py-2"
                        style={{ color: 'var(--text-muted)', fontFamily: "'Noto Sans TC', sans-serif" }}>
                        暫無區域記憶
                      </p>
                    )}
                  </div>
                </div>

                {/* ── 下：前往方式（固定在底部） ── */}
                {!isAtSelected && (
                  <div className="shrink-0 p-4 space-y-2" style={{ borderTop: '0.5px solid var(--border-default)' }}>
                    <h4 className="text-sm font-bold uppercase tracking-wider"
                      style={{ color: 'var(--text-tab)', fontFamily: "'Noto Sans TC', sans-serif" }}>
                      前往方式
                    </h4>
                    <div className="flex gap-2">
                      {/* 徒步 */}
                      <button
                        onClick={() => { setTravelMode(prev => prev === 'walk' ? null : 'walk'); setGoldWarning(false); }}
                        className="flex-1 py-1.5 text-sm rounded-[8px] transition"
                        style={{
                          border: `1px solid ${travelMode === 'walk' ? 'var(--text-tab)' : 'var(--border-default)'}`,
                          color: travelMode === 'walk' ? '#fff' : 'var(--text-tab)',
                          background: travelMode === 'walk' ? 'rgba(74,122,201,0.25)' : 'transparent',
                          fontFamily: "'Noto Sans TC', sans-serif",
                        }}
                      >
                        🚶 徒步
                      </button>
                      {/* 馬車 */}
                      {(selectedNode.cartFare ?? 0) > 0 && (
                        <button
                          onClick={() => { setTravelMode(prev => prev === 'carriage' ? null : 'carriage'); setGoldWarning(false); }}
                          className="flex-1 py-1.5 text-sm rounded-[8px] transition"
                          style={{
                            border: `1px solid ${travelMode === 'carriage' ? '#fde68a' : '#4a4a2a'}`,
                            color: travelMode === 'carriage' ? '#fde68a' : '#fde68a',
                            background: travelMode === 'carriage' ? 'rgba(201,168,76,0.2)' : 'transparent',
                            fontFamily: "'Noto Sans TC', sans-serif",
                          }}
                        >
                          🐴 {selectedNode.cartFare}G
                        </button>
                      )}
                    </div>
                    {goldWarning && (
                      <p className="text-[11px] text-center" style={{ color: '#ef4444' }}>阮囊羞澀</p>
                    )}
                    {travelMode && (
                      <button
                        onClick={handleDepart}
                        className="w-full py-2 text-sm font-bold rounded-[8px] tracking-widest transition"
                        style={{ background: '#fde68a', color: 'var(--bg-elevated)', fontFamily: "'Noto Sans TC', sans-serif" }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#e0bc62')}
                        onMouseLeave={e => (e.currentTarget.style.background = '#fde68a')}
                      >
                        ✦ 啟程
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              /* 無選取 → 地點清單 */
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="px-4 pt-4 pb-2 shrink-0">
                  <h4 className="text-base font-bold uppercase tracking-wider"
                    style={{ color: 'var(--text-tab)', fontFamily: "'Noto Sans TC', sans-serif" }}>
                    已知地點
                  </h4>
                </div>
                <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
                  {(searchQuery.trim() ? filteredNodes : mapNodes)
                    .filter(e => e.mapStatus === 'known' || e.title === currentLocation)
                    .map(loc => (
                      <button key={loc.id}
                        onClick={() => { setSelectedTitle(loc.title); setTravelMode(null); setGoldWarning(false); }}
                        className="w-full text-left px-2.5 py-2 rounded-[2px] text-sm transition"
                        style={{
                          background: loc.title === currentLocation ? 'rgba(201,168,76,0.1)' : 'transparent',
                          color: loc.title === currentLocation ? '#fde68a' : 'var(--text-tab)',
                          fontFamily: "'Noto Sans TC', sans-serif",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(89, 147, 241, 0.36)')}
                        onMouseLeave={e => (e.currentTarget.style.background = loc.title === currentLocation ? 'rgba(201,168,76,0.1)' : 'transparent')}
                      >
                        {loc.title === currentLocation ? '📍 ' : '✦ '}{loc.title}
                      </button>
                    ))
                  }
                  {(searchQuery.trim() ? filteredNodes : mapNodes)
                    .filter(e => e.mapStatus !== 'known' && e.title !== currentLocation).length > 0 && (
                    <>
                      <div className="flex items-center gap-1.5 py-1">
                        <div className="flex-1 h-px " style={{ background: 'var(--text-muted)' }} />
                        <span style={{ color: 'var(--text-muted)'}}>未踏足</span>
                        <div className="flex-1 h-px text-sm" style={{ background: 'var(--text-muted)' }} />
                      </div>
                      {(searchQuery.trim() ? filteredNodes : mapNodes)
                        .filter(e => e.mapStatus !== 'known' && e.title !== currentLocation)
                        .map(loc => (
                          <button key={loc.id}
                            onClick={() => { setSelectedTitle(loc.title); setTravelMode(null); setGoldWarning(false); }}
                            className="w-full text-left px-2.5 py-2 rounded-[8px] text-sm transition"
                            style={{ background: 'transparent', color: 'var(--text-muted)', fontFamily: "'Noto Sans TC', sans-serif" }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-muted)' )}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)' )}
                          >
                            ? {loc.title}
                          </button>
                        ))
                      }
                    </>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};
