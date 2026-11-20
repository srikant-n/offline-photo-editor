import { useEditor } from '../state/documentStore';
import { TonePanel } from './panels/TonePanel';
import { TransformPanel } from './panels/TransformPanel';
import { CropPanel } from './panels/CropPanel';

const TITLES: Record<string, string> = {
  select: 'Select',
  crop: 'Crop & Straighten',
  transform: 'Transform',
  adjust: 'Tone & Color',
};

/** Right-hand inspector dock; shows the panel for the active tool. */
export function Inspector() {
  const tool = useEditor((s) => s.tool);
  const doc = useEditor((s) => s.doc);

  if (!doc) return null;

  return (
    <aside className="inspector">
      <div className="inspector-tabs">
        <span className="inspector-tab active">{TITLES[tool]}</span>
      </div>
      <div className="inspector-body">
        {tool === 'crop' && <CropPanel />}
        {tool === 'transform' && <TransformPanel />}
        {(tool === 'adjust' || tool === 'select') && <TonePanel />}
      </div>
    </aside>
  );
}
