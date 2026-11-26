// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, fireEvent, cleanup } from '@testing-library/react';
import { useKeyboard } from './useKeyboard';
import { useEditor } from '../state/documentStore';

const s = () => useEditor.getState();

function fakeBitmap(w: number, h: number): ImageBitmap {
  return { width: w, height: h } as ImageBitmap;
}

function load() {
  s().loadImage({ bitmap: fakeBitmap(100, 50), width: 100, height: 50, name: 'x.png' });
}

function key(target: Window | HTMLElement, k: string, init: KeyboardEventInit = {}) {
  fireEvent.keyDown(target, { key: k, ...init });
}

beforeEach(() => {
  useEditor.setState({
    doc: null, past: [], future: [], gestureBase: null,
    tool: 'select', cropDraft: null, cropAspect: null,
    comparing: false, loadError: null,
    view: { scale: 1, tx: 0, ty: 0, baseW: 0, baseH: 0 },
    container: { w: 0, h: 0 },
  });
});

afterEach(cleanup);

describe('useKeyboard', () => {
  it('maps v/c/t/a and the section-2 tools', () => {
    renderHook(() => useKeyboard());
    key(window, 'c');
    expect(s().tool).toBe('crop');
    key(window, 't');
    expect(s().tool).toBe('text');
    key(window, 'b');
    expect(s().tool).toBe('brush');
    key(window, 's');
    expect(s().tool).toBe('shape');
    key(window, 'i');
    expect(s().tool).toBe('eyedropper');
    key(window, 'f');
    expect(s().tool).toBe('preset');
    key(window, 'a');
    expect(s().tool).toBe('adjust');
    key(window, 'v');
    expect(s().tool).toBe('select');
  });

  it('accepts uppercase tool keys', () => {
    renderHook(() => useKeyboard());
    key(window, 'C');
    expect(s().tool).toBe('crop');
  });

  it('ignores tool keys while typing in a field', () => {
    renderHook(() => useKeyboard());
    const input = document.createElement('input');
    document.body.appendChild(input);
    key(input, 'c');
    expect(s().tool).toBe('select');
    input.remove();
  });

  it('ctrl+z undoes and ctrl+shift+z / ctrl+y redo', () => {
    renderHook(() => useKeyboard());
    load();
    s().setAdjustment('brightness', 30);
    key(window, 'z', { ctrlKey: true });
    expect(s().doc?.adjustments.brightness).toBe(0);
    key(window, 'z', { ctrlKey: true, shiftKey: true });
    expect(s().doc?.adjustments.brightness).toBe(30);
    key(window, 'z', { ctrlKey: true });
    key(window, 'y', { ctrlKey: true });
    expect(s().doc?.adjustments.brightness).toBe(30);
  });

  it('still handles undo while typing (modifier shortcuts bypass the guard)', () => {
    renderHook(() => useKeyboard());
    load();
    s().setAdjustment('brightness', 30);
    const input = document.createElement('input');
    document.body.appendChild(input);
    key(input, 'z', { ctrlKey: true });
    expect(s().doc?.adjustments.brightness).toBe(0);
    input.remove();
  });

  it('holds \\ or Space for before/after compare', () => {
    renderHook(() => useKeyboard());
    key(window, '\\');
    expect(s().comparing).toBe(true);
    fireEvent.keyUp(window, { key: '\\' });
    expect(s().comparing).toBe(false);
    key(window, ' ');
    expect(s().comparing).toBe(true);
    fireEvent.keyUp(window, { key: ' ' });
    expect(s().comparing).toBe(false);
  });

  it('blur releases the compare state', () => {
    renderHook(() => useKeyboard());
    key(window, '\\');
    expect(s().comparing).toBe(true);
    window.dispatchEvent(new Event('blur'));
    expect(s().comparing).toBe(false);
  });

  it('Escape cancels an active crop draft', () => {
    renderHook(() => useKeyboard());
    load();
    s().setTool('crop');
    s().setCropDraft({ cx: 10, cy: 10, w: 20, h: 20, angle: 0 });
    key(window, 'Escape');
    expect(s().cropDraft).toBeNull();
    expect(s().tool).toBe('select');
  });

  it('Escape does nothing without a crop draft', () => {
    renderHook(() => useKeyboard());
    load();
    s().setTool('adjust');
    key(window, 'Escape');
    expect(s().tool).toBe('adjust');
  });

  it('removes listeners on unmount', () => {
    const { unmount } = renderHook(() => useKeyboard());
    unmount();
    key(window, 'c');
    expect(s().tool).toBe('select');
  });
});
