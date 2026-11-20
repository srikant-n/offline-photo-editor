---
name: Obsidian Studio
colors:
  surface: '#111319'
  surface-dim: '#111319'
  surface-bright: '#373940'
  surface-container-lowest: '#0c0e14'
  surface-container-low: '#191b21'
  surface-container: '#1d1f26'
  surface-container-high: '#282a30'
  surface-container-highest: '#33353b'
  on-surface: '#e2e2ea'
  on-surface-variant: '#c7c4d7'
  inverse-surface: '#e2e2ea'
  inverse-on-surface: '#2e3037'
  outline: '#908fa0'
  outline-variant: '#464554'
  surface-tint: '#c0c1ff'
  primary: '#c0c1ff'
  on-primary: '#1000a9'
  primary-container: '#8083ff'
  on-primary-container: '#0d0096'
  inverse-primary: '#494bd6'
  secondary: '#4cd7f6'
  on-secondary: '#003640'
  secondary-container: '#03b5d3'
  on-secondary-container: '#00424e'
  tertiary: '#ffb95f'
  on-tertiary: '#472a00'
  tertiary-container: '#ca8100'
  on-tertiary-container: '#3e2400'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e1e0ff'
  primary-fixed-dim: '#c0c1ff'
  on-primary-fixed: '#07006c'
  on-primary-fixed-variant: '#2f2ebe'
  secondary-fixed: '#acedff'
  secondary-fixed-dim: '#4cd7f6'
  on-secondary-fixed: '#001f26'
  on-secondary-fixed-variant: '#004e5c'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#111319'
  on-background: '#e2e2ea'
  surface-variant: '#33353b'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  body-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  body-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 14px
  label-md:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 12px
    letterSpacing: 0.03em
  label-xs:
    fontFamily: Inter
    fontSize: 9px
    fontWeight: '600'
    lineHeight: 10px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 0.5rem
  margin: 0.75rem
  space-xs: 0.125rem
  space-sm: 0.25rem
  space-md: 0.5rem
  space-lg: 0.75rem
  space-xl: 1rem
---

## Brand & Style

This design system is engineered for a high-performance, client-side creative desktop suite. It balances the analytical precision of digital asset grading (e.g., Lightroom) with the direct manipulation dynamics of vector and raster compositing canvases (e.g., Figma, Photoshop).

### Personality & Emotional Stance
- **Precision Instrument:** Uncluttered, zero-latency aesthetic, distraction-free neutral frames that recede to let user photography and artwork dominate.
- **Engineered Utilitarianism:** Dense, calibrated control clusters, micro-typography, and surgical iconography designed for keyboard-driven, muscle-memory workflows.
- **Restrained Electric Accents:** High-potency functional accents (electric indigo, laser cyan, amber alerts) reserved strictly for active states, transform bounding boxes, and histogram warnings.

### Design Movement
**Modern Technical Minimalism infused with Low-Contrast Precision Tooling.** Visual boundaries are dictated by single-pixel hairline borders and hairline surface stepped tonalities rather than heavy shadows. Toolbars, inspector docks, and viewport frames remain monolithic, solid, and non-distracting.

## Colors

The palette operates on a calibrated dark-room hierarchy designed to prevent optical eye strain during prolonged editing sessions while maintaining accurate delta-E contrast against image canvas contents.

### Surface Scale (Dark Slate Tiers)
- **Canvas Viewport Surface:** `#0c0d0f` (deepest base layer, neutral canvas backdrop).
- **Workspace Chrome / Dock Backgrounds:** `#121316` (docked sidebar trunks, top bar, status rail).
- **Surface Panels & Floating Palettes:** `#1a1c22` (inspector panels, layer trees, tool sheets).
- **Surface Elevation / Group Containers:** `#242731` (input controls, slider troughs, segmented toggles).
- **Interactive Hover & Active Surfaces:** `#2f3442` (button hovers, active tool wells, selection chips).

### Accent System
- **Primary Accent (`#6366f1` Electric Indigo):** Reserved for transform bounding handles, primary action buttons, active tab indicators, and vector path anchors.
- **Secondary Accent (`#06b6d4` Laser Cyan):** Indicator for clipping highlights, live curve editing points, color picker eyedropper states, and guide alignment lines.
- **Status / Dynamic Accents:**
  - **Amber Warning (`#f59e0b`):** Histogram shadow/highlight clipping alert, destructive state flags.
  - **Active Green (`#10b981`):** Cache status, background render engine idle/complete, GPU acceleration status.

## Typography

Typography prioritizes extreme high-density legibility, numerical tabular clarity, and immediate visual hierarchy across dense parameter sets.

### Typographic Principles
- **Monospaced Numerics:** All numeric readout panels, coordinate fields (`X`, `Y`, `W`, `H`), color channels (`RGB`, `HEX`, `HSL`), and slider value badges must utilize `font-variant-numeric: tabular-nums` to eliminate jitter during continuous drag adjustments.
- **All-Caps Micro-Headers:** Collapsible inspector accordion titles, tooltips, and property labels adopt `label-xs` or `label-sm` with upper casing and expanded tracking (`0.03em` - `0.05em`).
- **High-Contrast Value Display:** Primary labels take muted neutral foregrounds (`#9ca3af`), while numerical values, layer names, and active inputs take crisp off-white (`#f9fafb`).

