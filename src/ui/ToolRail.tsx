import { useRef } from 'react';
import { useEditor } from '../state/documentStore';
import type { ToolMode } from '../types';

/** Ordered list of tools shown in the rail, with icon, label, and shortcut key. */
const TOOLS: { mode: ToolMode; icon: string; label: string; key?: string }[] = [
  { mode: 'select', icon: 'near_me', label: 'Select / Move', key: 'V' },
  { mode: 'crop', icon: 'crop', label: 'Crop & Straighten', key: 'C' },
  { mode: 'transform', icon: 'transform', label: 'Transform / Flip' },
  { mode: 'text', icon: 'title', label: 'Text', key: 'T' },
  { mode: 'brush', icon: 'brush', label: 'Brush', key: 'B' },
  { mode: 'shape', icon: 'category', label: 'Shapes', key: 'S' },
  { mode: 'eyedropper', icon: 'colorize', label: 'Eyedropper', key: 'I' },
  { mode: 'preset', icon: 'auto_awesome', label: 'Presets', key: 'F' },
  { mode: 'adjust', icon: 'tune', label: 'Tone Adjustments', key: 'A' },
];

/** 44px vertical tool rail on the left. */
export function ToolRail() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const doc = useEditor((s) => s.doc);
  const currentColor = useEditor((s) => s.currentColor);
  const setCurrentColor = useEditor((s) => s.setCurrentColor);
  const colorInputRef = useRef<HTMLInputElement>(null);

  return (
    <nav className="toolrail">
      <div className="toolrail-group">
        {TOOLS.map((t) => (
          <button
            key={t.mode}
            className={`tool-rail-btn${tool === t.mode ? ' active' : ''}`}
            onClick={() => setTool(t.mode)}
            disabled={!doc}
            title={t.key ? `${t.label} (${t.key})` : t.label}
            type="button"
          >
            <span className="material-symbols-outlined">{t.icon}</span>
            {tool === t.mode && <span className="tool-rail-pip" />}
          </button>
        ))}
      </div>
      <div className="toolrail-footer">
        <button
          className="color-swatch"
          style={{ background: currentColor }}
          onClick={() => colorInputRef.current?.click()}
          disabled={!doc}
          title={`Foreground color ${currentColor} — click to change`}
          type="button"
        />
        <input
          ref={colorInputRef}
          type="color"
          className="color-swatch-input"
          value={currentColor}
          onChange={(e) => setCurrentColor(e.target.value)}
          tabIndex={-1}
          aria-hidden="true"
        />
        <span className="material-symbols-outlined toolrail-footer-icon" title="History">history</span>
      </div>
    </nav>
  );
}
