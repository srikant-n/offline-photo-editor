import { useEffect } from 'react';
import { useEditor } from '../state/documentStore';

/**
 * Global shortcuts:
 *  V select · C crop · T text · B brush · S shape · I eyedropper · F presets · A adjust
 *  Ctrl/Cmd+Z undo · Ctrl/Cmd+Shift+Z or Ctrl+Y redo
 *  Hold \ or Space → before/after compare
 *  Esc → cancel crop
 */
export function useKeyboard() {
  useEffect(() => {
    let comparing = false;
    const setComparing = (v: boolean) => {
      if (v !== comparing) {
        comparing = v;
        useEditor.getState().setComparing(v);
      }
    };

    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) useEditor.getState().redo();
        else useEditor.getState().undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        useEditor.getState().redo();
        return;
      }
      if (typing) return;

      switch (e.key) {
        case 'v': case 'V': useEditor.getState().setTool('select'); break;
        case 'c': case 'C': useEditor.getState().setTool('crop'); break;
        case 't': case 'T': useEditor.getState().setTool('text'); break;
        case 'b': case 'B': useEditor.getState().setTool('brush'); break;
        case 's': case 'S': useEditor.getState().setTool('shape'); break;
        case 'i': case 'I': useEditor.getState().setTool('eyedropper'); break;
        case 'f': case 'F': useEditor.getState().setTool('preset'); break;
        case 'a': case 'A': useEditor.getState().setTool('adjust'); break;
        case '\\': case ' ': setComparing(true); e.preventDefault(); break;
        case 'Escape': {
          const s = useEditor.getState();
          if (s.activeStroke) s.cancelBrushStroke();
          else if (s.cropDraft) s.cancelCrop();
          break;
        }
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === '\\' || e.key === ' ') setComparing(false);
    };
    const blur = () => setComparing(false);

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);
}
