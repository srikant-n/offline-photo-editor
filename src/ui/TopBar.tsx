import { useEditor } from '../state/documentStore';

interface Props {
  onExport: () => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  onOpenFile: () => void;
}

/** 40px top command bar. */
export function TopBar({ onExport, zoom, onZoomIn, onZoomOut, onZoomFit, onOpenFile }: Props) {
  const doc = useEditor((s) => s.doc);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const clearDocument = useEditor((s) => s.clearDocument);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="brand-lockup">
          <img className="brand-logo" src="/logo.png" alt="" width={20} height={20} />
          <span className="brand">Offline Photo</span>
          <span className="brand-badge">Local</span>
        </div>
        <span className="topbar-sep" />
        <button className="icon-btn" onClick={onOpenFile} title="Open image">
          <span className="material-symbols-outlined">folder_open</span>
        </button>
        {doc && (
          <>
            <span className="doc-name" title={doc.sourceName}>{doc.sourceName}</span>
            <span className="topbar-sep" />
            <button className="icon-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
              <span className="material-symbols-outlined">undo</span>
            </button>
            <button className="icon-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
              <span className="material-symbols-outlined">redo</span>
            </button>
            <button className="icon-btn" onClick={clearDocument} title="Close document">
              <span className="material-symbols-outlined">close</span>
            </button>
          </>
        )}
      </div>

      <div className="topbar-center">
        {doc && (
          <span className="status-text">
            {doc.canvas.width} × {doc.canvas.height}px
            {doc.straighten !== 0 && ` · Straighten ${doc.straighten.toFixed(1)}°`}
          </span>
        )}
      </div>

      <div className="topbar-right">
        {doc && (
          <div className="zoom-group">
            <button className="icon-btn" onClick={onZoomOut} title="Zoom out"><span className="material-symbols-outlined">remove</span></button>
            <button className="zoom-val" onClick={onZoomFit} title="Fit to view">{Math.round(zoom * 100)}%</button>
            <button className="icon-btn" onClick={onZoomIn} title="Zoom in"><span className="material-symbols-outlined">add</span></button>
            <button className="icon-btn" onClick={onZoomFit} title="Fit to view"><span className="material-symbols-outlined">fit_screen</span></button>
          </div>
        )}
        <button className="btn-primary" onClick={onExport} disabled={!doc}>
          <span className="material-symbols-outlined">download</span>
          Export
        </button>
      </div>
    </header>
  );
}
