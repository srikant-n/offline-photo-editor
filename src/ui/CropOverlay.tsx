import { useRef, useState } from 'react';
import { useEditor, type CropDraft } from '../state/documentStore';
import { rotatedRectCorners, type RotRect } from '../render/geometry';

interface View {
  scale: number; tx: number; ty: number; baseW: number; baseH: number;
}
type ToImg = (cx: number, cy: number) => { x: number; y: number };

const MIN_SIZE = 8;
const ROT_OFFSET = 44; // display px above top edge for the rotate handle

type DragMode = 'create' | 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'rotate';

interface DragState {
  mode: DragMode;
  startClient: { x: number; y: number };
  startImg: { x: number; y: number };
  startDraft: RotRect;
  aspect: number | null;
}

const CORNERS: [DragMode, number, number][] = [
  ['nw', -1, -1], ['ne', 1, -1], ['sw', -1, 1], ['se', 1, 1],
];

function rot(vx: number, vy: number, deg: number): [number, number] {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r), sin = Math.sin(r);
  return [vx * cos - vy * sin, vx * sin + vy * cos];
}

function clampDraft(r: RotRect, out: { w: number; h: number }): RotRect {
  // keep the quad's bbox inside the output bounds
  const corners = rotatedRectCorners(r);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of corners) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  let { cx, cy } = r;
  if (minX < 0) cx -= minX;
  if (maxX > out.w) cx -= maxX - out.w;
  if (minY < 0) cy -= minY;
  if (maxY > out.h) cy -= maxY - out.h;
  return {
    cx, cy,
    w: Math.max(MIN_SIZE, r.w),
    h: Math.max(MIN_SIZE, r.h),
    angle: r.angle,
  };
}

function enforceAspect(r: RotRect, aspect: number | null): RotRect {
  if (!aspect || r.w <= 0 || r.h <= 0) return r;
  // adjust height from width, then re-clamp extremes
  let { w, h } = r;
  h = w / aspect;
  return { ...r, w, h };
}

