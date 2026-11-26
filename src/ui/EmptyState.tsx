import { useEditor } from '../state/documentStore';
import { pickImageFile } from '../hooks/useFileInput';

/** Centered empty state / drop zone shown when no document is loaded. */
export function EmptyState() {
  const loadError = useEditor((s) => s.loadError);
  const setLoadError = useEditor((s) => s.setLoadError);

  return (
    <div className="empty-state">
      <div className="empty-card" onClick={pickImageFile} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') pickImageFile(); }}>
        <span className="material-symbols-outlined empty-icon">image</span>
        <div className="empty-title">Drop an image to start editing</div>
        <div className="empty-sub">
          PNG · JPEG · WebP · GIF · AVIF · BMP — or paste with Ctrl+V
        </div>
        <div className="empty-sub" style={{ marginTop: 6, color: 'var(--primary)' }}>
          Click to browse files
        </div>
        {loadError && (
          <div className="empty-error" onClick={(e) => { e.stopPropagation(); setLoadError(null); }}>
            {loadError}
          </div>
        )}
      </div>
    </div>
  );
}
