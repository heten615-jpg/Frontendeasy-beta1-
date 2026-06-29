export type ToolId = 'select' | 'hand' | 'scale' | 'frame' | 'section' | 'slice' | 'pen' | 'pencil' | 'text' | 'comment' | 'annotation' | 'measure' | 'image' | 'input' | 'textarea' | 'list' | 'iframe';
export type ElementType = 'section' | 'slice' | 'text' | 'group' | 'image' | 'svg' | 'vector' | 'input' | 'textarea' | 'list' | 'iframe';
export type ProjectFontFamily = 'Inter' | 'Roboto' | 'Open Sans' | 'Lora' | 'Playfair Display' | 'Space Grotesk';
export type TextStylePresetId = 'heading1' | 'heading2' | 'body' | 'caption';
export type ExportLayoutMode = 'flow' | 'absolute';

export interface TextStylePreset {
  id: TextStylePresetId;
  label: string;
  fontSize: number;
  fontWeight: string;
  letterSpacing?: number;
  lineHeight?: number;
  textDecoration?: 'none' | 'underline' | 'line-through' | 'overline';
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
}

export interface AppearancePresetFields {
  background?: string;
  color?: string;
  borderRadius?: number;
  opacity?: number | null;
  border?: FrameElement['border'] | null;
  shadow?: FrameElement['shadow'] | null;
  effects?: FrameElement['effects'] | null;
  textShadow?: FrameElement['textShadow'] | null;
  mediaFilters?: MediaFilters | null;
}

export interface AppearancePreset {
  id: string;
  label: string;
  description?: string;
  fields: AppearancePresetFields;
  createdAt: number;
  updatedAt: number;
}

export type ProjectStyleKind = 'text' | 'color' | 'effect' | 'layout-guide';
export type ProjectVariableType = 'color' | 'number' | 'text' | 'effect' | 'layout';

export interface ProjectStyle {
  id: string;
  name: string;
  kind: ProjectStyleKind;
  description?: string;
  fields: {
    text?: Partial<TextStylePreset>;
    color?: string;
    effects?: ElementEffect[];
    layoutGuide?: Partial<FrameLayoutGuide>;
    variableId?: string;
  };
  createdAt: number;
  updatedAt: number;
}

export interface ProjectVariableMode {
  id: string;
  name: string;
}

export interface ProjectVariableGroup {
  id: string;
  name: string;
}