/** Crop marquee overlay (rotated rect). All geometry in output-image px. */
export function CropOverlay({ draft, out, view, toImg }: {
  draft: CropDraft;
  out: { w: number; h: number };
  view: View;
  toImg: ToImg;
}) {
  const setCropDraft = useEditor((s) => s.setCropDraft);
  const cropAspect = useEditor((s) => s.cropAspect);
  const container = useEditor((s) => s.container);
  const dragRef = useRef<DragState | null>(null);
  const [, force] = useState(0);

  const s = view.scale;
  const toScreen = (x: number, y: number): [number, number] => [x * s + view.tx, y * s + view.ty];
  const cornersD = rotatedRectCorners(draft);
  const cornersS = cornersD.map(([x, y]) => toScreen(x, y));

  const ptsAttr = cornersS.map(([x, y]) => `${x},${y}`).join(' ');
  const quadPath = `M ${cornersS.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`;
  const cw = container.w || out.w * s;
  const ch = container.h || out.h * s;

  const update = (r: RotRect) => {
    let n = clampDraft(r, out);
    n = enforceAspect(n, cropAspect);
    n = clampDraft(n, out);
    setCropDraft(n);
    force((v) => v + 1);
  };

  const worldToLocal = (px: number, py: number): [number, number] => {
    const dx = px - draft.cx, dy = py - draft.cy;
    return rot(dx, dy, -draft.angle);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const p = toImg(e.clientX, e.clientY);
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const tol = 14 / s;

    // rotate handle hit?
    const [rx, ry] = rotateHandlePos();
    if (Math.hypot(p.x - rx, p.y - ry) < tol) {
      dragRef.current = { mode: 'rotate', startClient: { x: e.clientX, y: e.clientY }, startImg: p, startDraft: { ...draft }, aspect: cropAspect };
      e.stopPropagation();
      return;
    }
    // corner hits?
    for (let i = 0; i < 4; i++) {
      const [cx, cy] = cornersD[i];
      if (Math.hypot(p.x - cx, p.y - cy) < tol) {
        const mode = (['nw', 'ne', 'se', 'sw'] as DragMode[])[i];
        dragRef.current = { mode, startClient: { x: e.clientX, y: e.clientY }, startImg: p, startDraft: { ...draft }, aspect: cropAspect };
        e.stopPropagation();
        return;
      }
    }
    // inside quad → move; outside → create
    const [lx, ly] = worldToLocal(p.x, p.y);
    const mode: DragMode = Math.abs(lx) <= draft.w / 2 && Math.abs(ly) <= draft.h / 2 ? 'move' : 'create';
    dragRef.current = { mode, startClient: { x: e.clientX, y: e.clientY }, startImg: p, startDraft: { ...draft }, aspect: cropAspect };
    e.stopPropagation();
  };

  const rotateHandlePos = (): [number, number] => {
    const [ux, uy] = rot(0, -1, draft.angle);
    return [draft.cx + ux * (draft.h / 2 + ROT_OFFSET), draft.cy + uy * (draft.h / 2 + ROT_OFFSET)];
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const p = toImg(e.clientX, e.clientY);
    const sd = d.startDraft;

    if (d.mode === 'rotate') {
      const rot2 = Math.max(-45, Math.min(45, sd.angle - (e.clientY - d.startClient.y) * 0.5));
      update({ ...sd, angle: rot2 });
      return;
    }
    if (d.mode === 'create') {
      const x = Math.min(d.startImg.x, p.x), y = Math.min(d.startImg.y, p.y);
      const r: RotRect = {
        cx: x + Math.abs(p.x - d.startImg.x) / 2,
        cy: y + Math.abs(p.y - d.startImg.y) / 2,
        w: Math.abs(p.x - d.startImg.x),
        h: Math.abs(p.y - d.startImg.y),
        angle: 0,
      };
      update(r);
      return;
    }
    if (d.mode === 'move') {
      update({
        ...sd,
        cx: sd.cx + (p.x - d.startImg.x),
        cy: sd.cy + (p.y - d.startImg.y),
      });
      return;
    }
    // corner resize in the rect's local (unrotated) frame
    const [plx, ply] = worldToLocal(p.x, p.y);
    // fixed corner = opposite of dragged corner, in local coords
    const [sx, sy] = CORNERS.find(([m]) => m === d.mode)!.slice(1) as [number, number];
    const fx = (-sx * sd.w) / 2, fy = (-sy * sd.h) / 2;
    let lx0 = Math.min(fx, plx), ly0 = Math.min(fy, ply);
    let lw = Math.abs(plx - fx), lh = Math.abs(ply - fy);
    if (d.aspect && lw > 0 && lh > 0) {
      const ratio = lw / lh;
      if (ratio > d.aspect) lh = lw / d.aspect;
      else lw = lh * d.aspect;
      // keep the dragged corner on the correct side of the fixed corner
      if (plx < fx) lx0 = fx - lw; else lx0 = Math.min(fx, plx);
      if (ply < fy) ly0 = fy - lh; else ly0 = Math.min(fy, ply);
    }
    const lcx = lx0 + lw / 2, lcy = ly0 + lh / 2;
    const [ox, oy] = rot(lcx, lcy, sd.angle);
    update({
      cx: sd.cx + ox, cy: sd.cy + oy,
      w: Math.max(MIN_SIZE, lw), h: Math.max(MIN_SIZE, lh),
      angle: sd.angle,
    });
  };

  const onPointerUp = () => { dragRef.current = null; };

  // thirds grid: lines connecting trisection points on opposite edges
  const edgePt = (t: number, side: 0 | 1 | 2 | 3): [number, number] => {
    // side: 0=top 1=right 2=bottom 3=left; t in 0..1 along that edge
    const hw = draft.w / 2, hh = draft.h / 2;
    const local: [number, number][] = [
      [-hw + t * draft.w, -hh], [hw, -hh + t * draft.h],
      [hw - t * draft.w, hh], [-hw, hh - t * draft.h],
    ];
    const [lx, ly] = local[side];
    const [rx, ry] = rot(lx, ly, draft.angle);
    return [draft.cx + rx, draft.cy + ry];
  };
  const gridLines: [number, number][][] = [];
  for (const t of [1 / 3, 2 / 3]) {
    gridLines.push([edgePt(t, 0), edgePt(t, 2)]);
    gridLines.push([edgePt(t, 3), edgePt(t, 1)]);
  }
  const gridScreen = gridLines.map(([a, b]) => {
    const [ax, ay] = toScreen(a[0], a[1]);
    const [bx, by] = toScreen(b[0], b[1]);
    return `M ${ax} ${ay} L ${bx} ${by}`;
  });

  const [rhx, rhy] = rotateHandlePos();
  const [rhsx, rhsy] = toScreen(rhx, rhy);
  const [etmx, etmy] = (() => {
    const [ex, ey] = rot(0, -draft.h / 2, draft.angle);
    return toScreen(draft.cx + ex, draft.cy + ey);
  })();

  return (
    <svg
      className="crop-overlay"
      width={cw}
      height={ch}
      viewBox={`0 0 ${cw} ${ch}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <path d={`${quadPath} M 0 0 H ${cw} V ${ch} H 0 Z`} fillRule="evenodd" className="crop-dim-svg" />
      <polygon points={ptsAttr} className="crop-rect-svg" />
      {gridScreen.map((d, i) => (
        <path key={i} d={d} className="crop-grid-svg" />
      ))}
      {/* rotate handle stem + knob */}
      <line x1={etmx} y1={etmy} x2={rhsx} y2={rhsy} className="crop-rotate-line-svg" />
      <circle cx={rhsx} cy={rhsy} r={7} className="crop-rotate-knob-svg" />
      {cornersS.map(([x, y], i) => (
        <rect key={i} x={x - 5} y={y - 5} width={10} height={10} className="crop-handle-svg" />
      ))}
    </svg>
  );
}
