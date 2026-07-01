import React, { useState, useRef, useCallback } from 'react';
import { X, Search } from 'lucide-react';
import { LorebookEntry, Profile, MemoryEntry, Faction, Npc } from '../types';

// ─── Constants ───────────────────────────────────────────────────────────────
const SVG_W = 680;
const SVG_H = 520;
const MAP_SCALE = 2.2;
const CLUSTER_THRESHOLD = 20;
const MAP_PALETTE = {
  paper: '#f9f4f0',
  paperDeep: '#e8dcd3',
  know: '#a0826d',
  ink: '#d4c4b8',
  inkSoft: '#9b8b7e',
  accentStrong: '#8e3d37',
  accent: '#08357E',
  water: '#b8a89e',
  pine: '#9b8576',
  glow: 'rgba(193, 143, 115, 0.25)',
};
const FACTION_PALETTE = ['#7F77DD', '#E24B4A', '#1D9E75', '#EF9F27', '#5f93d3', '#C47D3E', '#FF637E'];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function toSvg(x: number, y: number, panX: number, panY: number) {
  return { cx: SVG_W / 2 + x * MAP_SCALE + panX, cy: SVG_H / 2 - y * MAP_SCALE + panY };
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
function getFactionColor(faction: Faction, index: number): string {
  return faction.color ?? FACTION_PALETTE[index % FACTION_PALETTE.length];
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface Cluster { primary: LorebookEntry; members: LorebookEntry[]; }

interface MapModalProps {
  isOpen: boolean;
  onClose: () => void;
  lorebookEntries: LorebookEntry[];
  currentLocation: string;
  profile: Profile;
  memories: MemoryEntry[];
  onTravel: (destName: string, byCarriage: boolean) => void;
  showToast: (msg: string) => void;
  factions: Faction[];
  npcs: Npc[];
  onOpenNpcModal: (npcId: number) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────
export const MapModal: React.FC<MapModalProps> = ({
  isOpen, onClose, lorebookEntries, currentLocation, profile, memories, onTravel, showToast,
  factions, npcs, onOpenNpcModal,
}) => {
  const [activeTab, setActiveTab] = useState<'map' | 'faction'>('map');
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const [travelMode, setTravelMode] = useState<'walk' | 'carriage' | null>(null);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [goldWarning, setGoldWarning] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFactionId, setSelectedFactionId] = useState<number | null>(null);
  const [factionPanX, setFactionPanX] = useState(0);
  const [factionPanY, setFactionPanY] = useState(0);
  const isDragging = useRef(false);
  const lastPan = useRef({ x: 0, y: 0 });
  const panRafRef = useRef<number | null>(null);
  const pendingPan = useRef<{ dx: number; dy: number } | null>(null);
  const isFactionDragging = useRef(false);
  const lastFactionPan = useRef({ x: 0, y: 0 });
  const factionPanRafRef = useRef<number | null>(null);
  const pendingFactionPan = useRef<{ dx: number; dy: number } | null>(null);

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

  const handleFactionPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if ((e.target as Element).closest('[data-node]')) return;
    isFactionDragging.current = true;
    lastFactionPan.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
  }, []);
  const handleFactionPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!isFactionDragging.current) return;
    const dx = e.clientX - lastFactionPan.current.x;
    const dy = e.clientY - lastFactionPan.current.y;
    lastFactionPan.current = { x: e.clientX, y: e.clientY };
    pendingFactionPan.current = { dx, dy };
    if (factionPanRafRef.current !== null) return;
    factionPanRafRef.current = requestAnimationFrame(() => {
      const delta = pendingFactionPan.current;
      factionPanRafRef.current = null;
      pendingFactionPan.current = null;
      if (!delta) return;
      setFactionPanX(p => Math.max(-350, Math.min(350, p + delta.dx)));
      setFactionPanY(p => Math.max(-350, Math.min(350, p + delta.dy)));
    });
  }, []);
  const handleFactionPointerUp = useCallback(() => { isFactionDragging.current = false; }, []);

  const [isMobile, setIsMobile] = React.useState(() => window.innerWidth <= 640);
  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  if (!isOpen) return null;

  // ── Geo Map Data ──────────────────────────────────────────────────────────
  const mapNodes = lorebookEntries.filter(e => e.category === '地點' && e.mapX != null && e.mapY != null);
  const clusters: Cluster[] = [];
  const assignedIds = new Set<number>();
  for (const node of mapNodes) {
    if (assignedIds.has(node.id)) continue;
    const members: LorebookEntry[] = [node];
    assignedIds.add(node.id);
    for (const other of mapNodes) {
      if (assignedIds.has(other.id)) continue;
      const dist = Math.sqrt((other.mapX! - node.mapX!) ** 2 + (other.mapY! - node.mapY!) ** 2);
      if (dist < CLUSTER_THRESHOLD) { members.push(other); assignedIds.add(other.id); }
    }
    clusters.push({ primary: node, members });
  }
  const selectedCluster = selectedTitle
    ? clusters.find(c => c.members.some(m => m.title === selectedTitle)) ?? null : null;
  const selectedNode = selectedTitle ? mapNodes.find(e => e.title === selectedTitle) ?? null : null;
  const isAtSelected = selectedTitle === currentLocation;
  const currentCluster = clusters.find(c => c.members.some(m => m.title === currentLocation));
  const currentNode = currentCluster?.primary ?? null;
  const selectedPrimary = selectedCluster?.primary ?? null;
  const selectedMemories = selectedNode
    ? memories.filter(m => m.type === 'region' && (m.tags?.locations ?? []).includes(selectedNode.title))
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
      // Bug #5 fix: fallback 只連 known + currentLocation，排除 heard 節點避免意外連線
      const knownNodes = mapNodes.filter(node => (node.mapStatus === 'known' || node.title === currentLocation) && node.mapStatus !== 'heard');
      knownNodes.forEach(node => {
        const nearest = knownNodes.filter(other => other.id !== node.id)
          .map(other => ({ other, dist: (other.mapX! - node.mapX!) ** 2 + (other.mapY! - node.mapY!) ** 2 }))
          .sort((a, b) => a.dist - b.dist).slice(0, 2);
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

  // ── Faction Data ──────────────────────────────────────────────────────────
  const activeFactions = factions.filter(f => f.isActive);
  const getLocationFactions = (locId: number): Faction[] =>
    activeFactions.map((f, i) => ({ f, i })).filter(({ f }) => f.homeId === locId).map(({ f }) => f);
  const getFColor = (faction: Faction): string => {
    const idx = activeFactions.findIndex(f => f.id === faction.id);
    return getFactionColor(faction, idx);
  };
  const getFactionNodePos = (faction: Faction, fi: number): { x: number; y: number } => {
    if (faction.homeId != null) {
      const homeLoc = lorebookEntries.find(e => e.id === faction.homeId);
      if (homeLoc?.mapX != null && homeLoc?.mapY != null) {
        const siblingIds = activeFactions.filter(f => f.homeId === faction.homeId).map(f => f.id);
        const sibIdx = siblingIds.indexOf(faction.id);
        const total = siblingIds.length;
        const spread = total > 1 ? 28 : 0;
        const offset = (sibIdx - (total - 1) / 2) * spread;
        const { cx, cy } = toSvg(homeLoc.mapX, homeLoc.mapY, factionPanX, factionPanY);
        return { x: cx + offset, y: cy - (total > 1 ? 20 : 0) };
      }
    }
    const count = activeFactions.length || 1;
    const angle = (2 * Math.PI / count) * fi - Math.PI / 2;
    const ringR = Math.min(160, 60 + count * 20);
    return { x: SVG_W / 2 + ringR * Math.cos(angle), y: SVG_H / 2 - 60 + ringR * Math.sin(angle) };
  };
  const getFactionMembers = (faction: Faction): Npc[] => {
    const fromNpcIds = npcs.filter(n => (n.factionIds ?? []).includes(faction.id));
    const fromFactionNpcIds = (faction.npcIds ?? []).length > 0
      ? npcs.filter(n => (faction.npcIds ?? []).includes(n.id)) : [];
    const all = [...fromNpcIds];
    fromFactionNpcIds.forEach(n => { if (!all.find(a => a.id === n.id)) all.push(n); });
    return all;
  };
  const selectedFaction = selectedFactionId != null
    ? activeFactions.find(f => f.id === selectedFactionId) ?? null : null;
  const relationStyle = (type: string): { color: string; width: number; dash?: string } => {
    switch (type) {
      case 'ally':   return { color: '#1D9E75', width: 2.5 };
      case 'enemy':  return { color: '#E24B4A', width: 2.5 };
      case 'rival':  return { color: '#EF9F27', width: 2 };
      case 'vassal': return { color: '#888780', width: 1.5 };
      default:       return { color: '#888780', width: 1.5, dash: '5,3' };
    }
  };
  const typeLabel = (t: string) =>
    t === 'race' ? '種族' : t === 'guild' ? '公會' : t === 'nation' ? '國家' :
    t === 'religion' ? '宗教' : t === 'criminal' ? '犯罪' : '其他';
  const relLabel = (t: string) =>
    t === 'ally' ? '盟友' : t === 'enemy' ? '敵對' : t === 'rival' ? '競爭' :
    t === 'vassal' ? '附庸' : '中立';

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleClusterClick = (cluster: Cluster, e: React.MouseEvent) => {
    e.stopPropagation();
    setGoldWarning(false); setTravelMode(null);
    if (cluster.members.length === 1) {
      setSelectedTitle(prev => prev === cluster.primary.title ? null : cluster.primary.title);
    } else {
      setSelectedTitle(selectedCluster === cluster ? null : cluster.primary.title);
    }
  };
  const handleSubLabelClick = (title: string, e: React.MouseEvent) => {
    e.stopPropagation(); setGoldWarning(false); setTravelMode(null);
    setSelectedTitle(prev => prev === title ? null : title);
  };
  const handleDepart = () => {
    if (!selectedTitle || !selectedNode || !travelMode) return;
    if (travelMode === 'carriage') {
      const fare = selectedNode.cartFare ?? 0;
      if (profile.gold < fare) { setGoldWarning(true); return; }
    }
    onTravel(selectedTitle, travelMode === 'carriage');
    setSelectedTitle(null); setTravelMode(null);
  };
  const handleCompassClick = () => {
    if (activeTab === 'map') { setPanX(0); setPanY(0); }
    else { setFactionPanX(0); setFactionPanY(0); }
    showToast('🧭 視角已重置');
  };

  const bezierPath = (() => {
    if (!currentNode || !selectedPrimary || currentCluster === selectedCluster) return null;
    const p1 = toSvg(currentNode.mapX!, currentNode.mapY!, panX, panY);
    const p2 = toSvg(selectedPrimary.mapX!, selectedPrimary.mapY!, panX, panY);
    const cx1 = p1.cx + (p2.cx - p1.cx) * 0.5; const cy1 = p1.cy - 55;
    const cx2 = p2.cx - (p2.cx - p1.cx) * 0.2; const cy2 = p2.cy - 55;
    return `M ${p1.cx} ${p1.cy} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${p2.cx} ${p2.cy}`;
  })();

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes pinBounce {
          0% { opacity: 0; transform: translateY(8px); }
          50% { transform: translateY(-4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .map-pin-animate { animation: pinBounce 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
      `}</style>
      <div className={`fixed inset-0 bg-black/85 backdrop-blur-sm z-[60] flex items-center justify-center${isMobile ? '' : ' p-4'}`}>
        <div className="flex flex-col overflow-hidden relative z-[61]" style={{
          background: 'var(--bg-elevated)', border: '0.5px solid var(--border-default)',
          borderTop: '1.5px solid #fde68a', borderRadius: isMobile ? '0' : '10px',
          boxShadow: '0 0 80px rgba(0,0,0,0.8)',
          width: isMobile ? '100%' : undefined, maxWidth: isMobile ? '100%' : '64rem',
          height: isMobile ? '100%' : '87vh',
        }}>
          {/* Header */}
          <div className="px-5 py-3 flex items-center gap-3 shrink-0" style={{ borderBottom: '0.5px solid var(--border-default)' }}>
            <h2 className="text-base font-bold tracking-widest shrink-0" style={{ color: '#fde68a', fontFamily: "'Noto Sans TC', sans-serif" }}>
              ✦ 世界地圖
            </h2>
            <div className="flex-1 relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
              <input type="text" placeholder={isMobile ? '搜尋...' : '搜尋地點...'}
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm rounded-none outline-none bg-transparent"
                style={{ borderBottom: '1px solid var(--border-default)', color: 'var(--text-tab)', fontFamily: "'Noto Sans TC', sans-serif" }}
              />
            </div>
            {/* Tab switcher */}
            <div style={{ display: 'flex', gap: 2, background: 'var(--bg-base)', borderRadius: 8, padding: 3 }}>
              {(['map', 'faction'] as const).map(t => (
                <button key={t}
                  onClick={() => { setActiveTab(t); setSelectedFactionId(null); }}
                  style={{
                    padding: '4px 14px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                    background: activeTab === t ? 'var(--bg-elevated)' : 'transparent',
                    color: activeTab === t ? 'var(--text-primary)' : 'var(--text-muted)',
                    border: activeTab === t ? '0.5px solid var(--border-default)' : 'none',
                    fontWeight: activeTab === t ? 500 : 400,
                  }}
                >{t === 'map' ? '地理' : '勢力'}</button>
              ))}
            </div>
            <button onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-full shrink-0 transition"
              style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border-default)', color: 'var(--text-muted)' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#fde68a')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
            ><X className="w-3.5 h-3.5" /></button>
          </div>

          {/* Body */}
          <div className={`flex-1 overflow-hidden min-h-0 ${isMobile ? 'flex flex-col' : 'flex'}`}>
            {activeTab === 'map' ? (
              <>
                {/* Geo Map SVG */}
                <div className="relative overflow-hidden select-none" style={{
                  background: MAP_PALETTE.paper, flex: isMobile ? 'none' : '3',
                  height: isMobile ? '55%' : '100%',
                }}>
                  <svg width="100%" height="100%" viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                    preserveAspectRatio="xMidYMid slice" style={{ display: 'block' }}
                    className="cursor-grab active:cursor-grabbing"
                    onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}
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
                      <filter id="glow-gold" x="-100%" y="-100%" width="300%" height="300%">
                        <feGaussianBlur stdDeviation="6" result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                      </filter>
                      <filter id="glow-red" x="-100%" y="-100%" width="300%" height="300%">
                        <feGaussianBlur stdDeviation="5" result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                      </filter>
                      <filter id="pin-shadow" x="-50%" y="-50%" width="200%" height="200%">
                        <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.35" />
                      </filter>
                    </defs>
                    <rect width={SVG_W} height={SVG_H} fill={MAP_PALETTE.paper} />
                    <rect width={SVG_W} height={SVG_H} fill="url(#map-grid)" />
                    {bezierPath && (
                      <path d={bezierPath} fill="none" stroke={MAP_PALETTE.accentStrong}
                        strokeWidth="2" strokeDasharray="6 4" opacity={0.8} />
                    )}
                    {clusters.map((cluster) => {
                      const loc = cluster.primary;
                      const { cx, cy } = toSvg(loc.mapX!, loc.mapY!, panX, panY);
                      const isCurrent = cluster.members.some(m => m.title === currentLocation);
                      const isSelected = cluster === selectedCluster;
                      const isKnown = cluster.members.some(m => m.mapStatus === 'known') || isCurrent;
                      const isMulti = cluster.members.length > 1;
                      const locFactions = getLocationFactions(loc.id);
                      const nodeR = 6;
                      const orbitR = nodeR + 14;
                      return (
                        <g key={loc.id} data-node="true" style={{ cursor: 'pointer' }}
                          onClick={(e) => handleClusterClick(cluster, e)}
                        >
                          {/* Faction petals */}
                          {isKnown && activeFactions.length > 1 && locFactions.length > 0 && (() => {
                            const vis = locFactions.slice(0, 3);
                            const extra = locFactions.length - 3;
                            const total = vis.length + (extra > 0 ? 1 : 0);
                            const arcSpan = Math.PI * 1.5;
                            const arcStart = -Math.PI / 2;
                            return (
                              <g style={{ pointerEvents: 'none' }}>
                                {vis.map((f, pi) => {
                                  const angle = arcStart + (total > 1 ? (arcSpan / (total - 1)) * pi : 0);
                                  const px = cx + orbitR * Math.cos(angle);
                                  const py = cy + orbitR * Math.sin(angle);
                                  const fc = getFColor(f);
                                  return (
                                    <g key={f.id}>
                                      <circle cx={px} cy={py} r={7} fill={fc + '33'} stroke={fc} strokeWidth={1.2} />
                                      <text x={px} y={py + 3.5} textAnchor="middle" fontSize="7" fill={fc} fontWeight="600"
                                        style={{ fontFamily: "'Noto Sans TC', sans-serif" }}>
                                        {f.name.charAt(0)}
                                      </text>
                                    </g>
                                  );
                                })}
                                {extra > 0 && (() => {
                                  const angle = arcStart + arcSpan;
                                  const px = cx + orbitR * Math.cos(angle);
                                  const py = cy + orbitR * Math.sin(angle);
                                  return (
                                    <g key="extra">
                                      <circle cx={px} cy={py} r={7} fill="#35343488" stroke="#888780" strokeWidth={1} />
                                      <text x={px} y={py + 3.5} textAnchor="middle" fontSize="6" fill="#e9d69e">+{extra}</text>
                                    </g>
                                  );
                                })()}
                              </g>
                            );
                          })()}
                          {/* Heard */}
                          {!isKnown && (
                            <>
                              {isSelected && <circle cx={cx} cy={cy} r={18} fill="rgba(235,235,235,0.18)"
                                stroke={MAP_PALETTE.accentStrong} strokeWidth="0" filter="url(#glow-red)" />}
                              <circle cx={cx} cy={cy} r={8}
                                fill={isSelected ? 'rgba(199,122,90,0.18)' : MAP_PALETTE.paper}
                                stroke={isSelected ? MAP_PALETTE.accentStrong : MAP_PALETTE.inkSoft}
                                strokeWidth={isSelected ? '1.5' : '1.2'} strokeDasharray="3 2"
                                opacity={isSelected ? 0.85 : 0.38} />
                              <text x={cx} y={cy + 4.5} textAnchor="middle" fontSize="9"
                                fill={isSelected ? MAP_PALETTE.accentStrong : MAP_PALETTE.inkSoft}
                                opacity={isSelected ? 0.9 : 0.5} style={{ pointerEvents: 'none' }}>?</text>
                              <text x={cx} y={cy + 20} textAnchor="middle" fontSize="10"
                                fill={isSelected ? MAP_PALETTE.accentStrong : MAP_PALETTE.inkSoft}
                                style={{ pointerEvents: 'none', fontFamily: "'Noto Sans TC', sans-serif" }}>???</text>
                            </>
                          )}
                          {/* Known */}
                          {isKnown && (() => {
                            const starColor = isCurrent ? MAP_PALETTE.accent : isSelected ? MAP_PALETTE.accentStrong : MAP_PALETTE.know;
                            const centerColor = isCurrent ? '#f9e7b4' : isSelected ? '#dfd5cf' : MAP_PALETTE.water;
                            return (
                              <>
                                <circle cx={cx} cy={cy} r={nodeR} fill={MAP_PALETTE.paperDeep} stroke={starColor} strokeWidth="3.5" opacity={0.7} />
                                <circle cx={cx} cy={cy} r={nodeR * 0.8} fill={centerColor} opacity={0.8} />
                                {(isCurrent || isSelected) && (
                                  <g filter="url(#pin-shadow)" className="map-pin-animate">
                                    <path d="M 0,0 C -3,-3 -8,-9 -8,-14 A 8,8 0 1 1 8,-14 C 8,-9 3,-3 0,0 Z"
                                      transform={`translate(${cx}, ${cy - 4}) scale(${isCurrent ? 1.3 : 1.1})`}
                                      fill={starColor} opacity={1} />
                                    <circle cx={cx} cy={cy - 4 - (isCurrent ? 18.2 : 15.4)}
                                      r={isCurrent ? 3.5 : 3} fill={centerColor} opacity={1} />
                                  </g>
                                )}
                                <text x={cx} y={cy + 22} textAnchor="middle"
                                  fontSize={isCurrent || isSelected ? '12' : '11'}
                                  fontWeight={isCurrent || isSelected ? '700' : '500'}
                                  fill={isCurrent ? MAP_PALETTE.accent : isSelected ? MAP_PALETTE.accentStrong : MAP_PALETTE.know}
                                  style={{ pointerEvents: 'none', fontFamily: "'Noto Sans TC', sans-serif", textShadow: '0 1px 3px rgba(255,255,255,0.66)' }}
                                >{isKnown ? loc.title : '???'}{isMulti && isKnown && ' ◆'}</text>
                                {/* Faction dots */}
                                {activeFactions.length > 1 && locFactions.length > 0 && (() => {
                                  const dotsY = cy + 33;
                                  const vis2 = locFactions.slice(0, 3);
                                  const extra2 = locFactions.length - 3;
                                  const dotR = 4; const spacing = dotR * 2 + 3;
                                  const totalW = vis2.length * spacing + (extra2 > 0 ? spacing : 0);
                                  const startX = cx - totalW / 2 + dotR;
                                  return (
                                    <>
                                      {vis2.map((f, di) => {
                                        const fc = getFColor(f);
                                        return <circle key={f.id} cx={startX + di * spacing} cy={dotsY}
                                          r={dotR} fill={fc + '44'} stroke={fc} strokeWidth={1} />;
                                      })}
                                      {extra2 > 0 && (
                                        <>
                                          <circle cx={startX + vis2.length * spacing} cy={dotsY}
                                            r={dotR} fill="#35343488" stroke="#888780" strokeWidth={0.8} />
                                          <text x={startX + vis2.length * spacing} y={dotsY + 3}
                                            textAnchor="middle" fontSize="5" fill="#acacac">+{extra2}</text>
                                        </>
                                      )}
                                    </>
                                  );
                                })()}
                              </>
                            );
                          })()}
                          {/* Multi sub-labels */}
                          {isMulti && isKnown && isSelected && (() => {
                            const r1 = isCurrent ? 14 : 13;
                            return cluster.members.map((member, mi) => {
                              const isActiveSub = selectedTitle === member.title;
                              const offsetX = mi % 2 === 0 ? -50 : 50;
                              const offsetY = -r1 - 30 - Math.floor(mi / 2) * 24;
                              return (
                                <g key={member.id} data-node="true" style={{ cursor: 'pointer' }}
                                  onClick={(e) => handleSubLabelClick(member.title, e)}>
                                  <rect x={cx + offsetX - 38} y={cy + offsetY - 11} width={76} height={20} rx={4}
                                    fill={isActiveSub ? MAP_PALETTE.accentStrong : MAP_PALETTE.paperDeep}
                                    stroke={isActiveSub ? '#a39369' : MAP_PALETTE.accentStrong}
                                    strokeWidth="0.8" opacity={0.95} />
                                  <text x={cx + offsetX} y={cy + offsetY + 3} textAnchor="middle" fontSize="10"
                                    fontWeight={isActiveSub ? '700' : '500'}
                                    fill={isActiveSub ? MAP_PALETTE.ink : MAP_PALETTE.inkSoft}
                                    style={{ pointerEvents: 'none', fontFamily: "'Noto Sans TC', sans-serif" }}
                                  >{member.title}</text>
                                </g>
                              );
                            });
                          })()}
                        </g>
                      );
                    })}
                    <rect width={SVG_W} height={SVG_H} fill="url(#map-vig)" style={{ pointerEvents: 'none' }} />
                  </svg>
                  {/* Compass */}
                  <button className="absolute bottom-[30px] left-[30px] transition-all duration-300 hover:scale-110 active:scale-95"
                    style={{ opacity: 1, background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.15))' }}
                    onClick={handleCompassClick} title="重置視角">
                    <svg width="60" height="60" viewBox="0 0 60 60" style={{ overflow: 'visible' }}>
                      {[0, 90, 180, 270].map(ang => (
                        <line key={ang} x1="30" y1="8" x2="30" y2="12"
                          transform={`rotate(${ang} 30 30)`} stroke={MAP_PALETTE.inkSoft} strokeWidth="1" />
                      ))}
                      <g>
                        <polygon points="30,8 30,30 24,30" fill={MAP_PALETTE.accentStrong} />
                        <polygon points="30,8 36,30 30,30" fill={MAP_PALETTE.accentStrong} opacity="0.7" />
                        <polygon points="30,52 30,30 36,30" fill={MAP_PALETTE.inkSoft} />
                        <polygon points="30,52 24,30 30,30" fill={MAP_PALETTE.inkSoft} opacity="0.6" />
                        <polygon points="52,30 30,30 30,27" fill={MAP_PALETTE.inkSoft} opacity="0.4" />
                        <polygon points="8,30 30,30 30,33" fill={MAP_PALETTE.inkSoft} opacity="0.4" />
                      </g>
                      <circle cx="30" cy="30" r="3.5" fill={MAP_PALETTE.paper} stroke={MAP_PALETTE.inkSoft} strokeWidth="1.5" />
                      <circle cx="30" cy="30" r="1" fill={MAP_PALETTE.inkSoft} />
                      <text x="30" y="5" textAnchor="middle" fontSize="10" fill={MAP_PALETTE.accentStrong}
                        style={{ fontFamily: 'Arial, sans-serif', fontWeight: 'bold', letterSpacing: '1px' }}>N</text>
                    </svg>
                  </button>
                </div>
                {/* Geo Right Panel */}
                <div className="flex flex-col overflow-hidden shrink-0" style={{
                  background: 'transparent', width: isMobile ? '100%' : '16rem',
                  flex: isMobile ? '1' : undefined,
                  borderTop: isMobile ? '0.5px solid var(--border-default)' : undefined,
                  borderLeft: isMobile ? undefined : '0.5px solid var(--border-default)',
                }}>
                  {selectedNode ? (
                    <>
                      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                        <div>
                          <div className="flex items-center justify-center gap-1.5 mt-2 mb-5">
                            <h3 className="font-bold leading-snug"
                              style={{ color: 'var(--text-tab)', fontFamily: "'Noto Sans TC', sans-serif" }}>
                              ✦【{selectedNode.title}】
                            </h3>
                          </div>
                          <div className="flex items-center gap-1.5 mt-2 mb-5">
                            <div className="flex-1 h-px" style={{ background: 'var(--text-tab)' }} />
                            <span style={{ color: 'var(--text-tab)', fontSize: 12 }}>◆</span>
                            <div className="flex-1 h-px" style={{ background: 'var(--text-tab)' }} />
                          </div>
                        </div>
                        <p className="text-sm leading-relaxed"
                          style={{ color: 'var(--text-body)', fontFamily: "'Noto Sans TC', sans-serif" }}>
                          {selectedNode.content || '這個地方充滿了未知的故事，等待著探索。'}
                        </p>
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
                                  style={{ color: 'var(--text-tab)', borderLeft: '2px solid #fde68a',
                                    background: 'rgba(74,122,201,0.06)', fontFamily: "'Noto Sans TC', sans-serif", lineHeight: 1.5 }}>
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
                      {!isAtSelected && (
                        <div className="shrink-0 p-4 space-y-2" style={{ borderTop: '0.5px solid var(--border-default)' }}>
                          <h4 className="text-sm font-bold uppercase tracking-wider"
                            style={{ color: 'var(--text-tab)', fontFamily: "'Noto Sans TC', sans-serif" }}>前往方式</h4>
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setTravelMode(prev => prev === 'walk' ? null : 'walk'); setGoldWarning(false); }}
                              className="flex-1 py-1.5 text-sm rounded-[8px] transition"
                              style={{
                                border: `1px solid ${travelMode === 'walk' ? 'var(--text-tab)' : 'var(--border-default)'}`,
                                color: travelMode === 'walk' ? '#fff' : 'var(--text-tab)',
                                background: travelMode === 'walk' ? 'rgba(74,122,201,0.25)' : 'transparent',
                                fontFamily: "'Noto Sans TC', sans-serif",
                              }}
                            >🚶 徒步</button>
                            {(selectedNode.cartFare ?? 0) > 0 && (
                              <button
                                onClick={() => { setTravelMode(prev => prev === 'carriage' ? null : 'carriage'); setGoldWarning(false); }}
                                className="flex-1 py-1.5 text-sm rounded-[8px] transition"
                                style={{
                                  border: `1px solid ${travelMode === 'carriage' ? '#fde68a' : '#4a4a2a'}`,
                                  color: '#fde68a',
                                  background: travelMode === 'carriage' ? 'rgba(201,168,76,0.2)' : 'transparent',
                                  fontFamily: "'Noto Sans TC', sans-serif",
                                }}
                              >🐴 {selectedNode.cartFare}G</button>
                            )}
                          </div>
                          {goldWarning && <p className="text-[11px] text-center" style={{ color: '#ef4444' }}>阮囊羞澀</p>}
                          {travelMode && (
                            <button onClick={handleDepart}
                              className="w-full py-2 text-sm font-bold rounded-[8px] tracking-widest transition"
                              style={{ background: '#fde68a', color: 'var(--bg-elevated)', fontFamily: "'Noto Sans TC', sans-serif" }}
                              onMouseEnter={e => (e.currentTarget.style.background = '#e0bc62')}
                              onMouseLeave={e => (e.currentTarget.style.background = '#fde68a')}
                            >✦ 啟程</button>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex-1 flex flex-col overflow-hidden">
                      <div className="px-4 pt-4 pb-2 shrink-0">
                        <h4 className="text-base font-bold uppercase tracking-wider text-center"
                          style={{ color: 'var(--text-tab)', fontFamily: "'Noto Sans TC', sans-serif" }}>已知地點</h4>
                      </div>
                      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
                        {(searchQuery.trim() ? filteredNodes : mapNodes)
                          .filter(e => e.mapStatus === 'known' || e.title === currentLocation)
                          .map(loc => (
                            <button key={loc.id}
                              onClick={() => { setSelectedTitle(loc.title); setTravelMode(null); setGoldWarning(false); }}
                              className="w-full text-center px-2.5 py-2 rounded-[2px] text-sm transition"
                              style={{
                                background: loc.title === currentLocation ? 'rgba(201,168,76,0.1)' : 'transparent',
                                color: loc.title === currentLocation ? '#fde68a' : 'var(--text-tab)',
                                fontFamily: "'Noto Sans TC', sans-serif",
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(89,147,241,0.36)')}
                              onMouseLeave={e => (e.currentTarget.style.background = loc.title === currentLocation ? 'rgba(201,168,76,0.1)' : 'transparent')}
                            >{loc.title === currentLocation ? '📍 ' : '✦ '}{loc.title}</button>
                          ))}
                        {(searchQuery.trim() ? filteredNodes : mapNodes)
                          .filter(e => e.mapStatus !== 'known' && e.title !== currentLocation).length > 0 && (
                          <>
                            <div className="flex items-center gap-1.5 py-1">
                              <div className="flex-1 h-px" style={{ background: 'var(--text-muted)' }} />
                              <span style={{ color: 'var(--text-muted)' }}>未踏足</span>
                              <div className="flex-1 h-px" style={{ background: 'var(--text-muted)' }} />
                            </div>
                            {(searchQuery.trim() ? filteredNodes : mapNodes)
                              .filter(e => e.mapStatus !== 'known' && e.title !== currentLocation)
                              .map(loc => (
                                <button key={loc.id}
                                  onClick={() => { setSelectedTitle(loc.title); setTravelMode(null); setGoldWarning(false); }}
                                  className="w-full text-center px-2.5 py-2 rounded-[8px] text-sm"
                                  style={{ background: 'transparent', color: 'var(--text-muted)', fontFamily: "'Noto Sans TC', sans-serif" }}
                                >? {loc.title}</button>
                              ))}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Faction View */
              <>
                {/* Faction SVG */}
                <div className="relative overflow-hidden select-none" style={{
                  background: 'var(--bg-base)', flex: isMobile ? 'none' : '3',
                  height: isMobile ? '55%' : '100%',
                }}>
                  <svg width="100%" height="100%" viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                    preserveAspectRatio="xMidYMid slice" style={{ display: 'block' }}
                    className="cursor-grab active:cursor-grabbing"
                    onPointerDown={handleFactionPointerDown} onPointerMove={handleFactionPointerMove}
                    onPointerUp={handleFactionPointerUp} onPointerLeave={handleFactionPointerUp}
                  >
                    <defs>
                      <marker id="arrow-vassal" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                        <path d="M0,0 L0,6 L8,3 z" fill="#888780" />
                      </marker>
                    </defs>
                    <rect width={SVG_W} height={SVG_H} fill="var(--bg-base)" />
                    {activeFactions.length === 0 ? (
                      <text x={SVG_W / 2} y={SVG_H / 2} textAnchor="middle" fontSize="14" fill="#acacac"
                        fontFamily="'Noto Sans TC', sans-serif">尚無勢力資料</text>
                    ) : (
                      <>
                        {/* Relation lines */}
                        {activeFactions.map((faction, fi) => {
                          const pos1 = getFactionNodePos(faction, fi);
                          return (faction.relations ?? []).map(rel => {
                            if (faction.id > rel.targetFactionId) return null;
                            const tgt = activeFactions.find(f => f.id === rel.targetFactionId);
                            if (!tgt) return null;
                            const tfi = activeFactions.findIndex(f => f.id === rel.targetFactionId);
                            const pos2 = getFactionNodePos(tgt, tfi);
                            const rs = relationStyle(rel.type);
                            return (
                              <line key={`${faction.id}-${rel.targetFactionId}`}
                                x1={pos1.x} y1={pos1.y} x2={pos2.x} y2={pos2.y}
                                stroke={rs.color} strokeWidth={rs.width}
                                strokeDasharray={rs.dash}
                                markerEnd={rel.type === 'vassal' ? 'url(#arrow-vassal)' : undefined}
                                opacity={0.7} />
                            );
                          });
                        })}
                        {/* Faction nodes */}
                        {activeFactions.map((faction, fi) => {
                          const { x, y } = getFactionNodePos(faction, fi);
                          const fc = getFColor(faction);
                          const members = getFactionMembers(faction);
                          const isSelected = selectedFactionId === faction.id;
                          return (
                            <g key={faction.id} data-node="true" style={{ cursor: 'pointer' }}
                              onClick={e => { e.stopPropagation(); setSelectedFactionId(prev => prev === faction.id ? null : faction.id); }}
                            >
                              {isSelected && <circle cx={x} cy={y} r={28} fill={fc + '22'} stroke={fc} strokeWidth={2} opacity={0.6} />}
                              <circle cx={x} cy={y} r={22} fill={fc + '1a'} stroke={fc} strokeWidth={1.5} />
                              <circle cx={x} cy={y} r={13} fill={fc + '33'} />
                              <text x={x} y={y + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill={fc}
                                style={{ pointerEvents: 'none', fontFamily: "'Noto Sans TC', sans-serif" }}>
                                {faction.name.charAt(0)}
                              </text>
                              <text x={x} y={y + 38} textAnchor="middle" fontSize="11" fill="var(--text-primary)" fontWeight="500"
                                style={{ pointerEvents: 'none', fontFamily: "'Noto Sans TC', sans-serif" }}>{faction.name}</text>
                              <text x={x} y={y + 50} textAnchor="middle" fontSize="10" fill="var(--text-muted)"
                                style={{ pointerEvents: 'none', fontFamily: "'Noto Sans TC', sans-serif" }}>{typeLabel(faction.type)}</text>
                              {/* NPC circles */}
                              {members.slice(0, 6).map((npc, ni) => {
                                const npcX = x - ((Math.min(members.length, 6) - 1) * 11) / 2 + ni * 11;
                                const npcY = y + 64;
                                return (
                                  <g key={npc.id} data-node="true" style={{ cursor: 'pointer' }}
                                    onClick={e => { e.stopPropagation(); onOpenNpcModal(npc.id); }}>
                                    <circle cx={npcX} cy={npcY} r={9} fill={fc + '22'} stroke={fc} strokeWidth={1} />
                                    <text x={npcX} y={npcY + 4} textAnchor="middle" fontSize="8" fill={fc}
                                      style={{ pointerEvents: 'none', fontFamily: "'Noto Sans TC', sans-serif" }}>
                                      {npc.name.charAt(0)}
                                    </text>
                                  </g>
                                );
                              })}
                            </g>
                          );
                        })}
                        {/* Player node */}
                        <g data-node="true">
                          <circle cx={SVG_W / 2} cy={SVG_H - 60} r={18} fill="rgba(0,105,168,0.15)" stroke="#0069a8" strokeWidth={2} />
                          <circle cx={SVG_W / 2} cy={SVG_H - 60} r={11} fill="rgba(0,105,168,0.25)" stroke="#0069a8" strokeWidth={1} />
                          <text x={SVG_W / 2} y={SVG_H - 60 + 5} textAnchor="middle" fontSize="12" fontWeight="700" fill="#5f93d3"
                            style={{ pointerEvents: 'none', fontFamily: "'Noto Sans TC', sans-serif" }}>你</text>
                          <text x={SVG_W / 2} y={SVG_H - 60 + 28} textAnchor="middle" fontSize="10" fill="var(--text-muted)"
                            style={{ pointerEvents: 'none', fontFamily: "'Noto Sans TC', sans-serif" }}>玩家</text>
                        </g>
                      </>
                    )}
                  </svg>
                  {/* Reset button */}
                  <button className="absolute bottom-[30px] left-[30px] transition-all duration-300 hover:scale-110 active:scale-95"
                    style={{ opacity: 1, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                    onClick={handleCompassClick} title="重置視角">
                    <svg width="44" height="44" viewBox="0 0 44 44">
                      <circle cx="22" cy="22" r="20" fill="rgba(40,41,41,0.85)" stroke="var(--border-default)" strokeWidth="1" />
                      <text x="22" y="27" textAnchor="middle" fontSize="16" fill="var(--text-muted)"
                        style={{ fontFamily: 'Arial, sans-serif' }}>↺</text>
                    </svg>
                  </button>
                </div>

                {/* Faction Right Panel */}
                <div className="flex flex-col overflow-hidden shrink-0" style={{
                  background: 'transparent', width: isMobile ? '100%' : '16rem',
                  flex: isMobile ? '1' : undefined,
                  borderTop: isMobile ? '0.5px solid var(--border-default)' : undefined,
                  borderLeft: isMobile ? undefined : '0.5px solid var(--border-default)',
                }}>
                  {selectedFaction ? (
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                      <div className="flex items-center gap-2 pt-1">
                        <div style={{ width: 4, height: 32, borderRadius: 2, background: getFColor(selectedFaction), flexShrink: 0 }} />
                        <div>
                          <div className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>{selectedFaction.name}</div>
                          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{typeLabel(selectedFaction.type)}</div>
                        </div>
                        <button className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}
                          onClick={() => setSelectedFactionId(null)}>✕</button>
                      </div>
                      {selectedFaction.description && (
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-body)' }}>{selectedFaction.description}</p>
                      )}
                      {selectedFaction.homeId != null && (() => {
                        const home = lorebookEntries.find(e => e.id === selectedFaction.homeId);
                        return home ? (
                          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                            根據地：<span style={{ color: 'var(--text-primary)' }}>{home.title}</span>
                          </div>
                        ) : null;
                      })()}
                      {(selectedFaction.relations ?? []).length > 0 && (
                        <div>
                          <div className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>勢力關係</div>
                          <div className="space-y-1.5">
                            {(selectedFaction.relations ?? []).map(rel => {
                              const tgt = activeFactions.find(f => f.id === rel.targetFactionId);
                              if (!tgt) return null;
                              const rs = relationStyle(rel.type);
                              return (
                                <div key={rel.targetFactionId} className="flex items-center gap-2 text-sm">
                                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: rs.color, flexShrink: 0 }} />
                                  <span style={{ color: 'var(--text-body)' }}>{tgt.name}</span>
                                  <span className="text-xs ml-auto" style={{ color: rs.color }}>{relLabel(rel.type)}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {(() => {
                        const members = getFactionMembers(selectedFaction);
                        if (!members.length) return null;
                        return (
                          <div>
                            <div className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>已知成員</div>
                            <div className="space-y-1">
                              {members.map(npc => (
                                <button key={npc.id} className="w-full text-left px-2.5 py-1.5 rounded-[6px] text-sm transition"
                                  style={{ background: 'var(--bg-ui-card)', color: 'var(--text-body)' }}
                                  onClick={() => onOpenNpcModal(npc.id)}
                                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-ui-card)'; }}
                                >
                                  {npc.name}
                                  <span className="text-xs ml-1.5" style={{ color: 'var(--text-muted)' }}>{npc.job}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col overflow-hidden">
                      <div className="px-4 pt-4 pb-2 shrink-0">
                        <h4 className="text-base font-bold uppercase tracking-wider text-center"
                          style={{ color: 'var(--text-tab)', fontFamily: "'Noto Sans TC', sans-serif" }}>勢力列表</h4>
                      </div>
                      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
                        {activeFactions.length === 0 ? (
                          <p className="text-center text-sm py-4" style={{ color: 'var(--text-muted)' }}>尚無勢力</p>
                        ) : activeFactions.map((f) => (
                          <button key={f.id} onClick={() => setSelectedFactionId(f.id)}
                            className="w-full text-left px-2.5 py-2 rounded-[6px] text-sm transition flex items-center gap-2"
                            style={{ background: 'transparent', color: 'var(--text-tab)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(89,147,241,0.36)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: getFColor(f), flexShrink: 0 }} />
                            {f.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