## Layout & Spacing

The UI is built around an immutable workspace shell partitioned into high-density dock regions:
- **Top Command Bar:** Fixed `40px` height. Houses project metadata, breadcrumbs, cloud/local cache indicator, undo/redo stacks, and export triggers.
- **Left Toolstrip:** Fixed `44px` width. Compact icon vertical ribbon containing primary canvas tools (Crop, Healing Brush, Selection, Pen, Transform).
- **Central Canvas Viewport:** Fluid layout maximizing remaining viewport area. Features floating HUD overlays for zoom level, canvas orientation, and gamut alerts.
- **Right Property Inspector:** Fixed `280px` or `320px` modular dock. Houses collapsible property accordions: Histogram, RAW Development, Curves, Color Wheels, and Layer Stack.
- **Bottom Status & Filmstrip Strip:** Collapsible `32px` status rail or expandable `96px` multi-image filmstrip.

### Spatial Rhythm
This desktop tool leverages a tight 4px micro-grid. Spacing between discrete parameter pairs is tightly bound (`space-xs` = 2px, `space-sm` = 4px) to retain maximum screen real estate for the image viewport.

## Elevation & Depth

This system avoids blurred drop shadows on docked chrome panels, maintaining absolute graphic precision through low-contrast hairline borders and surface stratification.

### Structural Stratification
- **Hairline Framing:** All panels, inspector cards, and toolwells are segmented via a 1px solid stroke (`#242731`).
- **Canvas Recess:** The primary viewport is visually recessed using `#0c0d0f`, framed by docked side panels sitting at `#121316` and `#1a1c22`.
- **Floating Modals & Dropdown Context Menus:** Floating HUD tools, context menus, and color wheels utilize a razor-sharp ambient elevation:
  - 1px border stroke: `#2f3442`.
  - Ambient shadow: `0 8px 24px -4px rgba(0, 0, 0, 0.65), 0 2px 6px -1px rgba(0, 0, 0, 0.45)`.
- **Canvas Bounding & Active Overlays:** Active layer bounds and crop marquees render above canvas imagery with single-pixel solid vectors (`#6366f1` or `#06b6d4`) with high-contrast 0.5px dark outer halos to remain visible against pure white or pure black pixels.

## Shapes

The design system embraces a condensed, precision-tooled geometry (`roundedness: 1`).
- Standard buttons, input wells, sliders, and layer item rows feature `0.25rem` (4px) corner radii.
- Inspector cards, nested toolgroups, and canvas HUD pods use `rounded-lg` (`0.5rem` / 8px).
- Floating context menus and tooltips implement `rounded-lg` (`0.5rem`).
- Anchor points, bounding box transformation grips, and vector control handles remain crisp squares (`0` radius) or precise circular pips (`9999px`).

## Components

### Buttons & Toolwell Triggers
- **Icon Tool Trigger:** 32x32px square hit targets with a 4px corner radius. Inactive: transparent background with `#9ca3af` icon. Hover: `#242731`. Active: `#2f3442` with an electric indigo (`#6366f1`) 2px left-indicator pip or solid fill.
- **Primary Button:** High-contrast `#6366f1` background, `#ffffff` text, 28px height, `label-md` uppercase typography. Active state scales subtly (`scale(0.98)`).
- **Ghost/Tertiary Action:** Subtle `#242731` border, transparent background, `#d1d5db` text.

### Parameter Inputs & Scrubbable Sliders
- **Scrubbable Numeric Input:** Compound control featuring a parameter tag (e.g., `Exposure`), a clickable inline draggable value label (scrub cursor: `ew-resize`), and an immediate text input trigger on double-click.
- **Tactile Slider Track:**
  - Trough: 4px height, background `#242731`, corner radius 2px. Center detent mark at 0 for bipolar adjustments (e.g., `-100` to `+100`).
  - Active Fill: `#6366f1` (or `#06b6d4` for color temperature).
  - Thumb: 12x12px pill with a 1px border (`#ffffff`) and `#121316` fill, elevating to full white fill when dragged.

### Layer Stack Item
- **Layout:** 28px compact horizontal row.
- **State Indicators:** Left eye icon (visibility toggle), lock glyph, clipping mask indentation (12px nested), layer thumbnail (20x20px checkerboard backing), title label (`body-md`), and blend mode quick dropdown.
- **Selected State:** Solid `#2f3442` background with `#6366f1` 2px left accent border and white text. Drag-over indicated by a 2px horizontal electric cyan insertion bar.

### Inspector Accordion Cards
- **Header:** 28px height with caret icon, section title in `label-sm` tracking, and an inline reset toggle button (curved arrow) appearing on hover when adjustments differ from default.
- **Body:** Multi-column layout with 8px column gutters for paired properties (e.g., X/Y or Width/Height).

### Interactive Color Wheels & Tone Curves
- **Tone Curve:** 200x200px plot area backed by a 4x4 neutral grid (`#242731`). Curve line rendered in high-clarity 1.5px `#ffffff`, node anchor points rendered as 8px circular points with `#6366f1` cores.
- **3-Way Color Wheels (Lift, Gamma, Gain):** 80px circular track with dark polar coordinates grid. Crosshair pointer with a 1px white border and live color feedback pip in the center.