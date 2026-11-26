// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { useFileInput, pickImageFile } from './useFileInput';
import { useEditor } from '../state/documentStore';

const s = () => useEditor.getState();

function dispatchDragEvent(type: string, dataTransfer: unknown) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'dataTransfer', { value: dataTransfer });
  window.dispatchEvent(e);
  return e;
}

function imageFile(name = 'pic.png', type = 'image/png') {
  return new File([new Uint8Array([137, 80, 78, 71])], name, { type });
}

beforeEach(() => {
  useEditor.setState({
    doc: null, past: [], future: [], gestureBase: null,
    tool: 'select', cropDraft: null, cropAspect: null,
    comparing: false, loadError: null,
    view: { scale: 1, tx: 0, ty: 0, baseW: 0, baseH: 0 },
    container: { w: 0, h: 0 },
  });
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 10, height: 10 })));
});

afterEach(cleanup);

describe('useFileInput', () => {
  it('loads the first image file on drop', async () => {
    renderHook(() => useFileInput());
    const file = imageFile('photo.png');
    dispatchDragEvent('drop', { types: ['Files'], files: [file], dropEffect: 'none' });
    await waitFor(() => expect(s().doc).not.toBeNull());
    expect(s().doc?.sourceName).toBe('photo.png');
  });

  it('accepts image files by extension even without an image MIME type', async () => {
    renderHook(() => useFileInput());
    const file = imageFile('scan.webp', 'application/octet-stream');
    dispatchDragEvent('drop', { types: ['Files'], files: [file], dropEffect: 'none' });
    await waitFor(() => expect(s().doc).not.toBeNull());
  });

  it('ignores drops without image files', async () => {
    renderHook(() => useFileInput());
    const file = new File([new Uint8Array([1])], 'notes.txt', { type: 'text/plain' });
    dispatchDragEvent('drop', { types: ['Files'], files: [file], dropEffect: 'none' });
    await new Promise((r) => setTimeout(r, 20));
    expect(s().doc).toBeNull();
    expect(s().loadError).toBeNull();
  });

  it('ignores drops that carry no files', () => {
    renderHook(() => useFileInput());
    const e = dispatchDragEvent('drop', { types: ['text/plain'], files: [], dropEffect: 'none' });
    expect(e.defaultPrevented).toBe(false);
  });

  it('dragover with files prevents default and sets copy effect', () => {
    renderHook(() => useFileInput());
    const dt = { types: ['Files'], dropEffect: 'none' };
    const e = dispatchDragEvent('dragover', dt);
    expect(e.defaultPrevented).toBe(true);
    expect(dt.dropEffect).toBe('copy');
  });

  it('dragover without files is ignored', () => {
    renderHook(() => useFileInput());
    const dt = { types: ['text/plain'], dropEffect: 'none' };
    const e = dispatchDragEvent('dragover', dt);
    expect(e.defaultPrevented).toBe(false);
    expect(dt.dropEffect).toBe('none');
  });

  it('paste loads an image clipboard item as "pasted-image"', async () => {
    renderHook(() => useFileInput());
    const file = imageFile('whatever.png');
    const e = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'clipboardData', {
      value: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }] },
    });
    window.dispatchEvent(e);
    await waitFor(() => expect(s().doc).not.toBeNull());
    expect(s().doc?.sourceName).toBe('pasted-image');
    expect(e.defaultPrevented).toBe(true);
  });

  it('paste ignores non-image and non-file items', async () => {
    renderHook(() => useFileInput());
    const e = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'clipboardData', {
      value: {
        items: [
          { kind: 'string', type: 'text/plain', getAsFile: () => null },
          { kind: 'file', type: 'text/plain', getAsFile: () => new File(['x'], 'a.txt') },
        ],
      },
    });
    window.dispatchEvent(e);
    await new Promise((r) => setTimeout(r, 20));
    expect(s().doc).toBeNull();
    expect(e.defaultPrevented).toBe(false);
  });

  it('removes listeners on unmount', async () => {
    const { unmount } = renderHook(() => useFileInput());
    unmount();
    const file = imageFile();
    dispatchDragEvent('drop', { types: ['Files'], files: [file], dropEffect: 'none' });
    await new Promise((r) => setTimeout(r, 20));
    expect(s().doc).toBeNull();
  });
});

describe('pickImageFile', () => {
  function stubFileInput() {
    const realCreate = document.createElement.bind(document);
    const input: any = {
      type: '', accept: '', files: null as any,
      onchange: null as any, click: vi.fn(),
    };
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string, ...rest: any[]) => {
      if (tag === 'input') return input;
      return realCreate(tag, ...(rest as [any]));
    }) as typeof document.createElement);
    return input;
  }

  it('opens a picker limited to images and loads the selection', async () => {
    const input = stubFileInput();
    pickImageFile();
    expect(input.type).toBe('file');
    expect(input.accept).toBe('image/*,.bmp');
    expect(input.click).toHaveBeenCalledOnce();

    input.files = [imageFile('picked.jpg', 'image/jpeg')];
    input.onchange();
    await waitFor(() => expect(s().doc).not.toBeNull());
    expect(s().doc?.sourceName).toBe('picked.jpg');
    vi.restoreAllMocks();
  });

  it('does nothing when the picker is cancelled', async () => {
    const input = stubFileInput();
    pickImageFile();
    input.files = [];
    input.onchange();
    await new Promise((r) => setTimeout(r, 20));
    expect(s().doc).toBeNull();
    vi.restoreAllMocks();
  });
});
