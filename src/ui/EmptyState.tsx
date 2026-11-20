import { useEditor } from '../state/documentStore';

/** Centered empty state / drop zone shown when no document is loaded. */
export function EmptyState() {
  const loadError = useEditor((s) => s.loadError);
  const setLoadError = useEditor((s) => s.setLoadError);

  return (
    <div className="empty-state">
      <div className="empty-card">
        <span className="material-symbols-outlined empty-icon">image</span>
        <div className="empty-title">Drop an image to start editing</div>
        <div className="empty-sub">
          PNG · JPEG · WebP · GIF · AVIF · BMP — or paste with Ctrl+V
        </div>
        {loadError && (
          <div className="empty-error" onClick={() => setLoadError(null)}>
            {loadError}
          </div>
        )}
      </div>
    </div>
  );
}
