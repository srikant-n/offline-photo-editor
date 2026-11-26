import { useEffect } from 'react';
import { useEditor } from '../state/documentStore';

const IMAGE_MIME = /image\//;

/** Open the OS file picker for an image and load the selection. */
export function pickImageFile() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*,.bmp';
  inp.onchange = () => {
    const f = inp.files?.[0];
    if (f) void useEditor.getState().loadFile(f);
  };
  inp.click();
}

/** Global drag-drop + clipboard paste image ingest. Attach once at App level. */
export function useFileInput() {
  const loadFile = useEditor((s) => s.loadFile);

  useEffect(() => {
    const hasImage = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes('Files');

    const onDragOver = (e: DragEvent) => {
      if (hasImage(e)) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      }
    };
    const onDrop = (e: DragEvent) => {
      if (!hasImage(e)) return;
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
        IMAGE_MIME.test(f.type) || /\.(bmp|png|jpe?g|webp|gif|avif)$/i.test(f.name),
      );
      if (files.length) void loadFile(files[0]);
    };

    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const item = items.find((i) => i.kind === 'file' && IMAGE_MIME.test(i.type));
      if (!item) return;
      const file = item.getAsFile();
      if (file) {
        e.preventDefault();
        void loadFile(file, 'pasted-image');
      }
    };

    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('paste', onPaste);
    };
  }, [loadFile]);
}
