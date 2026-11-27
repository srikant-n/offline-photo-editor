import { useEditor } from '../state/documentStore';
import { TonePanel } from './panels/TonePanel';
import { TransformPanel } from './panels/TransformPanel';
import { CropPanel } from './panels/CropPanel';
import { LayersPanel } from './panels/LayersPanel';
import { TextPanel } from './panels/TextPanel';
import { BrushPanel } from './panels/BrushPanel';
import { ShapePanel } from './panels/ShapePanel';
import { PresetsPanel } from './panels/PresetsPanel';

/** Display titles for each tool mode, used in the inspector tab header. */
const TITLES: Record<string, string> = {
  select: 'Select',
  crop: 'Crop & Straighten',
  transform: 'Transform',
  adjust: 'Tone & Color',
  text: 'Text',
  brush: 'Brush',
  shape: 'Shape',
  eyedropper: 'Eyedropper',
  preset: 'Presets',
};

/** Right-hand inspector dock; shows the panel for the active tool. */
export function Inspector() {
  const tool = useEditor((s) => s.tool);
  const doc = useEditor((s) => s.doc);
  const selectedLayerId = useEditor((s) => s.selectedLayerId);

  if (!doc) return null;

  const selectedIsText = doc.layers.some(
    (l) => l.id === selectedLayerId && l.type === 'text',
  );

  return (
    <aside className="inspector">
      <div className="inspector-tabs">
        <span className="inspector-tab active">{TITLES[tool]}</span>
      </div>
      <div className="inspector-body">
        <LayersPanel />
        {tool === 'crop' && <CropPanel />}
        {tool === 'transform' && <TransformPanel />}
        {(tool === 'adjust' || tool === 'select') && <TonePanel />}
        {(tool === 'text' || selectedIsText) && <TextPanel />}
        {tool === 'brush' && <BrushPanel />}
        {tool === 'shape' && <ShapePanel />}
        {tool === 'eyedropper' && (
          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">
                <span className="material-symbols-outlined panel-icon">colorize</span>
                Eyedropper
              </span>
            </div>
            <p className="hint">
              Click anywhere on the image to sample its color into the current
              brush / text / shape color.
            </p>
          </div>
        )}
        {tool === 'preset' && <PresetsPanel />}
      </div>
    </aside>
  );
}
