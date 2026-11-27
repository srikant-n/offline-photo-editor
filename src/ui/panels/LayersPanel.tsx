import { useState } from 'react';
import { useEditor } from '../../state/documentStore';
import { documentOutputSize } from '../../render/geometry';
import type { BlendMode, Layer } from '../../types';

/** Blend modes offered in the layer panel dropdown. */
const BLEND_MODES: { id: BlendMode; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'multiply', label: 'Multiply' },
  { id: 'screen', label: 'Screen' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'darken', label: 'Darken' },
  { id: 'lighten', label: 'Lighten' },
  { id: 'color-dodge', label: 'Color Dodge' },
  { id: 'color-burn', label: 'Color Burn' },
  { id: 'hard-light', label: 'Hard Light' },
  { id: 'soft-light', label: 'Soft Light' },
  { id: 'difference', label: 'Difference' },
  { id: 'exclusion', label: 'Exclusion' },
  { id: 'hue', label: 'Hue' },
  { id: 'saturation', label: 'Saturation' },
  { id: 'color', label: 'Color' },
  { id: 'luminosity', label: 'Luminosity' },
];

/** Material icon names per layer type. */
const TYPE_ICONS: Record<Layer['type'], string> = {
  image: 'image', raster: 'brush', text: 'title', shape: 'category',
};

/** A single row in the layer list with visibility, rename, blend/opacity controls, and reorder buttons. */
function LayerRow({ layer, index, count }: { layer: Layer; index: number; count: number }) {
  const selectedLayerId = useEditor((s) => s.selectedLayerId);
  const selectLayer = useEditor((s) => s.selectLayer);
  const updateLayer = useEditor((s) => s.updateLayer);
  const removeLayer = useEditor((s) => s.removeLayer);
  const duplicateLayer = useEditor((s) => s.duplicateLayer);
  const moveLayer = useEditor((s) => s.moveLayer);
  const setTool = useEditor((s) => s.setTool);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(layer.name);

  const isImage = layer.type === 'image';
  const selected = selectedLayerId === layer.id;
  // index/count are positions in doc.layers (0 = bottom).
  const canMoveUp = index < count - 1;
  const canMoveDown = index > 1;

  /** Commits the rename input; reverts to the old name when empty. */
  const commitRename = () => {
    setRenaming(false);
    const n = name.trim();
    if (n && n !== layer.name) updateLayer(layer.id, { name: n });
    else setName(layer.name);
  };

  return (
    <div className={`layer-row${selected ? ' selected' : ''}${!layer.visible ? ' hidden' : ''}`}>
      <div className="layer-row-top">
        <button
          className="layer-icon-btn"
          title={layer.visible ? 'Hide layer' : 'Show layer'}
          onClick={() => updateLayer(layer.id, { visible: !layer.visible })}
          type="button"
        >
          <span className="material-symbols-outlined">
            {layer.visible ? 'visibility' : 'visibility_off'}
          </span>
        </button>
        <button
          className="layer-main"
          onClick={() => selectLayer(selected ? null : layer.id)}
          onDoubleClick={() => { if (!isImage) setRenaming(true); }}
          title={isImage ? 'Base image (locked)' : 'Double-click to rename'}
          type="button"
        >
          <span className="material-symbols-outlined layer-type-icon">{TYPE_ICONS[layer.type]}</span>
          {renaming ? (
            <input
              className="layer-rename"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') { setName(layer.name); setRenaming(false); }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="layer-name">{layer.name}</span>
          )}
          {isImage && <span className="layer-lock">locked</span>}
        </button>
        {isImage && layer.type === 'image' && (
          <button className="icon-btn" title="Tone adjustments" onClick={() => setTool('adjust')} type="button">
            <span className="material-symbols-outlined">tune</span>
          </button>
        )}
      </div>
      {selected && !isImage && (
        <div className="layer-row-sub">
          <select
            className="layer-blend"
            value={layer.blendMode}
            title="Blend mode"
            onChange={(e) => updateLayer(layer.id, { blendMode: e.target.value as BlendMode })}
          >
            {BLEND_MODES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
          <input
            type="range" className="slider layer-opacity" min={0} max={100} step={1}
            value={Math.round(layer.opacity * 100)}
            title={`Opacity ${Math.round(layer.opacity * 100)}%`}
            onPointerDown={() => useEditor.getState().beginGesture()}
            onChange={(e) => updateLayer(layer.id, { opacity: Number(e.target.value) / 100 }, 'transient')}
            onPointerUp={() => useEditor.getState().endGesture()}
            onKeyUp={() => useEditor.getState().endGesture()}
          />
          <div className="layer-btns">
            <button className="icon-btn" disabled={!canMoveUp} title="Move up"
              onClick={() => moveLayer(layer.id, 1)} type="button">
              <span className="material-symbols-outlined">keyboard_arrow_up</span>
            </button>
            <button className="icon-btn" disabled={!canMoveDown} title="Move down"
              onClick={() => moveLayer(layer.id, -1)} type="button">
              <span className="material-symbols-outlined">keyboard_arrow_down</span>
            </button>
            <button className="icon-btn" title="Duplicate"
              onClick={() => duplicateLayer(layer.id)} type="button">
              <span className="material-symbols-outlined">content_copy</span>
            </button>
            <button className="icon-btn" title="Delete layer"
              onClick={() => removeLayer(layer.id)} type="button">
              <span className="material-symbols-outlined">delete</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Layer stack panel: list (top→bottom), visibility, opacity, blend, reorder. */
export function LayersPanel() {
  const doc = useEditor((s) => s.doc);
  const addTextLayer = useEditor((s) => s.addTextLayer);
  const setTool = useEditor((s) => s.setTool);

  if (!doc) return null;
  const out = documentOutputSize(doc);
  // Display order: top of stack first.
  const ordered = doc.layers.map((l, i) => ({ l, i })).reverse();

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">
          <span className="material-symbols-outlined panel-icon">layers</span>
          Layers
        </span>
        <div className="btn-row">
          <button
            className="btn-ghost btn-xs"
            title="Add text layer at image center"
            onClick={() => addTextLayer(out.w / 2, out.h / 2)}
            type="button"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>title</span> Text
          </button>
          <button className="btn-ghost btn-xs" title="Brush tool — paint on canvas"
            onClick={() => setTool('brush')} type="button">
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>brush</span>
          </button>
          <button className="btn-ghost btn-xs" title="Shape tool — drag on canvas"
            onClick={() => setTool('shape')} type="button">
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>category</span>
          </button>
        </div>
      </div>
      <div className="layer-list">
        {ordered.map(({ l, i }) => (
          <LayerRow key={l.id} layer={l} index={i} count={doc.layers.length} />
        ))}
      </div>
    </div>
  );
}
