import { useEditor } from '../state/documentStore';
import type { ToolMode } from '../types';

const TOOLS: { mode: ToolMode; icon: string; label: string; key: string; soon?: boolean }[] = [
  { mode: 'select', icon: 'near_me', label: 'Select / Move', key: 'V' },
  { mode: 'crop', icon: 'crop', label: 'Crop & Straighten', key: 'C' },
  { mode: 'transform', icon: 'transform', label: 'Transform / Flip', key: 'T' },
  { mode: 'adjust', icon: 'tune', label: 'Tone Adjustments', key: 'A' },
  { mode: 'select', icon: 'title', label: 'Text Overlay', key: 'T', soon: true },
  { mode: 'select', icon: 'brush', label: 'Brush & Markup', key: 'B', soon: true },
  { mode: 'select', icon: 'auto_awesome', label: 'Filters & Presets', key: 'F', soon: true },
];

/** 44px vertical tool rail on the left. */
export function ToolRail() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const doc = useEditor((s) => s.doc);

  return (
    <nav className="toolrail">
      <div className="toolrail-group">
        {TOOLS.map((t, i) => (
          <button
            key={i}
            className={`tool-rail-btn${tool === t.mode && !t.soon ? ' active' : ''}`}
            onClick={() => !t.soon && setTool(t.mode)}
            disabled={!doc || t.soon}
            title={t.soon ? `${t.label} (coming soon)` : `${t.label} (${t.key})`}
            type="button"
          >
            <span className="material-symbols-outlined">{t.icon}</span>
            {tool === t.mode && !t.soon && <span className="tool-rail-pip" />}
          </button>
        ))}
      </div>
      <div className="toolrail-footer">
        <span className="material-symbols-outlined toolrail-footer-icon" title="History">history</span>
      </div>
    </nav>
  );
}
