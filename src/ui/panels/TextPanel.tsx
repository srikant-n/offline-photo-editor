import { useEffect, useRef } from 'react';
import { useEditor } from '../../state/documentStore';

/** Curated system-font list + generics. Everything resolves offline. */
const SYSTEM_FONTS = [
  'Inter Variable', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto',
  'Helvetica Neue', 'Arial', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Gill Sans',
  'Futura', 'Avenir', 'Palatino', 'Georgia', 'Times New Roman', 'serif',
  'Courier New', 'monospace', 'Comic Sans MS', 'Impact', 'cursive', 'fantasy',
];

/** Labeled row layout used throughout the text panel. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field-row" style={{ marginBottom: 6 }}>
      <span className="field" style={{ flex: '0 0 74px' }}><span>{label}</span></span>
      <div style={{ flex: 1, display: 'flex', gap: 4, alignItems: 'center' }}>{children}</div>
    </div>
  );
}

/** Text layer editor — bound to the selected text layer. */
export function TextPanel() {
  const doc = useEditor((s) => s.doc);
  const selectedLayerId = useEditor((s) => s.selectedLayerId);
  const updateTextLayer = useEditor((s) => s.updateTextLayer);
  const updateLayer = useEditor((s) => s.updateLayer);
  const setCurrentColor = useEditor((s) => s.setCurrentColor);

  const layer = doc?.layers.find((l) => l.id === selectedLayerId);
  const t = layer?.type === 'text' ? layer.text : undefined;
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Focus the editor when a text layer is (re)selected — e.g. after clicking
  // the canvas with the text tool. Deferred a frame because the layer is
  // created on pointerdown and the mousedown default action would otherwise
  // steal focus back to <body> after autoFocus runs.
  useEffect(() => {
    if (!t) return;
    const raf = requestAnimationFrame(() => {
      editorRef.current?.focus();
      editorRef.current?.select();
    });
    return () => cancelAnimationFrame(raf);
  }, [layer?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!doc || !layer || !t) {
    return (
      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">
            <span className="material-symbols-outlined panel-icon">title</span>
            Text
          </span>
        </div>
        <p className="hint">
          Select a text layer, or use the Text tool (T) and click the canvas to create one.
        </p>
      </div>
    );
  }

  /** Applies a TextProps patch and re-rasterizes the layer in one history entry. */
  const set = (patch: Partial<typeof t>) => updateTextLayer(layer.id, patch);
  const known = SYSTEM_FONTS.includes(t.fontFamily);

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">
          <span className="material-symbols-outlined panel-icon">title</span>
          Text
        </span>
        <button className="btn-ghost btn-xs" title="Delete text layer"
          onClick={() => useEditor.getState().removeLayer(layer.id)} type="button">
          Delete
        </button>
      </div>

      <textarea
        key={layer.id}
        ref={editorRef}
        className="text-editor"
        value={t.content}
        rows={3}
        placeholder="Enter text…"
        onFocus={() => useEditor.getState().beginGesture()}
        onChange={(e) => updateTextLayer(layer.id, { content: e.target.value }, true)}
        onBlur={() => useEditor.getState().endGesture()}
      />

      <Row label="Font">
        <select
          className="mini-select"
          value={known ? t.fontFamily : '__custom'}
          onChange={(e) => {
            if (e.target.value !== '__custom') set({ fontFamily: e.target.value });
          }}
        >
          {!known && <option value="__custom">{t.fontFamily}</option>}
          {SYSTEM_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <input
          className="mini-input"
          placeholder="custom family"
          defaultValue={known ? '' : t.fontFamily}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v) set({ fontFamily: v });
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
      </Row>

      <Row label="Size">
        <input type="range" className="slider" min={8} max={240} step={1}
          value={t.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })} />
        <span className="slider-value" style={{ minWidth: 30 }}>{t.fontSize}</span>
      </Row>

      <Row label="Style">
        <button
          className={`tool-btn${t.bold ? ' active' : ''}`}
          style={{ minWidth: 34, padding: '4px 6px' }}
          title="Bold" onClick={() => set({ bold: !t.bold })} type="button"
        ><span className="material-symbols-outlined" style={{ fontWeight: 700 }}>format_bold</span></button>
        <button
          className={`tool-btn${t.italic ? ' active' : ''}`}
          style={{ minWidth: 34, padding: '4px 6px' }}
          title="Italic" onClick={() => set({ italic: !t.italic })} type="button"
        ><span className="material-symbols-outlined" style={{ fontStyle: 'italic' }}>format_italic</span></button>
        <select
          className="mini-select" style={{ flex: 1 }}
          value={t.align}
          onChange={(e) => set({ align: e.target.value as typeof t.align })}
          title="Alignment"
        >
          <option value="left">Align left</option>
          <option value="center">Align center</option>
          <option value="right">Align right</option>
        </select>
      </Row>

      <Row label="Color">
        <input type="color" value={t.color}
          onChange={(e) => { set({ color: e.target.value }); setCurrentColor(e.target.value); }} />
      </Row>

      <Row label="Spacing">
        <input type="range" className="slider" min={-5} max={40} step={0.5}
          value={t.letterSpacing} onChange={(e) => set({ letterSpacing: Number(e.target.value) })} />
        <span className="slider-value" style={{ minWidth: 34 }}>{t.letterSpacing}px</span>
      </Row>

      <Row label="Line ht">
        <input type="range" className="slider" min={0.8} max={2.5} step={0.05}
          value={t.lineHeight} onChange={(e) => set({ lineHeight: Number(e.target.value) })} />
        <span className="slider-value" style={{ minWidth: 34 }}>{t.lineHeight.toFixed(2)}</span>
      </Row>

      <Row label="Width">
        <input type="range" className="slider" min={80} max={2000} step={10}
          value={t.wrapWidth ?? 480}
          onChange={(e) => set({ wrapWidth: Number(e.target.value) })} />
        <span className="slider-value" style={{ minWidth: 40 }}>{t.wrapWidth ?? 480}</span>
      </Row>

      <div className="panel-section-title" style={{ marginTop: 8 }}>Shadow</div>
      <Row label="Color">
        <input type="checkbox" checked={!!t.shadow}
          onChange={(e) => set({
            shadow: e.target.checked
              ? { color: '#000000', blur: 8, dx: 2, dy: 2 }
              : undefined,
          })} />
        {t.shadow && (
          <input type="color" value={t.shadow.color}
            onChange={(e) => set({ shadow: { ...t.shadow!, color: e.target.value } })} />
        )}
      </Row>
      {t.shadow && (
        <>
          <Row label="Blur">
            <input type="range" className="slider" min={0} max={60} step={1}
              value={t.shadow.blur}
              onChange={(e) => set({ shadow: { ...t.shadow!, blur: Number(e.target.value) } })} />
            <span className="slider-value" style={{ minWidth: 30 }}>{t.shadow.blur}</span>
          </Row>
          <Row label="Offset X">
            <input type="range" className="slider" min={-40} max={40} step={1}
              value={t.shadow.dx}
              onChange={(e) => set({ shadow: { ...t.shadow!, dx: Number(e.target.value) } })} />
            <span className="slider-value" style={{ minWidth: 30 }}>{t.shadow.dx}</span>
          </Row>
          <Row label="Offset Y">
            <input type="range" className="slider" min={-40} max={40} step={1}
              value={t.shadow.dy}
              onChange={(e) => set({ shadow: { ...t.shadow!, dy: Number(e.target.value) } })} />
            <span className="slider-value" style={{ minWidth: 30 }}>{t.shadow.dy}</span>
          </Row>
        </>
      )}

      <div className="panel-section-title" style={{ marginTop: 8 }}>Background</div>
      <Row label="Color">
        <input type="checkbox" checked={!!t.bgColor}
          onChange={(e) => set({ bgColor: e.target.checked ? '#000000' : undefined })} />
        {t.bgColor && (
          <input type="color" value={t.bgColor}
            onChange={(e) => set({ bgColor: e.target.value })} />
        )}
      </Row>
      {t.bgColor && (
        <Row label="Opacity">
          <input type="range" className="slider" min={0} max={100} step={1}
            value={Math.round((t.bgOpacity ?? 1) * 100)}
            onChange={(e) => set({ bgOpacity: Number(e.target.value) / 100 })} />
          <span className="slider-value" style={{ minWidth: 30 }}>{Math.round((t.bgOpacity ?? 1) * 100)}%</span>
        </Row>
      )}

      <Row label="W × H">
        <input className="mini-input" type="number" value={Math.round(layer.w)}
          onChange={(e) => updateLayer(layer.id, { w: Math.max(1, Number(e.target.value) || 1) })} />
        <input className="mini-input" type="number" value={Math.round(layer.h)}
          onChange={(e) => updateLayer(layer.id, { h: Math.max(1, Number(e.target.value) || 1) })} />
        <span className="hint" style={{ margin: 0 }}>output px</span>
      </Row>
      <p className="hint">Text re-renders on each change; W/H stretch the raster.</p>
    </div>
  );
}