export interface ProjectVariable {
  id: string;
  name: string;
  path: string;
  type: ProjectVariableType;
  groupId?: string;
  fallback: string;
  valuesByMode?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectVariableCollection {
  id: string;
  name: string;
  activeModeId?: string;
  modes: ProjectVariableMode[];
  groups?: ProjectVariableGroup[];
  variables: ProjectVariable[];
  createdAt: number;
  updatedAt: number;
}

export interface ProjectExportSettings {
  /** P1 — layout strategy for generated HTML. New projects default to flow; migrated projects keep absolute. */
  layoutMode?: ExportLayoutMode;
  /** Item 131 — HTML/CSS whitespace stripping for production exports. */
  minifyHtml: boolean;
  /** Adds a restrictive CSP meta tag to generated HTML while allowing known inline export blocks by nonce. */
  strictCsp: boolean;
  /** Keeps editor-only metadata out of export by default; future inspector export can opt in. */
  includeInspectorMetadata: boolean;
  /** Item 132 — project-level dark-mode token export. */
  darkMode: {
    enabled: boolean;
    palette: Record<string, string>;
  };
  /** Item 133 — PWA manifest/service-worker export. */
  pwa: {
    enabled: boolean;
    appName?: string;
    iconAssetId?: string | null;
  };
  /** Item 134 — default favicon for frames without an override. */
  defaultFaviconAssetId?: string | null;
}

export interface FrameExportSettings {
  layoutMode?: ExportLayoutMode | 'inherit';
  minifyHtml?: boolean;
  includeInspectorMetadata?: boolean;
  /** Item 132 — per-page override for project dark-mode token export. */
  darkModeEnabled?: boolean;
  pwaExcluded?: boolean;
  faviconAssetId?: string | null;
}

export type ProjectCommentStatus = 'local' | 'queued' | 'syncing' | 'synced' | 'failed';

export type ProjectCommentTarget =
  | { type: 'canvas'; x: number; y: number }
  | { type: 'frame'; frameId: string; x: number; y: number }
  | { type: 'element'; frameId?: string; elementId: string; x: number; y: number };

export interface ProjectCommentMessage {
  id: string;
  authorUserId?: string;
  authorName?: string;
  body: string;
  createdAt: number;
  updatedAt?: number;
}

export interface ProjectCommentThread {
  id: string;
  projectId: string;
  clientId?: string;
  target: ProjectCommentTarget;
  body: string;
  messages: ProjectCommentMessage[];
  resolved: boolean;
  status: ProjectCommentStatus;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export type ProjectReviewOverlayKind = 'annotation' | 'measurement';

export interface ProjectReviewOverlay {
  id: string;
  kind: ProjectReviewOverlayKind;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: string;
  createdAt: number;
}

export type ProjectGuideAxis = 'x' | 'y';
export type ProjectGuideScope = 'canvas' | 'frame';

export interface ProjectGuide {
  id: string;
  axis: ProjectGuideAxis;
  /** World position for canvas guides; frame-local position for frame guides. */
  position: number;
  scope: ProjectGuideScope;
  frameId?: string;
  createdAt: number;
}

export type FrameLayoutGuideKind = 'uniform' | 'columns' | 'rows';
export type FrameLayoutGuideTrackType = 'stretch' | 'center' | 'start' | 'end';

export interface FrameLayoutGuide {
  id: string;
  kind: FrameLayoutGuideKind;
  visible?: boolean;
  count?: number;
  /** Uniform grid cell size, or optional explicit track size for columns/rows. */
  size?: number;
  margin?: number;
  gutter?: number;
  trackType?: FrameLayoutGuideTrackType;
  color?: string;
  variableRef?: string;
}

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  href?: string;
  targetFrameId?: string;
}

export interface VectorPoint {
  x: number;
  y: number;
  handleIn?: { x: number; y: number };
  handleOut?: { x: number; y: number };
  curve?: 'line' | 'cubic';
}

export type VectorEditTool = 'select' | 'variable-width' | 'shape-builder' | 'cut' | 'bend' | 'lasso' | 'paint';
export type VectorEditOperationKind = 'merge' | 'extract' | 'subtract' | 'cut' | 'bend';

export interface VectorEditOperation {
  id: string;
  kind: VectorEditOperationKind;
  createdAt: number;
}

export interface VectorEditState {
  active?: boolean;
  tool?: VectorEditTool;
  variableWidths?: number[];
  paintColor?: string;
  operations?: VectorEditOperation[];
}

export type ElementMaskKind = 'alpha' | 'vector' | 'luminance';

export interface ElementMask {
  kind: ElementMaskKind;
  enabled?: boolean;
  inverted?: boolean;
  createdAt: number;
}

export interface ComponentInstanceData {
  masterId: string;
  variantId?: string;
  detached?: boolean;
  propertyValues?: Record<string, ComponentPropertyValue>;
}

export type ComponentPropertyKind = 'boolean' | 'text' | 'instance-swap' | 'variant';
export type ComponentPropertyValue = boolean | string;

export interface ComponentPropertyDefinition {
  id: string;
  name: string;
  kind: ComponentPropertyKind;
  targetElementId?: string;
  defaultValue?: ComponentPropertyValue;
  options?: string[];
  createdAt: number;
}

export type MediaKind = 'raster' | 'svg' | 'video';

export interface MediaCrop {
  unit: 'percent';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MediaFocalPoint {
  x: number;
  y: number;
}

export interface MediaFilters {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  blur?: number;
  hue?: number;
  grayscale?: number;
}

export interface MediaFill {
  mode: 'fit' | 'fill' | 'stretch' | 'original' | 'tile';
  background?: string;
}

export interface MediaTransform {
  kind: MediaKind;
  crop?: MediaCrop;
  cropAspectRatio?: 'free' | '1:1' | '4:3' | '16:9' | '3:4' | '9:16';
  focalPoint?: MediaFocalPoint;
  filters?: MediaFilters;
  fill?: MediaFill;
  scale?: number;
  translateX?: number;
  translateY?: number;
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;
}

export interface ElementMediaFill {
  kind: MediaKind;
  /** Inline data URL or external source. Cloud-backed media should prefer asset fields. */
  src?: string;
  assetId?: string;
  assetPath?: string;
  mime?: string;
  /** Semantic alt text when the media fill is exported as meaningful content. */
  alt?: string;
  transform?: MediaTransform;
}

export type FillKind = 'solid' | 'gradient' | 'pattern' | 'image' | 'video';
export type FillColorModel = 'hex' | 'rgb' | 'hsl' | 'variable';
export type FillSource = 'document' | 'library' | 'local';
export type FillGradientKind = 'linear' | 'radial' | 'angular' | 'diamond';
export type FillPatternTiling = 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat';
export type FillPatternAlignment = 'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right';

export interface FillGradientStop {
  color: string;
  pos: number;
  variableRef?: string;
}

export interface FillGradient {
  type: FillGradientKind;
  angle: number;
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;
  stops: FillGradientStop[];
}

export interface ElementFill {
  id: string;
  kind: FillKind;
  /** Concrete CSS fallback used by current canvas/export paths. */
  value?: string;
  colorModel?: FillColorModel;
  source?: FillSource;
  variableRef?: string;
  gradient?: FillGradient;
  pattern?: {
    style: 'diagonal' | 'grid' | 'dots';
    foreground: string;
    background: string;
    size: number;
    source?: FillSource;
    tiling?: FillPatternTiling;
    scale?: number;
    spacing?: number;
    alignment?: FillPatternAlignment;
    opacity?: number;
  };
  media?: ElementMediaFill;
}

export type AutoLayoutMode = 'flex' | 'grid';
export type AutoLayoutSizingMode = 'fixed' | 'hug' | 'fill';

export interface AutoLayoutGrid {
  columns: number;
  rows: number;
  columnTracks: string;
  rowTracks: string;
  columnGap: number;
  rowGap: number;
}

export interface AutoLayoutSizing {
  horizontal: AutoLayoutSizingMode;
  vertical: AutoLayoutSizingMode;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
}

/** Auto-layout config. Applied to 'group' elements or a Frame. */
export interface AutoLayout {
  /** Undefined preserves the legacy flex contract. */
  mode?: AutoLayoutMode;
  direction: 'row' | 'column';
  gap: number;
  /** Per-side padding */
  padding: { t: number; r: number; b: number; l: number };
  /** Cross-axis alignment */
  align: 'start' | 'center' | 'end' | 'stretch';
  /** Main-axis distribution (justify-content). Optional; default 'start'. */
  justify?: 'start' | 'center' | 'end' | 'space-between' | 'space-around';
  wrap?: boolean;
  grid?: AutoLayoutGrid;
}

export type HorizontalConstraint = 'left' | 'right' | 'left-right' | 'center' | 'scale';
export type VerticalConstraint = 'top' | 'bottom' | 'top-bottom' | 'center' | 'scale';
export type AppearanceValueMode = 'fixed' | 'variable';
export type StrokePlacement = 'inside' | 'center' | 'outside';
export type StrokeWidthProfile = 'uniform' | 'taper-start' | 'taper-end' | 'taper-both';
export type StrokeCap = 'butt' | 'round' | 'square';
export type StrokeBrushDirection = 'forward' | 'reverse';
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';
export type TypographyPanelMode = 'basics' | 'details' | 'variable';
export type FontSource = 'project' | 'system' | 'variable';
export type TextAlign = 'left' | 'center' | 'right' | 'justify';
export type TextVerticalAlign = 'top' | 'center' | 'bottom';
export type TextCase = 'none' | 'uppercase' | 'lowercase' | 'capitalize' | 'small-caps';
export type TextTrim = 'none' | 'cap-height' | 'both';
export type ElementEffectKind = 'drop-shadow' | 'inner-shadow' | 'layer-blur' | 'background-blur' | 'glass' | 'noise' | 'texture';
export type TextureEffectStyle = 'grain' | 'paper' | 'fabric';

export interface ElementEffect {
  id: string;
  kind: ElementEffectKind;
  visible?: boolean;
  settings: {
    shadow?: { x: number; y: number; blur: number; spread: number; color: string };
    blur?: { radius: number };
    glass?: { blur: number; saturation: number; tint: string; opacity: number };
    noise?: { opacity: number; size: number; monochrome?: boolean };
    texture?: { style: TextureEffectStyle; scale: number; opacity: number; color: string };
  };
}

export interface ElementStrokeSide {
  width?: number;
  style?: StrokeStyle;
  color?: string;
}

export interface ElementStroke {
  width: number;
  style: StrokeStyle;
  color: string;
  placement?: StrokePlacement;
  widthProfile?: StrokeWidthProfile;
  dash?: number;
  gap?: number;
  cap?: StrokeCap;
  startCap?: StrokeCap;
  endCap?: StrokeCap;
  brushDirection?: StrokeBrushDirection;
  sides?: {
    top?: ElementStrokeSide;
    right?: ElementStrokeSide;
    bottom?: ElementStrokeSide;
    left?: ElementStrokeSide;
  };
}

export interface CornerRadii {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}
export type BlendMode =
  | 'normal'
  | 'pass-through'
  | 'darken'
  | 'multiply'
  | 'color-burn'
  | 'lighten'
  | 'screen'
  | 'color-dodge'
  | 'overlay'
  | 'soft-light'
  | 'hard-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'
  | 'plus-darker'
  | 'plus-lighter';

export interface ElementConstraints {
  horizontal: HorizontalConstraint;
  vertical: VerticalConstraint;
}

export interface FrameElement {
  id: string;
  type: ElementType;
  name?: string;
  /** Set only when the element lives at canvas level (orphan). When orphaned, this is its standalone HTML filename. */
  filename?: string;
  /**
   * @deprecated v3 legacy — flat group tag. Migrated to proper 'group' ElementType in v4.
   * Left here so old JSON blobs can still be read and migrated without data loss.
   */
  groupId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Authored CSS geometry values (item 110). Numeric geometry remains px for
   * canvas editing; these optional strings preserve unit-suffixed inspector
   * input such as `50%`, `1em`, or `24px` for HTML export.
   */
  xCss?: string;
  yCss?: string;
  widthCss?: string;
  heightCss?: string;
  /** Responsive pinning inside the parent frame/group. Omitted means the default Left + Top contract. */
  constraints?: ElementConstraints;
  /** Export this element as an absolute overlay even in flow layout mode. */
  exportPinned?: boolean;
  /** Manual semantic tag override for HTML export. */
  semanticTag?: string;
  content: string;
  /** Optional inline styles for text elements; concatenated run text mirrors `content`. */
  textRuns?: TextRun[];
  color: string;
  background: string;
  /** Item 161 — unified fill metadata. Concrete rendering still falls back to background/mediaFill. */
  fills?: ElementFill[];
  borderRadius: number;
  /** Optional independent corner radii. Omitted keeps the legacy uniform borderRadius contract. */
  cornerRadii?: CornerRadii;
  /** Figma-style corner smoothing, 0..1. CSS export keeps radius fallback and persists this as intent metadata. */
  cornerSmoothing?: number;
  fontSize: number;
  fontWeight: string;
  targetFrameId: string | null;
  /** Any element can be marked as a button — gains link-to-frame capability + button HTML semantics. */
  isButton?: boolean;
  /**
   * Explicit background-layer marker (item 72). When true, the element is treated as the
   * full-frame background and is excluded from hit-test, marquee, inline-edit, and selection
   * highlight. Replaces the legacy coordinate/content heuristic in Canvas runtime.
   * Set explicitly on new background sections; legacy projects are migrated once on load (v7→v8).
   */
  isFrameBackground?: boolean;
  /** When true, element is skipped from hit-test, drag, marquee, and resize. Still rendered + exported. */
  locked?: boolean;
  /** When true, element is excluded from canvas render and from HTML export. Still listed in left panel. */
  hidden?: boolean;
  /** Children — only set when type === 'group'. Coords are relative to this element's origin. */
  children?: FrameElement[];
  /** Auto-layout config — only meaningful when type === 'group'. */
  autoLayout?: AutoLayout;
  /** Child sizing semantics when the parent is Auto Layout. */
  layoutSizing?: AutoLayoutSizing;
  /** When true, this child remains absolutely positioned even inside an Auto Layout parent. */
  ignoreAutoLayout?: boolean;
  /** Live reusable component instance metadata. Root element keeps normal geometry/selection behavior. */
  componentInstance?: ComponentInstanceData;
  /** Figma-style mask intent. Current export maps to deterministic CSS/SVG fallbacks where available. */
  mask?: ElementMask;
  /** Image src — data: URL or external URL. Only used when type === 'image'. */
  imageSrc?: string;
  /**
   * Cloud asset reference (item 35, schema v6). When set this takes precedence
   * over `imageSrc` and is resolved into a signed URL via the asset URL store.
   * Set together with `imageAssetPath` + `imageMime` so HTML export and the
   * offline asset cache can recreate the asset without a second lookup.
   */
  imageAssetId?: string;
  /** Storage path: `{user_id}/{project_id}/{asset_id}.{ext}`. */
  imageAssetPath?: string;
  /** MIME type recorded at upload time (e.g. `image/png`). */
  imageMime?: string;
  /** CSS object-fit for image element */
  objectFit?: 'cover' | 'contain' | 'fill' | 'none';
  /** CSS object-position for non-destructive image crop/focal point. */
  objectPosition?: string;
  /** Non-destructive media transform metadata for crop/filter/fill workflows. */
  mediaTransform?: MediaTransform;
  /**
   * Additive Figma-style media fill bridge (schema v17). Existing `type:'image'`
   * elements keep their legacy fields; new shape media fills can use this field
   * without destructively migrating old projects.
   */
  mediaFill?: ElementMediaFill;
  /** Sanitized inline SVG markup. Only used when type === 'svg'. */
  svgMarkup?: string;
  /** Normalized SVG viewBox for diagnostics and export. */
  svgViewBox?: string;
  /** Vector object foundation (schema v18). Coordinates are local to the element box. */
  vectorPath?: string;
  vectorPoints?: VectorPoint[];
  /** Contextual vector edit state: active sub-tool, variable widths, paint and boolean/path operations. */
  vectorEdit?: VectorEditState;
  /** Alt text for image element */
  alt?: string;
  /** External URL for iframe element (sandbox is applied automatically on export). */
  iframeSrc?: string;
  /** List kind: 'ul' (bulleted) or 'ol' (numbered). Only used when type === 'list'. */
  listKind?: 'ul' | 'ol';
  /**
   * Vector-shape variant for `type: 'section'` elements (item 45). When set,
   * the element renders as an inline SVG path instead of a plain div, both on
   * canvas and in the exported HTML.
   *   arrow   — right-pointing arrow (rotate via the wrapper if needed)
   *   polygon — regular N-gon, sides = `shapeSides` (3..12, default 5)
   *   ellipse — ellipse or pie arc when `shapeArcStart`/`shapeArcEnd` differ
   *   star    — 2N-pointed star; `shapeSides` = N points; `shapeInnerRatio`
   *             controls the inner radius (0..1, default 0.5)
   */
  shapeKind?: 'arrow' | 'ellipse' | 'polygon' | 'star';
  shapeSides?: number;
  shapeInnerRatio?: number;
  /** Corner rounding for polygon/star path geometry; rectangle uses borderRadius as the exported radius. */
  shapeCornerRadius?: number;
  /** Ellipse arc angles in degrees. 0→360 exports a full ellipse; other spans export a pie arc. */
  shapeArcStart?: number;
  shapeArcEnd?: number;
  /**
   * Rotation in degrees (item 46). Applied via CSS `transform: rotate()` on the
   * element wrapper around its center. Hit-testing still uses the un-rotated
   * bounding box — proper rotated hit-test is a follow-up.
   */
  rotation?: number;
  /** Optional transform origin preset used by canvas and export rotation/flip transforms. */
  transformOrigin?: 'center center' | 'top left' | 'top center' | 'top right' | 'center left' | 'center right' | 'bottom left' | 'bottom center' | 'bottom right';
  /** Mirror the rendered element horizontally without changing authored geometry. */
  flipX?: boolean;
  /** Mirror the rendered element vertically without changing authored geometry. */
  flipY?: boolean;
  /**
   * Opacity 0..1 (item 47). When undefined the element is fully opaque.
   * Stored as a float so 0.5 means 50% transparent; the inspector exposes
   * it as a 0–100 % slider.
   */
  opacity?: number;
  /** Item 160 — future variable binding mode for opacity; fixed preserves current behavior. */
  opacityMode?: AppearanceValueMode;
  /** Item 160 — future variable binding mode for visibility; fixed preserves current hidden flag behavior. */
  visibilityMode?: AppearanceValueMode;
  /** Item 160 — Figma-style blend mode. Normal/pass-through omit CSS on export. */
  blendMode?: BlendMode;
  /**
   * Drop shadow (item 48). When set, exports as a CSS `box-shadow` of the
   * form `Xpx Ypx Bpx Spx color`. `color` accepts any CSS colour the
   * ColorPicker emits (hex, rgba, etc.).
   */
  shadow?: { x: number; y: number; blur: number; spread: number; color: string };
  /** Item 166 — ordered Figma-style effects stack with nested CSS fallback settings. */
  effects?: ElementEffect[];
  /**
   * Border / stroke (item 49). Exports as a CSS `border` shorthand.
   * `box-sizing: border-box` is already set everywhere so adding a border
   * doesn't reflow the element box.
   */
  border?: ElementStroke;
  /**
   * Text shadow (item 102). Exports as a CSS `text-shadow` of the form
   * `Xpx Ypx Bpx color`. Distinct from `shadow` (box-shadow on the wrapper).
   */
  textShadow?: { x: number; y: number; blur: number; color: string };
  /**
   * Auto-fit font size (item 100). When true, the canvas preview and HTML
   * export compute the largest integer font-size (px) at which the longest
   * line of text fits within the element's width (accounting for padding).
   * Export emits `font-size: clamp(6px, Xvw, fitPx)` for responsive scaling.
   */
  fitText?: boolean;
  /** Text box sizing semantics. Old projects omit this and keep fixed-size behavior. */
  textBoxMode?: 'auto-width' | 'auto-height' | 'fixed';
  /** Text-box overflow behavior. Undefined preserves the default wrapped text layout. */
  textOverflow?: 'clip' | 'ellipsis' | 'wrap' | 'none';
  /** Typography inspector mode/source metadata for UI parity. */
  typographyMode?: TypographyPanelMode;
  fontSource?: FontSource;
  textAlign?: TextAlign;
  textVerticalAlign?: TextVerticalAlign;
  textCase?: TextCase;
  smallCaps?: boolean;
  textTrim?: TextTrim;
  maxLines?: number;
  paragraphIndent?: number;
  paragraphSpacing?: number;
  hangingPunctuation?: boolean;
  openTypeSettings?: string;
  listIndent?: number;
  listGap?: number;
  /**
   * Typography extras (item 51). All optional — omitted from state_json when
   * the user leaves them at default.
   *   letterSpacing — em units (e.g. 0.05 = "tracked"; negative for tight)
   *   lineHeight    — unitless multiplier (1.5 = "comfortable")
   *   textDecoration — underline / line-through / overline
   *   textTransform  — uppercase / lowercase / capitalize
   */
  letterSpacing?: number;
  lineHeight?: number;
  textDecoration?: 'none' | 'underline' | 'line-through' | 'overline';
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
}

export interface ComponentVariant {
  id: string;
  name: string;
  root: FrameElement;
  createdAt: number;
  updatedAt: number;
}

export interface ComponentMaster {
  id: string;
  name: string;
  description?: string;
  root: FrameElement;
  variants?: ComponentVariant[];
  properties?: ComponentPropertyDefinition[];
  createdAt: number;
  updatedAt: number;
  thumbnailAssetId?: string | null;
}

export interface ProjectSnippet {
  id: string;
  name: string;
  description?: string;
  roots: FrameElement[];
  createdAt: number;
  updatedAt: number;
  thumbnailAssetId?: string | null;
}

export interface Frame {
  id: string;
  name: string;
  filename: string;
  description?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Editor canvas rotation in degrees. */
  rotation?: number;
  /** Clips child layers to the frame bounds. Undefined preserves the default clipped export/runtime behavior. */
  clipContent?: boolean;
  /** Frame-level visual appearance for the editor canvas and generated page wrapper. */
  opacity?: number;
  borderRadius?: number;
  border?: FrameElement['border'];
  shadow?: FrameElement['shadow'];
  background: string;
  /** Optional CSS background image source plus placement controls for the frame/page. */
  backgroundImage?: string;
  backgroundImageSize?: 'cover' | 'contain' | 'auto';
  backgroundImageRepeat?: 'no-repeat' | 'repeat' | 'repeat-x' | 'repeat-y';
  backgroundImagePosition?: 'center' | 'top' | 'bottom' | 'left' | 'right';
  /** Optional flex layout for top-level content layers; frame background layers remain absolute. */
  autoLayout?: AutoLayout;
  /** Editor-only layout guide definitions rendered over this frame. */
  layoutGuides?: FrameLayoutGuide[];
  elements: FrameElement[];
  /** Base page for a responsive breakpoint frame. Undefined means this frame exports as its own page. */
  breakpointBaseId?: string;
  /** Responsive role for a base page or one of its linked viewport variants. */
  breakpoint?: 'desktop' | 'tablet' | 'mobile';
  /** Element IDs whose visual properties were customized in this variant. */
  variantOverrideElementIds?: string[];
  exportLayoutMode?: ExportLayoutMode | 'inherit';
  /** SEO meta tags (item 70). All optional — only emitted when set. */
  ogTitle?: string;
  ogImage?: string;
  twitterCard?: 'summary' | 'summary_large_image';
  keywords?: string;
  themeColor?: string;
  /** Per-frame export overrides for project export settings. */
  exportSettings?: FrameExportSettings;
}

export interface StudioState {
  schemaVersion: number;
  /** Shared typography family used by every exported page in this project. */
  fontFamily?: ProjectFontFamily;
  /** Per-project reusable typography presets shown in the inspector. */
  textStylePresets?: TextStylePreset[];
  /** Per-project reusable non-typography appearance presets. */
  appearancePresets?: AppearancePreset[];
  /** Project-owned reusable styles and variable/token collections. */
  projectStyles?: ProjectStyle[];
  variableCollections?: ProjectVariableCollection[];
  /** Project-wide export settings and defaults for future production export controls. */
  exportSettings?: ProjectExportSettings;
  /** Per-project async review comments. Persisted locally; mirrored to Supabase when available. */
  comments?: ProjectCommentThread[];
  /** Canvas-level reviewer redlines/measurements. Editor-only and excluded from HTML export. */
  reviewOverlays?: ProjectReviewOverlay[];
  /** Persistent editor-only layout guides created from rulers. Excluded from HTML export. */
  guides?: ProjectGuide[];
  /** Per-project local component masters. Instances/UI are wired in later tasks. */
  componentMasters?: ComponentMaster[];
  /** Static reusable copy-paste snippets. */
  snippets?: ProjectSnippet[];
  frames: Frame[];
  /** Elements that live at canvas level (not inside any frame). x/y are in WORLD coords (not relative). */
  orphanElements: FrameElement[];
  activeFrameId: string | null;
  selectedFrameIds: string[];
  selectedElementId: string | null;
  selectedElementIds: string[];
}

/**
 * Pure persistent payload — what's written to disk/cloud. No ephemeral UI state.
 * This is the part of a Project that survives across sessions/devices.
 */
export interface ProjectPayload {
  schemaVersion: number;
  fontFamily?: ProjectFontFamily;
  textStylePresets?: TextStylePreset[];
  appearancePresets?: AppearancePreset[];
  projectStyles?: ProjectStyle[];
  variableCollections?: ProjectVariableCollection[];
  exportSettings?: ProjectExportSettings;
  comments?: ProjectCommentThread[];
  reviewOverlays?: ProjectReviewOverlay[];
  guides?: ProjectGuide[];
  componentMasters?: ComponentMaster[];
  snippets?: ProjectSnippet[];
  frames: Frame[];
  orphanElements: FrameElement[];
}

/**
 * Canonical Project envelope. Wraps the persistent ProjectPayload with metadata
 * needed for cloud sync, project list display, and conflict resolution.
 *
 * Local-only projects have `ownerUserId: null` until they're synced to the cloud.
 * `lastClientRev` is a monotonically-incrementing counter — the client bumps it
 * before each save and the server uses it (in the cloud phase) to detect conflicts.
 */
export interface Project {
  /** UUID — stable across saves and devices. */
  id: string;
  /** Human-readable name shown in the project list. */
  title: string;
  /** Persistent canvas data. */
  payload: ProjectPayload;
  /** Monotonic counter, bumped on every save. Used for last-write-wins. */
  lastClientRev: number;
  /** Unix ms — project creation time. */
  createdAt: number;
  /** Unix ms — last meaningful save. */
  updatedAt: number;
  /** Unix ms — last time the user opened this project in the editor. */
  lastOpenedAt: number;
  /** Cloud owner. null = local-only project (pre-sync). */
  ownerUserId?: string | null;
  /** Optional asset id used for thumbnail in the project list. Resolved later in the cloud phase. */
  thumbnailAssetId?: string | null;
}
