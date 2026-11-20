# Obsidian Studio

A client-side photo editor built with React, TypeScript, and Vite. Images are decoded and edited entirely in the browser—there is no upload or server-side processing.

## Features

- Import images by opening a file, dragging and dropping, or pasting from the clipboard
- Supports PNG, JPEG, WebP, GIF, AVIF, and BMP
- Crop with aspect-ratio presets, rotation, and straightening
- Rotate, flip, and custom canvas sizing with background color
- Tone and color adjustments: exposure, brightness, contrast, highlights, shadows, whites, blacks, temperature, vibrance, saturation, and sharpness
- Undo/redo history with gesture coalescing for slider drags
- Zoomable, pannable viewport with before/after comparison
- WebGL2 rendering pipeline with a Canvas2D fallback
- Export to PNG, JPEG, or WebP with quality control

## Getting started

Requires Node.js and npm.

```bash
npm install
npm run dev
```

Open the URL printed by Vite, then drop an image onto the workspace or use the open-file button.

## Scripts

```bash
npm run dev       # Start the Vite development server
npm run build     # Type-check and create a production build
npm run preview   # Preview the production build locally
npm run lint      # Run Oxlint
npx vitest run    # Run geometry/rendering unit tests
```

## Usage

- **Open image:** toolbar folder button, drag and drop, or paste with `Ctrl+V` / `Cmd+V`
- **Crop:** press `C` or select the crop tool
- **Transform:** press `T` for rotate, flip, straighten, and canvas controls
- **Adjustments:** press `A` for tone, color, and detail controls
- **Compare:** hold `\` or `Space` to view the original
- **Cancel crop:** press `Esc`
- **Zoom/pan:** scroll to zoom and drag the canvas to pan
- **History:** `Ctrl+Z` / `Cmd+Z` to undo, `Ctrl+Shift+Z` or `Ctrl+Y` to redo

## Rendering

The editor uses WebGL2 for geometry transforms, tone adjustments, and unsharp masking when available. If WebGL2 is unavailable, it falls back to a Canvas2D renderer with approximate adjustment support.

The `Screens/` directory contains design references and is not part of the runtime application.
