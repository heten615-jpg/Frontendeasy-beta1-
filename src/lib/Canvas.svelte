<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { AutoLayout, BlendMode, FrameLayoutGuide, StudioState, Frame, FrameElement, ToolId, ElementType, ProjectCommentTarget, ProjectCommentThread, ProjectReviewOverlay, ProjectReviewOverlayKind, ProjectGuide, ProjectGuideAxis, ProjectGuideScope } from '../types';
  import { assetUrls, assetUrlStatuses, assetUrlStatusForElement, ensureAssetUrl, resolveImageSrcSync } from './assets/assetUrls';
  import { computeSnap, type SnapBox, type SnapGuide } from './canvas/smartGuides';
  import { getMeta, setMeta } from './persistence/localStore';
  import {
    type ResizeHandle, type ResizeBox,
    RESIZE_HANDLES, MIN_FRAME_SIZE, MIN_ELEMENT_SIZE,
    constrainAspectRatio, resizeBox, handleCursor,
  } from './canvas/resizeHandles';
  import { type HitResult, isFrameBackgroundLayer, hitTest, hitTestFrame } from './canvas/hitTest';
  import { getLassoSelection, getSelectionBounds, getMarqueeSelection, type SelectionPoint } from './canvas/selectionGeometry';
  import { buildConnectors } from './canvas/connectors';
  import MiniMap from './MiniMap.svelte';
  import InlineText from './InlineText.svelte';
  import { COMPONENT_DRAG_MIME } from './editor/componentMasters';
  import { cssFilterForElement, nextObjectPositionFromDrag, objectPositionForElement } from './editor/mediaTransforms';
  import { mediaFillForElement, mediaFillModeToObjectFit } from './editor/mediaFill';
  import { buildTabOrderItems, tabOrderSummary } from './a11y/tabOrder';
  import { buildCommentPins, commentStatusLabel } from './comments/commentModel';

  // Per-project viewport persistence (item 66) — debounced so dragging the
  // canvas doesn't hammer IDB. Loaded once when projectId is known.
  let viewportSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let viewportLoaded = false;
  function scheduleViewportSave() {
    if (!projectId || !viewportLoaded) return;
    if (viewportSaveTimer) clearTimeout(viewportSaveTimer);
    viewportSaveTimer = setTimeout(() => {
      viewportSaveTimer = null;
      void setMeta(`viewport:${projectId}`, { panX, panY, scale });
    }, 400);
  }
  // React to pan/zoom changes — fires on every move, but debounced inside.
  $: if (viewportLoaded) { panX; panY; scale; scheduleViewportSave(); }
  import { snapToGrid, gridSettings } from './canvas/gridSettings';
  import { shapePath } from './canvas/shapeSvg';
  import { buildVectorFromWorldPoints, type RawPoint } from './canvas/vectorPath';
  import {
    autoLayoutColumnGap,
    autoLayoutDisplay,
    autoLayoutGap,
    autoLayoutGridColumns,
    autoLayoutGridRows,
    autoLayoutRowGap,
    borderCss,
    borderOutlineCss,
    borderRadiusCss,
    borderSideCss,
    effectBackgroundCss,
    effectBoxShadowCss,
    elementBackdropFilterCss,
    elementBlendMode as resolvedElementBlendMode,
    elementBoxHeight,
    elementBoxWidth,
    elementFilterCss,
    elementTransformCss,
    elementTransformOrigin,
    frameBackgroundImage,
    layoutItemAlignSelf,
    layoutItemFlex,
    layoutItemHeight,
    layoutItemWidth,
    participatesInAutoLayout,
    resolvedFontSize as resolvedFontSizeForElement,
    strokeCap,
    strokeDashArray,
    shadowCss,
    textAlignCss,
    textBoxOverflow,
    textContentOverflow,
    textContentWidth,
    textEllipsis,
    textJustifyCss,
    textShadowCss,
    textVerticalAlignCss,
    textWhiteSpace,
    textWordBreak,
    transformOriginOffset,
    vectorEditLabel,
    vectorStrokeColor,
    vectorStrokeWidth,
    wireframeLabel,
  } from './canvas/renderStyles';

  function resolvedFontSize(el: FrameElement): number {
    return resolvedFontSizeForElement(el, state.fontFamily ?? 'Inter');
  }

  function elementBlendMode(el: FrameElement): string | undefined {
    return resolvedElementBlendMode(el, blendPreviewElementId, blendPreviewMode);
  }

  function enterVectorEdit(frameId: string | null, el: FrameElement) {
    if (!canEdit || el.type !== 'vector') return;
    const next = { ...(el.vectorEdit ?? {}), active: true, tool: el.vectorEdit?.tool ?? ('variable-width' as const) };
    if (frameId) onUpdateElement(frameId, el.id, { vectorEdit: next });
    else onUpdateOrphan(el.id, { vectorEdit: next });
  }

  function findFrameElement(elements: FrameElement[], id: string): FrameElement | null {
    for (const element of elements) {
      if (element.id === id) return element;
      const child = element.children ? findFrameElement(element.children, id) : null;
      if (child) return child;
    }
    return null;
  }

  // ── Rulers (item 43) ────────────────────────────────────────────────────
  // Track the canvas viewport size so ruler ticks span the visible area.
  let viewportWidth = 0;
  let viewportHeight = 0;

  function syncViewportSize() {
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    viewportWidth = rect.width;
    viewportHeight = rect.height;
  }

  /**
   * Picks an adaptive tick step (in world px) so labels stay roughly ~80 px
   * apart on-screen regardless of zoom level.
   */
  function rulerStep(scaleVal: number): number {
    const targetScreenStep = 80;
    const candidates = [1, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
    for (const c of candidates) {
      if (c * scaleVal >= targetScreenStep) return c;
    }
    return 10000;
  }

  /** Generates the visible tick positions for a given axis. */
  function rulerTicks(panOffset: number, viewport: number, scaleVal: number, step: number) {
    if (viewport <= 0) return [] as Array<{ world: number; screen: number }>;
    const worldStart = -panOffset / scaleVal;
    const worldEnd = (viewport - panOffset) / scaleVal;
    const first = Math.ceil(worldStart / step) * step;
    const ticks: Array<{ world: number; screen: number }> = [];
    for (let w = first; w <= worldEnd; w += step) {
      ticks.push({ world: w, screen: w * scaleVal + panOffset });
    }
    return ticks;
  }

  $: hRulerStep = rulerStep(scale);
  $: vRulerStep = rulerStep(scale);
  $: hTicks = rulerTicks(panX, viewportWidth, scale, hRulerStep);
  $: vTicks = rulerTicks(panY, viewportHeight, scale, vRulerStep);

  /** Active smart guides — populated during a single-object drag, cleared on mouseup. */
  let activeGuides: SnapGuide[] = [];

  type RenderedGuide = {
    id: string;
    axis: ProjectGuideAxis;
    scope: ProjectGuideScope;
    position: number;
    left: number;
    top: number;
    width: number;
    height: number;
    label: string;
  };
  type RenderedFrameLayoutGuide = {
    id: string;
    kind: FrameLayoutGuide['kind'];
    left: number;
    top: number;
    width: number;
    height: number;
    color: string;
  };

  type GuideDistanceLabel = {
    id: string;
    axis: ProjectGuideAxis;
    left: number;
    top: number;
    width: number;
    height: number;
    distance: number;
  };

  /**
   * Builds the list of snap targets for a move. Includes everything in world
   * coords EXCEPT the moving object itself. Frame siblings of a moving element
   * are included so elements can align with their neighbours, too.
   */
  function collectSnapTargets(excludeId: string | null, excludeFrameElement: { frameId: string; elementId: string } | null): SnapBox[] {
    const boxes: SnapBox[] = [];
    for (const f of state.frames) {
      if (f.id !== excludeId) {
        boxes.push({ id: f.id, x: f.x, y: f.y, w: f.width, h: f.height });
      }
      // Sibling elements (in world coords) — only when moving an element inside this frame.
      // For a moving frame we don't snap to its own children (that would be self-snap).
      if (excludeFrameElement && excludeFrameElement.frameId === f.id) {
        for (const el of f.elements) {
          if (el.id === excludeFrameElement.elementId) continue;
          if (el.hidden) continue;
          boxes.push({ id: el.id, x: f.x + el.x, y: f.y + el.y, w: el.width, h: el.height });
        }
      }
    }
    for (const o of state.orphanElements) {
      if (o.id === excludeId) continue;
      if (o.hidden) continue;
      boxes.push({ id: o.id, x: o.x, y: o.y, w: o.width, h: o.height });
    }
    return boxes;
  }

  /**
   * Reactively pick the right URL for an image element:
   *   - If it carries an asset reference (imageAssetPath), use the resolved
   *     URL from the store (kicked off lazily via ensureAssetUrl).
   *   - Otherwise fall back to the legacy `imageSrc` (data: URL or external).
   */
  const ASSET_RESOLVE_OVERSCAN_PX = 900;

  type WorldRect = { x: number; y: number; width: number; height: number };

  function rectsIntersect(a: WorldRect, b: WorldRect): boolean {
    return a.x <= b.x + b.width
      && a.x + a.width >= b.x
      && a.y <= b.y + b.height
      && a.y + a.height >= b.y;
  }

  function assetResolveWorldRect(): WorldRect {
    const safeScale = Math.max(0.01, scale);
    const margin = ASSET_RESOLVE_OVERSCAN_PX / safeScale;
    return {
      x: -panX / safeScale - margin,
      y: -panY / safeScale - margin,
      width: viewportWidth / safeScale + margin * 2,
      height: viewportHeight / safeScale + margin * 2,
    };
  }

  function shouldResolveCanvasAsset(el: FrameElement, frame: Frame | null): boolean {
    if (frame) {
      if (frame.id === state.activeFrameId || selectedFrameIdSet.has(frame.id)) return true;
      return rectsIntersect(assetResolveWorldRect(), {
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height,
      });
    }
    if (state.selectedElementId === el.id || selectedElementIdSet.has(el.id)) return true;
    return rectsIntersect(assetResolveWorldRect(), {
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
    });
  }

  function maybeResolveCanvasAsset(el: FrameElement, frame: Frame | null): void {
    const fill = mediaFillForElement(el);
    if ((el.imageAssetPath && el.imageAssetId) || (fill?.assetPath && fill.assetId)) {
      if (shouldResolveCanvasAsset(el, frame)) void ensureAssetUrl(el);
    }
    if (el.children?.length) {
      for (const child of el.children) maybeResolveCanvasAsset(child, frame);
    }
  }

  function prewarmVisibleCanvasAssets(
    frames: Frame[],
    orphanElements: FrameElement[],
    deps: {
      activeFrameId: string | null;
      selectedFrameIds: string[];
      selectedElementId: string | null;
      selectedElementIds: string[];
      viewportWidth: number;
      viewportHeight: number;
      panX: number;
      panY: number;
      scale: number;
    },
  ): void {
    void deps;
    for (const frame of frames) {
      for (const el of frame.elements) maybeResolveCanvasAsset(el, frame);
    }
    for (const el of orphanElements) maybeResolveCanvasAsset(el, null);
  }

  $: prewarmVisibleCanvasAssets(
    state.frames,
    state.orphanElements,
    {
      activeFrameId: state.activeFrameId,
      selectedFrameIds: state.selectedFrameIds,
      selectedElementId: state.selectedElementId,
      selectedElementIds: state.selectedElementIds,
      viewportWidth,
      viewportHeight,
      panX,
      panY,
      scale,
    },
  );

  function imageRenderSrc(el: FrameElement, urls: Map<string, string>, frame: Frame | null): string {
    const fill = mediaFillForElement(el);
    if (el.imageAssetPath || fill?.assetPath) {
      // Kick off resolution (no-op if already resolved/in-flight).
      if (shouldResolveCanvasAsset(el, frame)) void ensureAssetUrl(el);
    }
    return resolveImageSrcSync(el, urls) ?? '';
  }

  function imagePlaceholderLabel(el: FrameElement): string {
    const status = assetUrlStatusForElement(el, $assetUrlStatuses);
    if (status === 'error') return 'Asset failed';
    if (status === 'unavailable') return 'Asset unavailable';
    return el.imageAssetPath || mediaFillForElement(el)?.assetPath ? 'Loading…' : 'No image';
  }

  function startMarqueeSelection(worldPoint: { x: number; y: number }, frameId: string | null) {
    dragMode = 'marquee';
    isMarquee = false;
    marqueeClickFrameId = frameId;
    marqueeRect = { x: worldPoint.x, y: worldPoint.y, w: 0, h: 0 };
    resetMarqueeSelectionTracking();
  }

  function marqueeSignature(frameId: string | null, elementIds: string[], frameIds: string[]): string {
    return `${frameId ?? ''}|${frameIds.join(',')}|${elementIds.join(',')}`;
  }

  function applyMarqueeSelection(rect: typeof marqueeRect) {
    const { elementIds, orphanIds, firstFrameWithHits, wholeFrameIds } = getMarqueeSelection(
      rect,
      state.frames,
      state.orphanElements,
    );
    const frameId = wholeFrameIds[0] ?? firstFrameWithHits ?? marqueeClickFrameId;
    const selectedIds = [...elementIds, ...orphanIds];
    const signature = marqueeSignature(frameId, selectedIds, wholeFrameIds);
    if (signature === lastMarqueeSelectionSignature) return;
    lastMarqueeSelectionSignature = signature;
    onSelectMultiple(frameId, selectedIds, wholeFrameIds);
  }

  function scheduleMarqueeSelection() {
    pendingMarqueeSelectionRect = { ...marqueeRect };
    if (marqueeSelectionRaf !== null) return;
    marqueeSelectionRaf = requestAnimationFrame(() => {
      marqueeSelectionRaf = null;
      const rect = pendingMarqueeSelectionRect;
      pendingMarqueeSelectionRect = null;
      if (dragMode !== 'marquee' || !isMarquee || !rect) return;
      applyMarqueeSelection(rect);
    });
  }

  function cancelPendingMarqueeSelection() {
    if (marqueeSelectionRaf !== null) {
      cancelAnimationFrame(marqueeSelectionRaf);
      marqueeSelectionRaf = null;
    }
    pendingMarqueeSelectionRect = null;
  }

  function resetMarqueeSelectionTracking() {
    cancelPendingMarqueeSelection();
    lastMarqueeSelectionSignature = '';
  }

  function hasMediaFill(el: FrameElement): boolean {
    const fill = mediaFillForElement(el);
    return !!fill && (!!fill.src || !!fill.assetPath);
  }

  function mediaFillObjectFit(el: FrameElement): string {
    return mediaFillModeToObjectFit(mediaFillForElement(el)?.transform?.fill?.mode);
  }

  function mediaFillObjectPosition(el: FrameElement): string {
    return objectPositionForElement({ objectPosition: undefined, mediaTransform: mediaFillForElement(el)?.transform });
  }

  function cropObjectPosition(el: FrameElement): string {
    return el.type === 'image'
      ? objectPositionForElement(el)
      : objectPositionForElement({ objectPosition: undefined, mediaTransform: mediaFillForElement(el)?.transform });
  }

  function mediaInternalTransformCss(el: FrameElement): string | undefined {
    const transform = el.type === 'image' ? el.mediaTransform : mediaFillForElement(el)?.transform;
    if (!transform) return undefined;
    const scaleValue = transform.scale ?? 1;
    const tx = transform.translateX ?? 0;
    const ty = transform.translateY ?? 0;
    if (scaleValue === 1 && tx === 0 && ty === 0) return undefined;
    return `translate(${tx}%, ${ty}%) scale(${scaleValue})`;
  }

  function isMediaCropTarget(el: FrameElement): boolean {
    return el.type === 'image' || !!mediaFillForElement(el);
  }

  function mediaFillPatternId(el: FrameElement): string {
    return `media-fill-${el.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  }

  function isShapeManipulatorTarget(el: FrameElement): boolean {
    return el.type === 'section';
  }

  function cornerControlRadius(el: FrameElement): number {
    return Math.max(0, el.shapeCornerRadius ?? el.borderRadius ?? 0);
  }

  function arcPoint(el: FrameElement, angle: number | undefined): { x: number; y: number } {
    const degrees = ((angle ?? 0) % 360 + 360) % 360;
    const radians = degrees * Math.PI / 180;
    return {
      x: el.width / 2 + Math.cos(radians) * el.width / 2,
      y: el.height / 2 + Math.sin(radians) * el.height / 2,
    };
  }

  function angleFromElementCenter(el: FrameElement, world: { x: number; y: number }, frameId: string | null): number {
    const frame = frameId ? state.frames.find(candidate => candidate.id === frameId) ?? null : null;
    const originX = (frame?.x ?? 0) + el.x;
    const originY = (frame?.y ?? 0) + el.y;
    const cx = originX + el.width / 2;
    const cy = originY + el.height / 2;
    return Math.round((Math.atan2(world.y - cy, world.x - cx) * 180 / Math.PI + 360) % 360);
  }

  function startShapeCornerDrag(e: MouseEvent, frameId: string | null, el: FrameElement) {
    e.preventDefault();
    e.stopPropagation();
    if (!canEdit) return;
    onBeginInteraction();
    if (frameId) {
      onSelectFrame(frameId);
      onSelectElement(el.id);
    } else {
      onSelectOrphan(el.id);
    }
    dragMode = 'shape-corner';
    shapeDragFrameId = frameId;
    shapeDragElementId = el.id;
  }

  function startShapeArcDrag(e: MouseEvent, frameId: string | null, el: FrameElement, endpoint: 'start' | 'end') {
    e.preventDefault();
    e.stopPropagation();
    if (!canEdit) return;
    onBeginInteraction();
    if (frameId) {
      onSelectFrame(frameId);
      onSelectElement(el.id);
    } else {
      onSelectOrphan(el.id);
    }
    dragMode = endpoint === 'start' ? 'shape-arc-start' : 'shape-arc-end';
    shapeDragFrameId = frameId;
    shapeDragElementId = el.id;
  }

  function shapeDragElement(): FrameElement | null {
    if (!shapeDragElementId) return null;
    if (shapeDragFrameId) {
      return state.frames.find(frame => frame.id === shapeDragFrameId)?.elements.find(element => element.id === shapeDragElementId) ?? null;
    }
    return state.orphanElements.find(element => element.id === shapeDragElementId) ?? null;
  }

  function applyShapeManipulatorDrag(world: { x: number; y: number }) {
    const el = shapeDragElement();
    if (!el) return;
    const frame = shapeDragFrameId ? state.frames.find(candidate => candidate.id === shapeDragFrameId) ?? null : null;
    const originX = (frame?.x ?? 0) + el.x;
    const originY = (frame?.y ?? 0) + el.y;
    if (dragMode === 'shape-corner') {
      const localX = Math.max(0, Math.min(el.width / 2, world.x - originX));
      const localY = Math.max(0, Math.min(el.height / 2, world.y - originY));
      const radius = snapToGrid(Math.min(localX, localY));
      const patch: Partial<FrameElement> = el.shapeKind === 'polygon' || el.shapeKind === 'star'
        ? { shapeCornerRadius: radius }
        : { borderRadius: radius, cornerRadii: undefined, shapeCornerRadius: radius };
      if (shapeDragFrameId) onUpdateElement(shapeDragFrameId, el.id, patch);
      else onUpdateOrphan(el.id, patch);
      return;
    }
    if (el.shapeKind === 'ellipse') {
      const angle = angleFromElementCenter(el, world, shapeDragFrameId);
      const patch: Partial<FrameElement> = dragMode === 'shape-arc-start'
        ? { shapeArcStart: angle }
        : { shapeArcEnd: angle };
      if (shapeDragFrameId) onUpdateElement(shapeDragFrameId, el.id, patch);
      else onUpdateOrphan(el.id, patch);
    }
  }

  export let state: StudioState;
  let selectedElementIdSet = new Set<string>();
  let selectedFrameIdSet = new Set<string>();
  $: selectedElementIdSet = new Set(state.selectedElementIds);
  $: selectedFrameIdSet = new Set(state.selectedFrameIds);

  export let activeTool: ToolId;
  export let lassoActive = false;
  export let wireframeMode = false;
  export let tabOrderOverlay = false;
  export let layoutGuidesVisible = true;
  export let pixelPreview: 'disabled' | '1x' | '2x' = 'disabled';
  export let visionSimulation: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia' = 'none';
  export let canEdit = true;
  export let canComment = canEdit;
  export let comments: ProjectCommentThread[] = [];
  export let reviewOverlays: ProjectReviewOverlay[] = [];
  export let guides: ProjectGuide[] = [];
  export let onOpenComment: (id: string) => void = () => {};
  export let onAddCommentAt: (target: ProjectCommentTarget) => void = () => {};
  export let onAddReviewOverlay: (kind: ProjectReviewOverlayKind, x1: number, y1: number, x2: number, y2: number) => void = () => {};
  export let onAddGuide: (axis: ProjectGuideAxis, position: number, scope: ProjectGuideScope, frameId?: string) => void = () => {};
  export let onRemoveGuide: (id: string) => void = () => {};
  export let onClearGuides: () => void = () => {};
  export let onSelectFrame: (id: string | null) => void;
  export let onSelectElement: (id: string | null) => void;
  export let onDescendSelection: () => void = () => {};
  export let onSelectMultiple: (frameId: string | null, ids: string[], frameIds?: string[]) => void;
  export let onAddFrame: (x: number, y: number, w: number, h: number) => void;
  export let onUpdateFrame: (id: string, updates: Partial<Frame>) => void;
  export let onAddElement: (frameId: string, type: ElementType, x: number, y: number, width?: number, height?: number, overrides?: Partial<FrameElement>) => void;
  export let onAddOrphan: (type: ElementType, x: number, y: number, width?: number, height?: number, overrides?: Partial<FrameElement>) => void = () => {};
  export let onUpdateElement: (frameId: string, elementId: string, updates: Partial<FrameElement>) => void;
  export let onUpdateElements: (frameId: string, updates: { id: string; x: number; y: number }[]) => void;
  export let onMoveElement: (fromFrameId: string, elementId: string, toFrameId: string, newX: number, newY: number) => void;
  export let onUpdateOrphan: (orphanId: string, updates: Partial<FrameElement>) => void = () => {};
  export let onSelectOrphan: (orphanId: string) => void = () => {};
  export let onPromoteToOrphan: (fromFrameId: string, elementId: string) => void = () => {};
  export let onDemoteOrphanToFrame: (orphanId: string, toFrameId: string, newX: number, newY: number) => void = () => {};
  export let onInsertComponentInstance: (masterId: string, x: number, y: number, frameId: string | null) => void = () => {};
  export let onReplaceComponentInstance: (masterId: string) => boolean = () => false;
  export let onDropImageFiles: (files: File[], x: number, y: number, frameId: string | null) => void = () => {};
  export let cropImageElementId: string | null = null;
  export let blendPreviewElementId: string | null = null;
  export let blendPreviewMode: BlendMode | null = null;
  export let onToggleImageCrop: (elementId: string) => void = () => {};
  export let onCropImagePosition: (frameId: string | null, elementId: string, objectPosition: string) => void = () => {};
  export let onBeginInteraction: () => void = () => {};
  export let onEndInteraction: () => void = () => {};
  export let hoveredFrameId: string | null = null;
  export let hoveredElementId: string | null = null;
  export let hoveredOrphanId: string | null = null;
  /**
   * Current project id, used to scope persistent canvas viewport (item 66).
   * When null/undefined we skip persistence entirely (offline-only project
   * before IDB resolves, or unauth'd state).
   */
  export let projectId: string | null = null;

  let canvasEl: HTMLDivElement;
  let panX = 40;
  let panY = 40;
  let scale = 0.35;

  type DragMode = 'none' | 'panning' | 'measuring' | 'drawing-review-overlay' | 'drawing-frame' | 'drawing-element' | 'drawing-vector' | 'moving-frame' | 'moving-frames' | 'moving-element' | 'moving-multi' | 'moving-orphan' | 'resizing-frame' | 'resizing-element' | 'rotating-frame' | 'rotating-element' | 'auto-layout-spacing' | 'creating-guide' | 'scaling-selection' | 'shape-corner' | 'shape-arc-start' | 'shape-arc-end' | 'cropping-image' | 'linking-button' | 'marquee' | 'lasso';
  let dragMode: DragMode = 'none';
  let dragClientStart = { x: 0, y: 0 };
  let dragWorldStart = { x: 0, y: 0 };
  let draggedFrameId: string | null = null;
  let draggedFrameOrigin = { x: 0, y: 0 };
  let draggedElementId: string | null = null;
  let draggedElementOrigin = { x: 0, y: 0 };
  let resizeHandle: ResizeHandle | null = null;
  let resizeOrigin: ResizeBox = { x: 0, y: 0, width: 0, height: 0 };
  let resizingFrameId: string | null = null;
  let resizingElementId: string | null = null;
  let rotatingFrameId: string | null = null;
  let rotatingElementId: string | null = null;
  let rotateStartAngle = 0;
  let rotateStartValue = 0;
  let rotateOrigin = { x: 0, y: 0 };
  type AutoLayoutSpacingSide = 'gap' | 't' | 'r' | 'b' | 'l';
  let autoLayoutSpacingDrag: {
    target: 'frame' | 'element' | 'orphan';
    frameId: string | null;
    elementId: string | null;
    side: AutoLayoutSpacingSide;
    startValue: number;
    axis: 'x' | 'y';
    sign: 1 | -1;
  } | null = null;
  const AUTO_LAYOUT_PADDING_SIDES: Exclude<AutoLayoutSpacingSide, 'gap'>[] = ['t', 'r', 'b', 'l'];
  let shapeDragFrameId: string | null = null;
  let shapeDragElementId: string | null = null;
  let cropDragFrameId: string | null = null;
  let cropDragElementId: string | null = null;
  let cropDragStartPosition = '50% 50%';
  let cropDragSize = { width: 1, height: 1 };
  let linkingFrameId: string | null = null;
  let linkingElementId: string | null = null;
  let linkStart = { x: 0, y: 0 };
  let linkEnd = { x: 0, y: 0 };
  let linkHoverFrameId: string | null = null;
  let drawRect = { x: 0, y: 0, w: 0, h: 0 };
  let measureStart = { x: 0, y: 0 };
  let measureEnd = { x: 0, y: 0 };
  let measureDX = 0;
  let measureDY = 0;
  let measureDistance = 0;
  let reviewOverlayKind: ProjectReviewOverlayKind = 'annotation';
  let guideDraft: RenderedGuide | null = null;
  let isDrawing = false;
  const ROTATE_HANDLES: ResizeHandle[] = ['nw', 'ne', 'se', 'sw'];
  /** Tool being drag-drawn (section/slice/text/image/input/textarea/list/iframe). */
  let drawingElementTool: ElementType | null = null;
  /** Parent frame for the dragged element; null = orphan / canvas-level. */
  let drawingElementFrameId: string | null = null;
  let drawingVectorMode: 'pen' | 'pencil' = 'pen';
  let drawingVectorPoints: RawPoint[] = [];
  let marqueeRect = { x: 0, y: 0, w: 0, h: 0 };
  let isMarquee = false;
  let marqueeClickFrameId: string | null = null;
  let marqueeSelectionRaf: number | null = null;
  let pendingMarqueeSelectionRect: typeof marqueeRect | null = null;
  let lastMarqueeSelectionSignature = '';
  let lassoPoints: SelectionPoint[] = [];
  // Per-element origin for multi-drag. frameId === null means orphan (world coords).
  let multiDragOrigins: { id: string; frameId: string | null; ox: number; oy: number }[] = [];
  let multiFrameDragOrigins: { id: string; x: number; y: number }[] = [];
  // Orphan origins when dragging frames+orphans together
  let multiOrphanDragOrigins: { id: string; x: number; y: number }[] = [];
  let draggedOrphanId: string | null = null;
  let draggedOrphanOrigin = { x: 0, y: 0 };
  let selectionBounds: { x: number; y: number; w: number; h: number } | null = null;
  type ScaleOrigin = {
    kind: 'frame' | 'element' | 'orphan';
    id: string;
    frameId: string | null;
    x: number;
    y: number;
    width: number;
    height: number;
    worldX: number;
    worldY: number;
    fontSize?: number;
    borderRadius?: number;
    border?: FrameElement['border'];
    shadow?: FrameElement['shadow'];
    textShadow?: FrameElement['textShadow'];
    autoLayout?: FrameElement['autoLayout'];
    children?: FrameElement[];
  };
  let scaleDrag: { center: { x: number; y: number }; startDistance: number; origins: ScaleOrigin[] } | null = null;

  // ── Cmd deep-select (hover any object) ────────────────────────────────────
  let cmdHeld = false;
  /** ID of whatever is currently highlighted under Cmd+hover: a frame, an element, an orphan, or a group child. */
  let cmdHoverId: string | null = null;
  let altMeasureHeld = false;
  type SpacingOverlay = {
    targetId: string;
    parentX: number;
    parentY: number;
    parentWidth: number;
    parentHeight: number;
    x: number;
    y: number;
    width: number;
    height: number;
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  let spacingOverlay: SpacingOverlay | null = null;
  /** Last known world-space cursor position (updated on mousemove). */
  let lastMouseWorld = { x: 0, y: 0 };

  $: measureDX = Math.round(measureEnd.x - measureStart.x);
  $: measureDY = Math.round(measureEnd.y - measureStart.y);
  $: measureDistance = Math.round(Math.hypot(measureEnd.x - measureStart.x, measureEnd.y - measureStart.y));

  /** Find the topmost child of a non-autoLayout group at local coords (lx, ly). */
  function findGroupChildAt(group: FrameElement, lx: number, ly: number): FrameElement | null {
    if (!group.children || group.autoLayout) return null;
    for (let i = group.children.length - 1; i >= 0; i--) {
      const c = group.children[i];
      if (lx >= c.x && lx <= c.x + c.width && ly >= c.y && ly <= c.y + c.height) return c;
    }
    return null;
  }

  function updateCmdHoverFromWorld(wx: number, wy: number) {
    if (!cmdHeld) { cmdHoverId = null; return; }
    const hit = hitTest(wx, wy, state.frames, state.orphanElements);
    if (!hit) { cmdHoverId = null; return; }

    if (hit.type === 'element') {
      const frame = state.frames.find(f => f.id === hit.frameId);
      const el = frame?.elements.find(e => e.id === hit.elementId);
      // If hovering over a non-autoLayout group, prefer the child under cursor (deep-hover)
      if ((el?.type === 'group' || el?.type === 'section') && el.children?.length && !el.autoLayout) {
        const lx = wx - frame!.x - el.x;
        const ly = wy - frame!.y - el.y;
        const child = findGroupChildAt(el, lx, ly);
        cmdHoverId = child ? child.id : el.id;
        return;
      }
      cmdHoverId = hit.elementId;
      return;
    }
    if (hit.type === 'orphan') {
      cmdHoverId = hit.orphanId;
      return;
    }
    // frame hit
    cmdHoverId = hit.frameId;
  }

  function makeSpacingOverlay(
    target: FrameElement,
    x: number,
    y: number,
    parentX: number,
    parentY: number,
    parentWidth: number,
    parentHeight: number,
  ): SpacingOverlay {
    return {
      targetId: target.id,
      parentX,
      parentY,
      parentWidth,
      parentHeight,
      x,
      y,
      width: target.width,
      height: target.height,
      left: Math.round(x - parentX),
      top: Math.round(y - parentY),
      right: Math.round(parentX + parentWidth - x - target.width),
      bottom: Math.round(parentY + parentHeight - y - target.height),
    };
  }

  /** Resolve the hovered layer and its immediate measurable parent for Alt spacing guides. */
  function updateSpacingOverlayFromWorld(wx: number, wy: number) {
    if (!altMeasureHeld) {
      spacingOverlay = null;
      return;
    }
    for (let i = state.frames.length - 1; i >= 0; i--) {
      const frame = state.frames[i];
      for (let j = frame.elements.length - 1; j >= 0; j--) {
        const el = frame.elements[j];
        if (el.hidden || el.locked || isFrameBackgroundLayer(frame, el)) continue;
        const x = frame.x + el.x;
        const y = frame.y + el.y;
        if (wx < x || wx > x + el.width || wy < y || wy > y + el.height) continue;
        if ((el.type === 'group' || el.type === 'section') && el.children?.length && !el.autoLayout) {
          const child = findGroupChildAt(el, wx - x, wy - y);
          if (child && !child.hidden && !child.locked) {
            spacingOverlay = makeSpacingOverlay(child, x + child.x, y + child.y, x, y, el.width, el.height);
            return;
          }
        }
        spacingOverlay = makeSpacingOverlay(el, x, y, frame.x, frame.y, frame.width, frame.height);
        return;
      }
    }
    spacingOverlay = null;
  }
  // ───────────────────────────────────────────────────────────────────────────

  // ── Inline text editing ────────────────────────────────────────────────────
  let inlineEditId: string | null = null;
  let inlineEditFrameId: string | null = null;
  let inlineEditValue = '';
  let inlineEditOriginal = '';
  let inlineEditSingleLine = false;
  let inlineEditInputEl: HTMLInputElement | null = null;
  let inlineEditTextareaEl: HTMLTextAreaElement | null = null;
  let inlineEditTextareaHeight = 0;

  $: inlineEditElement = (() => {
    if (!inlineEditId) return null;
    if (inlineEditFrameId) {
      return state.frames.find(f => f.id === inlineEditFrameId)?.elements.find(e => e.id === inlineEditId) ?? null;
    }
    return state.orphanElements.find(o => o.id === inlineEditId) ?? null;
  })();

  $: inlineEditFrame = inlineEditFrameId
    ? (state.frames.find(f => f.id === inlineEditFrameId) ?? null)
    : null;

  $: if (inlineEditId && inlineEditTextareaEl && inlineEditElement && !inlineEditSingleLine) {
    inlineEditValue;
    inlineEditElement.width;
    inlineEditElement.height;
    inlineEditElement.fontSize;
    inlineEditElement.fontWeight;
    inlineEditElement.letterSpacing;
    inlineEditElement.lineHeight;
    tick().then(syncInlineEditTextareaSize);
  }

  function inlineEditLineHeight(el: FrameElement): string | undefined {
    return el.lineHeight !== undefined ? String(el.lineHeight) : undefined;
  }

  function syncInlineEditTextareaSize() {
    const textarea = inlineEditTextareaEl;
    const el = inlineEditElement;
    if (!textarea || !el || inlineEditSingleLine) return;
    const minHeight = Math.max(1, el.height);
    textarea.style.height = `${minHeight}px`;
    const nextHeight = Math.ceil(Math.max(minHeight, textarea.scrollHeight));
    inlineEditTextareaHeight = nextHeight;
    textarea.style.height = `${nextHeight}px`;
    textarea.scrollTop = 0;
  }

  function startInlineEdit(el: FrameElement, frameId: string | null) {
    // Inline edit only makes sense for elements whose canvas representation is a single text run.
    // Image/group/iframe have no text; list has multi-line items handled via the inspector.
    if (el.type === 'image' || el.type === 'svg' || el.children?.length || el.type === 'iframe' || el.type === 'list') return;
    if (frameId) {
      onSelectFrame(frameId);
      onSelectElement(el.id);
    } else {
      onSelectOrphan(el.id);
    }
    inlineEditId = el.id;
    inlineEditFrameId = frameId;
    inlineEditValue = el.content;
    inlineEditOriginal = el.content;
    inlineEditSingleLine = el.type === 'input';
    inlineEditTextareaHeight = el.height;
    tick().then(() => {
      const input = inlineEditInputEl ?? inlineEditTextareaEl;
      input?.focus();
      input?.select();
      syncInlineEditTextareaSize();
    });
  }

  function commitInlineEdit() {
    if (!inlineEditId) return;
    const id = inlineEditId;
    const frameId = inlineEditFrameId;
    const newValue = inlineEditValue;
    const original = inlineEditOriginal;

    inlineEditId = null;
    inlineEditFrameId = null;
    inlineEditInputEl = null;
    inlineEditTextareaEl = null;
    inlineEditTextareaHeight = 0;

    if (newValue === original) return;

    onBeginInteraction();
    if (frameId) {
      onUpdateElement(frameId, id, { content: newValue, textRuns: undefined });
    } else {
      onUpdateOrphan(id, { content: newValue, textRuns: undefined });
    }
    onEndInteraction();
  }

  function cancelInlineEdit() {
    inlineEditId = null;
    inlineEditFrameId = null;
    inlineEditInputEl = null;
    inlineEditTextareaEl = null;
    inlineEditTextareaHeight = 0;
  }

  function handleInlineEditKeydown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelInlineEdit();
      return;
    }
    // Enter on single-line OR Cmd/Ctrl+Enter on multi-line → commit
    if (e.key === 'Enter' && (inlineEditSingleLine || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commitInlineEdit();
    }
  }

  function onDblClick(e: MouseEvent) {
    if (activeTool !== 'select') return;
    e.preventDefault();
    const wp = screenToWorld(e.clientX, e.clientY);
    const hit = hitTest(wp.x, wp.y, state.frames, state.orphanElements);
    if (!hit) return;

    if (hit.type === 'element') {
      const frame = state.frames.find(f => f.id === hit.frameId);
      const el = frame?.elements.find(el2 => el2.id === hit.elementId);
      if (frame && el && el.type !== 'image' && !el.children?.length && !isFrameBackgroundLayer(frame, el)) {
        startInlineEdit(el, hit.frameId);
      }
    } else if (hit.type === 'orphan') {
      const el = state.orphanElements.find(o => o.id === hit.orphanId);
      if (el && el.type !== 'image' && !el.children?.length) {
        startInlineEdit(el, null);
      }
    }
  }
  // ───────────────────────────────────────────────────────────────────────────

  function collectMultiOrigins(ids: string[]): { id: string; frameId: string | null; ox: number; oy: number }[] {
    const out: { id: string; frameId: string | null; ox: number; oy: number }[] = [];
    for (const id of ids) {
      let found = false;
      for (const f of state.frames) {
        const e = f.elements.find(el => el.id === id);
        if (e) {
          out.push({ id, frameId: f.id, ox: e.x, oy: e.y });
          found = true;
          break;
        }
      }
      if (!found) {
        const o = state.orphanElements.find(el => el.id === id);
        if (o) out.push({ id, frameId: null, ox: o.x, oy: o.y });
      }
    }
    return out;
  }

  function collectFrameOrigins(ids: string[]) {
    const selected = new Set(ids);
    return state.frames
      .filter(frame => selected.has(frame.id))
      .map(frame => ({ id: frame.id, x: frame.x, y: frame.y }));
  }

  function elementScaleOrigin(el: FrameElement, frame: Frame | null): ScaleOrigin {
    return {
      kind: frame ? 'element' : 'orphan',
      id: el.id,
      frameId: frame?.id ?? null,
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      worldX: (frame?.x ?? 0) + el.x,
      worldY: (frame?.y ?? 0) + el.y,
      fontSize: el.fontSize,
      borderRadius: el.borderRadius,
      border: el.border,
      shadow: el.shadow,
      textShadow: el.textShadow,
      autoLayout: el.autoLayout,
      children: el.children,
    };
  }

  function frameScaleOrigin(frame: Frame): ScaleOrigin {
    return {
      kind: 'frame',
      id: frame.id,
      frameId: null,
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
      worldX: frame.x,
      worldY: frame.y,
    };
  }

  function collectSelectedElementScaleOrigins(ids: string[]) {
    const origins: ScaleOrigin[] = [];
    for (const id of ids) {
      let found = false;
      for (const frame of state.frames) {
        const element = frame.elements.find(item => item.id === id);
        if (element) {
          origins.push(elementScaleOrigin(element, frame));
          found = true;
          break;
        }
      }
      if (!found) {
        const orphan = state.orphanElements.find(item => item.id === id);
        if (orphan) origins.push(elementScaleOrigin(orphan, null));
      }
    }
    return origins;
  }

  function scaleBounds(origins: ScaleOrigin[]) {
    const xs = origins.map(origin => origin.worldX);
    const ys = origins.map(origin => origin.worldY);
    const x2s = origins.map(origin => origin.worldX + origin.width);
    const y2s = origins.map(origin => origin.worldY + origin.height);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const width = Math.max(...x2s) - x;
    const height = Math.max(...y2s) - y;
    return { x, y, width, height };
  }

  function scaleLength(value: number | undefined, factor: number, min = 0) {
    if (value === undefined) return undefined;
    return Math.max(min, Math.round(value * factor * 100) / 100);
  }

  function scaleElementPatch(origin: ScaleOrigin, factor: number) {
    const patch: Partial<FrameElement> = {};
    const fontSize = scaleLength(origin.fontSize, factor, 1);
    if (fontSize !== undefined) patch.fontSize = fontSize;
    const borderRadius = scaleLength(origin.borderRadius, factor, 0);
    if (borderRadius !== undefined) patch.borderRadius = borderRadius;
    if (origin.border) {
      patch.border = { ...origin.border, width: scaleLength(origin.border.width, factor, 0) ?? origin.border.width };
    }
    if (origin.shadow) {
      patch.shadow = {
        ...origin.shadow,
        x: scaleLength(origin.shadow.x, factor) ?? origin.shadow.x,
        y: scaleLength(origin.shadow.y, factor) ?? origin.shadow.y,
        blur: scaleLength(origin.shadow.blur, factor, 0) ?? origin.shadow.blur,
        spread: scaleLength(origin.shadow.spread, factor) ?? origin.shadow.spread,
      };
    }
    if (origin.textShadow) {
      patch.textShadow = {
        ...origin.textShadow,
        x: scaleLength(origin.textShadow.x, factor) ?? origin.textShadow.x,
        y: scaleLength(origin.textShadow.y, factor) ?? origin.textShadow.y,
        blur: scaleLength(origin.textShadow.blur, factor, 0) ?? origin.textShadow.blur,
      };
    }
    if (origin.autoLayout) {
      patch.autoLayout = {
        ...origin.autoLayout,
        gap: scaleLength(origin.autoLayout.gap, factor, 0) ?? origin.autoLayout.gap,
        padding: {
          t: scaleLength(origin.autoLayout.padding.t, factor, 0) ?? origin.autoLayout.padding.t,
          r: scaleLength(origin.autoLayout.padding.r, factor, 0) ?? origin.autoLayout.padding.r,
          b: scaleLength(origin.autoLayout.padding.b, factor, 0) ?? origin.autoLayout.padding.b,
          l: scaleLength(origin.autoLayout.padding.l, factor, 0) ?? origin.autoLayout.padding.l,
        },
      };
    }
    if (origin.children?.length) {
      patch.children = origin.children.map(child => scaleChildElement(child, factor));
    }
    return patch;
  }

  function scaleChildElement(child: FrameElement, factor: number): FrameElement {
    const childOrigin = elementScaleOrigin(child, null);
    return {
      ...child,
      ...scaleElementPatch(childOrigin, factor),
      x: snapToGrid(child.x * factor),
      y: snapToGrid(child.y * factor),
      width: snapToGrid(Math.max(MIN_ELEMENT_SIZE.width, child.width * factor)),
      height: snapToGrid(Math.max(MIN_ELEMENT_SIZE.height, child.height * factor)),
    };
  }

  function startScaleDrag(hit: NonNullable<ReturnType<typeof hitTest>>, pointer: { x: number; y: number }) {
    let origins: ScaleOrigin[] = [];
    if (hit.type === 'frame') {
      const selectedFrameIds = selectedFrameIdSet.has(hit.frameId) && state.selectedFrameIds.length > 0
        ? state.selectedFrameIds
        : [hit.frameId];
      origins = state.frames.filter(frame => selectedFrameIds.includes(frame.id)).map(frameScaleOrigin);
      if (selectedFrameIdSet.has(hit.frameId)) {
        origins = [
          ...origins,
          ...state.selectedElementIds
            .map(id => state.orphanElements.find(orphan => orphan.id === id))
            .filter((orphan): orphan is FrameElement => orphan !== undefined)
            .map(orphan => elementScaleOrigin(orphan, null)),
        ];
      }
      onSelectFrame(hit.frameId);
      onSelectElement(null);
    } else if (hit.type === 'orphan') {
      const ids = state.selectedElementIds.length > 1 && selectedElementIdSet.has(hit.orphanId)
        ? state.selectedElementIds
        : [hit.orphanId];
      origins = collectSelectedElementScaleOrigins(ids);
      onSelectOrphan(hit.orphanId);
    } else {
      const frame = state.frames.find(item => item.id === hit.frameId);
      const element = frame?.elements.find(item => item.id === hit.elementId);
      if (!frame || !element) return;
      const ids = state.selectedElementIds.length > 1 && selectedElementIdSet.has(hit.elementId)
        ? state.selectedElementIds
        : [hit.elementId];
      origins = ids.length > 1 ? collectSelectedElementScaleOrigins(ids) : [elementScaleOrigin(element, frame)];
      onSelectFrame(hit.frameId);
      onSelectElement(hit.elementId);
    }

    origins = origins.filter(origin => origin.width > 0 && origin.height > 0);
    if (origins.length === 0) return;
    const bounds = scaleBounds(origins);
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const fallbackDistance = Math.max(bounds.width, bounds.height, 1) / 2;
    scaleDrag = {
      center,
      startDistance: Math.max(Math.hypot(pointer.x - center.x, pointer.y - center.y), fallbackDistance, 1),
      origins,
    };
    dragMode = 'scaling-selection';
  }

  function applyScaleDrag(pointer: { x: number; y: number }) {
    if (!scaleDrag) return;
    const factor = Math.max(0.05, Math.min(12, Math.hypot(pointer.x - scaleDrag.center.x, pointer.y - scaleDrag.center.y) / scaleDrag.startDistance));
    for (const origin of scaleDrag.origins) {
      const width = Math.max(origin.kind === 'frame' ? MIN_FRAME_SIZE.width : MIN_ELEMENT_SIZE.width, origin.width * factor);
      const height = Math.max(origin.kind === 'frame' ? MIN_FRAME_SIZE.height : MIN_ELEMENT_SIZE.height, origin.height * factor);
      const worldX = scaleDrag.center.x + (origin.worldX - scaleDrag.center.x) * factor;
      const worldY = scaleDrag.center.y + (origin.worldY - scaleDrag.center.y) * factor;
      if (origin.kind === 'frame') {
        onUpdateFrame(origin.id, {
          x: snapToGrid(worldX),
          y: snapToGrid(worldY),
          width: snapToGrid(width),
          height: snapToGrid(height),
        });
      } else if (origin.frameId) {
        const frame = state.frames.find(item => item.id === origin.frameId);
        onUpdateElement(origin.frameId, origin.id, {
          x: snapToGrid(worldX - (frame?.x ?? 0)),
          y: snapToGrid(worldY - (frame?.y ?? 0)),
          width: snapToGrid(width),
          height: snapToGrid(height),
          ...scaleElementPatch(origin, factor),
        });
      } else {
        onUpdateOrphan(origin.id, {
          x: snapToGrid(worldX),
          y: snapToGrid(worldY),
          width: snapToGrid(width),
          height: snapToGrid(height),
          ...scaleElementPatch(origin, factor),
        });
      }
    }
  }

  function zoomToWorldBounds(minX: number, minY: number, maxX: number, maxY: number, maxScale = 8) {
    if (!canvasEl) return;
    const pad = 80;
    const worldW = maxX - minX + pad * 2;
    const worldH = maxY - minY + pad * 2;
    const rect = canvasEl.getBoundingClientRect();
    const newScale = Math.min(rect.width / worldW, rect.height / worldH, maxScale);
    panX = (rect.width - worldW * newScale) / 2 - (minX - pad) * newScale;
    panY = (rect.height - worldH * newScale) / 2 - (minY - pad) * newScale;
    scale = newScale;
  }

  export function fitToView() {
    if (!canvasEl) return;
    const xs: number[] = [];
    const ys: number[] = [];
    const x2s: number[] = [];
    const y2s: number[] = [];
    for (const f of state.frames) {
      xs.push(f.x); ys.push(f.y);
      x2s.push(f.x + f.width); y2s.push(f.y + f.height);
    }
    for (const o of state.orphanElements) {
      xs.push(o.x); ys.push(o.y);
      x2s.push(o.x + o.width); y2s.push(o.y + o.height);
    }
    if (xs.length === 0) return;
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...x2s);
    const maxY = Math.max(...y2s);
    zoomToWorldBounds(minX, minY, maxX, maxY, 1);
  }

  export function zoomToSelection() {
    if (!canvasEl) return;
    const bounds = getSelectionBounds(state);
    if (bounds) {
      zoomToWorldBounds(bounds.x, bounds.y, bounds.x + bounds.w, bounds.y + bounds.h, 8);
      return;
    }
    if (state.selectedFrameIds.length === 1) {
      const frame = state.frames.find(candidate => candidate.id === state.selectedFrameIds[0]);
      if (frame) zoomToWorldBounds(frame.x, frame.y, frame.x + frame.width, frame.y + frame.height, 8);
    }
  }

  export function getZoomPercent() {
    return Math.round(scale * 100);
  }

  export function setZoomPercent(percent: number) {
    if (!canvasEl || !Number.isFinite(percent)) return;
    const rect = canvasEl.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    const newScale = Math.max(4, Math.min(800, percent)) / 100;
    panX = cx - (cx - panX) * (newScale / scale);
    panY = cy - (cy - panY) * (newScale / scale);
    scale = newScale;
  }

  export function zoomIn() {
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    const newScale = Math.min(8, scale * 1.25);
    panX = cx - (cx - panX) * (newScale / scale);
    panY = cy - (cy - panY) * (newScale / scale);
    scale = newScale;
  }

  export function zoomOut() {
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    const newScale = Math.max(0.04, scale * 0.8);
    panX = cx - (cx - panX) * (newScale / scale);
    panY = cy - (cy - panY) * (newScale / scale);
    scale = newScale;
  }

  export function zoomReset() {
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    const newScale = 1;
    panX = cx - (cx - panX) * (newScale / scale);
    panY = cy - (cy - panY) * (newScale / scale);
    scale = newScale;
  }

  function navigateFromMiniMap(worldX: number, worldY: number) {
    panX = viewportWidth / 2 - worldX * scale;
    panY = viewportHeight / 2 - worldY * scale;
  }

  function screenToWorld(clientX: number, clientY: number) {
    const rect = canvasEl.getBoundingClientRect();
    return {
      x: (clientX - rect.left - panX) / scale,
      y: (clientY - rect.top - panY) / scale,
    };
  }

  function frameAtWorldPoint(point: { x: number; y: number }): Frame | null {
    return state.frames.find(frame =>
      point.x >= frame.x &&
      point.x <= frame.x + frame.width &&
      point.y >= frame.y &&
      point.y <= frame.y + frame.height
    ) ?? null;
  }

  function renderGuide(guide: ProjectGuide): RenderedGuide | null {
    const frame = guide.scope === 'frame' && guide.frameId
      ? state.frames.find(candidate => candidate.id === guide.frameId)
      : null;
    if (guide.scope === 'frame' && !frame) return null;
    const position = guide.axis === 'x'
      ? (frame ? frame.x + guide.position : guide.position)
      : (frame ? frame.y + guide.position : guide.position);
    const label = `${guide.scope === 'frame' ? 'Frame' : 'Canvas'} ${guide.axis === 'x' ? 'vertical' : 'horizontal'} guide ${Math.round(guide.position)}`;
    if (guide.axis === 'x') {
      return {
        id: guide.id,
        axis: guide.axis,
        scope: guide.scope,
        position,
        left: position,
        top: frame ? frame.y : -10000,
        width: 0,
        height: frame ? frame.height : 20000,
        label,
      };
    }
    return {
      id: guide.id,
      axis: guide.axis,
      scope: guide.scope,
      position,
      left: frame ? frame.x : -10000,
      top: position,
      width: frame ? frame.width : 20000,
      height: 0,
      label,
    };
  }

  function renderFrameLayoutGuide(frame: Frame, guide: FrameLayoutGuide): RenderedFrameLayoutGuide[] {
    if (guide.visible === false) return [];
    const color = guide.color ?? (guide.kind === 'rows' ? 'rgba(255,189,46,0.16)' : 'rgba(100,140,255,0.18)');
    if (guide.kind === 'uniform') {
      const size = Math.max(2, guide.size ?? 8);
      const lines: RenderedFrameLayoutGuide[] = [];
      for (let x = size; x < frame.width; x += size) {
        lines.push({ id: `${frame.id}-${guide.id}-x-${x}`, kind: 'uniform', left: frame.x + x, top: frame.y, width: 1, height: frame.height, color });
      }
      for (let y = size; y < frame.height; y += size) {
        lines.push({ id: `${frame.id}-${guide.id}-y-${y}`, kind: 'uniform', left: frame.x, top: frame.y + y, width: frame.width, height: 1, color });
      }
      return lines;
    }
    const count = Math.max(1, Math.round(guide.count ?? (guide.kind === 'columns' ? 12 : 6)));
    const margin = Math.max(0, guide.margin ?? 64);
    const gutter = Math.max(0, guide.gutter ?? 24);
    const totalGutter = gutter * Math.max(0, count - 1);
    if (guide.kind === 'columns') {
      const available = Math.max(0, frame.width - margin * 2 - totalGutter);
      const width = Math.max(1, guide.size ?? available / count);
      const start = guide.trackType === 'center'
        ? (frame.width - (width * count + totalGutter)) / 2
        : guide.trackType === 'end'
          ? frame.width - margin - (width * count + totalGutter)
          : margin;
      return Array.from({ length: count }, (_, index) => ({
        id: `${frame.id}-${guide.id}-col-${index}`,
        kind: 'columns' as const,
        left: frame.x + start + index * (width + gutter),
        top: frame.y,
        width,
        height: frame.height,
        color,
      }));
    }
    const available = Math.max(0, frame.height - margin * 2 - totalGutter);
    const height = Math.max(1, guide.size ?? available / count);
    const start = guide.trackType === 'center'
      ? (frame.height - (height * count + totalGutter)) / 2
      : guide.trackType === 'end'
        ? frame.height - margin - (height * count + totalGutter)
        : margin;
    return Array.from({ length: count }, (_, index) => ({
      id: `${frame.id}-${guide.id}-row-${index}`,
      kind: 'rows' as const,
      left: frame.x,
      top: frame.y + start + index * (height + gutter),
      width: frame.width,
      height,
      color,
    }));
  }

  function guideFromPointer(axis: ProjectGuideAxis, event: MouseEvent): RenderedGuide | null {
    if (!canvasEl) return null;
    const point = screenToWorld(event.clientX, event.clientY);
    const frame = frameAtWorldPoint(point);
    const scope: ProjectGuideScope = frame ? 'frame' : 'canvas';
    const localPosition = axis === 'x'
      ? (frame ? Math.max(0, Math.min(frame.width, point.x - frame.x)) : point.x)
      : (frame ? Math.max(0, Math.min(frame.height, point.y - frame.y)) : point.y);
    return renderGuide({
      id: '__draft-guide__',
      axis,
      position: snapToGrid(localPosition),
      scope,
      frameId: frame?.id,
      createdAt: Date.now(),
    });
  }

  function startGuideDrag(event: MouseEvent, axis: ProjectGuideAxis) {
    event.preventDefault();
    event.stopPropagation();
    if (!canEdit) return;
    onBeginInteraction();
    dragMode = 'creating-guide';
    guideDraft = guideFromPointer(axis, event);

    const onMove = (moveEvent: MouseEvent) => {
      guideDraft = guideFromPointer(axis, moveEvent);
    };
    const onUp = (upEvent: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const draft = guideFromPointer(axis, upEvent);
      if (draft) {
        const point = screenToWorld(upEvent.clientX, upEvent.clientY);
        const frame = frameAtWorldPoint(point);
        const scope: ProjectGuideScope = frame ? 'frame' : 'canvas';
        const position = axis === 'x'
          ? (frame ? Math.max(0, Math.min(frame.width, point.x - frame.x)) : point.x)
          : (frame ? Math.max(0, Math.min(frame.height, point.y - frame.y)) : point.y);
        onAddGuide(axis, snapToGrid(position), scope, frame?.id);
      } else {
        onEndInteraction();
      }
      guideDraft = null;
      dragMode = 'none';
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp, { once: true });
  }

  $: renderedGuides = guides.map(renderGuide).filter(Boolean) as RenderedGuide[];
  $: renderedFrameLayoutGuides = state.frames.flatMap(frame => (frame.layoutGuides ?? []).flatMap(guide => renderFrameLayoutGuide(frame, guide)));

  function buildGuideDistanceLabels(bounds: NonNullable<typeof selectionBounds>): GuideDistanceLabel[] {
    const labels: GuideDistanceLabel[] = [];
    for (const guide of renderedGuides) {
      if (guide.axis === 'x') {
        const selectionMidY = bounds.y + bounds.h / 2;
        const edgeX = guide.position < bounds.x ? bounds.x : guide.position > bounds.x + bounds.w ? bounds.x + bounds.w : guide.position;
        const distance = Math.round(Math.abs(guide.position - edgeX));
        if (distance <= 0) continue;
        labels.push({
          id: guide.id,
          axis: guide.axis,
          left: Math.min(guide.position, edgeX),
          top: selectionMidY,
          width: Math.abs(guide.position - edgeX),
          height: 0,
          distance,
        });
      } else {
        const selectionMidX = bounds.x + bounds.w / 2;
        const edgeY = guide.position < bounds.y ? bounds.y : guide.position > bounds.y + bounds.h ? bounds.y + bounds.h : guide.position;
        const distance = Math.round(Math.abs(guide.position - edgeY));
        if (distance <= 0) continue;
        labels.push({
          id: guide.id,
          axis: guide.axis,
          left: selectionMidX,
          top: Math.min(guide.position, edgeY),
          width: 0,
          height: Math.abs(guide.position - edgeY),
          distance,
        });
      }
    }
    return labels;
  }

  function currentGuideDistanceBounds(): { x: number; y: number; w: number; h: number } | null {
    if (selectionBounds) return selectionBounds;
    if (state.selectedFrameIds.length === 1) {
      const frame = state.frames.find(candidate => candidate.id === state.selectedFrameIds[0]);
      if (frame) return { x: frame.x, y: frame.y, w: frame.width, h: frame.height };
    }
    return null;
  }

  function communicationTool(tool: ToolId): boolean {
    return tool === 'comment' || tool === 'annotation' || tool === 'measure';
  }

  function commentTargetFromHit(hit: HitResult | null, wp: { x: number; y: number }): ProjectCommentTarget {
    if (hit?.type === 'orphan') {
      const orphan = state.orphanElements.find(item => item.id === hit.orphanId);
      if (orphan) {
        return { type: 'element', elementId: orphan.id, x: Math.round(wp.x - orphan.x), y: Math.round(wp.y - orphan.y) };
      }
    }
    if (hit?.type === 'element') {
      const frame = state.frames.find(item => item.id === hit.frameId);
      const element = frame?.elements.find(item => item.id === hit.elementId);
      if (frame && element) {
        return { type: 'element', frameId: frame.id, elementId: element.id, x: Math.round(wp.x - frame.x - element.x), y: Math.round(wp.y - frame.y - element.y) };
      }
    }
    const frame = hit?.type === 'frame'
      ? state.frames.find(item => item.id === hit.frameId)
      : hitTestFrame(wp.x, wp.y, state.frames);
    if (frame) {
      return { type: 'frame', frameId: frame.id, x: Math.round(wp.x - frame.x), y: Math.round(wp.y - frame.y) };
    }
    return { type: 'canvas', x: Math.round(wp.x), y: Math.round(wp.y) };
  }

  function measurementLabel(x1: number, y1: number, x2: number, y2: number): string {
    const dx = Math.round(x2 - x1);
    const dy = Math.round(y2 - y1);
    return `${Math.round(Math.hypot(dx, dy))}px · ΔX ${dx} · ΔY ${dy}`;
  }

  function hasComponentDrag(e: DragEvent): boolean {
    return Array.from(e.dataTransfer?.types ?? []).includes(COMPONENT_DRAG_MIME);
  }
  function imageFilesFromDrag(e: DragEvent): File[] {
    const files = Array.from(e.dataTransfer?.files ?? []);
    return files.filter(file => file.type.startsWith('image/'));
  }
  function hasImageFileDrag(e: DragEvent): boolean {
    const items = Array.from(e.dataTransfer?.items ?? []);
    return items.some(item => item.kind === 'file' && item.type.startsWith('image/'))
      || imageFilesFromDrag(e).length > 0;
  }
  function onCanvasDragOver(e: DragEvent) {
    if (!hasComponentDrag(e) && !hasImageFileDrag(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }
  function onCanvasDrop(e: DragEvent) {
    const componentDrop = hasComponentDrag(e);
    const imageFiles = componentDrop ? [] : imageFilesFromDrag(e);
    if (!componentDrop && imageFiles.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    const wp = screenToWorld(e.clientX, e.clientY);
    const frame = hitTestFrame(wp.x, wp.y, state.frames);

    if (componentDrop) {
      const masterId = e.dataTransfer?.getData(COMPONENT_DRAG_MIME);
      if (!masterId) return;
      if (e.altKey && onReplaceComponentInstance(masterId)) return;
      if (frame) {
        onInsertComponentInstance(masterId, snapToGrid(wp.x - frame.x), snapToGrid(wp.y - frame.y), frame.id);
      } else {
        onInsertComponentInstance(masterId, snapToGrid(wp.x), snapToGrid(wp.y), null);
      }
      return;
    }

    if (frame) {
      onDropImageFiles(imageFiles, snapToGrid(wp.x - frame.x), snapToGrid(wp.y - frame.y), frame.id);
    } else {
      onDropImageFiles(imageFiles, snapToGrid(wp.x), snapToGrid(wp.y), null);
    }
  }

  $: connectors = buildConnectors(state.frames, state.orphanElements, state.selectedElementId, dragMode === 'linking-button');
  $: tabOrderItems = tabOrderOverlay ? buildTabOrderItems(state) : [];
  $: commentPins = buildCommentPins(state.frames, state.orphanElements, comments);
  $: selectionBounds = getSelectionBounds(state);
  $: guideDistanceBounds = currentGuideDistanceBounds();
  $: guideDistanceLabels = altMeasureHeld && guideDistanceBounds ? buildGuideDistanceLabels(guideDistanceBounds) : [];

  function startLinkDrag(e: MouseEvent, frame: Frame | null, el: FrameElement, origin?: { x: number; y: number }) {
    e.preventDefault();
    e.stopPropagation();
    if (!canEdit) return;
    if (!el.isButton) return;

    onBeginInteraction();
    if (frame) {
      onSelectFrame(frame.id);
      onSelectElement(el.id);
    } else {
      onSelectOrphan(el.id);
    }
    dragMode = 'linking-button';
    linkingFrameId = frame?.id ?? null;
    linkingElementId = el.id;
    const baseX = origin?.x ?? (frame ? frame.x + el.x : el.x);
    const baseY = origin?.y ?? (frame ? frame.y + el.y : el.y);
    linkStart = {
      x: baseX + el.width + 12,
      y: baseY + el.height / 2,
    };
    linkEnd = screenToWorld(e.clientX, e.clientY);
    linkHoverFrameId = null;
  }

  function startFrameResize(e: MouseEvent, frame: Frame, handle: ResizeHandle) {
    e.preventDefault();
    e.stopPropagation();
    if (!canEdit) return;
    if (activeTool === 'scale') {
      onBeginInteraction();
      startScaleDrag({ type: 'frame', frameId: frame.id }, screenToWorld(e.clientX, e.clientY));
      return;
    }
    onBeginInteraction();
    onSelectFrame(frame.id);
    onSelectElement(null);
    dragMode = 'resizing-frame';
    resizeHandle = handle;
    resizingFrameId = frame.id;
    resizingElementId = null;
    resizeOrigin = { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
    dragClientStart = { x: e.clientX, y: e.clientY };
  }

  function startFrameMove(e: MouseEvent, frame: Frame) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (!canEdit) {
      onSelectFrame(frame.id);
      onSelectElement(null);
      return;
    }
    onBeginInteraction();
    // Snapshot the selection BEFORE we mutate it — onSelectFrame clears selectedElementIds.
    const wasInSel = selectedFrameIdSet.has(frame.id);
    const selectedIds = wasInSel ? state.selectedFrameIds : [frame.id];
    const orphanOrigins = wasInSel
      ? state.selectedElementIds
          .map(id => state.orphanElements.find(o => o.id === id))
          .filter((o): o is FrameElement => o !== undefined)
          .map(o => ({ id: o.id, x: o.x, y: o.y }))
      : [];
    if (!wasInSel) {
      onSelectFrame(frame.id);
      onSelectElement(null);
    }
    // Use moving-frames when there's >1 frame OR any selected orphan that should drag along.
    if (selectedIds.length > 1 || orphanOrigins.length > 0) {
      dragMode = 'moving-frames';
      multiFrameDragOrigins = collectFrameOrigins(selectedIds);
      multiOrphanDragOrigins = orphanOrigins;
    } else {
      dragMode = 'moving-frame';
      draggedFrameId = frame.id;
      draggedFrameOrigin = { x: frame.x, y: frame.y };
      multiOrphanDragOrigins = [];
    }
    dragClientStart = { x: e.clientX, y: e.clientY };
  }

  function startElementResize(e: MouseEvent, frame: Frame, el: FrameElement, handle: ResizeHandle) {
    e.preventDefault();
    e.stopPropagation();
    if (!canEdit) return;
    if (activeTool === 'scale') {
      onBeginInteraction();
      startScaleDrag({ type: 'element', frameId: frame.id, elementId: el.id }, screenToWorld(e.clientX, e.clientY));
      return;
    }
    onBeginInteraction();
    onSelectFrame(frame.id);
    onSelectElement(el.id);
    dragMode = 'resizing-element';
    resizeHandle = handle;
    resizingFrameId = frame.id;
    resizingElementId = el.id;
    resizeOrigin = { x: el.x, y: el.y, width: el.width, height: el.height };
    dragClientStart = { x: e.clientX, y: e.clientY };
  }

  function startOrphanResize(e: MouseEvent, el: FrameElement, handle: ResizeHandle) {
    e.preventDefault();
    e.stopPropagation();
    if (!canEdit) return;
    if (activeTool === 'scale') {
      onBeginInteraction();
      startScaleDrag({ type: 'orphan', orphanId: el.id }, screenToWorld(e.clientX, e.clientY));
      return;
    }
    onBeginInteraction();
    onSelectOrphan(el.id);
    dragMode = 'resizing-element';
    resizeHandle = handle;
    resizingFrameId = null; // marker: orphan (no parent frame)
    resizingElementId = el.id;
    resizeOrigin = { x: el.x, y: el.y, width: el.width, height: el.height };
    dragClientStart = { x: e.clientX, y: e.clientY };
  }

  function startChildResize(e: MouseEvent, frame: Frame, child: FrameElement, handle: ResizeHandle) {
    e.preventDefault();
    e.stopPropagation();
    if (!canEdit) return;
    if (activeTool === 'scale') {
      onBeginInteraction();
      startScaleDrag({ type: 'element', frameId: frame.id, elementId: child.id }, screenToWorld(e.clientX, e.clientY));
      return;
    }
    onBeginInteraction();
    onSelectFrame(frame.id);
    onSelectElement(child.id);
    dragMode = 'resizing-element';
    resizeHandle = handle;
    resizingFrameId = frame.id;
    resizingElementId = child.id;
    // child.x/y are group-relative; resize works in the same coordinate space
    resizeOrigin = { x: child.x, y: child.y, width: child.width, height: child.height };
    dragClientStart = { x: e.clientX, y: e.clientY };
  }

  function rotationPointerAngle(pointer: { x: number; y: number }): number {
    return Math.atan2(pointer.y - rotateOrigin.y, pointer.x - rotateOrigin.x) * 180 / Math.PI + 90;
  }

  function normalizedRotation(value: number): number | undefined {
    const rounded = Math.round(value * 10) / 10;
    if (Math.abs(rounded) < 0.05) return undefined;
    let next = rounded;
    while (next > 360) next -= 360;
    while (next < -360) next += 360;
    return next;
  }

  function startFrameRotate(e: MouseEvent, frame: Frame) {
    e.preventDefault();
    e.stopPropagation();
    if (!canEdit) return;
    onBeginInteraction();
    onSelectFrame(frame.id);
    onSelectElement(null);
    rotateOrigin = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
    rotateStartAngle = rotationPointerAngle(screenToWorld(e.clientX, e.clientY));
    rotateStartValue = frame.rotation ?? 0;
    rotatingFrameId = frame.id;
    rotatingElementId = null;
    dragClientStart = { x: e.clientX, y: e.clientY };
    dragMode = 'rotating-frame';
  }

  function startElementRotate(e: MouseEvent, frame: Frame, el: FrameElement) {
    e.preventDefault();
    e.stopPropagation();
    if (!canEdit) return;
    onBeginInteraction();
    onSelectFrame(frame.id);
    onSelectElement(el.id);
    const origin = transformOriginOffset(el);
    rotateOrigin = { x: frame.x + el.x + origin.x, y: frame.y + el.y + origin.y };
    rotateStartAngle = rotationPointerAngle(screenToWorld(e.clientX, e.clientY));
    rotateStartValue = el.rotation ?? 0;
    rotatingFrameId = frame.id;
    rotatingElementId = el.id;
    dragClientStart = { x: e.clientX, y: e.clientY };
    dragMode = 'rotating-element';
  }

  function startChildRotate(e: MouseEvent, frame: Frame, child: FrameElement, parentWorld: { x: number; y: number }) {
    e.preventDefault();
    e.stopPropagation();
    if (!canEdit) return;
    onBeginInteraction();
    onSelectFrame(frame.id);
    onSelectElement(child.id);
    const origin = transformOriginOffset(child);
    rotateOrigin = { x: parentWorld.x + child.x + origin.x, y: parentWorld.y + child.y + origin.y };
    rotateStartAngle = rotationPointerAngle(screenToWorld(e.clientX, e.clientY));
    rotateStartValue = child.rotation ?? 0;
    rotatingFrameId = frame.id;
    rotatingElementId = child.id;
    dragClientStart = { x: e.clientX, y: e.clientY };
    dragMode = 'rotating-element';
  }

  function startOrphanRotate(e: MouseEvent, el: FrameElement) {
    e.preventDefault();
    e.stopPropagation();
    if (!canEdit) return;
    onBeginInteraction();
    onSelectOrphan(el.id);
    const origin = transformOriginOffset(el);
    rotateOrigin = { x: el.x + origin.x, y: el.y + origin.y };
    rotateStartAngle = rotationPointerAngle(screenToWorld(e.clientX, e.clientY));
    rotateStartValue = el.rotation ?? 0;
    rotatingFrameId = null;
    rotatingElementId = el.id;
    dragClientStart = { x: e.clientX, y: e.clientY };
    dragMode = 'rotating-element';
  }

  function autoLayoutSpacingValue(autoLayout: NonNullable<FrameElement['autoLayout'] | Frame['autoLayout']>, side: AutoLayoutSpacingSide): number {
    return side === 'gap' ? autoLayout.gap : autoLayout.padding[side];
  }

  function autoLayoutSpacingPatch(autoLayout: NonNullable<FrameElement['autoLayout'] | Frame['autoLayout']>, side: AutoLayoutSpacingSide, value: number): NonNullable<FrameElement['autoLayout']> {
    const next = Math.max(0, snapToGrid(value));
    return side === 'gap'
      ? { ...autoLayout, gap: next }
      : { ...autoLayout, padding: { ...autoLayout.padding, [side]: next } };
  }

  function startAutoLayoutSpacingDrag(
    e: MouseEvent,
    target: 'frame' | 'element' | 'orphan',
    autoLayout: NonNullable<FrameElement['autoLayout'] | Frame['autoLayout']>,
    side: AutoLayoutSpacingSide,
    frameId: string | null,
    elementId: string | null = null,
  ) {
    e.preventDefault();
    e.stopPropagation();
    if (!canEdit) return;
    onBeginInteraction();
    if (target === 'frame') {
      onSelectFrame(frameId);
      onSelectElement(null);
    } else if (target === 'element' && frameId && elementId) {
      onSelectFrame(frameId);
      onSelectElement(elementId);
    } else if (target === 'orphan' && elementId) {
      onSelectOrphan(elementId);
    }
    const axis = side === 'gap'
      ? (autoLayout.direction === 'column' ? 'y' : 'x')
      : (side === 't' || side === 'b' ? 'y' : 'x');
    const sign: 1 | -1 = side === 'r' || side === 'b' ? -1 : 1;
    autoLayoutSpacingDrag = {
      target,
      frameId,
      elementId,
      side,
      startValue: autoLayoutSpacingValue(autoLayout, side),
      axis,
      sign,
    };
    dragClientStart = { x: e.clientX, y: e.clientY };
    dragMode = 'auto-layout-spacing';
  }

  function updateAutoLayoutSpacingFromDrag(dx: number, dy: number) {
    if (!autoLayoutSpacingDrag) return;
    const delta = (autoLayoutSpacingDrag.axis === 'x' ? dx : dy) * autoLayoutSpacingDrag.sign;
    const value = autoLayoutSpacingDrag.startValue + delta;
    const patchFor = (autoLayout: NonNullable<FrameElement['autoLayout']>) => ({
      autoLayout: autoLayoutSpacingPatch(autoLayout, autoLayoutSpacingDrag!.side, value),
    });

    if (autoLayoutSpacingDrag.target === 'frame' && autoLayoutSpacingDrag.frameId) {
      const frame = state.frames.find(candidate => candidate.id === autoLayoutSpacingDrag?.frameId);
      if (frame?.autoLayout) onUpdateFrame(frame.id, { autoLayout: autoLayoutSpacingPatch(frame.autoLayout, autoLayoutSpacingDrag.side, value) });
      return;
    }

    if (autoLayoutSpacingDrag.target === 'element' && autoLayoutSpacingDrag.frameId && autoLayoutSpacingDrag.elementId) {
      const frame = state.frames.find(candidate => candidate.id === autoLayoutSpacingDrag?.frameId);
      if (!frame) return;
      const selectedIds = selectedElementIdSet.has(autoLayoutSpacingDrag.elementId) && state.selectedElementIds.length > 1
        ? state.selectedElementIds
        : [autoLayoutSpacingDrag.elementId];
      for (const id of selectedIds) {
        const element = findFrameElement(frame.elements, id);
        if (element?.autoLayout) onUpdateElement(frame.id, element.id, patchFor(element.autoLayout));
      }
      return;
    }

    if (autoLayoutSpacingDrag.target === 'orphan' && autoLayoutSpacingDrag.elementId) {
      const orphan = state.orphanElements.find(candidate => candidate.id === autoLayoutSpacingDrag?.elementId);
      if (orphan?.autoLayout) onUpdateOrphan(orphan.id, patchFor(orphan.autoLayout));
    }
  }

  function startImageCropDrag(frameId: string | null, element: FrameElement) {
    if (!canEdit) return;
    dragMode = 'cropping-image';
    cropDragFrameId = frameId;
    cropDragElementId = element.id;
    cropDragStartPosition = cropObjectPosition(element);
    cropDragSize = { width: element.width, height: element.height };
    activeGuides = [];
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const rect = canvasEl.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = 1 - e.deltaY * 0.002;
      const newScale = Math.max(0.04, Math.min(8, scale * factor));
      panX = mx - (mx - panX) * (newScale / scale);
      panY = my - (my - panY) * (newScale / scale);
      scale = newScale;
    } else {
      panX -= e.deltaX;
      panY -= e.deltaY;
    }
  }

  function onMouseDown(e: MouseEvent) {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    // Commit any open inline edit before starting a new interaction
    if (inlineEditId) commitInlineEdit();
    // Release focus from any inline input so keyboard tool hotkeys reach window
    const active = document.activeElement;
    if (active && (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) {
      active.blur();
    }
    const wp = screenToWorld(e.clientX, e.clientY);
    dragClientStart = { x: e.clientX, y: e.clientY };
    dragWorldStart = wp;

    if (e.button === 0 && e.altKey) {
      dragMode = 'measuring';
      measureStart = wp;
      measureEnd = wp;
      spacingOverlay = null;
      return;
    }

    onBeginInteraction();

    const effectiveTool = canEdit || (canComment && communicationTool(activeTool))
      ? activeTool
      : (activeTool === 'hand' ? 'hand' : 'select');

    if (e.button === 1 || effectiveTool === 'hand') {
      dragMode = 'panning';
      return;
    }

    if (lassoActive && effectiveTool === 'select' && canEdit) {
      dragMode = 'lasso';
      lassoPoints = [wp];
      return;
    }

    if (effectiveTool === 'frame') {
      dragMode = 'drawing-frame';
      isDrawing = false;
      drawRect = { x: wp.x, y: wp.y, w: 0, h: 0 };
      return;
    }

    const hit = hitTest(wp.x, wp.y, state.frames, state.orphanElements);

    if (effectiveTool === 'comment') {
      dragMode = 'none';
      onEndInteraction();
      onAddCommentAt(commentTargetFromHit(hit, wp));
      return;
    }

    if (effectiveTool === 'annotation' || effectiveTool === 'measure') {
      dragMode = 'drawing-review-overlay';
      reviewOverlayKind = effectiveTool === 'measure' ? 'measurement' : 'annotation';
      measureStart = wp;
      measureEnd = wp;
      spacingOverlay = null;
      return;
    }

    if (effectiveTool === 'scale') {
      if (hit) startScaleDrag(hit, wp);
      else onEndInteraction();
      return;
    }

    if (effectiveTool === 'pen' || effectiveTool === 'pencil') {
      dragMode = 'drawing-vector';
      drawingVectorMode = effectiveTool;
      drawingVectorPoints = [wp];
      drawingElementFrameId = (hit && (hit.type === 'frame' || hit.type === 'element'))
        ? hit.frameId
        : null;
      if (drawingElementFrameId) onSelectFrame(drawingElementFrameId);
      return;
    }

    if (effectiveTool === 'section' || effectiveTool === 'slice' || effectiveTool === 'text' || effectiveTool === 'image' || effectiveTool === 'input' || effectiveTool === 'textarea' || effectiveTool === 'list' || effectiveTool === 'iframe') {
      // Begin a drag-to-create operation. mouseup decides:
      //   - Drag farther than DRAW_THRESHOLD px → spawn at that exact size.
      //   - Otherwise → fall back to the tool's default size (legacy click behavior).
      dragMode = 'drawing-element';
      isDrawing = false;
      drawingElementTool = effectiveTool as ElementType;
      // If the cursor is over a frame (or one of its elements), the new
      // element parents to that frame; otherwise it becomes a canvas-level orphan.
      drawingElementFrameId = (hit && (hit.type === 'frame' || hit.type === 'element'))
        ? hit.frameId
        : null;
      drawRect = { x: wp.x, y: wp.y, w: 0, h: 0 };
      // Pre-select the frame so the right inspector context is correct on commit.
      if (drawingElementFrameId) onSelectFrame(drawingElementFrameId);
      return;
    }

    // select tool
    if (!hit) {
      startMarqueeSelection(wp, null);
      return;
    }

    const hitFrameId = hit.type === 'frame' || hit.type === 'element' ? hit.frameId : null;
    if (!canEdit) {
      if (hit.type === 'orphan') {
        onSelectOrphan(hit.orphanId);
      } else if (hit.type === 'element') {
        onSelectFrame(hit.frameId);
        onSelectElement(hit.elementId);
      } else {
        onSelectFrame(hit.frameId);
        onSelectElement(null);
      }
      dragMode = 'none';
      onEndInteraction();
      return;
    }
    if (hitFrameId && selectedFrameIdSet.has(hitFrameId)) {
      const selectedIds = state.selectedFrameIds.length > 0 ? state.selectedFrameIds : [hitFrameId];
      const orphanOrigins = state.selectedElementIds
        .map(id => state.orphanElements.find(o => o.id === id))
        .filter((o): o is FrameElement => o !== undefined)
        .map(o => ({ id: o.id, x: o.x, y: o.y }));
      // Use moving-frames when there's >1 frame OR any selected orphan that should drag along.
      if (selectedIds.length > 1 || orphanOrigins.length > 0) {
        dragMode = 'moving-frames';
        multiFrameDragOrigins = collectFrameOrigins(selectedIds);
        multiOrphanDragOrigins = orphanOrigins;
      } else {
        const frame = state.frames.find(f => f.id === hitFrameId);
        if (!frame) return;
        dragMode = 'moving-frame';
        draggedFrameId = hitFrameId;
        draggedFrameOrigin = { x: frame.x, y: frame.y };
        multiOrphanDragOrigins = [];
      }
      return;
    }

    if (hit.type === 'orphan') {
      const orphan = state.orphanElements.find(o => o.id === hit.orphanId);
      if (!orphan) return;
      const multiIds = state.selectedElementIds ?? [];
      const isInMulti = multiIds.length > 1 && multiIds.includes(hit.orphanId);
      const orphanInSel = multiIds.includes(hit.orphanId);

      // Group click-expand: clicking a grouped orphan selects all group members
      if (!isInMulti && orphan.groupId) {
        const groupIds = state.orphanElements.filter(o => o.groupId === orphan.groupId).map(o => o.id);
        if (groupIds.length > 1) {
          onSelectMultiple(null, groupIds);
          dragMode = 'moving-multi';
          multiDragOrigins = collectMultiOrigins(groupIds);
          return;
        }
      }

      // Mixed selection: frames + orphans → drag everything as a unit.
      // Check this BEFORE the multi-orphan path so frames come along too.
      if (orphanInSel && state.selectedFrameIds.length > 0) {
        dragMode = 'moving-frames';
        multiFrameDragOrigins = collectFrameOrigins(state.selectedFrameIds);
        multiOrphanDragOrigins = multiIds
          .map(id => state.orphanElements.find(o => o.id === id))
          .filter((o): o is FrameElement => o !== undefined)
          .map(o => ({ id: o.id, x: o.x, y: o.y }));
        return;
      }

      if (isInMulti) {
        dragMode = 'moving-multi';
        multiDragOrigins = collectMultiOrigins(multiIds);
        return;
      }

      onSelectOrphan(hit.orphanId);
      if (cropImageElementId === hit.orphanId && isMediaCropTarget(orphan)) {
        startImageCropDrag(null, orphan);
        return;
      }
      dragMode = 'moving-orphan';
      draggedOrphanId = hit.orphanId;
      draggedOrphanOrigin = { x: orphan.x, y: orphan.y };
      return;
    }

    if (hit.type === 'element') {
      const frame = state.frames.find(f => f.id === hit.frameId)!;
      const el = frame.elements.find(el2 => el2.id === hit.elementId)!;

      // ── Cmd deep-select: enter group and grab a specific child ───────────
      if (e.metaKey && (el.type === 'group' || el.type === 'section') && !el.autoLayout && el.children?.length) {
        const lx = wp.x - frame.x - el.x;
        const ly = wp.y - frame.y - el.y;
        const child = findGroupChildAt(el, lx, ly);
        if (child) {
          onSelectFrame(hit.frameId);
          onSelectElement(child.id);
          cmdHoverId = null;
          // Also allow immediate drag of the selected child
          dragMode = 'moving-element';
          draggedFrameId = hit.frameId;
          draggedElementId = child.id;
          draggedElementOrigin = { x: child.x, y: child.y };
          return;
        }
      }

      // ── If a group child is already selected, clicking it (no cmd) keeps drag ──
      if ((el.type === 'group' || el.type === 'section') && !el.autoLayout && el.children && state.selectedElementId) {
        const alreadySelected = el.children.find(c => c.id === state.selectedElementId);
        if (alreadySelected) {
          const lx = wp.x - frame.x - el.x;
          const ly = wp.y - frame.y - el.y;
          const hitChild = findGroupChildAt(el, lx, ly);
          if (hitChild && hitChild.id === state.selectedElementId) {
            dragMode = 'moving-element';
            draggedFrameId = hit.frameId;
            draggedElementId = hitChild.id;
            draggedElementOrigin = { x: hitChild.x, y: hitChild.y };
            return;
          }
        }
      }
      // ─────────────────────────────────────────────────────────────────────

      if (isFrameBackgroundLayer(frame, el)) {
        onSelectFrame(hit.frameId);
        onSelectElement(null);
        startMarqueeSelection(wp, hit.frameId);
        return;
      }
      const multiIds = state.selectedElementIds ?? [];
      const isInMulti = multiIds.length > 1 && multiIds.includes(hit.elementId);

      if (cropImageElementId === hit.elementId && isMediaCropTarget(el)) {
        onSelectFrame(hit.frameId);
        onSelectElement(hit.elementId);
        startImageCropDrag(hit.frameId, el);
        return;
      }

      // Group click-expand: clicking a grouped element selects all group members in same frame
      if (!isInMulti && el.groupId) {
        const groupIds = frame.elements.filter(e => e.groupId === el.groupId).map(e => e.id);
        if (groupIds.length > 1) {
          onSelectMultiple(hit.frameId, groupIds);
          dragMode = 'moving-multi';
          multiDragOrigins = collectMultiOrigins(groupIds);
          return;
        }
      }

      if (isInMulti) {
        onSelectFrame(hit.frameId);
        dragMode = 'moving-multi';
        multiDragOrigins = collectMultiOrigins(multiIds);
      } else {
        onSelectFrame(hit.frameId);
        onSelectElement(hit.elementId);
        dragMode = 'moving-element';
        draggedFrameId = hit.frameId;
        draggedElementId = hit.elementId;
        draggedElementOrigin = { x: el.x, y: el.y };
      }
    } else {
      onSelectFrame(hit.frameId);
      onSelectElement(null);
      startMarqueeSelection(wp, hit.frameId);
    }
  }

  function onMouseMove(e: MouseEvent) {
    // Always track world-space cursor so cmd-hover stays accurate
    const _wp = screenToWorld(e.clientX, e.clientY);
    lastMouseWorld = _wp;
    // Sync cmdHeld from event in case keyup was missed
    if (cmdHeld !== e.metaKey) {
      cmdHeld = e.metaKey;
      if (!cmdHeld) cmdHoverId = null;
    }
    if (altMeasureHeld !== e.altKey) {
      altMeasureHeld = e.altKey;
      if (!altMeasureHeld) spacingOverlay = null;
    }
    if (dragMode === 'none') {
      updateCmdHoverFromWorld(_wp.x, _wp.y);
      updateSpacingOverlayFromWorld(_wp.x, _wp.y);
      return;
    }

    if (dragMode === 'linking-button') {
      const wp = screenToWorld(e.clientX, e.clientY);
      linkEnd = wp;
      const target = hitTestFrame(wp.x, wp.y, state.frames);
      linkHoverFrameId = target && target.id !== linkingFrameId ? target.id : null;
      return;
    }

    if (dragMode === 'measuring') {
      measureEnd = _wp;
      spacingOverlay = null;
      return;
    }

    if (dragMode === 'drawing-review-overlay') {
      measureEnd = _wp;
      spacingOverlay = null;
      return;
    }

    if (dragMode === 'panning') {
      panX += e.clientX - dragClientStart.x;
      panY += e.clientY - dragClientStart.y;
      dragClientStart = { x: e.clientX, y: e.clientY };
      return;
    }

    if (dragMode === 'scaling-selection') {
      applyScaleDrag(_wp);
      return;
    }

    if (dragMode === 'shape-corner' || dragMode === 'shape-arc-start' || dragMode === 'shape-arc-end') {
      applyShapeManipulatorDrag(_wp);
      return;
    }

    if (dragMode === 'drawing-vector') {
      const previous = drawingVectorPoints[drawingVectorPoints.length - 1];
      const threshold = drawingVectorMode === 'pencil' ? 2 / scale : 6 / scale;
      if (!previous || Math.hypot(_wp.x - previous.x, _wp.y - previous.y) >= threshold) {
        drawingVectorPoints = [...drawingVectorPoints, _wp];
      }
      return;
    }

    if (dragMode === 'marquee') {
      const wp = screenToWorld(e.clientX, e.clientY);
      marqueeRect = {
        x: Math.min(dragWorldStart.x, wp.x),
        y: Math.min(dragWorldStart.y, wp.y),
        w: Math.abs(wp.x - dragWorldStart.x),
        h: Math.abs(wp.y - dragWorldStart.y),
      };
      isMarquee = marqueeRect.w > 4 || marqueeRect.h > 4;
      if (isMarquee) {
        scheduleMarqueeSelection();
      }
      return;
    }

    if (dragMode === 'lasso') {
      const previous = lassoPoints[lassoPoints.length - 1];
      const threshold = 2 / scale;
      if (!previous || Math.hypot(_wp.x - previous.x, _wp.y - previous.y) >= threshold) {
        lassoPoints = [...lassoPoints, _wp];
      }
      if (lassoPoints.length >= 3) {
        const { elementIds, orphanIds, firstFrameWithHits, wholeFrameIds } = getLassoSelection(
          lassoPoints,
          state.frames,
          state.orphanElements,
        );
        onSelectMultiple(
          wholeFrameIds[0] ?? firstFrameWithHits,
          [...elementIds, ...orphanIds],
          wholeFrameIds,
        );
      }
      return;
    }

    const dx = (e.clientX - dragClientStart.x) / scale;
    const dy = (e.clientY - dragClientStart.y) / scale;

    if (dragMode === 'cropping-image' && cropDragElementId) {
      onCropImagePosition(
        cropDragFrameId,
        cropDragElementId,
        nextObjectPositionFromDrag(cropDragStartPosition, dx, dy, cropDragSize.width, cropDragSize.height),
      );
      return;
    }

    if (dragMode === 'moving-frames') {
      for (const origin of multiFrameDragOrigins) {
        onUpdateFrame(origin.id, {
          x: snapToGrid(origin.x + dx),
          y: snapToGrid(origin.y + dy),
        });
      }
      // Also move any orphans that were selected alongside the frames
      for (const origin of multiOrphanDragOrigins) {
        onUpdateOrphan(origin.id, {
          x: snapToGrid(origin.x + dx),
          y: snapToGrid(origin.y + dy),
        });
      }
      return;
    }

    if (dragMode === 'moving-multi') {
      const updatesByFrame = new Map<string, { id: string; x: number; y: number }[]>();
      const orphanUpdates: { id: string; x: number; y: number }[] = [];
      for (const o of multiDragOrigins) {
        const nx = snapToGrid(o.ox + dx);
        const ny = snapToGrid(o.oy + dy);
        if (o.frameId === null) {
          orphanUpdates.push({ id: o.id, x: nx, y: ny });
        } else {
          const arr = updatesByFrame.get(o.frameId) ?? [];
          arr.push({ id: o.id, x: nx, y: ny });
          updatesByFrame.set(o.frameId, arr);
        }
      }
      for (const [fId, ups] of updatesByFrame) {
        onUpdateElements(fId, ups);
      }
      for (const u of orphanUpdates) {
        onUpdateOrphan(u.id, { x: u.x, y: u.y });
      }
      return;
    }

    if (dragMode === 'drawing-frame' || dragMode === 'drawing-element') {
      const wp = screenToWorld(e.clientX, e.clientY);
      let dW = wp.x - dragWorldStart.x;
      let dH = wp.y - dragWorldStart.y;
      // Shift-constrain: force a square. Pick the larger magnitude as the side
      // length, preserving each axis's drag direction so the rect still tracks
      // the cursor's quadrant relative to the drag start.
      if (e.shiftKey) {
        const side = Math.max(Math.abs(dW), Math.abs(dH));
        dW = side * Math.sign(dW || 1);
        dH = side * Math.sign(dH || 1);
      }
      drawRect = {
        x: dW < 0 ? dragWorldStart.x + dW : dragWorldStart.x,
        y: dH < 0 ? dragWorldStart.y + dH : dragWorldStart.y,
        w: Math.abs(dW),
        h: Math.abs(dH),
      };
      const threshold = dragMode === 'drawing-frame' ? 10 : 4;
      isDrawing = drawRect.w > threshold || drawRect.h > threshold;
    } else if (dragMode === 'moving-frame' && draggedFrameId) {
      // Smart-guide snap: align the frame's edges/centre to nearby frames + orphans.
      const frame = state.frames.find(f => f.id === draggedFrameId);
      if (frame) {
        const candidateX = draggedFrameOrigin.x + dx;
        const candidateY = draggedFrameOrigin.y + dy;
        const moving: SnapBox = { id: frame.id, x: candidateX, y: candidateY, w: frame.width, h: frame.height };
        const snap = computeSnap(moving, collectSnapTargets(frame.id, null));
        activeGuides = snap.guides;
        onUpdateFrame(draggedFrameId, {
          x: snapToGrid(candidateX + snap.dx),
          y: snapToGrid(candidateY + snap.dy),
        });
      } else {
        activeGuides = [];
      }
    } else if (dragMode === 'moving-element' && draggedFrameId && draggedElementId) {
      // Smart-guide snap for elements — snap to siblings + the parent frame's edges.
      const frame = state.frames.find(f => f.id === draggedFrameId);
      const el = frame?.elements.find(e => e.id === draggedElementId);
      if (frame && el) {
        const candidateX = draggedElementOrigin.x + dx;
        const candidateY = draggedElementOrigin.y + dy;
        // Work in world coords so the snapping math sees the same plane as frames + orphans.
        const moving: SnapBox = {
          id: el.id,
          x: frame.x + candidateX,
          y: frame.y + candidateY,
          w: el.width,
          h: el.height,
        };
        const snap = computeSnap(moving, collectSnapTargets(null, { frameId: frame.id, elementId: el.id }));
        activeGuides = snap.guides;
        onUpdateElement(draggedFrameId, draggedElementId, {
          x: snapToGrid(candidateX + snap.dx),
          y: snapToGrid(candidateY + snap.dy),
        });
      } else {
        // Frame/element disappeared mid-drag — fall back without snap.
        activeGuides = [];
        onUpdateElement(draggedFrameId, draggedElementId, {
          x: snapToGrid(draggedElementOrigin.x + dx),
          y: snapToGrid(draggedElementOrigin.y + dy),
        });
      }
    } else if (dragMode === 'moving-orphan' && draggedOrphanId) {
      const orphan = state.orphanElements.find(o => o.id === draggedOrphanId);
      if (orphan) {
        const candidateX = draggedOrphanOrigin.x + dx;
        const candidateY = draggedOrphanOrigin.y + dy;
        const moving: SnapBox = { id: orphan.id, x: candidateX, y: candidateY, w: orphan.width, h: orphan.height };
        const snap = computeSnap(moving, collectSnapTargets(orphan.id, null));
        activeGuides = snap.guides;
        onUpdateOrphan(draggedOrphanId, {
          x: snapToGrid(candidateX + snap.dx),
          y: snapToGrid(candidateY + snap.dy),
        });
      } else {
        activeGuides = [];
        onUpdateOrphan(draggedOrphanId, {
          x: snapToGrid(draggedOrphanOrigin.x + dx),
          y: snapToGrid(draggedOrphanOrigin.y + dy),
        });
      }
    } else if (dragMode === 'resizing-frame' && resizingFrameId && resizeHandle) {
      let box = resizeBox(resizeOrigin, resizeHandle, dx, dy, MIN_FRAME_SIZE.width, MIN_FRAME_SIZE.height);
      // Shift-constrain (item 44): preserve the frame's original aspect ratio.
      if (e.shiftKey) box = constrainAspectRatio(box, resizeOrigin, resizeHandle);
      onUpdateFrame(resizingFrameId, box);
    } else if (dragMode === 'resizing-element' && resizingElementId && resizeHandle) {
      let box = resizeBox(resizeOrigin, resizeHandle, dx, dy, MIN_ELEMENT_SIZE.width, MIN_ELEMENT_SIZE.height, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, true);
      if (e.shiftKey) box = constrainAspectRatio(box, resizeOrigin, resizeHandle);
      if (resizingFrameId) {
        onUpdateElement(resizingFrameId, resizingElementId, box);
      } else {
        onUpdateOrphan(resizingElementId, box);
      }
    } else if (dragMode === 'rotating-frame' && rotatingFrameId) {
      const pointer = screenToWorld(e.clientX, e.clientY);
      const delta = rotationPointerAngle(pointer) - rotateStartAngle;
      const rawRotation = rotateStartValue + delta;
      const rotation = normalizedRotation(e.shiftKey ? Math.round(rawRotation / 15) * 15 : rawRotation);
      onUpdateFrame(rotatingFrameId, { rotation });
    } else if (dragMode === 'rotating-element' && rotatingElementId) {
      const pointer = screenToWorld(e.clientX, e.clientY);
      const delta = rotationPointerAngle(pointer) - rotateStartAngle;
      const rawRotation = rotateStartValue + delta;
      const rotation = normalizedRotation(e.shiftKey ? Math.round(rawRotation / 15) * 15 : rawRotation);
      const patch = { rotation } as Partial<FrameElement>;
      if (rotatingFrameId) {
        onUpdateElement(rotatingFrameId, rotatingElementId, patch);
      } else {
        onUpdateOrphan(rotatingElementId, patch);
      }
    } else if (dragMode === 'auto-layout-spacing') {
      updateAutoLayoutSpacingFromDrag(dx, dy);
    }
  }

  function onMouseUp(e?: MouseEvent) {
    if (dragMode === 'measuring') {
      dragMode = 'none';
      measureStart = { x: 0, y: 0 };
      measureEnd = { x: 0, y: 0 };
      return;
    }

    if (dragMode === 'drawing-review-overlay') {
      const distance = Math.hypot(measureEnd.x - measureStart.x, measureEnd.y - measureStart.y);
      if (distance >= 6) {
        onAddReviewOverlay(reviewOverlayKind, measureStart.x, measureStart.y, measureEnd.x, measureEnd.y);
      } else {
        onEndInteraction();
      }
      dragMode = 'none';
      measureStart = { x: 0, y: 0 };
      measureEnd = { x: 0, y: 0 };
      return;
    }

    if (dragMode === 'marquee') {
      cancelPendingMarqueeSelection();
      if (isMarquee) {
        applyMarqueeSelection(marqueeRect);
      } else {
        if (marqueeClickFrameId) {
          onSelectFrame(marqueeClickFrameId);
          onSelectElement(null);
        } else {
          onSelectMultiple(null, []);
        }
      }
      isMarquee = false;
      marqueeClickFrameId = null;
      lastMarqueeSelectionSignature = '';
      marqueeRect = { x: 0, y: 0, w: 0, h: 0 };
      dragMode = 'none';
      onEndInteraction();
      return;
    }

    if (dragMode === 'lasso') {
      if (lassoPoints.length >= 3) {
        const { elementIds, orphanIds, firstFrameWithHits, wholeFrameIds } = getLassoSelection(
          lassoPoints,
          state.frames,
          state.orphanElements,
        );
        onSelectMultiple(
          wholeFrameIds[0] ?? firstFrameWithHits,
          [...elementIds, ...orphanIds],
          wholeFrameIds,
        );
      } else {
        onSelectMultiple(null, []);
      }
      lassoPoints = [];
      dragMode = 'none';
      onEndInteraction();
      return;
    }

    if (dragMode === 'drawing-frame' && isDrawing && drawRect.w > 24 && drawRect.h > 24) {
      onAddFrame(snapToGrid(drawRect.x), snapToGrid(drawRect.y), snapToGrid(drawRect.w), snapToGrid(drawRect.h));
    } else if (dragMode === 'drawing-element' && drawingElementTool) {
      // Commit the dragged element. If the drag was tiny (≤10 px on either
      // axis) we fall back to default size — that's the legacy click behavior.
      const DRAW_THRESHOLD = 10;
      const dragged = drawRect.w >= DRAW_THRESHOLD || drawRect.h >= DRAW_THRESHOLD;
      const w = dragged ? Math.max(drawRect.w, 4) : undefined;
      const h = dragged ? Math.max(drawRect.h, 4) : undefined;
      // Anchor: dragged → top-left of the rect. Click → click point.
      const anchorX = dragged ? drawRect.x : dragWorldStart.x;
      const anchorY = dragged ? drawRect.y : dragWorldStart.y;
      if (drawingElementFrameId) {
        const frame = state.frames.find(f => f.id === drawingElementFrameId);
        if (frame) {
          onAddElement(
            frame.id,
            drawingElementTool,
            snapToGrid(anchorX - frame.x),
            snapToGrid(anchorY - frame.y),
            w !== undefined ? snapToGrid(w) : undefined,
            h !== undefined ? snapToGrid(h) : undefined,
          );
        }
      } else {
        onAddOrphan(
          drawingElementTool,
          snapToGrid(anchorX),
          snapToGrid(anchorY),
          w !== undefined ? snapToGrid(w) : undefined,
          h !== undefined ? snapToGrid(h) : undefined,
        );
      }
    } else if (dragMode === 'moving-element' && draggedFrameId && draggedElementId) {
      const parentFrame = state.frames.find(f => f.id === draggedFrameId);
      const el = parentFrame?.elements.find(e => e.id === draggedElementId);
      if (parentFrame && el) {
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const isOutside = cx < 0 || cx > parentFrame.width || cy < 0 || cy > parentFrame.height;
        if (isOutside) {
          const worldCX = parentFrame.x + cx;
          const worldCY = parentFrame.y + cy;
          const target = state.frames.find(f =>
            f.id !== draggedFrameId &&
            worldCX >= f.x && worldCX <= f.x + f.width &&
            worldCY >= f.y && worldCY <= f.y + f.height
          );
          if (target) {
            onMoveElement(draggedFrameId, draggedElementId, target.id, snapToGrid(worldCX - target.x - el.width / 2), snapToGrid(worldCY - target.y - el.height / 2));
          } else {
            // Dropped outside all frames → promote to canvas-level orphan
            onPromoteToOrphan(draggedFrameId, draggedElementId);
          }
        }
      }
    } else if (dragMode === 'moving-orphan' && draggedOrphanId) {
      const orphan = state.orphanElements.find(o => o.id === draggedOrphanId);
      if (orphan) {
        const cx = orphan.x + orphan.width / 2;
        const cy = orphan.y + orphan.height / 2;
        const target = state.frames.find(f =>
          cx >= f.x && cx <= f.x + f.width &&
          cy >= f.y && cy <= f.y + f.height
        );
        if (target) {
          // Dropped onto a frame → demote orphan back into that frame's child
          onDemoteOrphanToFrame(
            draggedOrphanId,
            target.id,
            snapToGrid(cx - target.x - orphan.width / 2),
            snapToGrid(cy - target.y - orphan.height / 2),
          );
        }
        // else: stays an orphan at its new world coords (already updated during drag)
      }
    } else if (dragMode === 'linking-button' && e && linkingElementId) {
      const wp = screenToWorld(e.clientX, e.clientY);
      const target = hitTestFrame(wp.x, wp.y, state.frames);
      if (target && target.id !== linkingFrameId) {
        if (linkingFrameId) {
          onUpdateElement(linkingFrameId, linkingElementId, { targetFrameId: target.id });
        } else {
          onUpdateOrphan(linkingElementId, { targetFrameId: target.id });
        }
      }
    } else if (dragMode === 'drawing-vector') {
      const result = buildVectorFromWorldPoints(drawingVectorPoints, drawingVectorMode);
      if (result) {
        const parent = drawingElementFrameId ? state.frames.find(frame => frame.id === drawingElementFrameId) ?? null : null;
        const localX = parent ? result.x - parent.x : result.x;
        const localY = parent ? result.y - parent.y : result.y;
        const overrides: Partial<FrameElement> = {
          vectorPath: result.path,
          vectorPoints: result.points,
          background: '#f7f1e8',
          color: 'transparent',
        };
        if (parent) {
          onAddElement(parent.id, 'vector', snapToGrid(localX), snapToGrid(localY), Math.max(1, snapToGrid(result.width)), Math.max(1, snapToGrid(result.height)), overrides);
        } else {
          onAddOrphan('vector', snapToGrid(result.x), snapToGrid(result.y), Math.max(1, snapToGrid(result.width)), Math.max(1, snapToGrid(result.height)), overrides);
        }
      }
    }
    dragMode = 'none';
    isDrawing = false;
    draggedFrameId = null;
    multiFrameDragOrigins = [];
    multiOrphanDragOrigins = [];
    draggedElementId = null;
    resizingFrameId = null;
    resizingElementId = null;
    rotatingFrameId = null;
    rotatingElementId = null;
    rotateStartAngle = 0;
    rotateStartValue = 0;
    rotateOrigin = { x: 0, y: 0 };
    autoLayoutSpacingDrag = null;
    shapeDragFrameId = null;
    shapeDragElementId = null;
    cropDragFrameId = null;
    cropDragElementId = null;
    cropDragStartPosition = '50% 50%';
    cropDragSize = { width: 1, height: 1 };
    resizeHandle = null;
    linkingFrameId = null;
    linkingElementId = null;
    linkHoverFrameId = null;
    drawRect = { x: 0, y: 0, w: 0, h: 0 };
    drawingElementTool = null;
    drawingElementFrameId = null;
    drawingVectorPoints = [];
    scaleDrag = null;
    activeGuides = [];
    multiDragOrigins = [];
    draggedOrphanId = null;
    onEndInteraction();
  }

  // Pointer manipulation is complemented by keyboard controls in the toolbar
  // and layer tree; keep this free-form drawing surface out of tab order.
  function pointerSurface(node: HTMLElement) {
    node.addEventListener('mousedown', onMouseDown);
    node.addEventListener('mousemove', onMouseMove);
    node.addEventListener('mouseup', onMouseUp);
    node.addEventListener('mouseleave', onMouseUp);
    node.addEventListener('dblclick', onDblClick);
    return {
      destroy() {
        node.removeEventListener('mousedown', onMouseDown);
        node.removeEventListener('mousemove', onMouseMove);
        node.removeEventListener('mouseup', onMouseUp);
        node.removeEventListener('mouseleave', onMouseUp);
        node.removeEventListener('dblclick', onDblClick);
      },
    };
  }

  onMount(() => {
    canvasEl.addEventListener('wheel', onWheel, { passive: false });
    syncViewportSize();
    // Restore saved viewport (item 66) — kicks the reactive save off after the
    // first render so we don't immediately overwrite the value we just read.
    if (projectId) {
      void getMeta<{ panX: number; panY: number; scale: number }>(`viewport:${projectId}`)
        .then((saved) => {
          if (saved && typeof saved.scale === 'number' && saved.scale > 0) {
            panX = saved.panX ?? panX;
            panY = saved.panY ?? panY;
            scale = saved.scale;
          }
          viewportLoaded = true;
        })
        .catch(() => { viewportLoaded = true; });
    } else {
      viewportLoaded = true;
    }
    // ResizeObserver: kept-alive size for the rulers without polling.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncViewportSize) : null;
    if (ro && canvasEl) ro.observe(canvasEl);
    const onWinKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Meta' || e.key === 'Control') {
        cmdHeld = true;
        updateCmdHoverFromWorld(lastMouseWorld.x, lastMouseWorld.y);
      }
      if (e.key === 'Alt') {
        altMeasureHeld = true;
        updateSpacingOverlayFromWorld(lastMouseWorld.x, lastMouseWorld.y);
      }
    };
    const onWinKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Meta' || e.key === 'Control') {
        cmdHeld = false;
        cmdHoverId = null;
      }
      if (e.key === 'Alt') {
        altMeasureHeld = false;
        spacingOverlay = null;
      }
    };
    window.addEventListener('keydown', onWinKeyDown);
    window.addEventListener('keyup', onWinKeyUp);
    window.addEventListener('resize', syncViewportSize);
    // Item 74 — commit any open inline edit when the tab is hidden or the
    // window loses focus, so alt-tabbing mid-typing doesn't lose work.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && inlineEditId) commitInlineEdit();
    };
    const onWindowBlur = () => {
      if (inlineEditId) commitInlineEdit();
      altMeasureHeld = false;
      spacingOverlay = null;
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      canvasEl.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onWinKeyDown);
      window.removeEventListener('keyup', onWinKeyUp);
      window.removeEventListener('resize', syncViewportSize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onWindowBlur);
      cancelPendingMarqueeSelection();
      ro?.disconnect();
    };
  });

  $: effectiveCursorTool = canEdit ? activeTool : (activeTool === 'hand' ? 'hand' : 'select');
  $: cursorStyle = lassoActive && effectiveCursorTool === 'select' && canEdit ? 'crosshair'
    : effectiveCursorTool === 'hand' ? (dragMode === 'panning' ? 'grabbing' : 'grab')
    : effectiveCursorTool === 'scale' ? 'nwse-resize'
    : effectiveCursorTool === 'frame' ? 'crosshair'
    : dragMode === 'linking-button' ? 'crosshair'
    : dragMode === 'resizing-frame' || dragMode === 'resizing-element' ? (resizeHandle ? handleCursor(resizeHandle) : 'default')
    : dragMode === 'rotating-frame' || dragMode === 'rotating-element' ? 'grabbing'
    : dragMode === 'cropping-image' ? 'grabbing'
    : effectiveCursorTool === 'section' || effectiveCursorTool === 'slice' || effectiveCursorTool === 'text' || effectiveCursorTool === 'image' || effectiveCursorTool === 'input' || effectiveCursorTool === 'textarea' || effectiveCursorTool === 'list' || effectiveCursorTool === 'iframe' ? 'cell'
    : dragMode === 'panning' || dragMode === 'moving-frame' || dragMode === 'moving-frames' || dragMode === 'moving-element' || dragMode === 'moving-multi' || dragMode === 'moving-orphan' || dragMode === 'scaling-selection' ? 'grabbing'
    : 'default';
  $: visionFilter = visionSimulation === 'none' ? '' : `url(#frontendeasy-${visionSimulation})`;
</script>

<div
  class="canvas"
  role="region"
  aria-label="Design canvas"
  use:pointerSurface
  bind:this={canvasEl}
  style:cursor={cursorStyle}
  on:dragover={onCanvasDragOver}
  on:drop={onCanvasDrop}
>
  <svg class="vision-filter-defs" aria-hidden="true">
    <defs>
      <filter id="frontendeasy-protanopia" color-interpolation-filters="sRGB">
        <feColorMatrix type="matrix" values="0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0" />
      </filter>
      <filter id="frontendeasy-deuteranopia" color-interpolation-filters="sRGB">
        <feColorMatrix type="matrix" values="0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0" />
      </filter>
      <filter id="frontendeasy-tritanopia" color-interpolation-filters="sRGB">
        <feColorMatrix type="matrix" values="0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0" />
      </filter>
      <filter id="frontendeasy-achromatopsia" color-interpolation-filters="sRGB">
        <feColorMatrix type="matrix" values="0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0 0 0 1 0" />
      </filter>
    </defs>
  </svg>
  <div
    class="canvas-world"
    class:has-grid={$gridSettings.showOverlay && scale >= 4}
    class:wireframe={wireframeMode}
    class:pixel-preview-1x={pixelPreview === '1x'}
    class:pixel-preview-2x={pixelPreview === '2x'}
    style:transform="translate({panX}px, {panY}px) scale({scale})"
    style:--grid-size="{$gridSettings.size}px"
    style:--canvas-scale={scale}
    style:filter={visionFilter}
  >
    <!-- Frames -->
    {#each state.frames as frame (frame.id)}
      {@const isActiveFrame = frame.id === state.activeFrameId}
      {@const isSelectedFrame = selectedFrameIdSet.has(frame.id)}
      <div
        class="frame-container"
        style:left="{frame.x}px"
        style:top="{frame.y}px"
        style:width="{frame.width}px"
      >
        <div class="frame-label" class:active={isActiveFrame || isSelectedFrame}>
        <button
          type="button"
          class="frame-label-drag"
          title="Drag to move frame"
          aria-label="Drag to move frame {frame.name}"
          on:mousedown={(e) => startFrameMove(e, frame)}
        >
          <span class="frame-icon">{frame.filename.endsWith('index.html') ? '⊞' : '▣'}</span>
          {frame.name}
          <span class="frame-size">{frame.width}×{frame.height}</span>
        </button>
        </div>
        <div
          class="frame"
          data-frame-id={frame.id}
          data-layer-label={frame.name}
          class:active={isActiveFrame || isSelectedFrame}
          class:multi-selected={isSelectedFrame && state.selectedFrameIds.length > 1}
          class:link-drop-target={frame.id === linkHoverFrameId}
          class:cmd-deep-hover={cmdHoverId === frame.id && !isSelectedFrame && !isActiveFrame}
          class:layer-tree-hover={hoveredFrameId === frame.id}
          class:clip-disabled={frame.clipContent === false}
          style:width="{frame.width}px"
          style:height="{frame.height}px"
          style:background={frame.background}
          style:background-image={frameBackgroundImage(frame)}
          style:background-size={frame.backgroundImageSize ?? 'cover'}
          style:background-repeat={frame.backgroundImageRepeat ?? 'no-repeat'}
          style:background-position={frame.backgroundImagePosition ?? 'center'}
          style:opacity={frame.opacity ?? 1}
          style:border-radius={`${frame.borderRadius ?? 0}px`}
          style:border={borderCss(frame.border)}
          style:box-shadow={shadowCss(frame.shadow)}
          style:transform={frame.rotation !== undefined ? `rotate(${frame.rotation}deg)` : undefined}
          style:transform-origin="center center"
          style:display={autoLayoutDisplay(frame.autoLayout)}
          style:flex-direction={frame.autoLayout?.direction}
          style:gap={autoLayoutGap(frame.autoLayout)}
          style:column-gap={autoLayoutColumnGap(frame.autoLayout)}
          style:row-gap={autoLayoutRowGap(frame.autoLayout)}
          style:grid-template-columns={autoLayoutGridColumns(frame.autoLayout)}
          style:grid-template-rows={autoLayoutGridRows(frame.autoLayout)}
          style:align-items={frame.autoLayout ? (frame.autoLayout.align === 'start' ? 'flex-start' : frame.autoLayout.align === 'end' ? 'flex-end' : frame.autoLayout.align) : undefined}
          style:justify-content={frame.autoLayout ? (frame.autoLayout.justify === 'start' || !frame.autoLayout.justify ? 'flex-start' : frame.autoLayout.justify === 'end' ? 'flex-end' : frame.autoLayout.justify) : undefined}
          style:flex-wrap={frame.autoLayout?.wrap ? 'wrap' : undefined}
          style:padding={frame.autoLayout ? `${frame.autoLayout.padding.t}px ${frame.autoLayout.padding.r}px ${frame.autoLayout.padding.b}px ${frame.autoLayout.padding.l}px` : undefined}
        >
          {#each frame.elements as el (el.id)}
            {@const isPrimarySelectedEl = el.id === state.selectedElementId}
            {@const isSelectedEl = isPrimarySelectedEl || selectedElementIdSet.has(el.id) || (isSelectedFrame && !isFrameBackgroundLayer(frame, el))}
            {#if el.hidden}
              <!-- Hidden — not rendered on canvas (still listed in left panel). -->
            {:else if el.type === 'group' || (el.type === 'section' && !!el.children?.length)}
              <!-- Container — group and nested section children render inside, selected as a unit. -->
              <div
                class="element is-group"
                data-frame-id={frame.id}
                data-element-id={el.id}
                data-wireframe-label={wireframeLabel(el)}
                data-layer-label={wireframeLabel(el)}
                role="button"
                tabindex="-1"
                aria-label="Descend into {wireframeLabel(el)}"
                class:selected={isSelectedEl}
                class:primary-selected={isPrimarySelectedEl}
                class:cropping={cropImageElementId === el.id}
                class:masked={!!el.mask && el.mask.enabled !== false}
                class:cmd-deep-hover={cmdHoverId === el.id && !isSelectedEl}
                class:layer-tree-hover={hoveredElementId === el.id}
                style:position={participatesInAutoLayout(frame.autoLayout, el) ? 'relative' : undefined}
                style:left={participatesInAutoLayout(frame.autoLayout, el) ? undefined : `${el.x}px`}
                style:top={participatesInAutoLayout(frame.autoLayout, el) ? undefined : `${el.y}px`}
                style:width={layoutItemWidth(el, elementBoxWidth(el, frame.autoLayout?.align === 'stretch' && frame.autoLayout.direction === 'column' && participatesInAutoLayout(frame.autoLayout, el) ? 'auto' : `${el.width}px`))}
                style:height={layoutItemHeight(el, elementBoxHeight(el, frame.autoLayout?.align === 'stretch' && frame.autoLayout.direction === 'row' && participatesInAutoLayout(frame.autoLayout, el) ? 'auto' : `${el.height}px`))}
                style:background={effectBackgroundCss(el, el.background || 'transparent')}
                style:border-radius={borderRadiusCss(el)}
                style:transform={elementTransformCss(el)}
                style:transform-origin={elementTransformOrigin(el)}
                style:opacity={el.opacity ?? 1}
                style:mix-blend-mode={elementBlendMode(el)}
                style:box-shadow={effectBoxShadowCss(el)}
                style:filter={elementFilterCss(el)}
                style:backdrop-filter={elementBackdropFilterCss(el)}
                style:border={borderCss(el.border)}
                style:outline={borderOutlineCss(el.border)}
                style:border-top={borderSideCss(el.border, 'top')}
                style:border-right={borderSideCss(el.border, 'right')}
                style:border-bottom={borderSideCss(el.border, 'bottom')}
                style:border-left={borderSideCss(el.border, 'left')}
                style:flex={layoutItemFlex(el, frame.autoLayout)}
                style:align-self={layoutItemAlignSelf(el)}
                style:display={autoLayoutDisplay(el.autoLayout) ?? 'block'}
                style:flex-direction={el.autoLayout?.direction ?? 'row'}
                style:gap={autoLayoutGap(el.autoLayout)}
                style:column-gap={autoLayoutColumnGap(el.autoLayout)}
                style:row-gap={autoLayoutRowGap(el.autoLayout)}
                style:grid-template-columns={autoLayoutGridColumns(el.autoLayout)}
                style:grid-template-rows={autoLayoutGridRows(el.autoLayout)}
                style:align-items={el.autoLayout ? (el.autoLayout.align === 'start' ? 'flex-start' : el.autoLayout.align === 'end' ? 'flex-end' : el.autoLayout.align) : textVerticalAlignCss(el)}
                style:justify-content={el.autoLayout ? (el.autoLayout.justify === 'start' || !el.autoLayout.justify ? 'flex-start' : el.autoLayout.justify === 'end' ? 'flex-end' : el.autoLayout.justify) : textJustifyCss(el)}
                style:flex-wrap={el.autoLayout?.wrap ? 'wrap' : undefined}
                style:padding={el.autoLayout ? `${el.autoLayout.padding.t}px ${el.autoLayout.padding.r}px ${el.autoLayout.padding.b}px ${el.autoLayout.padding.l}px` : undefined}
                on:dblclick|stopPropagation={() => { onSelectFrame(frame.id); onSelectElement(el.id); onDescendSelection(); }}
              >
                {#each el.children ?? [] as child (child.id)}
                  {@const isChildPrimarySelected = child.id === state.selectedElementId}
                  {@const isChildSelected = isChildPrimarySelected || selectedElementIdSet.has(child.id)}
                  {@const isChildCmdHovered = child.id === cmdHoverId && !isChildSelected}
                  <div
                    class="element"
                    data-frame-id={frame.id}
                    data-element-id={child.id}
                    data-wireframe-label={wireframeLabel(child)}
                    data-layer-label={wireframeLabel(child)}
                    class:is-button={child.isButton}
                    class:is-text={child.type === 'text'}
                    class:selected={isChildSelected}
                    class:primary-selected={isChildPrimarySelected}
                    class:cmd-deep-hover={isChildCmdHovered}
                    class:layer-tree-hover={hoveredElementId === child.id}
                    style:position={participatesInAutoLayout(el.autoLayout, child) ? 'relative' : 'absolute'}
                    style:left={participatesInAutoLayout(el.autoLayout, child) ? undefined : child.x + 'px'}
                    style:top={participatesInAutoLayout(el.autoLayout, child) ? undefined : child.y + 'px'}
                    style:width={layoutItemWidth(child, elementBoxWidth(child, el.autoLayout?.align === 'stretch' && el.autoLayout.direction === 'column' && participatesInAutoLayout(el.autoLayout, child) ? 'auto' : child.width + 'px'))}
                    style:height={layoutItemHeight(child, elementBoxHeight(child, el.autoLayout?.align === 'stretch' && el.autoLayout.direction === 'row' && participatesInAutoLayout(el.autoLayout, child) ? 'auto' : child.height + 'px'))}
                    style:background={effectBackgroundCss(child, child.background)}
                    style:color={child.color}
                    style:border-radius={borderRadiusCss(child)}
                    style:transform={elementTransformCss(child)}
                    style:transform-origin={elementTransformOrigin(child)}
                    style:opacity={child.opacity ?? 1}
                    style:mix-blend-mode={elementBlendMode(child)}
                    style:box-shadow={effectBoxShadowCss(child)}
                    style:filter={elementFilterCss(child)}
                    style:backdrop-filter={elementBackdropFilterCss(child)}
                    style:border={borderCss(child.border)}
                    style:outline={borderOutlineCss(child.border)}
                    style:border-top={borderSideCss(child.border, 'top')}
                    style:border-right={borderSideCss(child.border, 'right')}
                    style:border-bottom={borderSideCss(child.border, 'bottom')}
                    style:border-left={borderSideCss(child.border, 'left')}
                    style:flex={layoutItemFlex(child, el.autoLayout)}
                    style:align-self={layoutItemAlignSelf(child)}
                    style:font-size="{resolvedFontSize(child)}px"
                    style:font-weight={child.fontWeight}
                    style:overflow={textBoxOverflow(child)}
                  >
                    <span
                      class="el-content"
                      style:overflow={textContentOverflow(child)}
                      style:text-overflow={textEllipsis(child)}
                      style:white-space={textWhiteSpace(child)}
                      style:overflow-wrap={textWordBreak(child)}
                      style:word-break={textWordBreak(child)}
                      style:width={textContentWidth(child)}
                    ><InlineText content={child.content} runs={child.type === 'text' ? child.textRuns : undefined} /></span>
                    {#if isChildSelected && child.isButton}
                      <button
                        type="button"
                        class="link-handle"
                        title="Drag to link this button to another HTML page frame"
                        aria-label="Drag selected group child button to another page frame"
                        on:mousedown={(e) => startLinkDrag(e, frame, child, { x: frame.x + el.x + child.x, y: frame.y + el.y + child.y })}
                      >
                        <span class="link-handle-dot"></span>
                        <span class="link-handle-tip">drag to link page</span>
                      </button>
                    {/if}
                    {#if isChildSelected}
                      {#each ROTATE_HANDLES as handle}
                        <button
                          type="button"
                          class="rotate-handle rotate-{handle}"
                          title="Rotate child from {handle} corner"
                          aria-label={handle === 'ne' ? 'Rotate selected group child' : `Rotate selected group child from ${handle} corner`}
                          on:mousedown={(e) => startChildRotate(e, frame, child, { x: frame.x + el.x, y: frame.y + el.y })}
                        ></button>
                      {/each}
                      {#each RESIZE_HANDLES as handle}
                        <button
                          type="button"
                          class="resize-edge edge-{handle}"
                          title="Resize child {handle}"
                          aria-label="Resize selected group child from {handle} handle"
                          style:cursor={handleCursor(handle)}
                          on:mousedown={(e) => startChildResize(e, frame, child, handle)}
                        ></button>
                      {/each}
                      <span class="resize-size-badge">{snapToGrid(child.width)} × {snapToGrid(child.height)}</span>
                    {/if}
                  </div>
                {/each}
                {#if isPrimarySelectedEl && el.isButton}
                  <button
                    type="button"
                    class="link-handle"
                    title="Drag to link this group-button to another page"
                    aria-label="Drag to link this group-button to a page"
                    on:mousedown={(e) => startLinkDrag(e, frame, el)}
                  >
                    <span class="link-handle-dot"></span>
                    <span class="link-handle-tip">drag to link page</span>
                  </button>
                {/if}
                {#if isPrimarySelectedEl}
                  {#if el.autoLayout}
                    <button
                      type="button"
                      class="auto-layout-handle auto-layout-gap-handle"
                      aria-label="Drag element auto layout gap"
                      title="Drag to adjust Auto Layout gap"
                      on:mousedown={(e) => startAutoLayoutSpacingDrag(e, 'element', el.autoLayout!, 'gap', frame.id, el.id)}
                    >Gap {el.autoLayout.gap}</button>
                    {#each AUTO_LAYOUT_PADDING_SIDES as side}
                      <button
                        type="button"
                        class="auto-layout-handle padding-{side}"
                        aria-label="Drag element auto layout padding {side}"
                        title="Drag to adjust Auto Layout padding"
                        on:mousedown={(e) => startAutoLayoutSpacingDrag(e, 'element', el.autoLayout!, side, frame.id, el.id)}
                      >{el.autoLayout.padding[side]}</button>
                    {/each}
                  {/if}
                  {#each ROTATE_HANDLES as handle}
                    <button
                      type="button"
                      class="rotate-handle rotate-{handle}"
                      title="Rotate group from {handle} corner. Hold Shift to snap to 15° increments."
                      aria-label={handle === 'ne' ? 'Rotate selected group' : `Rotate selected group from ${handle} corner`}
                      on:mousedown={(e) => startElementRotate(e, frame, el)}
                    ></button>
                  {/each}
                  {#each RESIZE_HANDLES as handle}
                    <button
                      type="button"
                      class="resize-edge edge-{handle}"
                      title="Resize group {handle}"
                      aria-label="Resize selected group from {handle} handle"
                      style:cursor={handleCursor(handle)}
                      on:mousedown={(e) => startElementResize(e, frame, el, handle)}
                    ></button>
                  {/each}
                  <span class="resize-size-badge">{snapToGrid(el.width)} × {snapToGrid(el.height)}</span>
                {/if}
              </div>
            {:else if el.type === 'image'}
              <!-- Image element -->
              <div
                class="element is-image"
                data-frame-id={frame.id}
                data-element-id={el.id}
                data-wireframe-label={wireframeLabel(el)}
                data-layer-label={wireframeLabel(el)}
                class:selected={isSelectedEl}
                class:primary-selected={isPrimarySelectedEl}
                class:cropping={cropImageElementId === el.id}
                class:masked={!!el.mask && el.mask.enabled !== false}
                class:cmd-deep-hover={cmdHoverId === el.id && !isSelectedEl}
                class:layer-tree-hover={hoveredElementId === el.id}
                style:position={participatesInAutoLayout(frame.autoLayout, el) ? 'relative' : undefined}
                style:left={participatesInAutoLayout(frame.autoLayout, el) ? undefined : `${el.x}px`}
                style:top={participatesInAutoLayout(frame.autoLayout, el) ? undefined : `${el.y}px`}
                style:width={layoutItemWidth(el, elementBoxWidth(el, frame.autoLayout?.align === 'stretch' && frame.autoLayout.direction === 'column' && participatesInAutoLayout(frame.autoLayout, el) ? 'auto' : `${el.width}px`))}
                style:height={layoutItemHeight(el, elementBoxHeight(el, frame.autoLayout?.align === 'stretch' && frame.autoLayout.direction === 'row' && participatesInAutoLayout(frame.autoLayout, el) ? 'auto' : `${el.height}px`))}
                style:background={effectBackgroundCss(el, 'transparent')}
                style:border-radius={borderRadiusCss(el)}
                style:transform={elementTransformCss(el)}
                style:transform-origin={elementTransformOrigin(el)}
                style:opacity={el.opacity ?? 1}
                style:mix-blend-mode={elementBlendMode(el)}
                style:box-shadow={effectBoxShadowCss(el)}
                style:filter={elementFilterCss(el)}
                style:backdrop-filter={elementBackdropFilterCss(el)}
                style:border={borderCss(el.border)}
                style:outline={borderOutlineCss(el.border)}
                style:border-top={borderSideCss(el.border, 'top')}
                style:border-right={borderSideCss(el.border, 'right')}
                style:border-bottom={borderSideCss(el.border, 'bottom')}
                style:border-left={borderSideCss(el.border, 'left')}
                style:flex={layoutItemFlex(el, frame.autoLayout)}
                style:align-self={layoutItemAlignSelf(el)}
                style:display={autoLayoutDisplay(el.autoLayout)}
                style:flex-direction={el.autoLayout?.direction ?? undefined}
                style:gap={autoLayoutGap(el.autoLayout)}
                style:column-gap={autoLayoutColumnGap(el.autoLayout)}
                style:row-gap={autoLayoutRowGap(el.autoLayout)}
                style:grid-template-columns={autoLayoutGridColumns(el.autoLayout)}
                style:grid-template-rows={autoLayoutGridRows(el.autoLayout)}
                style:align-items={el.autoLayout ? (el.autoLayout.align === 'start' ? 'flex-start' : el.autoLayout.align === 'end' ? 'flex-end' : el.autoLayout.align) : undefined}
                style:justify-content={el.autoLayout ? (el.autoLayout.justify === 'start' || !el.autoLayout.justify ? 'flex-start' : el.autoLayout.justify === 'end' ? 'flex-end' : el.autoLayout.justify) : undefined}
                style:flex-wrap={el.autoLayout?.wrap ? 'wrap' : undefined}
                style:padding={el.autoLayout ? `${el.autoLayout.padding.t}px ${el.autoLayout.padding.r}px ${el.autoLayout.padding.b}px ${el.autoLayout.padding.l}px` : undefined}
              >
                {#if imageRenderSrc(el, $assetUrls, frame)}
                  <img
                    src={imageRenderSrc(el, $assetUrls, frame)}
                    alt={el.alt ?? ''}
                    class="el-image"
                    style:object-fit={el.objectFit ?? 'cover'}
                    style:object-position={objectPositionForElement(el)}
                    style:filter={cssFilterForElement(el)}
                    style:transform={mediaInternalTransformCss(el)}
                    draggable="false"
                  />
                {:else}
                  <div class="image-placeholder">
                    <span class="image-placeholder-icon">⊟</span>
                    <span class="image-placeholder-label">{imagePlaceholderLabel(el)}</span>
                  </div>
                {/if}
                {#if isPrimarySelectedEl && canEdit && isShapeManipulatorTarget(el)}
                  <button
                    type="button"
                    class="shape-manipulator shape-corner-control"
                    title="Drag to adjust shape corner radius"
                    aria-label="Adjust shape corner radius"
                    style:left="{Math.min(el.width / 2, cornerControlRadius(el))}px"
                    style:top="{Math.min(el.height / 2, cornerControlRadius(el))}px"
                    on:mousedown={(e) => startShapeCornerDrag(e, frame.id, el)}
                  ></button>
                  {#if el.shapeKind === 'ellipse'}
                    {@const arcStart = arcPoint(el, el.shapeArcStart ?? 0)}
                    {@const arcEnd = arcPoint(el, el.shapeArcEnd ?? 360)}
                    <button
                      type="button"
                      class="shape-manipulator shape-arc-control shape-arc-start"
                      title="Drag to adjust ellipse arc start"
                      aria-label="Adjust ellipse arc start"
                      style:left="{arcStart.x}px"
                      style:top="{arcStart.y}px"
                      on:mousedown={(e) => startShapeArcDrag(e, frame.id, el, 'start')}
                    ></button>
                    <button
                      type="button"
                      class="shape-manipulator shape-arc-control shape-arc-end"
                      title="Drag to adjust ellipse arc end"
                      aria-label="Adjust ellipse arc end"
                      style:left="{arcEnd.x}px"
                      style:top="{arcEnd.y}px"
                      on:mousedown={(e) => startShapeArcDrag(e, frame.id, el, 'end')}
                    ></button>
                  {/if}
                {/if}
                {#if isPrimarySelectedEl && el.isButton}
                  <button
                    type="button"
                    class="link-handle"
                    title="Drag to link this image-button to another page"
                    aria-label="Drag to link this image to a page"
                    on:mousedown={(e) => startLinkDrag(e, frame, el)}
                  >
                    <span class="link-handle-dot"></span>
                    <span class="link-handle-tip">drag to link page</span>
                  </button>
                {/if}
                {#if isPrimarySelectedEl && canEdit}
                  <div class="context-handle-row media-context-row" aria-label="Selected media quick actions">
                    <button type="button" aria-label={cropImageElementId === el.id ? 'Exit crop media mode' : 'Crop media on canvas'} on:mousedown|stopPropagation on:click|stopPropagation={() => onToggleImageCrop(el.id)}>
                      {cropImageElementId === el.id ? 'Done crop' : 'Crop media'}
                    </button>
                  </div>
                {/if}
                {#if isPrimarySelectedEl && cropImageElementId === el.id}
                  <div class="crop-mode-badge">Drag image to crop</div>
                  {#each ['nw', 'ne', 'se', 'sw'] as handle}
                    <button
                      type="button"
                      class="crop-handle crop-{handle}"
                      aria-label="Drag image crop handle {handle}"
                      on:mousedown|stopPropagation={(e) => startImageCropDrag(frame.id, el)}
                    ></button>
                  {/each}
                {/if}
                {#if isPrimarySelectedEl}
                  {#if el.autoLayout}
                    <button
                      type="button"
                      class="auto-layout-handle auto-layout-gap-handle"
                      aria-label="Drag element auto layout gap"
                      title="Drag to adjust Auto Layout gap"
                      on:mousedown={(e) => startAutoLayoutSpacingDrag(e, 'element', el.autoLayout!, 'gap', frame.id, el.id)}
                    >Gap {el.autoLayout.gap}</button>
                    {#each AUTO_LAYOUT_PADDING_SIDES as side}
                      <button
                        type="button"
                        class="auto-layout-handle padding-{side}"
                        aria-label="Drag element auto layout padding {side}"
                        title="Drag to adjust Auto Layout padding"
                        on:mousedown={(e) => startAutoLayoutSpacingDrag(e, 'element', el.autoLayout!, side, frame.id, el.id)}
                      >{el.autoLayout.padding[side]}</button>
                    {/each}
                  {/if}
                  {#each ROTATE_HANDLES as handle}
                    <button
                      type="button"
                      class="rotate-handle rotate-{handle}"
                      title="Rotate image from {handle} corner. Hold Shift to snap to 15° increments."
                      aria-label={handle === 'ne' ? 'Rotate selected image' : `Rotate selected image from ${handle} corner`}
                      on:mousedown={(e) => startElementRotate(e, frame, el)}
                    ></button>
                  {/each}
                  {#each RESIZE_HANDLES as handle}
                    <button
                      type="button"
                      class="resize-edge edge-{handle}"
                      title="Resize image {handle}"
                      aria-label="Resize selected image from {handle} handle"
                      style:cursor={handleCursor(handle)}
                      on:mousedown={(e) => startElementResize(e, frame, el, handle)}
                    ></button>
                  {/each}
                  <span class="resize-size-badge">{snapToGrid(el.width)} × {snapToGrid(el.height)}</span>
                {/if}
              </div>
            {:else}
              <div
                class="element"
                data-frame-id={frame.id}
                data-element-id={el.id}
                data-wireframe-label={wireframeLabel(el)}
                data-layer-label={wireframeLabel(el)}
                class:selected={isSelectedEl}
                class:primary-selected={isPrimarySelectedEl}
                class:is-button={el.isButton}
                class:is-text={el.type === 'text'}
                class:is-input={el.type === 'input'}
                class:is-textarea={el.type === 'textarea'}
                class:is-list={el.type === 'list'}
                class:is-iframe={el.type === 'iframe'}
                class:is-svg={el.type === 'svg'}
                class:is-vector={el.type === 'vector'}
                class:vector-editing={el.type === 'vector' && !!el.vectorEdit?.active}
                class:is-slice={el.type === 'slice'}
                class:is-shape={!!el.shapeKind}
                class:cropping={cropImageElementId === el.id}
                class:masked={!!el.mask && el.mask.enabled !== false}
                class:editing-inline={inlineEditId === el.id}
                class:cmd-deep-hover={cmdHoverId === el.id && !isSelectedEl}
                class:layer-tree-hover={hoveredElementId === el.id}
                style:position={participatesInAutoLayout(frame.autoLayout, el) ? 'relative' : undefined}
                style:left={participatesInAutoLayout(frame.autoLayout, el) ? undefined : `${el.x}px`}
                style:top={participatesInAutoLayout(frame.autoLayout, el) ? undefined : `${el.y}px`}
                style:width={layoutItemWidth(el, elementBoxWidth(el, frame.autoLayout?.align === 'stretch' && frame.autoLayout.direction === 'column' && participatesInAutoLayout(frame.autoLayout, el) ? 'auto' : `${el.width}px`))}
                style:height={layoutItemHeight(el, elementBoxHeight(el, frame.autoLayout?.align === 'stretch' && frame.autoLayout.direction === 'row' && participatesInAutoLayout(frame.autoLayout, el) ? 'auto' : `${el.height}px`))}
                style:background={effectBackgroundCss(el, el.type === 'slice' || el.shapeKind || hasMediaFill(el) || (el.isFrameBackground && frame.backgroundImage) ? 'transparent' : el.background)}
                style:background-image={el.isFrameBackground ? frameBackgroundImage(frame) : undefined}
                style:background-size={el.isFrameBackground && frame.backgroundImage ? frame.backgroundImageSize ?? 'cover' : undefined}
                style:background-repeat={el.isFrameBackground && frame.backgroundImage ? frame.backgroundImageRepeat ?? 'no-repeat' : undefined}
                style:background-position={el.isFrameBackground && frame.backgroundImage ? frame.backgroundImagePosition ?? 'center' : undefined}
                style:color={el.color}
                style:border-radius={borderRadiusCss(el)}
                style:transform={elementTransformCss(el)}
                style:transform-origin={elementTransformOrigin(el)}
                style:opacity={el.opacity ?? 1}
                style:mix-blend-mode={elementBlendMode(el)}
                style:box-shadow={effectBoxShadowCss(el)}
                style:filter={elementFilterCss(el)}
                style:backdrop-filter={elementBackdropFilterCss(el)}
                style:border={borderCss(el.border)}
                style:outline={borderOutlineCss(el.border)}
                style:border-top={borderSideCss(el.border, 'top')}
                style:border-right={borderSideCss(el.border, 'right')}
                style:border-bottom={borderSideCss(el.border, 'bottom')}
                style:border-left={borderSideCss(el.border, 'left')}
                style:flex={layoutItemFlex(el, frame.autoLayout)}
                style:align-self={layoutItemAlignSelf(el)}
                style:display={autoLayoutDisplay(el.autoLayout)}
                style:flex-direction={el.autoLayout?.direction ?? undefined}
                style:gap={autoLayoutGap(el.autoLayout)}
                style:column-gap={autoLayoutColumnGap(el.autoLayout)}
                style:row-gap={autoLayoutRowGap(el.autoLayout)}
                style:grid-template-columns={autoLayoutGridColumns(el.autoLayout)}
                style:grid-template-rows={autoLayoutGridRows(el.autoLayout)}
                style:align-items={el.autoLayout ? (el.autoLayout.align === 'start' ? 'flex-start' : el.autoLayout.align === 'end' ? 'flex-end' : el.autoLayout.align) : undefined}
                style:justify-content={el.autoLayout ? (el.autoLayout.justify === 'start' || !el.autoLayout.justify ? 'flex-start' : el.autoLayout.justify === 'end' ? 'flex-end' : el.autoLayout.justify) : undefined}
                style:flex-wrap={el.autoLayout?.wrap ? 'wrap' : undefined}
                style:padding={el.autoLayout ? `${el.autoLayout.padding.t}px ${el.autoLayout.padding.r}px ${el.autoLayout.padding.b}px ${el.autoLayout.padding.l}px` : undefined}
                style:font-size="{resolvedFontSize(el)}px"
                style:font-weight={el.fontWeight}
                style:letter-spacing={el.letterSpacing !== undefined ? `${el.letterSpacing}em` : ''}
                style:line-height={el.lineHeight !== undefined ? String(el.lineHeight) : ''}
                style:text-decoration={el.textDecoration && el.textDecoration !== 'none' ? el.textDecoration : ''}
                style:text-transform={el.textTransform && el.textTransform !== 'none' ? el.textTransform : ''}
                style:text-align={textAlignCss(el)}
                style:font-variant-caps={el.smallCaps || el.textCase === 'small-caps' ? 'small-caps' : undefined}
                style:hanging-punctuation={el.hangingPunctuation ? 'first last' : undefined}
                style:font-feature-settings={el.openTypeSettings}
                style:text-indent={el.paragraphIndent !== undefined ? `${el.paragraphIndent}px` : undefined}
                style:margin-block-end={el.paragraphSpacing !== undefined ? `${el.paragraphSpacing}px` : undefined}
                style:text-shadow={textShadowCss(el.textShadow)}
                style:overflow={hasMediaFill(el) && el.type === 'section' ? 'hidden' : textBoxOverflow(el)}
              >
                {#if el.type === 'slice'}
                  <span class="slice-label">{el.name || el.filename || 'Slice'}</span>
                  <span class="slice-size">{snapToGrid(el.width)} x {snapToGrid(el.height)}</span>
                {:else if el.shapeKind}
                  <!-- Vector shape (item 45) — inline SVG filling the element box. -->
                  <svg
                    class="shape-svg"
                    viewBox="0 0 {el.width} {el.height}"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    {#if imageRenderSrc(el, $assetUrls, frame)}
                      <defs>
                        <pattern id={mediaFillPatternId(el)} patternUnits="userSpaceOnUse" width={el.width} height={el.height}>
                          <image
                            href={imageRenderSrc(el, $assetUrls, frame)}
                            width={el.width}
                            height={el.height}
                            preserveAspectRatio={mediaFillObjectFit(el) === 'contain' ? 'xMidYMid meet' : mediaFillObjectFit(el) === 'fill' ? 'none' : 'xMidYMid slice'}
                          />
                        </pattern>
                      </defs>
                      <path d={shapePath(el.shapeKind, el.width, el.height, el.shapeSides, el.shapeInnerRatio, el.shapeCornerRadius, el.shapeArcStart, el.shapeArcEnd)} fill={'url(#' + mediaFillPatternId(el) + ')'} stroke={el.border?.color ?? 'none'} stroke-width={el.border?.width ?? 0} stroke-linecap={strokeCap(el.border)} stroke-dasharray={strokeDashArray(el.border)} />
                    {:else}
                      <path d={shapePath(el.shapeKind, el.width, el.height, el.shapeSides, el.shapeInnerRatio, el.shapeCornerRadius, el.shapeArcStart, el.shapeArcEnd)} fill={el.background} stroke={el.border?.color ?? 'none'} stroke-width={el.border?.width ?? 0} stroke-linecap={strokeCap(el.border)} stroke-dasharray={strokeDashArray(el.border)} />
                    {/if}
                  </svg>
                {:else if el.type === 'section' && imageRenderSrc(el, $assetUrls, frame)}
                  <img
                    src={imageRenderSrc(el, $assetUrls, frame)}
                    alt={mediaFillForElement(el)?.alt ?? ''}
                    class="media-fill-image"
                    style:object-fit={mediaFillObjectFit(el)}
                    style:object-position={mediaFillObjectPosition(el)}
                    style:filter={cssFilterForElement({ mediaTransform: mediaFillForElement(el)?.transform })}
                    style:transform={mediaInternalTransformCss(el)}
                    draggable="false"
                  />
                {:else if el.type === 'vector'}
                  <svg class="vector-svg" viewBox="0 0 {el.width} {el.height}" preserveAspectRatio="none" aria-hidden="true">
                    <path d={el.vectorPath || 'M 0 0 L 1 1'} fill="none" stroke={vectorStrokeColor(el)} stroke-width={vectorStrokeWidth(el)} stroke-linecap={strokeCap(el.border)} stroke-linejoin="round" stroke-dasharray={strokeDashArray(el.border)} />
                  </svg>
                  {#if isPrimarySelectedEl && el.vectorEdit?.active}
                    <div class="context-handle-row vector-context-row" aria-label="Vector edit quick actions">
                      <button type="button" aria-label="Vector variable width quick action" on:mousedown|stopPropagation on:click|stopPropagation={() => onUpdateElement(frame.id, el.id, { vectorEdit: { ...(el.vectorEdit ?? {}), active: true, tool: 'variable-width' } })}>Width</button>
                      <button type="button" aria-label="Vector shape builder quick action" on:mousedown|stopPropagation on:click|stopPropagation={() => onUpdateElement(frame.id, el.id, { vectorEdit: { ...(el.vectorEdit ?? {}), active: true, tool: 'shape-builder' } })}>Builder</button>
                      <button type="button" aria-label="Vector paint quick action" on:mousedown|stopPropagation on:click|stopPropagation={() => onUpdateElement(frame.id, el.id, { vectorEdit: { ...(el.vectorEdit ?? {}), active: true, tool: 'paint' } })}>Paint</button>
                    </div>
                    <div class="vector-edit-badge">{vectorEditLabel(el)}</div>
                  {/if}
                {:else if el.type === 'list'}
                  <!-- Live list preview: render bullets/numbers matching listKind -->
                  {#if el.listKind === 'ol'}
                    <ol class="el-list">
                      {#each (el.content || '').split('\n').map(s => s.trim()).filter(Boolean) as item}
                        <li>{item}</li>
                      {/each}
                    </ol>
                  {:else}
                    <ul class="el-list">
                      {#each (el.content || '').split('\n').map(s => s.trim()).filter(Boolean) as item}
                        <li>{item}</li>
                      {/each}
                    </ul>
                  {/if}
                {:else if el.type === 'iframe'}
                  <div class="iframe-placeholder">
                    <span class="iframe-placeholder-icon">⊞</span>
                    <span class="iframe-placeholder-label">iframe</span>
                    <span class="iframe-placeholder-src">{el.iframeSrc || 'about:blank'}</span>
                  </div>
                {:else if el.type === 'svg'}
                  <div class="svg-content" style:filter={cssFilterForElement(el)}>
                    {@html el.svgMarkup ?? ''}
                  </div>
                {:else}
                  <span
                    class="el-content"
                    style:overflow={textContentOverflow(el)}
                    style:text-overflow={textEllipsis(el)}
                    style:white-space={textWhiteSpace(el)}
                    style:overflow-wrap={textWordBreak(el)}
                    style:word-break={textWordBreak(el)}
                    style:width={textContentWidth(el)}
                  ><InlineText content={el.content} runs={el.type === 'text' ? el.textRuns : undefined} /></span>
                {/if}
                {#if isPrimarySelectedEl && canEdit && isShapeManipulatorTarget(el)}
                  <button
                    type="button"
                    class="shape-manipulator shape-corner-control"
                    title="Drag to adjust shape corner radius"
                    aria-label="Adjust shape corner radius"
                    style:left="{Math.min(el.width / 2, cornerControlRadius(el))}px"
                    style:top="{Math.min(el.height / 2, cornerControlRadius(el))}px"
                    on:mousedown={(e) => startShapeCornerDrag(e, frame.id, el)}
                  ></button>
                  {#if el.shapeKind === 'ellipse'}
                    {@const arcStart = arcPoint(el, el.shapeArcStart ?? 0)}
                    {@const arcEnd = arcPoint(el, el.shapeArcEnd ?? 360)}
                    <button
                      type="button"
                      class="shape-manipulator shape-arc-control shape-arc-start"
                      title="Drag to adjust ellipse arc start"
                      aria-label="Adjust ellipse arc start"
                      style:left="{arcStart.x}px"
                      style:top="{arcStart.y}px"
                      on:mousedown={(e) => startShapeArcDrag(e, frame.id, el, 'start')}
                    ></button>
                    <button
                      type="button"
                      class="shape-manipulator shape-arc-control shape-arc-end"
                      title="Drag to adjust ellipse arc end"
                      aria-label="Adjust ellipse arc end"
                      style:left="{arcEnd.x}px"
                      style:top="{arcEnd.y}px"
                      on:mousedown={(e) => startShapeArcDrag(e, frame.id, el, 'end')}
                    ></button>
                  {/if}
                {/if}
                {#if isPrimarySelectedEl && el.isButton}
                  <button
                    type="button"
                    class="link-handle"
                    title="Drag to link this button to another HTML page frame"
                    aria-label="Drag to link this button to another page frame"
                    on:mousedown={(e) => startLinkDrag(e, frame, el)}
                  >
                    <span class="link-handle-dot"></span>
                    <span class="link-handle-tip">drag to link page</span>
                  </button>
                {/if}
                {#if isPrimarySelectedEl && canEdit && mediaFillForElement(el)}
                  <div class="context-handle-row media-context-row" aria-label="Selected media fill quick actions">
                    <button type="button" aria-label={cropImageElementId === el.id ? 'Exit media fill crop mode on canvas' : 'Crop media fill on canvas'} on:mousedown|stopPropagation on:click|stopPropagation={() => onToggleImageCrop(el.id)}>
                      {cropImageElementId === el.id ? 'Done crop' : 'Crop fill'}
                    </button>
                  </div>
                {/if}
                {#if isPrimarySelectedEl && cropImageElementId === el.id && mediaFillForElement(el)}
                  <div class="crop-mode-badge">Drag media fill to crop</div>
                  {#each ['nw', 'ne', 'se', 'sw'] as handle}
                    <button
                      type="button"
                      class="crop-handle crop-{handle}"
                      aria-label="Drag media fill crop handle {handle}"
                      on:mousedown|stopPropagation={(e) => startImageCropDrag(frame.id, el)}
                    ></button>
                  {/each}
                {/if}
                {#if isPrimarySelectedEl}
                  {#if el.autoLayout}
                    <button
                      type="button"
                      class="auto-layout-handle auto-layout-gap-handle"
                      aria-label="Drag element auto layout gap"
                      title="Drag to adjust Auto Layout gap"
                      on:mousedown={(e) => startAutoLayoutSpacingDrag(e, 'element', el.autoLayout!, 'gap', frame.id, el.id)}
                    >Gap {el.autoLayout.gap}</button>
                    {#each AUTO_LAYOUT_PADDING_SIDES as side}
                      <button
                        type="button"
                        class="auto-layout-handle padding-{side}"
                        aria-label="Drag element auto layout padding {side}"
                        title="Drag to adjust Auto Layout padding"
                        on:mousedown={(e) => startAutoLayoutSpacingDrag(e, 'element', el.autoLayout!, side, frame.id, el.id)}
                      >{el.autoLayout.padding[side]}</button>
                    {/each}
                  {/if}
                  {#each ROTATE_HANDLES as handle}
                    <button
                      type="button"
                      class="rotate-handle rotate-{handle}"
                      title="Rotate from {handle} corner. Hold Shift to snap to 15° increments."
                      aria-label={handle === 'ne' ? 'Rotate selected element' : `Rotate selected element from ${handle} corner`}
                      on:mousedown={(e) => startElementRotate(e, frame, el)}
                    ></button>
                  {/each}
                  {#each RESIZE_HANDLES as handle}
                    <button
                      type="button"
                      class="resize-edge edge-{handle}"
                      title="Resize {handle}"
                      aria-label="Resize selected element from {handle} handle"
                      style:cursor={handleCursor(handle)}
                      on:mousedown={(e) => startElementResize(e, frame, el, handle)}
                    ></button>
                  {/each}
                  <span class="resize-size-badge">{snapToGrid(el.width)} × {snapToGrid(el.height)}</span>
                {/if}
              </div>
            {/if}
          {/each}

          {#if isActiveFrame && state.selectedFrameIds.length <= 1 && !state.selectedElementId && state.selectedElementIds.length === 0}
            {#if frame.autoLayout}
              <button
                type="button"
                class="auto-layout-handle auto-layout-gap-handle"
                aria-label="Drag frame auto layout gap"
                title="Drag to adjust Auto Layout gap"
                on:mousedown={(e) => startAutoLayoutSpacingDrag(e, 'frame', frame.autoLayout!, 'gap', frame.id)}
              >Gap {frame.autoLayout.gap}</button>
              {#each AUTO_LAYOUT_PADDING_SIDES as side}
                <button
                  type="button"
                  class="auto-layout-handle padding-{side}"
                  aria-label="Drag frame auto layout padding {side}"
                  title="Drag to adjust Auto Layout padding"
                  on:mousedown={(e) => startAutoLayoutSpacingDrag(e, 'frame', frame.autoLayout!, side, frame.id)}
                >{frame.autoLayout.padding[side]}</button>
              {/each}
            {/if}
            {#each ROTATE_HANDLES as handle}
              <button
                type="button"
                class="rotate-handle rotate-{handle}"
                title="Rotate frame from {handle} corner. Hold Shift to snap to 15° increments."
                aria-label={handle === 'ne' ? 'Rotate selected frame' : `Rotate selected frame from ${handle} corner`}
                on:mousedown={(e) => startFrameRotate(e, frame)}
              ></button>
            {/each}
            {#each RESIZE_HANDLES as handle}
              <button
                type="button"
                class="resize-edge edge-{handle}"
                title="Resize frame {handle}"
                aria-label="Resize selected frame from {handle} handle"
                style:cursor={handleCursor(handle)}
                on:mousedown={(e) => startFrameResize(e, frame, handle)}
              ></button>
            {/each}
          {/if}
        </div>
      </div>
    {/each}

    <!-- Orphan (canvas-level) elements -->
    {#each state.orphanElements as el (el.id)}
      {@const isPrimarySelectedEl = el.id === state.selectedElementId}
      {@const isSelectedEl = isPrimarySelectedEl || selectedElementIdSet.has(el.id)}
      {#if el.hidden}
        <!-- Hidden orphan — not rendered on canvas. -->
      {:else if el.type === 'image'}
        <div
          class="element is-image orphan-element"
          data-element-id={el.id}
          data-wireframe-label={wireframeLabel(el)}
          data-layer-label={wireframeLabel(el)}
          class:selected={isSelectedEl}
          class:primary-selected={isPrimarySelectedEl}
          class:cropping={cropImageElementId === el.id}
          class:masked={!!el.mask && el.mask.enabled !== false}
          class:cmd-deep-hover={cmdHoverId === el.id && !isSelectedEl}
          class:layer-tree-hover={hoveredOrphanId === el.id || hoveredElementId === el.id}
          style:left="{el.x}px"
          style:top="{el.y}px"
          style:width={elementBoxWidth(el, `${el.width}px`)}
          style:height={elementBoxHeight(el, `${el.height}px`)}
          style:background={effectBackgroundCss(el, 'transparent')}
          style:border-radius={borderRadiusCss(el)}
          style:transform={elementTransformCss(el)}
          style:transform-origin={elementTransformOrigin(el)}
          style:opacity={el.opacity ?? 1}
          style:mix-blend-mode={elementBlendMode(el)}
          style:box-shadow={effectBoxShadowCss(el)}
          style:filter={elementFilterCss(el)}
          style:backdrop-filter={elementBackdropFilterCss(el)}
          style:border={borderCss(el.border)}
          style:outline={borderOutlineCss(el.border)}
          style:border-top={borderSideCss(el.border, 'top')}
          style:border-right={borderSideCss(el.border, 'right')}
          style:border-bottom={borderSideCss(el.border, 'bottom')}
          style:border-left={borderSideCss(el.border, 'left')}
          style:display={autoLayoutDisplay(el.autoLayout)}
          style:flex-direction={el.autoLayout?.direction ?? undefined}
          style:gap={autoLayoutGap(el.autoLayout)}
          style:column-gap={autoLayoutColumnGap(el.autoLayout)}
          style:row-gap={autoLayoutRowGap(el.autoLayout)}
          style:grid-template-columns={autoLayoutGridColumns(el.autoLayout)}
          style:grid-template-rows={autoLayoutGridRows(el.autoLayout)}
          style:align-items={el.autoLayout ? (el.autoLayout.align === 'start' ? 'flex-start' : el.autoLayout.align === 'end' ? 'flex-end' : el.autoLayout.align) : textVerticalAlignCss(el)}
          style:justify-content={el.autoLayout ? (el.autoLayout.justify === 'start' || !el.autoLayout.justify ? 'flex-start' : el.autoLayout.justify === 'end' ? 'flex-end' : el.autoLayout.justify) : textJustifyCss(el)}
          style:flex-wrap={el.autoLayout?.wrap ? 'wrap' : undefined}
          style:padding={el.autoLayout ? `${el.autoLayout.padding.t}px ${el.autoLayout.padding.r}px ${el.autoLayout.padding.b}px ${el.autoLayout.padding.l}px` : undefined}
          title="Loose image — drag onto a frame to attach"
        >
          {#if imageRenderSrc(el, $assetUrls, null)}
            <img
              src={imageRenderSrc(el, $assetUrls, null)}
              alt={el.alt ?? ''}
              class="el-image"
              style:object-fit={el.objectFit ?? 'cover'}
              style:object-position={objectPositionForElement(el)}
              style:filter={cssFilterForElement(el)}
              style:transform={mediaInternalTransformCss(el)}
              draggable="false"
            />
          {:else}
            <div class="image-placeholder">
              <span class="image-placeholder-icon">⊟</span>
              <span class="image-placeholder-label">{imagePlaceholderLabel(el)}</span>
            </div>
          {/if}
          {#if isPrimarySelectedEl && cropImageElementId === el.id}
            <div class="crop-mode-badge">Drag image to crop</div>
            {#each ['nw', 'ne', 'se', 'sw'] as handle}
              <button
                type="button"
                class="crop-handle crop-{handle}"
                aria-label="Drag image crop handle {handle}"
                on:mousedown|stopPropagation={(e) => startImageCropDrag(null, el)}
              ></button>
            {/each}
          {/if}
          {#if isPrimarySelectedEl && canEdit}
            <div class="context-handle-row media-context-row" aria-label="Selected media quick actions">
              <button type="button" aria-label={cropImageElementId === el.id ? 'Exit crop media mode' : 'Crop media on canvas'} on:mousedown|stopPropagation on:click|stopPropagation={() => onToggleImageCrop(el.id)}>
                {cropImageElementId === el.id ? 'Done crop' : 'Crop media'}
              </button>
            </div>
          {/if}
          {#if isPrimarySelectedEl}
            {#if el.autoLayout}
              <button
                type="button"
                class="auto-layout-handle auto-layout-gap-handle"
                aria-label="Drag orphan auto layout gap"
                title="Drag to adjust Auto Layout gap"
                on:mousedown={(e) => startAutoLayoutSpacingDrag(e, 'orphan', el.autoLayout!, 'gap', null, el.id)}
              >Gap {el.autoLayout.gap}</button>
              {#each AUTO_LAYOUT_PADDING_SIDES as side}
                <button
                  type="button"
                  class="auto-layout-handle padding-{side}"
                  aria-label="Drag orphan auto layout padding {side}"
                  title="Drag to adjust Auto Layout padding"
                  on:mousedown={(e) => startAutoLayoutSpacingDrag(e, 'orphan', el.autoLayout!, side, null, el.id)}
                >{el.autoLayout.padding[side]}</button>
              {/each}
            {/if}
            {#each ROTATE_HANDLES as handle}
              <button
                type="button"
                class="rotate-handle rotate-{handle}"
                title="Rotate orphan image from {handle} corner. Hold Shift to snap to 15° increments."
                aria-label={handle === 'ne' ? 'Rotate orphan image' : `Rotate orphan image from ${handle} corner`}
                on:mousedown={(e) => startOrphanRotate(e, el)}
              ></button>
            {/each}
            {#each RESIZE_HANDLES as handle}
              <button
                type="button"
                class="resize-edge edge-{handle}"
                title="Resize image {handle}"
                aria-label="Resize orphan image from {handle} handle"
                style:cursor={handleCursor(handle)}
                on:mousedown={(e) => startOrphanResize(e, el, handle)}
              ></button>
            {/each}
            <span class="resize-size-badge">{snapToGrid(el.width)} × {snapToGrid(el.height)}</span>
          {/if}
        </div>
      {:else}
        <div
          class="element orphan-element"
          data-element-id={el.id}
          data-wireframe-label={wireframeLabel(el)}
          data-layer-label={wireframeLabel(el)}
          class:selected={isSelectedEl}
          class:primary-selected={isPrimarySelectedEl}
          class:is-button={el.isButton}
          class:is-text={el.type === 'text'}
          class:is-input={el.type === 'input'}
          class:is-textarea={el.type === 'textarea'}
          class:is-list={el.type === 'list'}
          class:is-iframe={el.type === 'iframe'}
          class:is-svg={el.type === 'svg'}
          class:is-vector={el.type === 'vector'}
          class:vector-editing={el.type === 'vector' && !!el.vectorEdit?.active}
          class:is-slice={el.type === 'slice'}
          class:is-shape={!!el.shapeKind}
          class:cropping={cropImageElementId === el.id}
          class:masked={!!el.mask && el.mask.enabled !== false}
          class:editing-inline={inlineEditId === el.id}
          class:cmd-deep-hover={cmdHoverId === el.id && !isSelectedEl}
          class:layer-tree-hover={hoveredOrphanId === el.id || hoveredElementId === el.id}
          style:left="{el.x}px"
          style:top="{el.y}px"
          style:width={elementBoxWidth(el, `${el.width}px`)}
          style:height={elementBoxHeight(el, `${el.height}px`)}
          style:background={effectBackgroundCss(el, el.type === 'slice' || el.shapeKind || hasMediaFill(el) ? 'transparent' : el.background)}
          style:color={el.color}
          style:border-radius={borderRadiusCss(el)}
          style:transform={elementTransformCss(el)}
          style:transform-origin={elementTransformOrigin(el)}
          style:opacity={el.opacity ?? 1}
          style:mix-blend-mode={elementBlendMode(el)}
          style:box-shadow={effectBoxShadowCss(el)}
          style:filter={elementFilterCss(el)}
          style:backdrop-filter={elementBackdropFilterCss(el)}
          style:border={borderCss(el.border)}
          style:outline={borderOutlineCss(el.border)}
          style:border-top={borderSideCss(el.border, 'top')}
          style:border-right={borderSideCss(el.border, 'right')}
          style:border-bottom={borderSideCss(el.border, 'bottom')}
          style:border-left={borderSideCss(el.border, 'left')}
          style:display={autoLayoutDisplay(el.autoLayout)}
          style:flex-direction={el.autoLayout?.direction ?? undefined}
          style:gap={autoLayoutGap(el.autoLayout)}
          style:column-gap={autoLayoutColumnGap(el.autoLayout)}
          style:row-gap={autoLayoutRowGap(el.autoLayout)}
          style:grid-template-columns={autoLayoutGridColumns(el.autoLayout)}
          style:grid-template-rows={autoLayoutGridRows(el.autoLayout)}
          style:align-items={el.autoLayout ? (el.autoLayout.align === 'start' ? 'flex-start' : el.autoLayout.align === 'end' ? 'flex-end' : el.autoLayout.align) : undefined}
          style:justify-content={el.autoLayout ? (el.autoLayout.justify === 'start' || !el.autoLayout.justify ? 'flex-start' : el.autoLayout.justify === 'end' ? 'flex-end' : el.autoLayout.justify) : undefined}
          style:flex-wrap={el.autoLayout?.wrap ? 'wrap' : undefined}
          style:padding={el.autoLayout ? `${el.autoLayout.padding.t}px ${el.autoLayout.padding.r}px ${el.autoLayout.padding.b}px ${el.autoLayout.padding.l}px` : undefined}
          style:font-size="{resolvedFontSize(el)}px"
          style:font-weight={el.fontWeight}
          style:text-align={textAlignCss(el)}
          style:font-variant-caps={el.smallCaps || el.textCase === 'small-caps' ? 'small-caps' : undefined}
          style:hanging-punctuation={el.hangingPunctuation ? 'first last' : undefined}
          style:font-feature-settings={el.openTypeSettings}
          style:text-indent={el.paragraphIndent !== undefined ? `${el.paragraphIndent}px` : undefined}
          style:overflow={hasMediaFill(el) && el.type === 'section' ? 'hidden' : textBoxOverflow(el)}
          title="Loose element — drag onto a frame to attach"
        >
          {#if el.type === 'slice'}
            <span class="slice-label">{el.name || el.filename || 'Slice'}</span>
            <span class="slice-size">{snapToGrid(el.width)} x {snapToGrid(el.height)}</span>
          {:else if el.shapeKind}
            <svg
              class="shape-svg"
              viewBox="0 0 {el.width} {el.height}"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {#if imageRenderSrc(el, $assetUrls, null)}
                <defs>
                  <pattern id={mediaFillPatternId(el)} patternUnits="userSpaceOnUse" width={el.width} height={el.height}>
                    <image
                      href={imageRenderSrc(el, $assetUrls, null)}
                      width={el.width}
                      height={el.height}
                      preserveAspectRatio={mediaFillObjectFit(el) === 'contain' ? 'xMidYMid meet' : mediaFillObjectFit(el) === 'fill' ? 'none' : 'xMidYMid slice'}
                    />
                  </pattern>
                </defs>
                <path d={shapePath(el.shapeKind, el.width, el.height, el.shapeSides, el.shapeInnerRatio, el.shapeCornerRadius, el.shapeArcStart, el.shapeArcEnd)} fill={'url(#' + mediaFillPatternId(el) + ')'} stroke={el.border?.color ?? 'none'} stroke-width={el.border?.width ?? 0} stroke-linecap={strokeCap(el.border)} stroke-dasharray={strokeDashArray(el.border)} />
              {:else}
                <path d={shapePath(el.shapeKind, el.width, el.height, el.shapeSides, el.shapeInnerRatio, el.shapeCornerRadius, el.shapeArcStart, el.shapeArcEnd)} fill={el.background} stroke={el.border?.color ?? 'none'} stroke-width={el.border?.width ?? 0} stroke-linecap={strokeCap(el.border)} stroke-dasharray={strokeDashArray(el.border)} />
              {/if}
            </svg>
          {:else if el.type === 'section' && imageRenderSrc(el, $assetUrls, null)}
            <img
              src={imageRenderSrc(el, $assetUrls, null)}
              alt={mediaFillForElement(el)?.alt ?? ''}
              class="media-fill-image"
              style:object-fit={mediaFillObjectFit(el)}
              style:object-position={mediaFillObjectPosition(el)}
              style:filter={cssFilterForElement({ mediaTransform: mediaFillForElement(el)?.transform })}
              style:transform={mediaInternalTransformCss(el)}
              draggable="false"
            />
          {:else if el.type === 'vector'}
            <svg class="vector-svg" viewBox="0 0 {el.width} {el.height}" preserveAspectRatio="none" aria-hidden="true">
              <path d={el.vectorPath || 'M 0 0 L 1 1'} fill="none" stroke={vectorStrokeColor(el)} stroke-width={vectorStrokeWidth(el)} stroke-linecap={strokeCap(el.border)} stroke-linejoin="round" stroke-dasharray={strokeDashArray(el.border)} />
            </svg>
            {#if isPrimarySelectedEl && el.vectorEdit?.active}
              <div class="context-handle-row vector-context-row" aria-label="Vector edit quick actions">
                <button type="button" aria-label="Vector variable width quick action" on:mousedown|stopPropagation on:click|stopPropagation={() => onUpdateOrphan(el.id, { vectorEdit: { ...(el.vectorEdit ?? {}), active: true, tool: 'variable-width' } })}>Width</button>
                <button type="button" aria-label="Vector shape builder quick action" on:mousedown|stopPropagation on:click|stopPropagation={() => onUpdateOrphan(el.id, { vectorEdit: { ...(el.vectorEdit ?? {}), active: true, tool: 'shape-builder' } })}>Builder</button>
                <button type="button" aria-label="Vector paint quick action" on:mousedown|stopPropagation on:click|stopPropagation={() => onUpdateOrphan(el.id, { vectorEdit: { ...(el.vectorEdit ?? {}), active: true, tool: 'paint' } })}>Paint</button>
              </div>
              <div class="vector-edit-badge">{vectorEditLabel(el)}</div>
            {/if}
          {:else if el.type === 'list'}
            {#if el.listKind === 'ol'}
              <ol class="el-list">
                {#each (el.content || '').split('\n').map(s => s.trim()).filter(Boolean) as item}
                  <li>{item}</li>
                {/each}
              </ol>
            {:else}
              <ul class="el-list">
                {#each (el.content || '').split('\n').map(s => s.trim()).filter(Boolean) as item}
                  <li>{item}</li>
                {/each}
              </ul>
            {/if}
          {:else if el.type === 'iframe'}
            <div class="iframe-placeholder">
              <span class="iframe-placeholder-icon">⊞</span>
              <span class="iframe-placeholder-label">iframe</span>
              <span class="iframe-placeholder-src">{el.iframeSrc || 'about:blank'}</span>
            </div>
          {:else if el.type === 'svg'}
            <div class="svg-content" style:filter={cssFilterForElement(el)}>
              {@html el.svgMarkup ?? ''}
            </div>
          {:else}
            <span
              class="el-content"
              style:overflow={textContentOverflow(el)}
              style:text-overflow={textEllipsis(el)}
              style:white-space={textWhiteSpace(el)}
              style:overflow-wrap={textWordBreak(el)}
              style:word-break={textWordBreak(el)}
              style:width={textContentWidth(el)}
            ><InlineText content={el.content} runs={el.type === 'text' ? el.textRuns : undefined} /></span>
          {/if}
          {#if isPrimarySelectedEl && canEdit && isShapeManipulatorTarget(el)}
            <button
              type="button"
              class="shape-manipulator shape-corner-control"
              title="Drag to adjust shape corner radius"
              aria-label="Adjust shape corner radius"
              style:left="{Math.min(el.width / 2, cornerControlRadius(el))}px"
              style:top="{Math.min(el.height / 2, cornerControlRadius(el))}px"
              on:mousedown={(e) => startShapeCornerDrag(e, null, el)}
            ></button>
            {#if el.shapeKind === 'ellipse'}
              {@const arcStart = arcPoint(el, el.shapeArcStart ?? 0)}
              {@const arcEnd = arcPoint(el, el.shapeArcEnd ?? 360)}
              <button
                type="button"
                class="shape-manipulator shape-arc-control shape-arc-start"
                title="Drag to adjust ellipse arc start"
                aria-label="Adjust ellipse arc start"
                style:left="{arcStart.x}px"
                style:top="{arcStart.y}px"
                on:mousedown={(e) => startShapeArcDrag(e, null, el, 'start')}
              ></button>
              <button
                type="button"
                class="shape-manipulator shape-arc-control shape-arc-end"
                title="Drag to adjust ellipse arc end"
                aria-label="Adjust ellipse arc end"
                style:left="{arcEnd.x}px"
                style:top="{arcEnd.y}px"
                on:mousedown={(e) => startShapeArcDrag(e, null, el, 'end')}
              ></button>
            {/if}
          {/if}
          {#if isPrimarySelectedEl && el.isButton}
            <button
              type="button"
              class="link-handle"
              title="Drag to link this button to a page frame"
              aria-label="Drag to link orphan button to a page frame"
              on:mousedown={(e) => startLinkDrag(e, null, el)}
            >
              <span class="link-handle-dot"></span>
              <span class="link-handle-tip">drag to link page</span>
            </button>
          {/if}
          {#if isPrimarySelectedEl && canEdit && mediaFillForElement(el)}
            <div class="context-handle-row media-context-row" aria-label="Selected media fill quick actions">
              <button type="button" aria-label={cropImageElementId === el.id ? 'Exit media fill crop mode on canvas' : 'Crop media fill on canvas'} on:mousedown|stopPropagation on:click|stopPropagation={() => onToggleImageCrop(el.id)}>
                {cropImageElementId === el.id ? 'Done crop' : 'Crop fill'}
              </button>
            </div>
          {/if}
          {#if isPrimarySelectedEl && cropImageElementId === el.id && mediaFillForElement(el)}
            <div class="crop-mode-badge">Drag media fill to crop</div>
            {#each ['nw', 'ne', 'se', 'sw'] as handle}
              <button
                type="button"
                class="crop-handle crop-{handle}"
                aria-label="Drag media fill crop handle {handle}"
                on:mousedown|stopPropagation={(e) => startImageCropDrag(null, el)}
              ></button>
            {/each}
          {/if}
          {#if isPrimarySelectedEl}
            {#if el.autoLayout}
              <button
                type="button"
                class="auto-layout-handle auto-layout-gap-handle"
                aria-label="Drag orphan auto layout gap"
                title="Drag to adjust Auto Layout gap"
                on:mousedown={(e) => startAutoLayoutSpacingDrag(e, 'orphan', el.autoLayout!, 'gap', null, el.id)}
              >Gap {el.autoLayout.gap}</button>
              {#each AUTO_LAYOUT_PADDING_SIDES as side}
                <button
                  type="button"
                  class="auto-layout-handle padding-{side}"
                  aria-label="Drag orphan auto layout padding {side}"
                  title="Drag to adjust Auto Layout padding"
                  on:mousedown={(e) => startAutoLayoutSpacingDrag(e, 'orphan', el.autoLayout!, side, null, el.id)}
                >{el.autoLayout.padding[side]}</button>
              {/each}
            {/if}
            {#each ROTATE_HANDLES as handle}
              <button
                type="button"
                class="rotate-handle rotate-{handle}"
                title="Rotate orphan element from {handle} corner. Hold Shift to snap to 15° increments."
                aria-label={handle === 'ne' ? 'Rotate orphan element' : `Rotate orphan element from ${handle} corner`}
                on:mousedown={(e) => startOrphanRotate(e, el)}
              ></button>
            {/each}
            {#each RESIZE_HANDLES as handle}
              <button
                type="button"
                class="resize-edge edge-{handle}"
                title="Resize {handle}"
                aria-label="Resize orphan element from {handle} handle"
                style:cursor={handleCursor(handle)}
                on:mousedown={(e) => startOrphanResize(e, el, handle)}
              ></button>
            {/each}
            <span class="resize-size-badge">{snapToGrid(el.width)} × {snapToGrid(el.height)}</span>
          {/if}
        </div>
      {/if}
    {/each}

    {#if commentPins.length > 0}
      <div class="comment-pin-layer" aria-label="Sticky comments">
        {#each commentPins as pin (pin.id)}
          <button
            type="button"
            class="comment-pin"
            class:comment-pin-unsynced={pin.status === 'local' || pin.status === 'queued' || pin.status === 'syncing'}
            class:comment-pin-error={pin.status === 'failed'}
            style:left="{pin.x}px"
            style:top="{pin.y}px"
            title="{pin.label} · {commentStatusLabel(pin.status)}"
            aria-label="Open comment: {pin.label}"
            on:mousedown|stopPropagation
            on:click|stopPropagation={() => onOpenComment(pin.id)}
          >
            <span></span>
          </button>
        {/each}
      </div>
    {/if}

    {#if tabOrderOverlay}
      <div class="tab-order-overlay" aria-hidden="true">
        {#each tabOrderItems as item (item.id)}
          <div
            class="tab-order-badge"
            style:left="{item.worldX}px"
            style:top="{item.worldY}px"
            title={tabOrderSummary(item, state.frames)}
          >
            <span>{item.order}</span>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Smart alignment guides (item 41) — 1 px world-space lines drawn while dragging -->
    {#if activeGuides.length > 0}
      {#each activeGuides as g, i (i)}
        {#if g.kind === 'v'}
          <div
            class="snap-guide snap-guide-v"
            style:left="{g.pos}px"
            style:top="{g.from}px"
            style:height="{g.to - g.from}px"
          ></div>
        {:else}
          <div
            class="snap-guide snap-guide-h"
            style:top="{g.pos}px"
            style:left="{g.from}px"
            style:width="{g.to - g.from}px"
          ></div>
        {/if}
      {/each}
    {/if}

    {#if layoutGuidesVisible && renderedFrameLayoutGuides.length > 0}
      <div class="frame-layout-guide-layer" aria-label="Frame layout guides">
        {#each renderedFrameLayoutGuides as guide (guide.id)}
          <div
            class="frame-layout-guide"
            class:frame-layout-guide-uniform={guide.kind === 'uniform'}
            style:left="{guide.left}px"
            style:top="{guide.top}px"
            style:width="{guide.width}px"
            style:height="{guide.height}px"
            style:background={guide.color}
          ></div>
        {/each}
      </div>
    {/if}

    {#if layoutGuidesVisible && (renderedGuides.length > 0 || guideDraft)}
      <div class="project-guide-layer" aria-label="Layout guides">
        {#each renderedGuides as guide (guide.id)}
          <button
            type="button"
            class="project-guide"
            class:project-guide-v={guide.axis === 'x'}
            class:project-guide-h={guide.axis === 'y'}
            class:project-guide-frame={guide.scope === 'frame'}
            aria-label="Remove {guide.label}"
            title="Click to remove {guide.label}"
            style:left="{guide.left}px"
            style:top="{guide.top}px"
            style:width={guide.axis === 'y' ? `${guide.width}px` : undefined}
            style:height={guide.axis === 'x' ? `${guide.height}px` : undefined}
            on:mousedown|stopPropagation
            on:click|stopPropagation={() => onRemoveGuide(guide.id)}
            on:dblclick|stopPropagation={() => onRemoveGuide(guide.id)}
          ></button>
        {/each}
        {#if guideDraft}
          <div
            class="project-guide project-guide-draft"
            class:project-guide-v={guideDraft.axis === 'x'}
            class:project-guide-h={guideDraft.axis === 'y'}
            class:project-guide-frame={guideDraft.scope === 'frame'}
            style:left="{guideDraft.left}px"
            style:top="{guideDraft.top}px"
            style:width={guideDraft.axis === 'y' ? `${guideDraft.width}px` : undefined}
            style:height={guideDraft.axis === 'x' ? `${guideDraft.height}px` : undefined}
          ></div>
        {/if}
      </div>
    {/if}

    {#if layoutGuidesVisible && guideDistanceLabels.length > 0}
      <div class="guide-distance-layer" aria-hidden="true">
        {#each guideDistanceLabels as label (label.id + label.axis)}
          <div
            class="guide-distance"
            class:guide-distance-v={label.axis === 'x'}
            class:guide-distance-h={label.axis === 'y'}
            style:left="{label.left}px"
            style:top="{label.top}px"
            style:width={label.axis === 'x' ? `${label.width}px` : undefined}
            style:height={label.axis === 'y' ? `${label.height}px` : undefined}
          ><span>{label.distance}px</span></div>
        {/each}
      </div>
    {/if}

    {#if spacingOverlay && dragMode === 'none'}
      <div class="spacing-overlay" data-target-id={spacingOverlay.targetId} aria-hidden="true">
        <div
          class="spacing-line spacing-line-h spacing-line-left"
          data-side="left"
          style:left="{spacingOverlay.parentX}px"
          style:top="{spacingOverlay.y + spacingOverlay.height / 2}px"
          style:width="{Math.max(0, spacingOverlay.left)}px"
        ><span class="spacing-value">{spacingOverlay.left}</span></div>
        <div
          class="spacing-line spacing-line-h spacing-line-right"
          data-side="right"
          style:left="{spacingOverlay.x + spacingOverlay.width}px"
          style:top="{spacingOverlay.y + spacingOverlay.height / 2}px"
          style:width="{Math.max(0, spacingOverlay.right)}px"
        ><span class="spacing-value">{spacingOverlay.right}</span></div>
        <div
          class="spacing-line spacing-line-v spacing-line-top"
          data-side="top"
          style:left="{spacingOverlay.x + spacingOverlay.width / 2}px"
          style:top="{spacingOverlay.parentY}px"
          style:height="{Math.max(0, spacingOverlay.top)}px"
        ><span class="spacing-value">{spacingOverlay.top}</span></div>
        <div
          class="spacing-line spacing-line-v spacing-line-bottom"
          data-side="bottom"
          style:left="{spacingOverlay.x + spacingOverlay.width / 2}px"
          style:top="{spacingOverlay.y + spacingOverlay.height}px"
          style:height="{Math.max(0, spacingOverlay.bottom)}px"
        ><span class="spacing-value">{spacingOverlay.bottom}</span></div>
      </div>
    {/if}

    {#if reviewOverlays.length > 0 || dragMode === 'drawing-review-overlay'}
      <svg class="review-overlay-layer" width="12000" height="12000" aria-label="Review overlays">
        {#each reviewOverlays as overlay (overlay.id)}
          <g class:review-annotation={overlay.kind === 'annotation'} class:review-measurement={overlay.kind === 'measurement'}>
            <line x1={overlay.x1} y1={overlay.y1} x2={overlay.x2} y2={overlay.y2}></line>
            <circle cx={overlay.x1} cy={overlay.y1} r="4"></circle>
            <circle cx={overlay.x2} cy={overlay.y2} r="4"></circle>
          </g>
        {/each}
        {#if dragMode === 'drawing-review-overlay'}
          <g class:review-annotation={reviewOverlayKind === 'annotation'} class:review-measurement={reviewOverlayKind === 'measurement'} class="review-draft">
            <line x1={measureStart.x} y1={measureStart.y} x2={measureEnd.x} y2={measureEnd.y}></line>
            <circle cx={measureStart.x} cy={measureStart.y} r="4"></circle>
            <circle cx={measureEnd.x} cy={measureEnd.y} r="4"></circle>
          </g>
        {/if}
      </svg>
      {#each reviewOverlays as overlay (overlay.id + '-label')}
        <div
          class:review-label={overlay.kind === 'annotation'}
          class:review-measure-label={overlay.kind === 'measurement'}
          style:left="{(overlay.x1 + overlay.x2) / 2}px"
          style:top="{(overlay.y1 + overlay.y2) / 2}px"
        >{overlay.label ?? (overlay.kind === 'measurement' ? measurementLabel(overlay.x1, overlay.y1, overlay.x2, overlay.y2) : 'Annotation')}</div>
      {/each}
      {#if dragMode === 'drawing-review-overlay'}
        <div
          class:review-label={reviewOverlayKind === 'annotation'}
          class:review-measure-label={reviewOverlayKind === 'measurement'}
          style:left="{(measureStart.x + measureEnd.x) / 2}px"
          style:top="{(measureStart.y + measureEnd.y) / 2}px"
        >{reviewOverlayKind === 'measurement' ? measurementLabel(measureStart.x, measureStart.y, measureEnd.x, measureEnd.y) : 'Annotation'}</div>
      {/if}
    {/if}

    {#if dragMode === 'measuring'}
      <svg class="measure-ruler" width="12000" height="12000" aria-hidden="true">
        <line x1={measureStart.x} y1={measureStart.y} x2={measureEnd.x} y2={measureEnd.y}></line>
        <circle cx={measureStart.x} cy={measureStart.y} r="3"></circle>
        <circle cx={measureEnd.x} cy={measureEnd.y} r="3"></circle>
      </svg>
      <div
        class="measure-readout"
        style:left="{(measureStart.x + measureEnd.x) / 2}px"
        style:top="{(measureStart.y + measureEnd.y) / 2}px"
      >
        <strong>{measureDistance}px</strong>
        <span>ΔX {measureDX} · ΔY {measureDY}</span>
      </div>
    {/if}

    <!-- Drawing ghost -->
    {#if isDrawing && drawRect.w > 0 && drawRect.h > 0}
      <div
        class="frame-ghost"
        style:left="{drawRect.x}px"
        style:top="{drawRect.y}px"
        style:width="{drawRect.w}px"
        style:height="{drawRect.h}px"
      >
        <span class="ghost-size">{snapToGrid(drawRect.w)} × {snapToGrid(drawRect.h)}</span>
      </div>
    {/if}

    <!-- Marquee selection -->
    {#if dragMode === 'marquee' && isMarquee}
      <div
        class="marquee-box"
        style:left="{marqueeRect.x}px"
        style:top="{marqueeRect.y}px"
        style:width="{marqueeRect.w}px"
        style:height="{marqueeRect.h}px"
      >
        <span class="marquee-size">{snapToGrid(marqueeRect.w)} × {snapToGrid(marqueeRect.h)}</span>
      </div>
    {/if}

    {#if dragMode === 'lasso' && lassoPoints.length > 1}
      <svg class="lasso-path" aria-hidden="true">
        <polygon points={lassoPoints.map(point => `${point.x},${point.y}`).join(' ')} />
      </svg>
    {/if}

    <!-- Multi-selection bounds -->
    {#if selectionBounds && dragMode !== 'marquee' && dragMode !== 'lasso'}
      <div
        class="selection-bounds"
        style:left="{selectionBounds.x}px"
        style:top="{selectionBounds.y}px"
        style:width="{selectionBounds.w}px"
        style:height="{selectionBounds.h}px"
      >
        <span class="selection-corner corner-nw"></span>
        <span class="selection-corner corner-ne"></span>
        <span class="selection-corner corner-se"></span>
        <span class="selection-corner corner-sw"></span>
        <span class="selection-size">{snapToGrid(selectionBounds.w)} × {snapToGrid(selectionBounds.h)}</span>
      </div>
    {/if}

    <!-- Inline text editor overlay -->
    {#if inlineEditId && inlineEditElement}
      {@const ox = inlineEditFrame ? inlineEditFrame.x + inlineEditElement.x : inlineEditElement.x}
      {@const oy = inlineEditFrame ? inlineEditFrame.y + inlineEditElement.y : inlineEditElement.y}
      {#if inlineEditSingleLine}
        <input
          bind:this={inlineEditInputEl}
          class="inline-edit-field"
          type="text"
          bind:value={inlineEditValue}
          style:left="{ox}px"
          style:top="{oy}px"
          style:width="{inlineEditElement.width}px"
          style:height="{inlineEditElement.height}px"
          style:font-size="{resolvedFontSize(inlineEditElement)}px"
          style:font-weight={inlineEditElement.fontWeight}
          style:line-height={inlineEditLineHeight(inlineEditElement)}
          style:letter-spacing={inlineEditElement.letterSpacing !== undefined ? `${inlineEditElement.letterSpacing}em` : undefined}
          style:color={inlineEditElement.color}
          style:background={inlineEditElement.background}
          style:border-radius={borderRadiusCss(inlineEditElement)}
          style:text-align="center"
          on:keydown={handleInlineEditKeydown}
          on:blur={commitInlineEdit}
        />
      {:else}
        <textarea
          bind:this={inlineEditTextareaEl}
          class="inline-edit-field inline-edit-textarea"
          bind:value={inlineEditValue}
          style:left="{ox}px"
          style:top="{oy}px"
          style:width="{inlineEditElement.width}px"
          style:height="{Math.max(inlineEditTextareaHeight || inlineEditElement.height, inlineEditElement.height)}px"
          style:min-height="{inlineEditElement.height}px"
          style:font-size="{resolvedFontSize(inlineEditElement)}px"
          style:font-weight={inlineEditElement.fontWeight}
          style:line-height={inlineEditLineHeight(inlineEditElement)}
          style:letter-spacing={inlineEditElement.letterSpacing !== undefined ? `${inlineEditElement.letterSpacing}em` : undefined}
          style:color={inlineEditElement.color}
          style:background={inlineEditElement.background}
          style:border-radius={borderRadiusCss(inlineEditElement)}
          style:text-align={textAlignCss(inlineEditElement)}
          style:text-decoration={inlineEditElement.textDecoration && inlineEditElement.textDecoration !== 'none' ? inlineEditElement.textDecoration : undefined}
          style:text-transform={inlineEditElement.textTransform && inlineEditElement.textTransform !== 'none' ? inlineEditElement.textTransform : undefined}
          style:font-variant-caps={inlineEditElement.smallCaps || inlineEditElement.textCase === 'small-caps' ? 'small-caps' : undefined}
          on:keydown={handleInlineEditKeydown}
          on:blur={commitInlineEdit}
        ></textarea>
      {/if}
    {/if}

    <!-- Connector lines SVG -->
    <svg class="connectors">
      <defs>
        <marker id="arrow-normal" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
          <circle cx="4" cy="4" r="3" fill="#5a5aff" />
        </marker>
        <marker id="arrow-hi" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
          <circle cx="4" cy="4" r="3" fill="#ff6b39" />
        </marker>
      </defs>
      {#each connectors as c}
        {@const cpOffset = Math.abs(c.x2 - c.x1) * 0.4 + 80}
        <path
          d="M {c.x1} {c.y1} C {c.x1 + cpOffset} {c.y1}, {c.x2 - cpOffset} {c.y2}, {c.x2} {c.y2}"
          fill="none"
          stroke={c.highlighted ? '#ff6b39' : '#5a5aff'}
          stroke-width={c.highlighted ? 2.5 : 1.5}
          stroke-dasharray={c.highlighted ? '10 5' : '6 4'}
          opacity={c.highlighted ? 1 : 0.5}
          marker-end={c.highlighted ? 'url(#arrow-hi)' : 'url(#arrow-normal)'}
        />
      {/each}

      {#if dragMode === 'linking-button'}
        {@const cpOffset = Math.abs(linkEnd.x - linkStart.x) * 0.4 + 80}
        <path
          d="M {linkStart.x} {linkStart.y} C {linkStart.x + cpOffset} {linkStart.y}, {linkEnd.x - cpOffset} {linkEnd.y}, {linkEnd.x} {linkEnd.y}"
          fill="none"
          stroke="#ff6b39"
          stroke-width="2.5"
          stroke-dasharray="10 5"
          opacity="0.95"
        />
        <circle cx={linkEnd.x} cy={linkEnd.y} r="8" fill={linkHoverFrameId ? '#52d273' : '#ff6b39'} opacity="0.95" />
      {/if}
    </svg>
  </div>

  {#if state.frames.length === 0 && state.orphanElements.length === 0}
    <div class="canvas-empty-state" role="status" aria-live="polite" aria-atomic="true">
      <div class="canvas-empty-icon">⊡</div>
      <h2>No pages yet</h2>
      <p>Create a page from the left panel, or choose the Frame tool and click the canvas.</p>
    </div>
  {/if}

  <!-- Rulers (item 43) — only when the user toggles `showOverlay` on. -->
  {#if $gridSettings.showOverlay}
    <button
      type="button"
      class="ruler ruler-top"
      aria-label="Drag from top ruler to create horizontal guide"
      title="Drag from top ruler to create a horizontal guide"
      on:mousedown={(event) => startGuideDrag(event, 'y')}
    >
      {#each hTicks as tick (tick.world)}
        <div class="ruler-tick" style:left="{tick.screen}px">
          <span class="ruler-label">{tick.world}</span>
        </div>
      {/each}
    </button>
    <button
      type="button"
      class="ruler ruler-left"
      aria-label="Drag from left ruler to create vertical guide"
      title="Drag from left ruler to create a vertical guide"
      on:mousedown={(event) => startGuideDrag(event, 'x')}
    >
      {#each vTicks as tick (tick.world)}
        <div class="ruler-tick vertical" style:top="{tick.screen}px">
          <span class="ruler-label">{tick.world}</span>
        </div>
      {/each}
    </button>
    <button
      type="button"
      class="ruler-corner"
      aria-label="Remove all guides"
      title="Remove all guides"
      disabled={guides.length === 0 || !canEdit}
      on:click={onClearGuides}
    ></button>
  {/if}

  <MiniMap
    {state}
    {panX}
    {panY}
    {scale}
    {viewportWidth}
    {viewportHeight}
    onNavigate={navigateFromMiniMap}
  />

  <!-- Zoom controls -->
  <div class="canvas-controls">
    <button class="ctrl-btn" on:click={zoomOut} title="Zoom out (⌘−)">−</button>
    <button class="zoom-pct" on:click={zoomReset} title="Reset zoom to 100%">{Math.round(scale * 100)}%</button>
    <button class="ctrl-btn" on:click={zoomIn} title="Zoom in (⌘+)">+</button>
  </div>
</div>

<style>
  .canvas {
    flex: 1;
    position: relative;
    overflow: hidden;
    background-color: #111113;
    background-image:
      radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px);
    background-size: 28px 28px;
    user-select: none;
  }

  .canvas-world {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
  }

  .canvas-empty-state {
    position: absolute;
    left: 50%;
    top: 44%;
    transform: translate(-50%, -50%);
    width: min(360px, calc(100% - 48px));
    padding: 22px;
    display: grid;
    place-items: center;
    gap: 8px;
    text-align: center;
    border: 1px dashed rgba(255,255,255,0.14);
    border-radius: 18px;
    background: rgba(18,18,22,0.82);
    box-shadow: 0 18px 55px rgba(0,0,0,0.34);
    color: rgba(255,255,255,0.7);
    pointer-events: none;
    z-index: 40;
  }

  .canvas-empty-state h2 {
    margin: 0;
    color: #fff8ed;
    font-size: 18px;
    line-height: 1.2;
  }

  .canvas-empty-state p {
    margin: 0;
    font-size: 13px;
    line-height: 1.45;
  }

  .canvas-empty-icon {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border-radius: 14px;
    background: rgba(255, 189, 46, 0.12);
    color: #ffd27a;
    font-size: 24px;
  }

  .connectors {
    position: absolute;
    top: 0;
    left: 0;
    width: 12000px;
    height: 12000px;
    overflow: visible;
    pointer-events: none;
    z-index: 60;
  }

  .tab-order-overlay {
    position: absolute;
    inset: 0;
    width: 12000px;
    height: 12000px;
    pointer-events: none;
    z-index: 75;
  }

  .tab-order-badge {
    position: absolute;
    width: 24px;
    height: 24px;
    transform: translate(-8px, -8px);
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: #ffc44d;
    color: #160b04;
    border: 2px solid #111113;
    box-shadow: 0 6px 16px rgba(0,0,0,0.3);
    font-size: 12px;
    font-weight: 900;
  }

  .comment-pin-layer {
    position: absolute;
    inset: 0;
    width: 12000px;
    height: 12000px;
    pointer-events: none;
    z-index: 95;
  }

  .comment-pin {
    position: absolute;
    width: 18px;
    height: 18px;
    transform: translate(-50%, -50%);
    display: grid;
    place-items: center;
    border-radius: 999px;
    border: 2px solid #16161a;
    background: #ff6b39;
    box-shadow:
      0 0 0 2px rgba(255, 255, 255, 0.85),
      0 10px 24px rgba(0, 0, 0, 0.28);
    cursor: pointer;
    pointer-events: auto;
  }

  .comment-pin span {
    width: 5px;
    height: 5px;
    border-radius: 999px;
    background: #fff;
  }

  .comment-pin:hover {
    transform: translate(-50%, -50%) scale(1.12);
  }

  .comment-pin-unsynced {
    background: #ffbd2e;
  }

  .comment-pin-error {
    background: #ff5f57;
  }

  .frame-container {
    position: absolute;
  }

  .frame-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: rgba(255,255,255,0.38);
    padding: 0 2px 6px;
    white-space: nowrap;
    letter-spacing: 0.02em;
    transition: color 0.15s;
  }

  .frame-label.active {
    color: rgba(255,255,255,0.72);
  }

  .frame-label-drag {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    letter-spacing: inherit;
    text-align: left;
    cursor: grab;
  }

  .frame-label-drag:active {
    cursor: grabbing;
  }

  .frame-icon {
    font-size: 10px;
    opacity: 0.6;
  }

  .frame-size {
    margin-left: auto;
    font-size: 10px;
    opacity: 0.5;
    font-variant-numeric: tabular-nums;
  }

  .frame {
    position: relative;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,0.06);
    box-shadow: 0 8px 48px rgba(0,0,0,0.6);
    transition: border-color 0.12s;
  }

  .frame.active {
    overflow: visible;
    border-color: #18a0fb;
    box-shadow:
      0 0 0 2px #18a0fb,
      0 0 0 5px rgba(24, 160, 251, 0.14),
      0 8px 48px rgba(0,0,0,0.6);
  }

  .frame.clip-disabled {
    overflow: visible;
  }

  .frame.link-drop-target {
    border-color: rgba(82, 210, 115, 0.95);
    box-shadow:
      0 0 0 2px rgba(82, 210, 115, 0.58),
      0 0 36px rgba(82, 210, 115, 0.2),
      0 8px 48px rgba(0,0,0,0.6);
  }

  .element {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    padding: 8px 12px;
    overflow: hidden;
    transition: box-shadow 0.1s;
    text-overflow: ellipsis;
    white-space: pre-wrap;
    font-family: Inter, system-ui, sans-serif;
  }

  .element.is-slice {
    align-items: flex-start;
    justify-content: flex-start;
    padding: 6px 8px;
    border: 1px dashed rgba(90, 170, 255, 0.95);
    background: rgba(60, 140, 255, 0.08);
    color: #9dbdff;
    overflow: visible;
    pointer-events: auto;
  }

  .slice-label,
  .slice-size {
    padding: 2px 5px;
    border-radius: 4px;
    background: rgba(10, 18, 35, 0.88);
    font-size: 10px;
    line-height: 1;
    white-space: nowrap;
  }

  .slice-size {
    margin-left: 4px;
    opacity: 0.72;
  }

  /* Image element: fills container, clips to border-radius */
  .element.is-image {
    padding: 0;
    overflow: hidden;
    background: rgba(255,255,255,0.06);
  }
  .element.is-image.selected {
    overflow: visible;
  }
  .element.cropping,
  .element.is-image.cropping {
    cursor: grab;
    outline: 2px solid #f97316;
    outline-offset: 3px;
  }
  .element.is-image.cropping .el-image {
    cursor: grab;
  }

  .el-image {
    width: 100%;
    height: 100%;
    display: block;
    pointer-events: none;
    transform-origin: center;
  }

  .media-fill-image {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    pointer-events: none;
    z-index: 0;
    transform-origin: center;
  }

  .element:has(.media-fill-image) .el-content {
    position: relative;
    z-index: 1;
  }

  .shape-manipulator {
    position: absolute;
    width: 12px;
    height: 12px;
    border: 2px solid #111827;
    border-radius: 999px;
    box-shadow: 0 0 0 1px rgba(255,255,255,0.9), 0 4px 12px rgba(0,0,0,0.28);
    transform: translate(-50%, -50%);
    z-index: 40;
    padding: 0;
    pointer-events: auto;
  }

  .shape-corner-control {
    background: #fbbf24;
    cursor: nwse-resize;
  }

  .shape-arc-control {
    background: #38bdf8;
    cursor: crosshair;
  }

  .shape-arc-end {
    background: #fb7185;
  }

  .crop-mode-badge {
    position: absolute;
    left: 8px;
    bottom: 8px;
    padding: 4px 7px;
    border-radius: 999px;
    background: rgba(249, 115, 22, 0.92);
    color: #111827;
    font-size: 11px;
    font-weight: 800;
    line-height: 1;
    pointer-events: none;
    box-shadow: 0 6px 16px rgba(0,0,0,0.24);
  }

  .crop-handle {
    position: absolute;
    z-index: 42;
    width: 14px;
    height: 14px;
    border: 2px solid #111827;
    border-radius: 4px;
    background: #f97316;
    box-shadow: 0 0 0 1px rgba(255,255,255,0.86), 0 4px 10px rgba(0,0,0,0.24);
    padding: 0;
  }

  .crop-nw { left: -7px; top: -7px; cursor: nwse-resize; }
  .crop-ne { right: -7px; top: -7px; cursor: nesw-resize; }
  .crop-se { right: -7px; bottom: -7px; cursor: nwse-resize; }
  .crop-sw { left: -7px; bottom: -7px; cursor: nesw-resize; }

  .image-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: rgba(255,255,255,0.3);
    pointer-events: none;
  }

  .image-placeholder-icon {
    font-size: 28px;
    line-height: 1;
    opacity: 0.5;
  }

  .image-placeholder-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    opacity: 0.5;
  }

  /* Cmd+hover highlight — works on any hovered object: frame, element, orphan, or group child.
     Uses outline (not box-shadow/z-index) so the hovered object doesn't get raised above
     its siblings or out of the natural stacking order.
     outline-offset: -2px draws the line inside the border-box, so a parent's overflow:hidden
     never clips it (and the frame-background section won't push other elements out of view). */
  .element.cmd-deep-hover,
  .frame.cmd-deep-hover {
    outline: 2px solid rgba(255, 200, 50, 0.9);
    outline-offset: -2px;
  }

  .element.layer-tree-hover,
  .frame.layer-tree-hover {
    outline: 2px solid rgba(255, 122, 61, 0.95);
    outline-offset: -2px;
  }

  /* Group container: clip children, show selection ring */
  .element.is-group {
    display: block;
    position: absolute;
    padding: 0;
    overflow: visible;
    background: transparent;
  }
  .element.is-group.selected {
    box-shadow: 0 0 0 1.5px rgba(100, 140, 255, 0.7), 0 0 0 3px rgba(100, 140, 255, 0.15);
  }

  .element.is-text {
    justify-content: flex-start;
    align-items: flex-start;
  }

  /* Input and textarea — show placeholder-style content + an outline matching exported CSS */
  .element.is-input,
  .element.is-textarea {
    justify-content: flex-start;
    align-items: flex-start;
    border: 1px solid rgba(0, 0, 0, 0.2);
    padding: 8px 12px;
  }

  .element.is-input .el-content,
  .element.is-textarea .el-content {
    opacity: 0.55;
    font-style: italic;
  }

  .element.is-svg {
    padding: 0;
    overflow: hidden;
  }

  .svg-content,
  .svg-content :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .element.is-textarea .el-content {
    white-space: pre-wrap;
    text-overflow: clip;
  }

  /* List preview — visible bullets/numbers inside the element box */
  .element.is-list {
    justify-content: flex-start;
    align-items: flex-start;
    padding: 8px 12px 8px 32px;
    overflow: auto;
  }

  .el-list {
    margin: 0;
    padding: 0;
    list-style-position: outside;
    width: 100%;
    pointer-events: none;
  }

  .el-list li {
    line-height: 1.5;
    margin: 0;
  }

  /* Iframe placeholder — non-interactive preview block */
  .element.is-iframe {
    padding: 0;
    overflow: hidden;
    border: 1px dashed rgba(255,255,255,0.18);
  }

  .iframe-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    color: rgba(255,255,255,0.45);
    pointer-events: none;
    padding: 12px;
  }

  .iframe-placeholder-icon {
    font-size: 26px;
    line-height: 1;
    opacity: 0.5;
  }

  .iframe-placeholder-label {
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    opacity: 0.55;
  }

  .iframe-placeholder-src {
    font-family: 'SFMono-Regular', ui-monospace, monospace;
    font-size: 10px;
    color: rgba(255,255,255,0.35);
    text-align: center;
    word-break: break-all;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .element.selected {
    overflow: visible;
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.92),
      0 0 0 2.5px #18a0fb,
      0 0 0 5px rgba(24, 160, 251, 0.18);
    z-index: 10;
  }

  .element.selected.primary-selected {
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.95),
      0 0 0 2.5px #ff7a3d,
      0 0 0 6px rgba(255, 122, 61, 0.24);
  }

  .orphan-element {
    outline: 1px dashed rgba(255, 175, 110, 0.32);
    outline-offset: 2px;
  }

  .orphan-element.selected {
    outline-color: transparent;
  }

  .resize-edge {
    position: absolute;
    border: 0;
    background: transparent;
    z-index: 30;
    padding: 0;
    pointer-events: auto;
  }

  .edge-n,
  .edge-s {
    left: 8px;
    right: 8px;
    height: 12px;
  }

  .edge-e,
  .edge-w {
    top: 8px;
    bottom: 8px;
    width: 12px;
  }

  .edge-nw,
  .edge-ne,
  .edge-se,
  .edge-sw {
    width: 18px;
    height: 18px;
  }

  .edge-n { top: -6px; }
  .edge-s { bottom: -6px; }
  .edge-e { right: -6px; }
  .edge-w { left: -6px; }
  .edge-nw { left: -9px; top: -9px; }
  .edge-ne { right: -9px; top: -9px; }
  .edge-se { right: -9px; bottom: -9px; }
  .edge-sw { left: -9px; bottom: -9px; }

  .rotate-handle {
    position: absolute;
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: rgba(160, 195, 255, 0.9);
    box-shadow: none;
    cursor: grab;
    z-index: 35;
    padding: 0;
    font-size: 13px;
    font-weight: 800;
    line-height: 1;
    transform: scale(calc(1 / var(--canvas-scale, 1)));
    transform-origin: center;
  }

  .rotate-nw { left: -30px; top: -30px; }
  .rotate-ne { right: -30px; top: -30px; }
  .rotate-se { right: -30px; bottom: -30px; }
  .rotate-sw { left: -30px; bottom: -30px; }

  .rotate-handle::before {
    content: '⟳';
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    opacity: 0.82;
    text-shadow: 0 1px 4px rgba(0,0,0,0.7);
  }

  .rotate-nw::before { transform: rotate(-90deg); }
  .rotate-ne::before { transform: rotate(0deg); }
  .rotate-se::before { transform: rotate(90deg); }
  .rotate-sw::before { transform: rotate(180deg); }

  .rotate-handle::after {
    content: '';
    position: absolute;
    inset: 5px;
    border: 1px solid rgba(100,140,255,0.48);
    border-radius: inherit;
    opacity: 0;
    transition: opacity 0.12s, border-color 0.12s, background 0.12s;
  }

  .rotate-handle:hover,
  .rotate-handle:focus-visible {
    color: #ffb46a;
    background: rgba(100, 140, 255, 0.08);
    outline: none;
  }

  .rotate-handle:hover::before,
  .rotate-handle:focus-visible::before {
    opacity: 1;
  }

  .rotate-handle:hover::after,
  .rotate-handle:focus-visible::after {
    border-color: rgba(255,180,106,0.72);
    background: rgba(255,180,106,0.08);
    opacity: 1;
  }

  .context-handle-row {
    position: absolute;
    left: 50%;
    top: -66px;
    display: flex;
    gap: 4px;
    transform: translateX(-50%);
    z-index: 36;
  }

  .context-handle-row button {
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 6px;
    background: rgba(18, 20, 28, 0.94);
    color: rgba(255,255,255,0.78);
    font-size: 10px;
    font-weight: 800;
    line-height: 1;
    padding: 5px 7px;
    white-space: nowrap;
  }

  .context-handle-row button:hover,
  .context-handle-row button:focus-visible {
    border-color: rgba(255,107,57,0.5);
    color: #ffd9b8;
    outline: none;
  }

  .element.vector-editing {
    outline: 1px solid rgba(249, 115, 22, 0.72);
    outline-offset: 3px;
  }

  .element.masked {
    box-shadow: inset 0 0 0 1px rgba(168, 85, 247, 0.56), 0 0 0 1px rgba(168, 85, 247, 0.18);
  }

  .element.masked::after {
    content: 'Mask';
    position: absolute;
    right: 6px;
    top: 6px;
    z-index: 33;
    border: 1px solid rgba(216, 180, 254, 0.55);
    border-radius: 999px;
    background: rgba(40, 18, 58, 0.86);
    color: #f3e8ff;
    font-size: 10px;
    font-weight: 800;
    line-height: 1;
    padding: 4px 6px;
    pointer-events: none;
  }

  .vector-context-row {
    top: -36px;
  }

  .vector-edit-badge {
    position: absolute;
    left: 50%;
    bottom: -28px;
    z-index: 35;
    transform: translateX(-50%);
    border: 1px solid rgba(249, 115, 22, 0.45);
    border-radius: 999px;
    background: rgba(18, 20, 28, 0.94);
    color: #fed7aa;
    font-size: 10px;
    font-weight: 800;
    line-height: 1;
    padding: 6px 9px;
    white-space: nowrap;
    pointer-events: none;
  }

  .auto-layout-handle {
    position: absolute;
    z-index: 34;
    border: 1px solid rgba(255, 189, 46, 0.72);
    border-radius: 999px;
    background: rgba(30, 24, 12, 0.94);
    color: #ffd486;
    font-size: 10px;
    font-weight: 800;
    line-height: 1;
    min-width: 24px;
    min-height: 18px;
    padding: 4px 6px;
    box-shadow: 0 0 0 3px rgba(255, 189, 46, 0.16), 0 6px 16px rgba(0,0,0,0.3);
    cursor: ew-resize;
  }

  .auto-layout-gap-handle {
    right: 8px;
    top: 8px;
  }

  .auto-layout-handle.padding-t,
  .auto-layout-handle.padding-b {
    left: 50%;
    transform: translateX(-50%);
    cursor: ns-resize;
  }

  .auto-layout-handle.padding-t { top: 4px; }
  .auto-layout-handle.padding-b { bottom: 4px; }

  .auto-layout-handle.padding-l,
  .auto-layout-handle.padding-r {
    top: 50%;
    transform: translateY(-50%);
  }

  .auto-layout-handle.padding-l { left: 4px; }
  .auto-layout-handle.padding-r { right: 4px; }

  .resize-size-badge {
    position: absolute;
    right: -1px;
    bottom: -24px;
    background: rgba(22, 24, 34, 0.92);
    border: 1px solid rgba(100, 140, 255, 0.38);
    border-radius: 6px;
    color: rgba(235, 240, 255, 0.86);
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    padding: 5px 7px;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
    white-space: nowrap;
    z-index: 25;
  }

  .element.selected.is-button {
    overflow: visible;
  }

  .link-handle {
    position: absolute;
    right: -17px;
    top: 50%;
    transform: translateY(-50%);
    width: 20px;
    height: 20px;
    border: 1px solid rgba(255,255,255,0.9);
    border-radius: 999px;
    background: #ff6b39;
    box-shadow:
      0 0 0 3px rgba(255, 107, 57, 0.22),
      0 6px 16px rgba(0,0,0,0.35);
    cursor: crosshair;
    z-index: 20;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .link-handle:hover {
    transform: translateY(-50%) scale(1.08);
    background: #ff865f;
  }

  .link-handle-dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: #fff;
  }

  .link-handle-tip {
    position: absolute;
    left: 24px;
    top: 50%;
    transform: translateY(-50%);
    padding: 4px 7px;
    border-radius: 6px;
    background: rgba(14,14,18,0.92);
    border: 1px solid rgba(255,255,255,0.12);
    color: rgba(255,255,255,0.78);
    font-size: 10px;
    font-weight: 600;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.12s ease;
  }

  .link-handle:hover .link-handle-tip {
    opacity: 1;
  }

  .el-content {
    pointer-events: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    width: 100%;
    display: block;
  }

  .element.is-text .el-content {
    white-space: pre-wrap;
    text-overflow: clip;
  }

  .frame-ghost {
    position: absolute;
    border: 1.5px dashed rgba(100, 140, 255, 0.8);
    background: rgba(100, 140, 255, 0.06);
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    pointer-events: none;
  }

  /* Smart alignment guides (item 41) */
  .snap-guide {
    position: absolute;
    background: #ff5b27;
    pointer-events: none;
    z-index: 85;
  }
  .snap-guide-v {
    width: 1px;
  }
  .snap-guide-h {
    height: 1px;
  }

  .frame-layout-guide-layer,
  .project-guide-layer,
  .guide-distance-layer {
    position: absolute;
    inset: 0;
    overflow: visible;
    pointer-events: none;
    z-index: 84;
  }

  .frame-layout-guide {
    position: absolute;
    pointer-events: none;
    mix-blend-mode: screen;
  }

  .frame-layout-guide-uniform {
    opacity: 0.8;
  }

  .project-guide {
    position: absolute;
    margin: 0;
    border: 0;
    padding: 0;
    background: transparent;
    pointer-events: auto;
    z-index: 85;
    cursor: pointer;
  }

  .project-guide::after {
    content: "";
    position: absolute;
    background: rgba(80, 179, 255, 0.92);
    box-shadow: 0 0 0 1px rgba(2, 6, 23, 0.55);
  }

  .project-guide-frame::after {
    background: rgba(255, 189, 46, 0.95);
  }

  .project-guide-v {
    width: 12px;
    transform: translateX(-6px);
  }

  .project-guide-v::after {
    left: 5px;
    top: 0;
    width: 2px;
    height: 100%;
  }

  .project-guide-h {
    height: 12px;
    transform: translateY(-6px);
  }

  .project-guide-h::after {
    left: 0;
    top: 5px;
    width: 100%;
    height: 2px;
  }

  .project-guide-draft {
    pointer-events: none;
    opacity: 0.72;
  }

  .project-guide-draft::after {
    background: #ff6b39;
  }

  .guide-distance-layer {
    z-index: 86;
  }

  .guide-distance {
    position: absolute;
    pointer-events: none;
    border-color: rgba(255, 255, 255, 0.85);
    color: #111113;
    font-variant-numeric: tabular-nums;
  }

  .guide-distance-v {
    border-top: 1px solid rgba(255, 255, 255, 0.8);
  }

  .guide-distance-h {
    border-left: 1px solid rgba(255, 255, 255, 0.8);
  }

  .guide-distance span {
    position: absolute;
    left: 50%;
    top: -20px;
    transform: translateX(-50%);
    border-radius: 5px;
    background: #f7f1e8;
    color: #111113;
    padding: 2px 5px;
    font-size: 10px;
    font-weight: 800;
    white-space: nowrap;
  }

  .guide-distance-h span {
    left: 7px;
    top: 50%;
    transform: translateY(-50%);
  }

  /* Alt-hover spacing measurement (item 105): four parent-to-layer gaps in world space. */
  .spacing-overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 12000px;
    height: 12000px;
    pointer-events: none;
    z-index: 86;
  }
  .spacing-line {
    position: absolute;
    background: #ef5c62;
    pointer-events: none;
  }
  .spacing-line-h {
    height: 1px;
  }
  .spacing-line-v {
    width: 1px;
  }
  .spacing-value {
    position: absolute;
    border-radius: 4px;
    background: #d94750;
    color: #fff;
    padding: 2px 4px;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .spacing-line-h .spacing-value {
    left: 50%;
    top: -16px;
    transform: translateX(-50%);
  }
  .spacing-line-v .spacing-value {
    left: 5px;
    top: 50%;
    transform: translateY(-50%);
  }
  .measure-ruler {
    position: absolute;
    left: 0;
    top: 0;
    overflow: visible;
    pointer-events: none;
    z-index: 87;
  }
  .measure-ruler line {
    stroke: #ef5c62;
    stroke-width: 2px;
    stroke-dasharray: 5 3;
  }
  .measure-ruler circle {
    fill: #ef5c62;
    stroke: #fff;
    stroke-width: 1px;
  }
  .measure-readout {
    position: absolute;
    transform: translate(10px, -50%);
    display: flex;
    align-items: center;
    gap: 7px;
    border-radius: 6px;
    background: #d94750;
    color: #fff;
    padding: 4px 7px;
    font-size: 10px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    pointer-events: none;
    z-index: 88;
  }
  .measure-readout strong {
    font-size: 11px;
  }

  .review-overlay-layer {
    position: absolute;
    left: 0;
    top: 0;
    overflow: visible;
    pointer-events: none;
    z-index: 86;
  }

  .review-overlay-layer line {
    stroke-width: 2.5px;
    stroke-linecap: round;
  }

  .review-overlay-layer circle {
    fill: #111113;
    stroke-width: 2px;
  }

  .review-annotation line {
    stroke: #ff3b4f;
    stroke-dasharray: 10 5;
  }

  .review-annotation circle {
    stroke: #ff3b4f;
  }

  .review-measurement line {
    stroke: #38bdf8;
    stroke-dasharray: 5 3;
  }

  .review-measurement circle {
    stroke: #38bdf8;
  }

  .review-draft {
    opacity: 0.72;
  }

  .review-label,
  .review-measure-label {
    position: absolute;
    transform: translate(10px, -50%);
    border-radius: 6px;
    color: #fff;
    padding: 4px 7px;
    font-size: 10px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    pointer-events: none;
    z-index: 88;
  }

  .review-label {
    background: #d94750;
  }

  .review-measure-label {
    background: #0369a1;
  }

  /* Vector shapes (item 45) — full-bleed SVG inside the element box. */
  .shape-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .vector-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }

  .canvas-world.wireframe .frame,
  .canvas-world.wireframe .element {
    background: transparent !important;
    box-shadow: none !important;
    border: 1px solid rgba(116, 173, 230, 0.72) !important;
  }
  .canvas-world.wireframe .element > .el-content,
  .canvas-world.wireframe .element > .el-image,
  .canvas-world.wireframe .element > .image-placeholder,
  .canvas-world.wireframe .element > .el-list,
  .canvas-world.wireframe .element > .iframe-placeholder,
  .canvas-world.wireframe .element > .shape-svg,
  .canvas-world.wireframe .element > .vector-svg,
  .canvas-world.wireframe .element > .link-handle {
    visibility: hidden;
  }
  .canvas-world.wireframe .element::before {
    content: attr(data-wireframe-label);
    position: absolute;
    left: 4px;
    top: 3px;
    max-width: calc(100% - 8px);
    color: #81bfff;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    pointer-events: none;
    z-index: 1;
  }

  /* Grid overlay (item 43) — drawn inside the world transform so it scales with zoom. */
  .canvas-world.has-grid {
    background-image:
      linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px);
    background-size: var(--grid-size, 8px) var(--grid-size, 8px);
  }

  .canvas-world.pixel-preview-1x,
  .canvas-world.pixel-preview-2x,
  .canvas-world.pixel-preview-1x :global(img),
  .canvas-world.pixel-preview-2x :global(img) {
    image-rendering: pixelated;
  }

  .canvas-world.pixel-preview-2x {
    filter: contrast(1.03);
  }

  .vision-filter-defs {
    position: absolute;
    width: 0;
    height: 0;
    pointer-events: none;
  }

  /* Rulers (item 43) */
  .ruler {
    position: absolute;
    margin: 0;
    border: 0;
    padding: 0;
    background: rgba(20, 20, 24, 0.92);
    color: rgba(255, 255, 255, 0.45);
    font-size: 9.5px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    pointer-events: auto;
    z-index: 90;
    user-select: none;
    cursor: crosshair;
  }
  .ruler-top {
    top: 0;
    left: 24px;
    right: 0;
    height: 18px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .ruler-left {
    top: 18px;
    left: 0;
    bottom: 0;
    width: 24px;
    border-right: 1px solid rgba(255,255,255,0.08);
  }
  .ruler-corner {
    position: absolute;
    top: 0; left: 0;
    width: 24px; height: 18px;
    background: rgba(20, 20, 24, 0.92);
    border-right: 1px solid rgba(255,255,255,0.08);
    border-bottom: 1px solid rgba(255,255,255,0.08);
    z-index: 91;
    pointer-events: auto;
    border: 0;
    padding: 0;
    cursor: pointer;
  }
  .ruler-corner:disabled {
    cursor: default;
    opacity: 0.55;
  }
  .ruler-corner:not(:disabled)::after {
    content: "×";
    color: rgba(255, 255, 255, 0.58);
    font-size: 13px;
    line-height: 18px;
  }
  .ruler-tick {
    position: absolute;
    top: 0;
    width: 1px;
    height: 18px;
    background: rgba(255, 255, 255, 0.18);
  }
  .ruler-tick.vertical {
    left: 0;
    top: 0;          /* overridden inline */
    width: 24px;
    height: 1px;
  }
  .ruler-label {
    position: absolute;
    left: 3px;
    top: 2px;
    line-height: 1;
    white-space: nowrap;
  }
  .ruler-tick.vertical .ruler-label {
    left: 3px;
    top: 2px;
    transform: none;
  }

  .marquee-box {
    position: absolute;
    border: 2px solid #18a0fb;
    background: rgba(24, 160, 251, 0.08);
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.8),
      inset 0 0 0 1px rgba(24, 160, 251, 0.22);
    pointer-events: none;
    z-index: 80;
  }

  .lasso-path {
    position: absolute;
    left: 0;
    top: 0;
    width: 1px;
    height: 1px;
    overflow: visible;
    pointer-events: none;
    z-index: 80;
  }
  .lasso-path polygon {
    fill: rgba(24, 160, 251, 0.08);
    stroke: #18a0fb;
    stroke-width: 2px;
    vector-effect: non-scaling-stroke;
    stroke-dasharray: 5 4;
  }

  .selection-bounds {
    position: absolute;
    border: 2px solid #18a0fb;
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.8),
      0 0 0 4px rgba(24, 160, 251, 0.12);
    pointer-events: none;
    z-index: 70;
  }

  .selection-corner {
    position: absolute;
    width: 10px;
    height: 10px;
    background: #ffffff;
    border: 2px solid #18a0fb;
    box-sizing: border-box;
  }

  .corner-nw { left: -6px; top: -6px; }
  .corner-ne { right: -6px; top: -6px; }
  .corner-se { right: -6px; bottom: -6px; }
  .corner-sw { left: -6px; bottom: -6px; }

  .ghost-size,
  .marquee-size,
  .selection-size {
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
    font-variant-numeric: tabular-nums;
  }

  .ghost-size {
    color: #648cff;
    background: rgba(20,20,30,0.85);
    margin: 6px;
  }

  .marquee-size,
  .selection-size {
    position: absolute;
    left: 50%;
    bottom: -30px;
    transform: translateX(-50%);
    color: #ffffff;
    background: #18a0fb;
    box-shadow: 0 6px 16px rgba(0,0,0,0.28);
    font-size: 14px;
    font-weight: 750;
    line-height: 1;
    white-space: nowrap;
  }

  .canvas-controls {
    position: absolute;
    bottom: 16px;
    right: 16px;
    display: flex;
    align-items: center;
    background: rgba(20,20,24,0.9);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    backdrop-filter: blur(8px);
    overflow: hidden;
    z-index: 5;
  }

  .ctrl-btn {
    width: 28px;
    height: 28px;
    color: rgba(255,255,255,0.45);
    font-size: 16px;
    font-weight: 300;
    display: grid;
    place-items: center;
    line-height: 1;
    transition: background 0.1s, color 0.1s;
  }

  .ctrl-btn:hover {
    background: rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.9);
  }

  .zoom-pct {
    height: 28px;
    padding: 0 8px;
    font-size: 11px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
    color: rgba(255,255,255,0.5);
    min-width: 46px;
    text-align: center;
    border-left: 1px solid rgba(255,255,255,0.08);
    border-right: 1px solid rgba(255,255,255,0.08);
    transition: background 0.1s, color 0.1s;
  }

  .zoom-pct:hover {
    background: rgba(255,255,255,0.06);
    color: rgba(255,255,255,0.8);
  }

  /* Inline text editor overlay */
  .inline-edit-field {
    position: absolute;
    box-sizing: border-box;
    border: 0;
    outline: 2px solid #18a0fb;
    outline-offset: 0;
    resize: none;
    font-family: Inter, system-ui, sans-serif;
    padding: 8px 12px;
    z-index: 100;
    box-shadow:
      0 0 0 4px rgba(24, 160, 251, 0.18),
      0 8px 32px rgba(0, 0, 0, 0.4);
    overflow: hidden;
  }

  .inline-edit-textarea {
    white-space: pre-wrap;
    overflow-wrap: break-word;
    word-break: break-word;
    overflow-y: hidden;
    text-align: left;
    align-items: flex-start;
    vertical-align: top;
  }

  /* Hide the element's text content while the overlay input is active */
  .element.editing-inline .el-content {
    opacity: 0;
  }
</style>
