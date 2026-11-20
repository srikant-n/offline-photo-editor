import { useEffect, useRef, useState } from 'react';
import { useEditor } from '../state/documentStore';
import type { Document } from '../types';
import { createGlRenderer, supportsWebGL2 } from '../render/gl/engine';
import { create2dRenderer } from '../render/fallback2d';

export type ExportFormat = 'image/png' | 'image/jpeg' | 'image/webp';

const FORMATS: { id: ExportFormat; label: string; sub: string }[] = [
  { id: 'image/jpeg', label: 'JPEG', sub: 'Lossy' },
  { id: 'image/png', label: 'PNG', sub: 'Lossless' },
  { id: 'image/webp', label: 'WebP', sub: 'Compact' },
];

type ExportResult = { canvas: HTMLCanvasElement; dispose: () => void };

async function renderExport(doc: Document, maxDim?: number): Promise<ExportResult> {
  // GL and 2D need separate canvases: a canvas can't switch context modes.
  const glCanvas = document.createElement('canvas');
  const r = supportsWebGL2()
    ? createGlRenderer(glCanvas, { loseOnDispose: true })
    : null;
  if (r) {
    r.render(doc, { maxDim });
    // dispose() must run AFTER toBlob — loseContext clears the drawing buffer.
    return { canvas: glCanvas, dispose: () => r.dispose() };
  }
  glCanvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
  const c2d = document.createElement('canvas');
  const r2 = create2dRenderer(c2d);
  r2.render(doc, { maxDim });
  return { canvas: c2d, dispose: () => {} };
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

/** Export dialog: format, quality, size estimate, download. */
export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const doc = useEditor((s) => s.doc);
  const [format, setFormat] = useState<ExportFormat>('image/jpeg');
  const [quality, setQuality] = useState(90);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const estRef = useRef(0);

  useEffect(() => {
    if (!open || !doc) return;
    setEstimate(null);
    const id = ++estRef.current;
    setBusy(true);
    renderExport(doc, 1200)
      .then((r) =>
        new Promise<Blob | null>((res) => r.canvas.toBlob(res, format, quality / 100))
          .finally(() => r.dispose()),
      )
      .then((blob) => {
        if (estRef.current !== id || !blob) return;
        // extrapolate from ~1200px preview to full res
        const scale = (doc.canvas.width * doc.canvas.height) / (1200 * 1200);
        setEstimate(blob.size * Math.min(scale, 40));
      })
      .finally(() => { if (estRef.current === id) setBusy(false); });
  }, [open, doc, format, quality]);

  if (!open || !doc) return null;

  const doExport = async () => {
    setBusy(true);
    try {
      const { canvas, dispose } = await renderExport(doc);
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, format, format === 'image/png' ? undefined : quality / 100),
      ).finally(dispose);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ext = format === 'image/jpeg' ? 'jpg' : format.split('/')[1];
      a.href = url;
      a.download = `${doc.sourceName.replace(/\.[^.]+$/, '')}-edit.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal export-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Export Image</span>
          <button className="icon-btn" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="modal-body">
          <div className="export-formats">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                className={`format-btn${format === f.id ? ' active' : ''}`}
                onClick={() => setFormat(f.id)}
                type="button"
              >
                <span>{f.label}</span>
                <span className="format-sub">{f.sub}</span>
              </button>
            ))}
          </div>

          <div className="export-quality">
            <div className="slider-labels">
              <span className="slider-name">Quality</span>
              <span className="slider-value">{quality}%</span>
            </div>
            <input
              type="range" className="slider" min={10} max={100} step={1}
              value={quality} disabled={format === 'image/png'}
              onChange={(e) => setQuality(Number(e.target.value))}
            />
          </div>

          <div className="export-meta">
            <div><span className="meta-label">Dimensions</span><span className="meta-value">{doc.canvas.width} × {doc.canvas.height} px</span></div>
            <div><span className="meta-label">Est. size</span><span className="meta-value">{busy ? '…' : estimate != null ? `~${formatBytes(estimate)}` : '—'}</span></div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={doExport} disabled={busy}>
            <span className="material-symbols-outlined">download</span>
            {busy ? 'Rendering…' : 'Download'}
          </button>
        </div>
      </div>
    </div>
  );
}
