import { useEffect, useState } from 'react';
import { useEditor } from './state/documentStore';
import { useFileInput } from './hooks/useFileInput';
import { useKeyboard } from './hooks/useKeyboard';
import { TopBar } from './ui/TopBar';
import { ToolRail } from './ui/ToolRail';
import { Viewport } from './ui/Viewport';
import { Inspector } from './ui/Inspector';
import { ExportDialog } from './ui/ExportDialog';
import { EmptyState } from './ui/EmptyState';

export default function App() {
  const doc = useEditor((s) => s.doc);
  const loadError = useEditor((s) => s.loadError);
  const setLoadError = useEditor((s) => s.setLoadError);
  const zoomIn = useEditor((s) => s.zoomIn);
  const zoomOut = useEditor((s) => s.zoomOut);
  const zoomFit = useEditor((s) => s.zoomFit);
  const view = useEditor((s) => s.view);
  const [exportOpen, setExportOpen] = useState(false);
  const [openTick, setOpenTick] = useState(0);

  useFileInput();
  useKeyboard();

  // Warn before losing unsaved work
  useEffect(() => {
    if (!doc) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [doc]);

  const openFile = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*,.bmp';
    inp.onchange = () => {
      const f = inp.files?.[0];
      if (f) void useEditor.getState().loadFile(f);
      setOpenTick((n) => n + 1);
    };
    inp.click();
  };

  return (
    <div className="app">
      <TopBar
        onExport={() => setExportOpen(true)}
        zoom={view.scale}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomFit={zoomFit}
        onOpenFile={openFile}
      />
      <div className="workspace">
        <ToolRail />
        <main className="stage">
          {doc ? <Viewport /> : <EmptyState />}
        </main>
        {doc && <Inspector />}
      </div>
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      {loadError && doc && (
        <div className="load-error-toast" onClick={() => setLoadError(null)}>
          {loadError}
        </div>
      )}
      <span hidden data-open-tick={openTick} />
    </div>
  );
}
