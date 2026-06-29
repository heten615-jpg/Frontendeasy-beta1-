<script lang="ts">
  import { tick } from 'svelte';
  import type { Component } from 'svelte';
  import type { AppearancePreset, AppearanceValueMode, AutoLayout, AutoLayoutSizingMode, BlendMode, ComponentMaster, ComponentPropertyDefinition, ComponentPropertyKind, ComponentPropertyValue, ElementConstraints, ElementEffect, ElementEffectKind, ElementFill, ElementMaskKind, FillColorModel, FillGradientKind, FillPatternAlignment, FillPatternTiling, FillKind, FillSource, FontSource, FrameLayoutGuide, FrameLayoutGuideKind, FrameLayoutGuideTrackType, HorizontalConstraint, MediaTransform, StrokeBrushDirection, StrokeCap, StrokePlacement, StrokeStyle, StrokeWidthProfile, StudioState, Frame, FrameElement, FrameExportSettings, ProjectExportSettings, ProjectFontFamily, ProjectStyle, ProjectVariableCollection, TextAlign, TextCase, TextureEffectStyle, TextRun, TextStylePreset, TextStylePresetId, TextTrim, TextVerticalAlign, TypographyPanelMode, VectorEditOperationKind, VectorEditState, VectorEditTool, VerticalConstraint } from '../types';
  import { PROJECT_FONT_OPTIONS } from '../storage';
  import ColorPicker from './ColorPicker.svelte';
  import GradientEditor from './GradientEditor.svelte';
  import { assetUrls, assetUrlStatuses, assetUrlStatusForElement, ensureAssetUrl, resolveImageSrcSync } from './assets/assetUrls';
  import { evalMath } from './canvas/mathExpr';
  import { recentFrameSizes } from './canvas/recentFrameSizes';
  import { scrub } from './canvas/scrubAction';
  import {
    cssFilterForElement,
    imageFilterPatch,
    mediaCropAspectPatch,
    mediaFilterValue,
    mediaInternalTransformPatch,
    objectPositionForElement,
    resizeMediaToFitPatch,
    resetImageFiltersPatch,
    type MediaFilterKey,
    type MediaCropAspectRatio,
  } from './editor/mediaTransforms';
  import { mediaFillForElement, mediaFillModeToObjectFit } from './editor/mediaFill';
  import { elementDisplayLabel } from './editor/elementDisplay';
  import {
    getTextStylePreset,
    saveTextStylePreset,
    textStylePatchFromPreset,
    withDefaultTextStylePresets,
  } from './editor/textStylePresets';
  import {
    appearancePresetPatchFromPreset,
    saveAppearancePreset,
    withDefaultAppearancePresets,
  } from './editor/appearancePresets';
  import { withDefaultProjectStyles, withDefaultVariableCollections } from './editor/projectStyles';
  import type { AssetInventoryEntry } from './assets/assetInventory';
  import type { AccessibilityPreflightIssue } from './a11y/preflight';
  import { isSafeIframeSrc, isSafeInlineHref } from './security/urls';
  import InspectorExportDock from './inspector/InspectorExportDock.svelte';
  import { inspectorExportModel, inspectorExportSummary } from './inspector/inspectorExport';
  import type { InspectorSearchRequest } from './inspector/inspectorSearchRequest';
  import { RELEASE_FLAGS } from './releaseFlags';

  type AnyComponent = Component<Record<string, unknown>>;
  let PrototypeInspectorComponent: AnyComponent | null = null;
  let prototypeInspectorLoadPromise: Promise<void> | null = null;
  let prototypeInspectorLoadError = '';

  function ensurePrototypeInspector() {
    if (PrototypeInspectorComponent) return Promise.resolve();
    if (!prototypeInspectorLoadPromise) {
      prototypeInspectorLoadError = '';
      prototypeInspectorLoadPromise = import('./inspector/PrototypeInspector.svelte')
        .then(module => {
          PrototypeInspectorComponent = module.default as unknown as AnyComponent;
        })
        .catch(error => {
          prototypeInspectorLoadError = error instanceof Error ? error.message : String(error);
          throw error;
        })
        .finally(() => {
          prototypeInspectorLoadPromise = null;
        });
    }
    return prototypeInspectorLoadPromise;
  }

  /** Pick the right URL for an image element + kick off async resolution if needed. */
  function imageRenderSrc(el: FrameElement, urls: Map<string, string>): string {
    const fill = mediaFillForElement(el);
    if (el.imageAssetPath || fill?.assetPath) void ensureAssetUrl(el);
    return resolveImageSrcSync(el, urls) ?? '';
  }

  function assetPreviewMessage(el: FrameElement): string {
    const status = assetUrlStatusForElement(el, $assetUrlStatuses);
    if (status === 'ready') return 'Asset loaded';
    if (status === 'error') return 'Could not load asset';
    if (status === 'unavailable') return 'Asset unavailable offline';
    return 'Loading from cloud…';
  }

  function assetPreviewRole(el: FrameElement): 'status' | 'alert' {
    const status = assetUrlStatusForElement(el, $assetUrlStatuses);
    return status === 'error' || status === 'unavailable' ? 'alert' : 'status';
  }

  export let state: StudioState;
  export let onUpdateFrame: (id: string, updates: Partial<Frame>) => void;
  export let onUpdateElement: (frameId: string, elementId: string, updates: Partial<FrameElement>) => void;
  export let onUpdateOrphan: (orphanId: string, updates: Partial<FrameElement>) => void = () => {};
  export let onPreviewFrame: (frame: Frame) => void;
  /** Called once when the user first focuses any inspector field in a session. Push undo here. */
  export let onBeginInspectorEdit: () => void = () => {};
  export let onAlignSelection: (axis: 'left' | 'h-center' | 'right' | 'top' | 'v-center' | 'bottom') => void = () => {};
  export let onDistributeSelection: (axis: 'h' | 'v') => void = () => {};
  export let onTidySelection: () => void = () => {};
  export let onRotateSelection: (delta: number) => void = () => {};
  export let onFlipSelection: (axis: 'horizontal' | 'vertical') => void = () => {};
  type SelectionMatchKind = 'type' | 'fill' | 'font' | 'stroke' | 'effect' | 'instance';
  export let onBulkUpdateSelection: (updates: Partial<FrameElement>) => void = () => {};
  export let onSelectSimilar: (match: SelectionMatchKind) => void = () => {};
  export let onApplyFramePreset: (width: number, height: number) => void = () => {};
  export let onUpdateProjectFont: (fontFamily: ProjectFontFamily) => void = () => {};
  export let onUpdateExportSettings: (updates: Partial<ProjectExportSettings>) => void = () => {};
  export let onUpdateTextStylePresets: (presets: TextStylePreset[]) => void = () => {};
  export let onUpdateAppearancePresets: (presets: AppearancePreset[]) => void = () => {};
  export let onUpdateProjectStyles: (styles: ProjectStyle[]) => void = () => {};
  export let onUpdateVariableCollections: (collections: ProjectVariableCollection[]) => void = () => {};
  export let onApplyProjectStyle: (id: string) => void = () => {};
  export let onOpenProjectTokensPanel: () => void = () => {};
  export let onExportCurrentFrame: () => void = () => {};
  export let onExportAllFrames: () => void = () => {};
  export let onCopyExportSummary: (summary: string) => void = () => {};
  export let componentMasters: ReadonlyArray<ComponentMaster> = [];
  export let onSetComponentInstanceVariant: (variantId: string | undefined) => void = () => {};
  export let onCreateComponentProperty: (kind: ComponentPropertyKind) => void = () => {};
  export let onSetComponentPropertyValue: (propertyId: string, value: ComponentPropertyValue) => void = () => {};
  export let onSetSelectionMask: (kind: ElementMaskKind) => void = () => {};
  export let onRemoveSelectionMask: () => void = () => {};
  export let onCreateBreakpointVariant: (baseFrameId: string, breakpoint: 'tablet' | 'mobile') => void = () => {};
  export let framePresets: ReadonlyArray<{ label: string; width: number; height: number }> = [];
  export let textStylePresets: ReadonlyArray<TextStylePreset> = [];
  export let appearancePresets: ReadonlyArray<AppearancePreset> = [];
  export let projectStyles: ReadonlyArray<ProjectStyle> = [];
  export let variableCollections: ReadonlyArray<ProjectVariableCollection> = [];
  export let assetInventory: ReadonlyArray<AssetInventoryEntry> = [];
  export let accessibilityIssuesByElement: Record<string, AccessibilityPreflightIssue[]> = {};
  export let readOnly = false;
  export let permissionLabel = 'Edit mode';
  export let cropImageElementId: string | null = null;
  export let onToggleImageCrop: (elementId: string) => void = () => {};
  export let onResetImageCrop: (elementId: string) => void = () => {};
  export let onPreviewBlendMode: (elementId: string | null, mode: BlendMode | null) => void = () => {};
  /**
   * When provided, picking an image in the inspector calls this with the raw
   * Blob and the parent handles upload (cloud asset) or inline (data: URL).
   * Falls back to the legacy data: URL behavior when unset.
   */
  export let onImageReplace: ((blob: Blob) => void) | null = null;
  /** Item 57 — scope the ColorPicker's project palette. */
  export let projectId: string | null = null;
  export let inspectorSearchRequest: InspectorSearchRequest = { query: '', nonce: 0 };
  let propertyQuery = '';
  let propertySearchInput: HTMLInputElement | null = null;
  let rightPanelRef: HTMLElement | null = null;
  let lastInspectorSearchNonce = 0;
  let inspectorTab: 'design' | 'prototype' = 'design';

  $: if (!RELEASE_FLAGS.showPrototypeInspector && inspectorTab === 'prototype') {
    inspectorTab = 'design';
  }

  $: if (RELEASE_FLAGS.showPrototypeInspector && inspectorTab === 'prototype' && !PrototypeInspectorComponent && !prototypeInspectorLoadError) {
    void ensurePrototypeInspector().catch(() => {});
  }

  function firstVisiblePropertyGroup(): HTMLElement | null {
    if (!rightPanelRef) return null;
    return Array
      .from(rightPanelRef.querySelectorAll<HTMLElement>('.prop-group'))
      .find(section => !section.hidden) ?? null;
  }

  async function applyInspectorSearchRequest(request: InspectorSearchRequest) {
    inspectorTab = 'design';
    propertyQuery = request.query;
    await tick();
    propertySearchInput?.focus({ preventScroll: true });
    await tick();
    firstVisiblePropertyGroup()?.scrollIntoView({ block: 'nearest' });
  }

  $: if (inspectorSearchRequest.nonce !== lastInspectorSearchNonce) {
    lastInspectorSearchNonce = inspectorSearchRequest.nonce;
    void applyInspectorSearchRequest(inspectorSearchRequest);
  }

  function guardReadOnlyInteraction(e: Event) {
    if (!readOnly) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('.property-search')) return;
    if (target.closest('[data-readonly-allowed]')) return;
    if (target.closest('button,input,select,textarea,label')) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function readonlyInteractionGuard(node: HTMLElement) {
    const handler = (event: Event) => guardReadOnlyInteraction(event);
    const options: AddEventListenerOptions = { capture: true };
    node.addEventListener('click', handler, options);
    node.addEventListener('input', handler, options);
    node.addEventListener('change', handler, options);
    node.addEventListener('keydown', handler, options);

    return {
      destroy() {
        node.removeEventListener('click', handler, options);
        node.removeEventListener('input', handler, options);
        node.removeEventListener('change', handler, options);
        node.removeEventListener('keydown', handler, options);
      },
    };
  }

  let selectedTextStylePresetId: TextStylePresetId = 'body';
  let selectedAppearancePresetId = 'card';
  let selectedTextBoxModeValue: NonNullable<FrameElement['textBoxMode']> = 'fixed';
  let selectedTextResizingSummaryValue = 'Fixed width + height';
  let propertySearchFocused = false;
  type PaddingSide = 't' | 'r' | 'b' | 'l';
  type PaddingScope = 'element' | 'frame';
  const DEFAULT_CONSTRAINTS: ElementConstraints = { horizontal: 'left', vertical: 'top' };
  const BLEND_MODE_OPTIONS: Array<{ value: BlendMode; label: string }> = [
    { value: 'normal', label: 'Normal' },
    { value: 'pass-through', label: 'Pass through' },
    { value: 'darken', label: 'Darken' },
    { value: 'multiply', label: 'Multiply' },
    { value: 'color-burn', label: 'Color burn' },
    { value: 'lighten', label: 'Lighten' },
    { value: 'screen', label: 'Screen' },
    { value: 'color-dodge', label: 'Color dodge' },
    { value: 'overlay', label: 'Overlay' },
    { value: 'soft-light', label: 'Soft light' },
    { value: 'hard-light', label: 'Hard light' },
    { value: 'difference', label: 'Difference' },
    { value: 'exclusion', label: 'Exclusion' },
    { value: 'hue', label: 'Hue' },
    { value: 'saturation', label: 'Saturation' },
    { value: 'color', label: 'Color' },
    { value: 'luminosity', label: 'Luminosity' },
    { value: 'plus-darker', label: 'Plus darker' },
    { value: 'plus-lighter', label: 'Plus lighter' },
  ];
  const FILL_KIND_OPTIONS: Array<{ value: FillKind; label: string }> = [
    { value: 'solid', label: 'Solid' },
    { value: 'gradient', label: 'Gradient' },
    { value: 'pattern', label: 'Pattern' },
    { value: 'image', label: 'Image' },
    { value: 'video', label: 'Video' },
  ];
  const GRADIENT_KIND_OPTIONS: Array<{ value: FillGradientKind; label: string }> = [
    { value: 'linear', label: 'Linear' },
    { value: 'radial', label: 'Radial' },
    { value: 'angular', label: 'Angular' },
    { value: 'diamond', label: 'Diamond' },
  ];
  const PATTERN_TILING_OPTIONS: Array<{ value: FillPatternTiling; label: string }> = [
    { value: 'repeat', label: 'Repeat' },
    { value: 'repeat-x', label: 'Repeat X' },
    { value: 'repeat-y', label: 'Repeat Y' },
    { value: 'no-repeat', label: 'No repeat' },
  ];
  const PATTERN_ALIGNMENT_OPTIONS: Array<{ value: FillPatternAlignment; label: string }> = [
    { value: 'top-left', label: 'Top left' },
    { value: 'top', label: 'Top' },
    { value: 'top-right', label: 'Top right' },
    { value: 'left', label: 'Left' },
    { value: 'center', label: 'Center' },
    { value: 'right', label: 'Right' },
    { value: 'bottom-left', label: 'Bottom left' },
    { value: 'bottom', label: 'Bottom' },
    { value: 'bottom-right', label: 'Bottom right' },
  ];
  const STROKE_PLACEMENT_OPTIONS: Array<{ value: StrokePlacement; label: string }> = [
    { value: 'inside', label: 'Inside' },
    { value: 'center', label: 'Center' },
    { value: 'outside', label: 'Outside' },
  ];
  const STROKE_PROFILE_OPTIONS: Array<{ value: StrokeWidthProfile; label: string }> = [
    { value: 'uniform', label: 'Uniform' },
    { value: 'taper-start', label: 'Taper start' },
    { value: 'taper-end', label: 'Taper end' },
    { value: 'taper-both', label: 'Taper both' },
  ];
  const STROKE_CAP_OPTIONS: Array<{ value: StrokeCap; label: string }> = [
    { value: 'butt', label: 'Butt' },
    { value: 'round', label: 'Round' },
    { value: 'square', label: 'Square' },
  ];
  const VECTOR_EDIT_TOOLS: Array<{ value: VectorEditTool; label: string }> = [
    { value: 'variable-width', label: 'Variable width' },
    { value: 'shape-builder', label: 'Shape builder' },
    { value: 'cut', label: 'Cut' },
    { value: 'bend', label: 'Bend' },
    { value: 'lasso', label: 'Lasso' },
    { value: 'paint', label: 'Paint' },
  ];
  const VECTOR_OPERATION_LABELS: Record<VectorEditOperationKind, string> = {
    merge: 'Merge',
    extract: 'Extract',
    subtract: 'Subtract',
    cut: 'Cut',
    bend: 'Bend',
  };
  const CROP_ASPECT_OPTIONS: Array<{ value: MediaCropAspectRatio; label: string }> = [
    { value: 'free', label: 'Free' },
    { value: '1:1', label: '1:1' },
    { value: '4:3', label: '4:3' },
    { value: '16:9', label: '16:9' },
    { value: '3:4', label: '3:4' },
    { value: '9:16', label: '9:16' },
  ];
  const MASK_KIND_OPTIONS: Array<{ value: ElementMaskKind; label: string }> = [
    { value: 'alpha', label: 'Alpha' },
    { value: 'vector', label: 'Vector' },
    { value: 'luminance', label: 'Luminance' },
  ];
  let linkedPaddingByTarget: Record<string, boolean> = {};
  type PropertyDoc = { description: string; href: string; linkLabel: string };
  const PROPERTY_DOCS: Record<string, PropertyDoc> = {
    x: {
      description: 'Horizontal offset from the parent container, exported as CSS left.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/left',
      linkLabel: 'CSS left reference',
    },
    y: {
      description: 'Vertical offset from the parent container, exported as CSS top.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/top',
      linkLabel: 'CSS top reference',
    },
    w: {
      description: 'Element or frame width; unit-suffixed values are preserved in export.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/width',
      linkLabel: 'CSS width reference',
    },
    h: {
      description: 'Element or frame height; unit-suffixed values are preserved in export.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/height',
      linkLabel: 'CSS height reference',
    },
    'font size': {
      description: 'Controls rendered text size and exports as CSS font-size.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/font-size',
      linkLabel: 'CSS font-size reference',
    },
    weight: {
      description: 'Controls stroke weight of text glyphs through CSS font-weight.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/font-weight',
      linkLabel: 'CSS font-weight reference',
    },
    align: {
      description: 'Sets inline text alignment for the selected text box.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/text-align',
      linkLabel: 'CSS text-align reference',
    },
    'letter spacing': {
      description: 'Adjusts spacing between text glyphs and exports as CSS letter-spacing.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/letter-spacing',
      linkLabel: 'CSS letter-spacing reference',
    },
    'line height': {
      description: 'Controls the distance between text baselines through CSS line-height.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/line-height',
      linkLabel: 'CSS line-height reference',
    },
    color: {
      description: 'Sets foreground text color, exported as CSS color.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/color',
      linkLabel: 'CSS color reference',
    },
    background: {
      description: 'Sets the layer or frame fill, exported as CSS background.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/background',
      linkLabel: 'CSS background reference',
    },
    opacity: {
      description: 'Controls layer transparency from 0% to 100%.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/opacity',
      linkLabel: 'CSS opacity reference',
    },
    radius: {
      description: 'Rounds element corners through CSS border-radius.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/border-radius',
      linkLabel: 'CSS border-radius reference',
    },
    'border width': {
      description: 'Controls border thickness around the selected layer.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/border-width',
      linkLabel: 'CSS border-width reference',
    },
    'border color': {
      description: 'Controls border stroke color for the selected layer.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/border-color',
      linkLabel: 'CSS border-color reference',
    },
    shadow: {
      description: 'Adds a box shadow effect around the selected layer.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/box-shadow',
      linkLabel: 'CSS box-shadow reference',
    },
    'text shadow': {
      description: 'Adds a shadow behind glyphs without affecting the layer box.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/text-shadow',
      linkLabel: 'CSS text-shadow reference',
    },
    direction: {
      description: 'Sets flex main-axis direction for Auto Layout children.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/flex-direction',
      linkLabel: 'CSS flex-direction reference',
    },
    gap: {
      description: 'Controls spacing between Auto Layout children.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/gap',
      linkLabel: 'CSS gap reference',
    },
    'align (cross)': {
      description: 'Aligns flex children on the cross axis with CSS align-items.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/align-items',
      linkLabel: 'CSS align-items reference',
    },
    'justify (main)': {
      description: 'Distributes flex children on the main axis with CSS justify-content.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/justify-content',
      linkLabel: 'CSS justify-content reference',
    },
    wrap: {
      description: 'Lets Auto Layout children flow onto multiple flex lines.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/flex-wrap',
      linkLabel: 'CSS flex-wrap reference',
    },
    padding: {
      description: 'Creates inner space between a container edge and its children.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/padding',
      linkLabel: 'CSS padding reference',
    },
    t: {
      description: 'Top padding side for the current Auto Layout container.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/padding-top',
      linkLabel: 'CSS padding-top reference',
    },
    r: {
      description: 'Right padding side for the current Auto Layout container.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/padding-right',
      linkLabel: 'CSS padding-right reference',
    },
    b: {
      description: 'Bottom padding side for the current Auto Layout container.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/padding-bottom',
      linkLabel: 'CSS padding-bottom reference',
    },
    l: {
      description: 'Left padding side for the current Auto Layout container.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/padding-left',
      linkLabel: 'CSS padding-left reference',
    },
    'image fit': {
      description: 'Controls how the image scales inside its box.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/object-fit',
      linkLabel: 'CSS object-fit reference',
    },
    'image position': {
      description: 'Controls which part of the image remains visible when fitted.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/object-position',
      linkLabel: 'CSS object-position reference',
    },
    'background image url': {
      description: 'Sets the frame background image source.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/background-image',
      linkLabel: 'CSS background-image reference',
    },
    'image repeat': {
      description: 'Controls whether a frame background image tiles.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/background-repeat',
      linkLabel: 'CSS background-repeat reference',
    },
    position: {
      description: 'Controls where a frame background image is anchored.',
      href: 'https://developer.mozilla.org/docs/Web/CSS/background-position',
      linkLabel: 'CSS background-position reference',
    },
  };

  $: multiElementSelection = !!activeFrame && state.selectedElementIds.length > 1 && state.selectedFrameIds.length <= 1;

  $: activeFrame = state.frames.find(f => f.id === state.activeFrameId) ?? null;
  $: frameLayoutGuideMap = new Map((activeFrame?.layoutGuides ?? []).map(guide => [guide.kind, guide] as const));
  $: uniformLayoutGuide = frameLayoutGuideMap.get('uniform');
  $: columnLayoutGuide = frameLayoutGuideMap.get('columns');
  $: rowLayoutGuide = frameLayoutGuideMap.get('rows');
  $: hasFrameLayoutGuides = !!uniformLayoutGuide || !!columnLayoutGuide || !!rowLayoutGuide;
  $: selectedFrames = state.frames.filter(f => state.selectedFrameIds.includes(f.id));
  $: selectedOrphan = findInList(state.orphanElements, state.selectedElementId ?? '');

  function findInList(elements: FrameElement[], id: string): FrameElement | null {
    for (const el of elements) {
      if (el.id === id) return el;
      if (el.children) {
        const child = findInList(el.children, id);
        if (child) return child;
      }
    }
    return null;
  }

  function findInFrame(frame: Frame, id: string): FrameElement | null {
    return findInList(frame.elements, id);
  }

  $: selectedElement = (activeFrame ? findInFrame(activeFrame, state.selectedElementId ?? '') : null)
                     ?? selectedOrphan
                     ?? null;
  $: selectedEffectMap = new Map((selectedElement?.effects ?? []).map(effect => [effect.kind, effect] as const));
  $: dropShadowStackEffect = selectedEffectMap.get('drop-shadow');
  $: innerShadowStackEffect = selectedEffectMap.get('inner-shadow');
  $: layerBlurEffect = selectedEffectMap.get('layer-blur');
  $: backgroundBlurEffect = selectedEffectMap.get('background-blur');
  $: glassEffect = selectedEffectMap.get('glass');
  $: noiseEffect = selectedEffectMap.get('noise');
  $: textureEffect = selectedEffectMap.get('texture');
  $: selectedElements = activeFrame
    ? state.selectedElementIds
        .map(id => findInFrame(activeFrame, id))
        .filter((element): element is FrameElement => element !== null)
    : [];
  $: primarySelectionElement = selectedElement ?? selectedElements[0] ?? null;
  $: isOrphanSelected = !!selectedOrphan && selectedElement?.id === selectedOrphan.id;
  $: resolvedTextStylePresets = withDefaultTextStylePresets(textStylePresets);
  $: resolvedAppearancePresets = withDefaultAppearancePresets(appearancePresets);
  $: resolvedProjectStyles = withDefaultProjectStyles(projectStyles);
  $: resolvedVariableCollections = withDefaultVariableCollections(variableCollections);
  $: faviconAssetOptions = assetInventory.filter(asset => !asset.mime || asset.mime.startsWith('image/'));
  $: selectedTextBoxModeValue = selectedElement?.type === 'text' ? selectedElement.textBoxMode ?? 'fixed' : 'fixed';
  $: selectedTextResizingSummaryValue =
    selectedTextBoxModeValue === 'auto-width'
      ? 'Hug width + height'
      : selectedTextBoxModeValue === 'auto-height'
        ? 'Fixed width + hug height'
        : 'Fixed width + height';
  $: selectedAccessibilityIssues = selectedElement ? (accessibilityIssuesByElement[selectedElement.id] ?? []) : [];
  $: selectedContrastIssue = selectedAccessibilityIssues.find(issue => issue.code === 'text-low-contrast') ?? null;
  $: selectedElementEffectiveFlowExport = !!selectedElement && !!activeFrame && !isOrphanSelected && (
    activeFrame.exportSettings?.layoutMode && activeFrame.exportSettings.layoutMode !== 'inherit'
      ? activeFrame.exportSettings.layoutMode
      : state.exportSettings?.layoutMode ?? 'flow'
  ) === 'flow';
  $: selectedComponentMaster = selectedElement?.componentInstance
    ? componentMasters.find(master => master.id === selectedElement?.componentInstance?.masterId) ?? null
    : null;
  $: selectedComponentProperties = selectedComponentMaster?.properties ?? [];
  $: inspectorExport = inspectorExportModel({
    selectedElement,
    selectedFrames,
    activeFrame,
    frameCount: state.frames.length,
  });
  $: inspectorExportCopySummary = inspectorExportSummary({
    model: inspectorExport,
    frameCount: state.frames.length,
    sliceCount: activeFrame?.elements.filter(element => element.type === 'slice' && !element.hidden).length ?? 0,
  });
  $: elementPaddingLinked = selectedElement?.id
    ? !!linkedPaddingByTarget[paddingLinkKey('element', selectedElement.id)]
    : false;
  $: framePaddingLinked = activeFrame?.id
    ? !!linkedPaddingByTarget[paddingLinkKey('frame', activeFrame.id)]
    : false;

  type GeometryField = 'x' | 'y' | 'width' | 'height';
  const GEOMETRY_CSS_FIELD: Record<GeometryField, 'xCss' | 'yCss' | 'widthCss' | 'heightCss'> = {
    x: 'xCss',
    y: 'yCss',
    width: 'widthCss',
    height: 'heightCss',
  };

  /**
   * Parses a value from a numeric input. Routes through `evalMath` (item 53)
   * so users can type expressions like `180+20`, `(100*2)/4`, `48-12` and the
   * field commits the result. Plain numbers continue to work unchanged.
   */
  function num(val: string): number {
    return evalMath(val);
  }

  function componentPropertyValue(property: ComponentPropertyDefinition): ComponentPropertyValue {
    if (property.kind === 'variant') return selectedElement?.componentInstance?.variantId ?? '';
    const value = selectedElement?.componentInstance?.propertyValues?.[property.id];
    if (value !== undefined) return value;
    if (property.defaultValue !== undefined) return property.defaultValue;
    return property.kind === 'boolean' ? true : '';
  }

  const DEFAULT_FRAME_BORDER: NonNullable<Frame['border']> = {
    width: 1,
    style: 'solid',
    color: 'rgba(255,255,255,0.34)',
    placement: 'inside',
  };
  const DEFAULT_FRAME_SHADOW: NonNullable<Frame['shadow']> = { x: 0, y: 8, blur: 24, spread: 0, color: 'rgba(0,0,0,0.28)' };

  function updateFrame(key: keyof Frame, val: Frame[keyof Frame]) {
    if (!activeFrame) return;
    onUpdateFrame(activeFrame.id, { [key]: val } as Partial<Frame>);
  }

  function updateFrameOpacity(percent: number) {
    const opacity = Math.max(0, Math.min(100, percent)) / 100;
    updateFrame('opacity', opacity >= 1 ? undefined : opacity);
  }

  function updateFrameRotation(value: string) {
    const rotation = num(value.replace('°', ''));
    if (Math.abs(rotation) < 0.05) {
      updateFrame('rotation', undefined);
      return;
    }
    updateFrame('rotation', Math.max(-360, Math.min(360, Math.round(rotation * 10) / 10)));
  }

  function updateFrameBorder(patch: Partial<NonNullable<Frame['border']>>) {
    const next = { ...(activeFrame?.border ?? DEFAULT_FRAME_BORDER), ...patch };
    updateFrame('border', next);
  }

  function updateFrameShadow(patch: Partial<NonNullable<Frame['shadow']>>) {
    const next = { ...(activeFrame?.shadow ?? DEFAULT_FRAME_SHADOW), ...patch };
    updateFrame('shadow', next);
  }

  function resizeActiveFrameToFit() {
    if (!activeFrame) return;
    const visible = activeFrame.elements.filter(element => !element.hidden && !element.isFrameBackground && element.type !== 'slice');
    if (visible.length === 0) return;
    const maxRight = Math.max(...visible.map(element => element.x + element.width));
    const maxBottom = Math.max(...visible.map(element => element.y + element.height));
    onBeginInspectorEdit();
    onUpdateFrame(activeFrame.id, {
      width: Math.max(1, Math.ceil(maxRight)),
      height: Math.max(1, Math.ceil(maxBottom)),
    });
  }

  function updateFrameExportSettings(patch: Partial<FrameExportSettings>) {
    if (!activeFrame) return;
    const next: FrameExportSettings = { ...(activeFrame.exportSettings ?? {}), ...patch };
    for (const key of Object.keys(next) as Array<keyof FrameExportSettings>) {
      if (next[key] === undefined) delete next[key];
    }
    updateFrame('exportSettings', Object.keys(next).length ? next : undefined);
  }

  function defaultLayoutGuide(kind: FrameLayoutGuideKind): FrameLayoutGuide {
    if (kind === 'uniform') return { id: `guide-${kind}`, kind, size: 8, color: 'rgba(100,140,255,0.28)' };
    if (kind === 'columns') return { id: `guide-${kind}`, kind, count: 12, margin: 64, gutter: 24, trackType: 'stretch', color: 'rgba(100,140,255,0.18)' };
    return { id: `guide-${kind}`, kind, count: 6, margin: 64, gutter: 24, trackType: 'stretch', color: 'rgba(255,189,46,0.16)' };
  }

  function frameLayoutGuide(kind: FrameLayoutGuideKind): FrameLayoutGuide | undefined {
    return frameLayoutGuideMap.get(kind);
  }

  function setFrameLayoutGuide(kind: FrameLayoutGuideKind, enabled: boolean) {
    if (!activeFrame) return;
    const current = activeFrame.layoutGuides ?? [];
    const next = enabled
      ? current.some(guide => guide.kind === kind) ? current : [...current, defaultLayoutGuide(kind)]
      : current.filter(guide => guide.kind !== kind);
    updateFrame('layoutGuides', next.length ? next : undefined);
  }

  function updateFrameLayoutGuide(kind: FrameLayoutGuideKind, patch: Partial<FrameLayoutGuide>) {
    if (!activeFrame) return;
    const current = activeFrame.layoutGuides ?? [];
    const guide = current.find(candidate => candidate.kind === kind) ?? defaultLayoutGuide(kind);
    const nextGuide = { ...guide, ...patch };
    const next = current.some(candidate => candidate.kind === kind)
      ? current.map(candidate => candidate.kind === kind ? nextGuide : candidate)
      : [...current, nextGuide];
    updateFrame('layoutGuides', next);
  }

  function faviconAssetLabel(asset: AssetInventoryEntry): string {
    const name = asset.path?.split('/').pop() || asset.assetId;
    const ref = asset.referenceCount === 1 ? '1 ref' : `${asset.referenceCount} refs`;
    return `${name} (${ref})`;
  }

  function updateEl(key: keyof FrameElement, val: FrameElement[keyof FrameElement]) {
    if (!selectedElement) return;
    const patch = { [key]: val } as Partial<FrameElement>;
    updateSelectedElement(patch);
  }

  function updateTextBoxMode(mode: NonNullable<FrameElement['textBoxMode']>) {
    updateEl('textBoxMode', mode === 'fixed' ? undefined : mode);
  }

  function currentVectorEdit(): VectorEditState {
    return selectedElement?.vectorEdit ?? {};
  }

  function updateVectorEdit(patch: Partial<VectorEditState>) {
    if (!selectedElement || selectedElement.type !== 'vector') return;
    const next: VectorEditState = { ...currentVectorEdit(), ...patch };
    updateSelectedElement({ vectorEdit: next });
  }

  function setVectorEditActive(active: boolean) {
    updateVectorEdit({
      active,
      tool: active ? currentVectorEdit().tool ?? 'variable-width' : currentVectorEdit().tool,
    });
  }

  function setVectorEditTool(tool: VectorEditTool) {
    updateVectorEdit({ active: true, tool });
  }

  function setVectorVariableWidth(value: number) {
    if (!selectedElement) return;
    const pointCount = Math.max(2, selectedElement.vectorPoints?.length ?? 2);
    const width = Math.max(1, Math.min(48, Math.round(value)));
    updateVectorEdit({ active: true, tool: 'variable-width', variableWidths: Array(pointCount).fill(width) });
    updateSelectedBorder({ width, widthProfile: width === (selectedElement.border?.width ?? 2) ? 'uniform' : 'taper-both' });
  }

  function setVectorPaintColor(color: string) {
    updateVectorEdit({ active: true, tool: 'paint', paintColor: color });
    updateSelectedElement({ background: color, border: { ...(selectedElement?.border ?? DEFAULT_ELEMENT_BORDER), color } });
  }

  function addVectorOperation(kind: VectorEditOperationKind) {
    const operation = { id: `vector-op-${Date.now()}-${kind}`, kind, createdAt: Date.now() };
    updateVectorEdit({
      active: true,
      tool: kind === 'cut' || kind === 'bend' ? kind : 'shape-builder',
      operations: [...(currentVectorEdit().operations ?? []), operation],
    });
  }

  function setSelectedMask(kind: ElementMaskKind) {
    onSetSelectionMask(kind);
  }

  function updateSelectedMask(patch: Partial<NonNullable<FrameElement['mask']>>) {
    if (!selectedElement?.mask) return;
    updateSelectedElement({ mask: { ...selectedElement.mask, ...patch } });
  }

  function setElementRotation(value: number) {
    const normalized = Math.max(-360, Math.min(360, value));
    updateEl('rotation', normalized === 0 ? undefined : normalized);
  }

  function rotateElementBy(delta: number) {
    onBeginInspectorEdit();
    setElementRotation((selectedElement?.rotation ?? 0) + delta);
  }

  function toggleElementFlip(axis: 'x' | 'y') {
    if (!selectedElement) return;
    onBeginInspectorEdit();
    if (axis === 'x') updateEl('flipX', selectedElement.flipX ? undefined : true);
    else updateEl('flipY', selectedElement.flipY ? undefined : true);
  }

  function setSelectedBlendMode(mode: BlendMode) {
    updateEl('blendMode', mode === 'normal' ? undefined : mode);
    onPreviewBlendMode(null, null);
  }

  function cssBlendMode(mode: BlendMode | null | undefined): string {
    return !mode || mode === 'normal' || mode === 'pass-through' ? '' : mode;
  }

  function applyLocalBlendPreview(elementId: string, mode: BlendMode | null) {
    const selector = `[data-element-id="${elementId.replace(/"/g, '\\"')}"]`;
    const fallback = selectedElement?.blendMode ?? null;
    const value = cssBlendMode(mode ?? fallback);
    document.querySelectorAll(selector).forEach(node => {
      if (node instanceof HTMLElement) node.style.mixBlendMode = value;
    });
  }

  function previewSelectedBlendMode(mode: BlendMode | null) {
    if (!selectedElement) return;
    applyLocalBlendPreview(selectedElement.id, mode);
    onPreviewBlendMode(selectedElement.id, mode);
  }

  function updateVisibilityMode(mode: AppearanceValueMode) {
    updateEl('visibilityMode', mode === 'fixed' ? undefined : mode);
  }

  function selectedConstraints(): ElementConstraints {
    return {
      horizontal: selectedElement?.constraints?.horizontal ?? DEFAULT_CONSTRAINTS.horizontal,
      vertical: selectedElement?.constraints?.vertical ?? DEFAULT_CONSTRAINTS.vertical,
    };
  }
  $: currentConstraints = selectedConstraints();

  function updateElementConstraint(axis: 'horizontal', value: HorizontalConstraint): void;
  function updateElementConstraint(axis: 'vertical', value: VerticalConstraint): void;
  function updateElementConstraint(axis: keyof ElementConstraints, value: ElementConstraints[keyof ElementConstraints]) {
    if (!selectedElement) return;
    onBeginInspectorEdit();
    const next: ElementConstraints = { ...selectedConstraints(), [axis]: value };
    updateSelectedElement(
      next.horizontal === DEFAULT_CONSTRAINTS.horizontal && next.vertical === DEFAULT_CONSTRAINTS.vertical
        ? { constraints: undefined }
        : { constraints: next },
    );
  }

  function updateSelectedElement(patch: Partial<FrameElement>) {
    if (!selectedElement) return;
    if (isOrphanSelected) {
      onUpdateOrphan(selectedElement.id, patch);
    } else if (activeFrame) {
      onUpdateElement(activeFrame.id, selectedElement.id, patch);
    }
  }

  const DEFAULT_BULK_BORDER: NonNullable<FrameElement['border']> = { width: 1, style: 'solid', color: 'rgba(255,255,255,0.4)' };
  const DEFAULT_BULK_SHADOW: NonNullable<FrameElement['shadow']> = { x: 0, y: 4, blur: 12, spread: 0, color: 'rgba(0,0,0,0.25)' };
  const DEFAULT_ELEMENT_BORDER: NonNullable<FrameElement['border']> = { width: 1, style: 'solid', color: 'rgba(255,255,255,0.4)', placement: 'inside' };
  const EFFECT_LABELS: Record<ElementEffectKind, string> = {
    'drop-shadow': 'Drop shadow',
    'inner-shadow': 'Inner shadow',
    'layer-blur': 'Layer blur',
    'background-blur': 'Background blur',
    glass: 'Glass',
    noise: 'Noise',
    texture: 'Texture',
  };
  const EFFECT_ORDER: ElementEffectKind[] = ['drop-shadow', 'inner-shadow', 'layer-blur', 'background-blur', 'glass', 'noise', 'texture'];
  const TEXTURE_STYLE_OPTIONS: Array<{ value: TextureEffectStyle; label: string }> = [
    { value: 'grain', label: 'Grain' },
    { value: 'paper', label: 'Paper' },
    { value: 'fabric', label: 'Fabric' },
  ];

  function defaultEffect(kind: ElementEffectKind): ElementEffect {
    const id = `fx-${kind}-${Date.now().toString(36)}`;
    if (kind === 'drop-shadow') {
      return { id, kind, settings: { shadow: { x: 0, y: 4, blur: 12, spread: 0, color: 'rgba(0,0,0,0.25)' } } };
    }
    if (kind === 'inner-shadow') {
      return { id, kind, settings: { shadow: { x: 0, y: 2, blur: 8, spread: 0, color: 'rgba(0,0,0,0.35)' } } };
    }
    if (kind === 'layer-blur') return { id, kind, settings: { blur: { radius: 8 } } };
    if (kind === 'background-blur') return { id, kind, settings: { blur: { radius: 12 } } };
    if (kind === 'glass') {
      return { id, kind, settings: { glass: { blur: 18, saturation: 140, tint: 'rgba(255,255,255,0.16)', opacity: 1 } } };
    }
    if (kind === 'noise') return { id, kind, settings: { noise: { opacity: 0.18, size: 2, monochrome: true } } };
    return { id, kind, settings: { texture: { style: 'grain', scale: 12, opacity: 0.16, color: 'rgba(255,255,255,0.32)' } } };
  }

  function selectedEffect(kind: ElementEffectKind): ElementEffect | undefined {
    return selectedElement?.effects?.find(effect => effect.kind === kind);
  }

  function setSelectedEffect(kind: ElementEffectKind, enabled: boolean) {
    if (!selectedElement) return;
    const effects = selectedElement.effects ?? [];
    if (enabled) {
      if (effects.some(effect => effect.kind === kind)) return;
      updateEl('effects', [...effects, defaultEffect(kind)]);
      return;
    }
    const next = effects.filter(effect => effect.kind !== kind);
    updateEl('effects', next.length ? next : undefined);
  }

  function updateSelectedEffect(kind: ElementEffectKind, patch: Partial<ElementEffect['settings']>) {
    if (!selectedElement) return;
    const effects = selectedElement.effects ?? [];
    const current = selectedEffect(kind) ?? defaultEffect(kind);
    const nextEffect: ElementEffect = { ...current, settings: { ...current.settings, ...patch } };
    const next = effects.some(effect => effect.kind === kind)
      ? effects.map(effect => effect.kind === kind ? nextEffect : effect)
      : [...effects, nextEffect];
    updateEl('effects', next);
  }

  function updateSelectedShadowEffect(kind: 'drop-shadow' | 'inner-shadow', patch: Partial<NonNullable<ElementEffect['settings']['shadow']>>) {
    const current = selectedEffect(kind)?.settings.shadow ?? defaultEffect(kind).settings.shadow!;
    updateSelectedEffect(kind, { shadow: { ...current, ...patch } });
  }

  function uniqueSelectionValues(values: Array<string | null | undefined>): string[] {
    return [...new Set(values.map(value => value || 'transparent'))];
  }

  function commonSelectionValue(key: 'color' | 'background'): string | null {
    const values = uniqueSelectionValues(selectedElements.map(element => element[key]));
    return values.length === 1 ? values[0] : null;
  }

  function selectionValueSummary(key: 'color' | 'background'): string {
    const values = uniqueSelectionValues(selectedElements.map(element => element[key]));
    if (values.length === 0) return 'none';
    if (values.length === 1) return values[0];
    return `${values.length} mixed`;
  }

  function commonBorderColor(): string | null {
    const values = uniqueSelectionValues(selectedElements.map(element => element.border?.color));
    return values.length === 1 ? values[0] : null;
  }

  function commonShadowColor(): string | null {
    const values = uniqueSelectionValues(selectedElements.map(element => element.shadow?.color ?? element.textShadow?.color));
    return values.length === 1 ? values[0] : null;
  }

  function firstSelectionBorder(): NonNullable<FrameElement['border']> {
    return primarySelectionElement?.border ?? selectedElements.find(element => element.border)?.border ?? DEFAULT_BULK_BORDER;
  }

  function firstSelectionShadow(): NonNullable<FrameElement['shadow']> {
    return primarySelectionElement?.shadow ?? selectedElements.find(element => element.shadow)?.shadow ?? DEFAULT_BULK_SHADOW;
  }

  function bulkUpdateSelection(patch: Partial<FrameElement>) {
    if (!multiElementSelection) return;
    onBeginInspectorEdit();
    if (activeFrame && selectedElements.length > 0) {
      for (const element of selectedElements) {
        onUpdateElement(activeFrame.id, element.id, patch);
      }
      return;
    }
    onBulkUpdateSelection(patch);
  }

  function updateBulkColor(key: 'color' | 'background', value: string) {
    bulkUpdateSelection({ [key]: value } as Partial<FrameElement>);
  }

  function updateBulkBorderColor(color: string) {
    bulkUpdateSelection({ border: { ...firstSelectionBorder(), color } });
  }

  function updateSelectedBorder(patch: Partial<NonNullable<FrameElement['border']>>) {
    const border = selectedElement?.border ?? DEFAULT_ELEMENT_BORDER;
    updateEl('border', { ...border, ...patch });
  }

  function updateSelectedBorderSide(side: 'top' | 'right' | 'bottom' | 'left', patch: Partial<NonNullable<NonNullable<FrameElement['border']>['sides']>[typeof side]>) {
    const border = selectedElement?.border ?? DEFAULT_ELEMENT_BORDER;
    const nextSides = { ...(border.sides ?? {}), [side]: { ...(border.sides?.[side] ?? {}), ...patch } };
    updateEl('border', { ...border, sides: nextSides });
  }

  function currentCornerRadii(): NonNullable<FrameElement['cornerRadii']> {
    return selectedElement?.cornerRadii ?? {
      topLeft: selectedElement?.borderRadius ?? 0,
      topRight: selectedElement?.borderRadius ?? 0,
      bottomRight: selectedElement?.borderRadius ?? 0,
      bottomLeft: selectedElement?.borderRadius ?? 0,
    };
  }

  function updateCornerRadius(corner: keyof NonNullable<FrameElement['cornerRadii']>, value: number) {
    const radii = { ...currentCornerRadii(), [corner]: Math.max(0, value) };
    updateSelectedElement({ cornerRadii: radii, borderRadius: Math.max(radii.topLeft, radii.topRight, radii.bottomRight, radii.bottomLeft) });
  }

  function updateUniformRadius(value: number) {
    const radius = Math.max(0, value);
    updateSelectedElement({ borderRadius: radius, cornerRadii: undefined });
  }

  function setCornerSmoothing(value: number) {
    const smoothing = Math.max(0, Math.min(1, value));
    updateSelectedElement({ cornerSmoothing: smoothing === 0 ? undefined : smoothing });
  }

  function updateBulkShadowColor(color: string) {
    bulkUpdateSelection({ shadow: { ...firstSelectionShadow(), color } });
  }

  function canSelectMatching(match: SelectionMatchKind): boolean {
    if (!primarySelectionElement) return false;
    if (multiElementSelection && (match === 'stroke' || match === 'effect')) {
      return selectedElements.length > 0;
    }
    if (match === 'font') return primarySelectionElement.type === 'text';
    if (match === 'stroke') return !!primarySelectionElement.border;
    if (match === 'effect') return !!primarySelectionElement.shadow || !!primarySelectionElement.textShadow || !!primarySelectionElement.effects?.some(effect => effect.visible !== false);
    if (match === 'instance') return !!primarySelectionElement.componentInstance;
    return true;
  }

  function imageFilterDisplayValue(key: MediaFilterKey): number {
    return mediaFilterValue(selectedElement?.mediaTransform, key);
  }

  function updateImageFilter(key: MediaFilterKey, value: number) {
    if (!selectedElement) return;
    updateSelectedElement(imageFilterPatch(key, value, selectedElement.mediaTransform));
  }

  function resetImageFilters() {
    if (!selectedElement) return;
    updateSelectedElement(resetImageFiltersPatch(selectedElement));
  }

  function updateMediaFill(patch: Partial<NonNullable<FrameElement['mediaFill']>>) {
    if (!selectedElement) return;
    const current = mediaFillForElement(selectedElement) ?? { kind: 'raster' as const };
    updateSelectedElement({
      mediaFill: {
        ...current,
        ...patch,
        transform: patch.transform ?? current.transform ?? { kind: current.kind },
      },
    });
  }

  function updateMediaFillMode(mode: 'fit' | 'fill' | 'stretch' | 'original' | 'tile') {
    if (!selectedElement) return;
    const fill = mediaFillForElement(selectedElement);
    if (!fill) return;
    updateMediaFill({
      transform: {
        ...(fill.transform ?? { kind: fill.kind }),
        kind: fill.kind,
        fill: { ...(fill.transform?.fill ?? { mode: 'fill' }), mode },
      },
    });
  }

  function selectedMediaTransform(): MediaTransform | undefined {
    if (!selectedElement) return undefined;
    return selectedElement.type === 'image'
      ? selectedElement.mediaTransform
      : mediaFillForElement(selectedElement)?.transform;
  }

  function applyMediaTransformPatch(patch: Partial<FrameElement>) {
    if (!selectedElement) return;
    if (selectedElement.type === 'image' && !selectedElement.mediaFill) {
      updateSelectedElement(patch);
      return;
    }
    const fill = mediaFillForElement(selectedElement);
    if (!fill) return;
    updateMediaFill({
      transform: patch.mediaTransform ?? fill.transform ?? { kind: fill.kind },
    });
  }

  function setCropAspectRatio(ratio: MediaCropAspectRatio) {
    applyMediaTransformPatch(mediaCropAspectPatch(ratio, selectedMediaTransform()));
  }

  function resizeSelectedMediaToFit() {
    applyMediaTransformPatch(resizeMediaToFitPatch(selectedMediaTransform()));
  }

  function updateSelectedMediaInternalTransform(patch: Pick<MediaTransform, 'scale' | 'translateX' | 'translateY'>) {
    applyMediaTransformPatch(mediaInternalTransformPatch(patch, selectedMediaTransform()));
  }

  function selectedMediaPreviewTransform(): string | undefined {
    const transform = selectedMediaTransform();
    if (!transform) return undefined;
    const scaleValue = transform.scale ?? 1;
    const tx = transform.translateX ?? 0;
    const ty = transform.translateY ?? 0;
    return scaleValue === 1 && tx === 0 && ty === 0 ? undefined : `translate(${tx}%, ${ty}%) scale(${scaleValue})`;
  }

  function defaultFillId(): string {
    return selectedElement ? `fill-${selectedElement.id}` : 'fill';
  }

  function defaultGradientFill(): NonNullable<ElementFill['gradient']> {
    return {
      type: 'linear',
      angle: 180,
      rotation: 0,
      stops: [
        { color: '#ff6b39', pos: 0 },
        { color: '#1a0a2e', pos: 100 },
      ],
    };
  }

  function defaultPatternFill(): NonNullable<ElementFill['pattern']> {
    return {
      style: 'diagonal',
      foreground: 'rgba(255,255,255,0.18)',
      background: 'transparent',
      size: 12,
      source: 'document',
      tiling: 'repeat',
      scale: 100,
      spacing: 12,
      alignment: 'center',
      opacity: 1,
    };
  }

  function clampPercent(value: number, fallback = 0): number {
    return Math.max(0, Math.min(100, Number.isFinite(value) ? value : fallback));
  }

  function normalizedAngle(value: number): number {
    return ((Math.round(value) % 360) + 360) % 360;
  }

  function gradientStopsForCss(gradient: NonNullable<ElementFill['gradient']>): string {
    const stops = gradient.stops.length >= 2 ? gradient.stops : defaultGradientFill().stops;
    const ordered = gradient.flipX || gradient.flipY
      ? stops.map(stop => ({ ...stop, pos: 100 - clampPercent(stop.pos) })).reverse()
      : stops;
    return ordered
      .map(stop => `${stop.color} ${Math.round(clampPercent(stop.pos))}%`)
      .join(', ');
  }

  function gradientBackground(fill?: ElementFill): string {
    const gradient = { ...defaultGradientFill(), ...(fill?.gradient ?? {}) };
    const angle = normalizedAngle((gradient.angle ?? 180) + (gradient.rotation ?? 0));
    const stops = gradientStopsForCss(gradient);
    if (gradient.type === 'radial') return `radial-gradient(circle, ${stops})`;
    if (gradient.type === 'angular') return `conic-gradient(from ${angle}deg, ${stops})`;
    if (gradient.type === 'diamond') return `conic-gradient(from ${normalizedAngle(angle + 45)}deg at 50% 50%, ${stops})`;
    return `linear-gradient(${angle}deg, ${stops})`;
  }

  function patternPosition(alignment: FillPatternAlignment | undefined): string {
    if (alignment === 'top-left') return 'left top';
    if (alignment === 'top') return 'center top';
    if (alignment === 'top-right') return 'right top';
    if (alignment === 'left') return 'left center';
    if (alignment === 'right') return 'right center';
    if (alignment === 'bottom-left') return 'left bottom';
    if (alignment === 'bottom') return 'center bottom';
    if (alignment === 'bottom-right') return 'right bottom';
    return 'center center';
  }

  function patternForeground(pattern: NonNullable<ElementFill['pattern']>): string {
    const opacity = Math.max(0, Math.min(1, pattern.opacity ?? 1));
    if (opacity >= 0.999) return pattern.foreground;
    return `color-mix(in srgb, ${pattern.foreground} ${Math.round(opacity * 100)}%, transparent)`;
  }

  function patternBackground(fill?: ElementFill): string {
    const pattern = { ...defaultPatternFill(), ...(fill?.pattern ?? {}) };
    const foreground = patternForeground(pattern);
    const background = pattern.background;
    const size = Math.max(1, Math.round(pattern.size));
    const spacing = Math.max(0, Math.round(pattern.spacing ?? size));
    const scale = Math.max(10, Math.round(pattern.scale ?? 100)) / 100;
    const tile = Math.max(4, Math.round((size + spacing) * scale));
    const position = patternPosition(pattern.alignment);
    const tiling = pattern.tiling ?? 'repeat';
    const layerSuffix = `${position} / ${tile}px ${tile}px ${tiling}`;
    const style = pattern.style;
    if (style === 'grid') {
      return `linear-gradient(${foreground} 1px, transparent 1px) ${layerSuffix}, linear-gradient(90deg, ${foreground} 1px, transparent 1px) ${layerSuffix}, ${background}`;
    }
    if (style === 'dots') {
      return `radial-gradient(circle, ${foreground} 1.5px, transparent 2px) ${layerSuffix}, ${background}`;
    }
    return `repeating-linear-gradient(45deg, ${background} 0 ${spacing}px, ${foreground} ${spacing}px ${spacing + size}px) ${layerSuffix}, ${background}`;
  }

  let selectedFill: ElementFill;

  function currentFill(element: FrameElement | null): ElementFill {
    const stored = element?.fills?.[0];
    const media = element ? mediaFillForElement(element) : undefined;
    const background = element?.background ?? 'transparent';
    const inferredKind: FillKind = stored?.kind
      ?? (media?.kind === 'video' ? 'video' : media ? 'image' : /^repeating-|radial-gradient\(circle/i.test(background) ? 'pattern' : /gradient\(/i.test(background) ? 'gradient' : 'solid');
    return {
      id: stored?.id ?? defaultFillId(),
      kind: inferredKind,
      value: stored?.value ?? background,
      colorModel: stored?.colorModel ?? 'hex',
      source: stored?.source ?? 'document',
      variableRef: stored?.variableRef,
      gradient: stored?.gradient,
      pattern: stored?.pattern,
      media: stored?.media ?? media,
    };
  }

  $: selectedFill = currentFill(selectedElement);

  function updateFillMeta(patch: Partial<ElementFill>) {
    if (!selectedElement) return;
    const next: ElementFill = { ...selectedFill, ...patch, id: selectedFill.id ?? defaultFillId() };
    updateSelectedElement({ fills: [next] });
  }

  function setFillKind(kind: FillKind) {
    if (!selectedElement) return;
    onBeginInspectorEdit();
    const base: ElementFill = { ...selectedFill, id: selectedFill.id ?? defaultFillId(), kind };
    if (kind === 'solid') {
      const value = /^#|^rgb|^hsl|^transparent$/i.test(selectedElement.background) ? selectedElement.background : '#f7f1e8';
      updateSelectedElement({ background: value, mediaFill: undefined, fills: [{ ...base, value }] });
      return;
    }
    if (kind === 'gradient') {
      const gradient = base.gradient ?? defaultGradientFill();
      const value = /gradient\(/i.test(selectedElement.background) && base.gradient
        ? selectedElement.background
        : gradientBackground({ ...base, gradient });
      updateSelectedElement({ background: value, mediaFill: undefined, fills: [{ ...base, gradient, value }] });
      return;
    }
    if (kind === 'pattern') {
      const pattern = { ...defaultPatternFill(), ...(base.pattern ?? {}) };
      const value = patternBackground({ ...base, pattern });
      updateSelectedElement({ background: value, mediaFill: undefined, fills: [{ ...base, pattern, value }] });
      return;
    }
    const mediaKind = kind === 'video' ? 'video' : 'raster';
    const media = { ...(base.media ?? { kind: mediaKind as 'raster' | 'video' }), kind: mediaKind as 'raster' | 'video', transform: base.media?.transform ?? { kind: mediaKind as 'raster' | 'video', fill: { mode: 'fill' as const } } };
    updateSelectedElement({ mediaFill: media, background: 'transparent', fills: [{ ...base, media, value: media.src }] });
  }

  function updateGradientFill(patch: Partial<NonNullable<ElementFill['gradient']>>) {
    const gradient = { ...defaultGradientFill(), ...(selectedFill.gradient ?? {}), ...patch };
    const value = gradientBackground({ ...selectedFill, gradient });
    updateSelectedElement({ background: value, mediaFill: undefined, fills: [{ ...selectedFill, kind: 'gradient', gradient, value }] });
  }

  function updateGradientStop(index: number, patch: Partial<NonNullable<ElementFill['gradient']>['stops'][number]>) {
    const gradient = { ...defaultGradientFill(), ...(selectedFill.gradient ?? {}) };
    const stops = (gradient.stops.length >= 2 ? gradient.stops : defaultGradientFill().stops)
      .map((stop, stopIndex) => stopIndex === index ? { ...stop, ...patch } : stop);
    updateGradientFill({ stops });
  }

  function addGradientStop() {
    const gradient = { ...defaultGradientFill(), ...(selectedFill.gradient ?? {}) };
    const stops = gradient.stops.length >= 2 ? gradient.stops : defaultGradientFill().stops;
    const last = stops[stops.length - 1];
    updateGradientFill({ stops: [...stops, { color: last.color, pos: Math.min(100, last.pos + 25) }] });
  }

  function removeGradientStop(index: number) {
    const gradient = { ...defaultGradientFill(), ...(selectedFill.gradient ?? {}) };
    if (gradient.stops.length <= 2) return;
    updateGradientFill({ stops: gradient.stops.filter((_, stopIndex) => stopIndex !== index) });
  }

  function updatePatternFill(patch: Partial<NonNullable<ElementFill['pattern']>>) {
    const pattern = { ...defaultPatternFill(), ...(selectedFill.pattern ?? {}), ...patch };
    const value = patternBackground({ ...selectedFill, pattern });
    updateSelectedElement({ background: value, mediaFill: undefined, fills: [{ ...selectedFill, kind: 'pattern', source: pattern.source ?? selectedFill.source, pattern, value }] });
  }

  function findParentElement(elements: FrameElement[], childId: string): FrameElement | null {
    for (const element of elements) {
      if (element.children?.some(child => child.id === childId)) return element;
      if (element.children) {
        const nested = findParentElement(element.children, childId);
        if (nested) return nested;
      }
    }
    return null;
  }

  function unitBasis(field: GeometryField): number {
    if (!selectedElement) return 0;
    const horizontal = field === 'x' || field === 'width';
    const selectedId = selectedElement.id;
    const parent = activeFrame ? findParentElement(activeFrame.elements, selectedId) : findParentElement(state.orphanElements, selectedId);
    if (parent) return horizontal ? parent.width : parent.height;
    if (activeFrame && !isOrphanSelected) return horizontal ? activeFrame.width : activeFrame.height;
    return horizontal ? selectedElement.width : selectedElement.height;
  }

  function formatGeometryValue(element: FrameElement, field: GeometryField): string {
    return element[GEOMETRY_CSS_FIELD[field]] ?? String(Math.round(element[field]));
  }

  function parseGeometryInput(raw: string, field: GeometryField): { px: number; css?: string } {
    const value = raw.trim();
    const match = value.match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))(px|%|em|rem)$/i);
    if (!match) {
      return { px: num(value) };
    }
    const numeric = Number(match[1]);
    const unit = match[2].toLowerCase();
    let px = numeric;
    if (unit === '%') px = (unitBasis(field) * numeric) / 100;
    if (unit === 'em' || unit === 'rem') px = numeric * 16;
    const css = `${numeric}${unit}`;
    return { px, css };
  }

  function commitGeometryInput(field: GeometryField, raw: string) {
    if (!selectedElement) return;
    const parsed = parseGeometryInput(raw, field);
    let px = Math.round(parsed.px);
    if (field === 'width' || field === 'height') px = Math.max(1, px);
    const patch: Partial<FrameElement> = {
      [field]: px,
      [GEOMETRY_CSS_FIELD[field]]: parsed.css,
    };
    updateSelectedElement(patch);
  }

  function scrubGeometry(field: GeometryField, value: number) {
    const px = field === 'width' || field === 'height'
      ? Math.max(1, Math.round(value))
      : Math.round(value);
    updateSelectedElement({ [field]: px, [GEOMETRY_CSS_FIELD[field]]: undefined });
  }

  let contentTextarea: HTMLTextAreaElement;

  function updateTextContent(content: string) {
    if (!selectedElement) return;
    const patch: Partial<FrameElement> = { content, textRuns: undefined };
    if (isOrphanSelected) {
      onUpdateOrphan(selectedElement.id, patch);
    } else if (activeFrame) {
      onUpdateElement(activeFrame.id, selectedElement.id, patch);
    }
  }

  function mergeTextRuns(runs: TextRun[]): TextRun[] {
    return runs.reduce<TextRun[]>((merged, run) => {
      if (!run.text) return merged;
      const previous = merged[merged.length - 1];
      if (previous
        && !!previous.bold === !!run.bold
        && !!previous.italic === !!run.italic
        && !!previous.underline === !!run.underline
        && previous.href === run.href
        && previous.targetFrameId === run.targetFrameId) {
        previous.text += run.text;
      } else {
        merged.push({ ...run });
      }
      return merged;
    }, []);
  }

  function updateSelectedRuns(transform: (run: TextRun) => TextRun) {
    if (!selectedElement || selectedElement.type !== 'text' || !contentTextarea) return;
    const start = contentTextarea.selectionStart;
    const end = contentTextarea.selectionEnd;
    if (start === end) return;
    const sourceRuns = selectedElement.textRuns?.length
      && selectedElement.textRuns.map(run => run.text).join('') === selectedElement.content
      ? selectedElement.textRuns
      : [{ text: selectedElement.content }];
    const next: TextRun[] = [];
    let cursor = 0;
    for (const run of sourceRuns) {
      const runEnd = cursor + run.text.length;
      const overlapStart = Math.max(start, cursor);
      const overlapEnd = Math.min(end, runEnd);
      if (overlapStart >= overlapEnd) {
        next.push({ ...run });
      } else {
        if (overlapStart > cursor) next.push({ ...run, text: run.text.slice(0, overlapStart - cursor) });
        next.push(transform({ ...run, text: run.text.slice(overlapStart - cursor, overlapEnd - cursor) }));
        if (overlapEnd < runEnd) next.push({ ...run, text: run.text.slice(overlapEnd - cursor) });
      }
      cursor = runEnd;
    }
    updateEl('textRuns', mergeTextRuns(next));
  }

  function formatSelectedRange(style: 'bold' | 'italic' | 'underline') {
    updateSelectedRuns(run => ({ ...run, [style]: !run[style] }));
  }

  function applyExternalLink(href: string) {
    if (!isSafeInlineHref(href)) return;
    updateSelectedRuns(run => ({ ...run, href, targetFrameId: undefined }));
  }

  function handleTextPaste(event: ClipboardEvent) {
    if (selectedElement?.type !== 'text' || !contentTextarea || contentTextarea.selectionStart === contentTextarea.selectionEnd) return;
    const href = event.clipboardData?.getData('text/plain').trim() ?? '';
    if (!isSafeInlineHref(href)) return;
    event.preventDefault();
    applyExternalLink(href);
  }

  function applyTextStylePreset(id: TextStylePresetId) {
    if (!selectedElement) return;
    selectedTextStylePresetId = id;
    updateSelectedElement(textStylePatchFromPreset(getTextStylePreset(resolvedTextStylePresets, id)));
  }

  function saveCurrentTextStylePreset(id: TextStylePresetId) {
    if (!selectedElement) return;
    onUpdateTextStylePresets(saveTextStylePreset(resolvedTextStylePresets, id, selectedElement));
  }

  function applyAppearancePreset(id: string) {
    if (!selectedElement) return;
    const preset = resolvedAppearancePresets.find(candidate => candidate.id === id);
    if (!preset) return;
    selectedAppearancePresetId = id;
    onBeginInspectorEdit();
    updateSelectedElement(appearancePresetPatchFromPreset(preset, selectedElement));
  }

  function saveCurrentAppearancePreset(id: string) {
    if (!selectedElement) return;
    onUpdateAppearancePresets(saveAppearancePreset(resolvedAppearancePresets, id, selectedElement));
  }

  function createProjectStyle(kind: ProjectStyle['kind']) {
    const now = Date.now();
    let style: ProjectStyle | null = null;
    if (kind === 'text' && selectedElement) {
      style = {
        id: `style-${now}`,
        name: selectedElement.name?.trim() || 'Text style',
        kind,
        fields: {
          text: {
            fontSize: selectedElement.fontSize,
            fontWeight: selectedElement.fontWeight,
            letterSpacing: selectedElement.letterSpacing,
            lineHeight: selectedElement.lineHeight,
            textDecoration: selectedElement.textDecoration,
            textTransform: selectedElement.textTransform,
          },
        },
        createdAt: now,
        updatedAt: now,
      };
    } else if (kind === 'color') {
      style = {
        id: `style-${now}`,
        name: 'Color style',
        kind,
        fields: { color: selectedElement?.background ?? activeFrame?.background ?? '#ff6b39' },
        createdAt: now,
        updatedAt: now,
      };
    } else if (kind === 'effect' && selectedElement) {
      style = {
        id: `style-${now}`,
        name: 'Effect style',
        kind,
        fields: { effects: (selectedElement.effects ?? []).map(effect => ({ ...effect, settings: { ...effect.settings } })) },
        createdAt: now,
        updatedAt: now,
      };
    } else if (kind === 'layout-guide' && activeFrame) {
      style = {
        id: `style-${now}`,
        name: 'Layout guide style',
        kind,
        fields: { layoutGuide: activeFrame.layoutGuides?.[0] ?? { kind: 'uniform', visible: true, size: 8, variableRef: 'layout.grid.8' } },
        createdAt: now,
        updatedAt: now,
      };
    }
    if (!style) return;
    onUpdateProjectStyles([...resolvedProjectStyles, style]);
  }

  function createVariableFromSelection() {
    const now = Date.now();
    const fallback = selectedElement?.background ?? activeFrame?.background ?? '#ff6b39';
    const [firstCollection, ...rest] = resolvedVariableCollections;
    const collection = firstCollection ?? {
      id: 'collection-local',
      name: 'Local variables',
      activeModeId: 'light',
      modes: [{ id: 'light', name: 'Light' }],
      groups: [{ id: 'colors', name: 'Colors' }],
      variables: [],
      createdAt: now,
      updatedAt: now,
    };
    const variable = {
      id: `var-${now}`,
      name: 'Selection colour',
      path: `color.selection.${collection.variables.length + 1}`,
      type: 'color' as const,
      groupId: collection.groups?.[0]?.id,
      fallback,
      valuesByMode: Object.fromEntries(collection.modes.map(mode => [mode.id, fallback])),
      createdAt: now,
      updatedAt: now,
    };
    onUpdateVariableCollections([
      { ...collection, variables: [...collection.variables, variable], updatedAt: now },
      ...rest,
    ]);
  }

  function issueNumber(issue: AccessibilityPreflightIssue | null, key: string): number | null {
    const value = issue?.metadata?.[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  function issueString(issue: AccessibilityPreflightIssue | null, key: string): string | null {
    const value = issue?.metadata?.[key];
    return typeof value === 'string' && value ? value : null;
  }

  function applyContrastSuggestion(issue: AccessibilityPreflightIssue | null) {
    const suggestedColor = issueString(issue, 'suggestedColor');
    if (!suggestedColor) return;
    updateEl('color', suggestedColor);
  }

  let imageReplaceInput: HTMLInputElement;

  function handleImageReplace(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (imageReplaceInput) imageReplaceInput.value = '';
    if (!file) return;
    if (onImageReplace) {
      // Hand the raw blob up to App.svelte — it decides cloud-upload vs inline.
      onImageReplace(file);
      return;
    }
    // Legacy fallback: read as data: URL and store inline.
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      updateEl('imageSrc', dataUrl);
    };
    reader.readAsDataURL(file);
  }

  const DEFAULT_AUTO_LAYOUT: AutoLayout = { direction: 'row', gap: 8, padding: { t: 8, r: 8, b: 8, l: 8 }, align: 'center', justify: 'start' };
  const DEFAULT_GRID = { columns: 2, rows: 1, columnTracks: 'repeat(2, minmax(0, 1fr))', rowTracks: 'auto', columnGap: 8, rowGap: 8 };
  const SIZING_OPTIONS: Array<{ value: AutoLayoutSizingMode; label: string }> = [
    { value: 'fixed', label: 'Fixed' },
    { value: 'hug', label: 'Hug' },
    { value: 'fill', label: 'Fill' },
  ];

  function paddingLinkKey(scope: PaddingScope, id: string): string {
    return `${scope}:${id}`;
  }

  function isPaddingLinked(scope: PaddingScope, id: string | undefined): boolean {
    return id ? !!linkedPaddingByTarget[paddingLinkKey(scope, id)] : false;
  }

  function togglePaddingLink(scope: PaddingScope, id: string | undefined) {
    if (!id) return;
    const key = paddingLinkKey(scope, id);
    linkedPaddingByTarget = { ...linkedPaddingByTarget, [key]: !linkedPaddingByTarget[key] };
  }

  function nextPadding(
    current: AutoLayout['padding'],
    side: PaddingSide,
    val: number,
    linked: boolean,
  ): AutoLayout['padding'] {
    return linked ? { t: val, r: val, b: val, l: val } : { ...current, [side]: val };
  }

  function inferAutoLayout(elements: FrameElement[] | undefined): AutoLayout {
    const candidates = (elements ?? []).filter(element => !element.hidden && !element.isFrameBackground && !element.ignoreAutoLayout);
    if (candidates.length < 2) return { ...DEFAULT_AUTO_LAYOUT, padding: { ...DEFAULT_AUTO_LAYOUT.padding } };
    const minX = Math.min(...candidates.map(element => element.x));
    const minY = Math.min(...candidates.map(element => element.y));
    const maxX = Math.max(...candidates.map(element => element.x + element.width));
    const maxY = Math.max(...candidates.map(element => element.y + element.height));
    const direction: AutoLayout['direction'] = (maxX - minX) >= (maxY - minY) ? 'row' : 'column';
    const sorted = [...candidates].sort((a, b) => direction === 'row' ? a.x - b.x : a.y - b.y);
    const gaps = sorted.slice(1).map((element, index) => {
      const prev = sorted[index];
      return direction === 'row' ? element.x - (prev.x + prev.width) : element.y - (prev.y + prev.height);
    }).filter(gap => Number.isFinite(gap));
    const avgGap = gaps.length ? Math.max(0, Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length)) : DEFAULT_AUTO_LAYOUT.gap;
    return {
      ...DEFAULT_AUTO_LAYOUT,
      direction,
      gap: avgGap,
      padding: {
        t: Math.max(0, Math.round(Math.min(...candidates.map(element => element.y)) - minY)),
        r: 8,
        b: 8,
        l: Math.max(0, Math.round(Math.min(...candidates.map(element => element.x)) - minX)),
      },
    };
  }

  function toggleAutoLayout() {
    if (!selectedElement || (selectedElement.type !== 'group' && selectedElement.type !== 'section')) return;
    if (selectedElement.autoLayout) {
      updateEl('autoLayout', undefined);
    } else {
      updateEl('autoLayout', inferAutoLayout(selectedElement.children));
    }
  }

  function updateAutoLayout(key: keyof AutoLayout, val: string | number | boolean | AutoLayout['grid']) {
    if (!selectedElement?.autoLayout) return;
    const al = { ...selectedElement.autoLayout, [key]: val };
    updateEl('autoLayout', al);
  }

  function setElementAutoLayoutFlow(direction: AutoLayout['direction'], mode: NonNullable<AutoLayout['mode']> = 'flex') {
    if (!selectedElement || (selectedElement.type !== 'group' && selectedElement.type !== 'section')) return;
    const current = selectedElement.autoLayout ?? inferAutoLayout(selectedElement.children);
    updateEl('autoLayout', {
      ...current,
      direction,
      mode: mode === 'flex' ? undefined : mode,
      grid: mode === 'grid' ? current.grid ?? { ...DEFAULT_GRID, columnGap: current.gap, rowGap: current.gap } : current.grid,
    });
  }

  function updateAutoLayoutPadding(side: 't' | 'r' | 'b' | 'l', val: number) {
    if (!selectedElement?.autoLayout) return;
    const al = {
      ...selectedElement.autoLayout,
      padding: nextPadding(
        selectedElement.autoLayout.padding,
        side,
        val,
        isPaddingLinked('element', selectedElement.id),
      ),
    };
    updateEl('autoLayout', al);
  }

  function toggleFrameAutoLayout() {
    if (!activeFrame) return;
    updateFrame('autoLayout', activeFrame.autoLayout ? undefined : inferAutoLayout(activeFrame.elements));
  }

  function updateFrameAutoLayout(key: keyof AutoLayout, val: string | number | boolean | AutoLayout['grid']) {
    if (!activeFrame?.autoLayout) return;
    updateFrame('autoLayout', { ...activeFrame.autoLayout, [key]: val });
  }

  function setFrameAutoLayoutFlow(direction: AutoLayout['direction'], mode: NonNullable<AutoLayout['mode']> = 'flex') {
    if (!activeFrame) return;
    const current = activeFrame.autoLayout ?? inferAutoLayout(activeFrame.elements);
    updateFrame('autoLayout', {
      ...current,
      direction,
      mode: mode === 'flex' ? undefined : mode,
      grid: mode === 'grid' ? current.grid ?? { ...DEFAULT_GRID, columnGap: current.gap, rowGap: current.gap } : current.grid,
    });
  }

  function setAutoLayoutMode(scope: 'element' | 'frame', mode: NonNullable<AutoLayout['mode']>) {
    const current = scope === 'element' ? selectedElement?.autoLayout : activeFrame?.autoLayout;
    if (!current) return;
    const next: AutoLayout = {
      ...current,
      mode: mode === 'flex' ? undefined : mode,
      grid: mode === 'grid' ? current.grid ?? { ...DEFAULT_GRID, columnGap: current.gap, rowGap: current.gap } : current.grid,
    };
    if (scope === 'element') updateEl('autoLayout', next);
    else updateFrame('autoLayout', next);
  }

  function updateAutoLayoutGrid(scope: 'element' | 'frame', patch: Partial<NonNullable<AutoLayout['grid']>>) {
    const current = scope === 'element' ? selectedElement?.autoLayout : activeFrame?.autoLayout;
    if (!current) return;
    const grid = { ...(current.grid ?? DEFAULT_GRID), ...patch };
    const next = { ...current, mode: 'grid' as const, grid };
    if (scope === 'element') updateEl('autoLayout', next);
    else updateFrame('autoLayout', next);
  }

  function updateLayoutSizing(axis: 'horizontal' | 'vertical', value: AutoLayoutSizingMode) {
    if (!selectedElement) return;
    const current = selectedElement.layoutSizing ?? { horizontal: 'fixed' as const, vertical: 'fixed' as const };
    const next = { ...current, [axis]: value };
    updateSelectedElement({ layoutSizing: next.horizontal === 'fixed' && next.vertical === 'fixed' ? undefined : next });
  }

  function updateLayoutSizingLimit(key: 'minWidth' | 'maxWidth' | 'minHeight' | 'maxHeight', value: number) {
    if (!selectedElement) return;
    const current = selectedElement.layoutSizing ?? { horizontal: 'fixed' as const, vertical: 'fixed' as const };
    const next = { ...current, [key]: value > 0 ? value : undefined };
    updateSelectedElement({ layoutSizing: next });
  }

  function updateFrameAutoLayoutPadding(side: 't' | 'r' | 'b' | 'l', val: number) {
    if (!activeFrame?.autoLayout) return;
    updateFrame('autoLayout', {
      ...activeFrame.autoLayout,
      padding: nextPadding(
        activeFrame.autoLayout.padding,
        side,
        val,
        isPaddingLinked('frame', activeFrame.id),
      ),
    });
  }

  function observeInspectorFocus(node: HTMLElement) {
    const handleFocus = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('.property-search, .inspector-ui-only')) return;
      onBeginInspectorEdit();
    };
    node.addEventListener('focusin', handleFocus);
    return {
      destroy() {
        node.removeEventListener('focusin', handleFocus);
      },
    };
  }

  const COLLAPSED_SECTIONS_KEY = 'frontendeasy_inspector_collapsed_v1';

  function loadCollapsedSections(): Set<string> {
    try {
      const parsed = JSON.parse(localStorage.getItem(COLLAPSED_SECTIONS_KEY) ?? '[]');
      return new Set(Array.isArray(parsed) ? parsed.filter(value => typeof value === 'string') : []);
    } catch {
      return new Set();
    }
  }

  function fuzzyPropertyMatch(query: string, text: string): boolean {
    const needle = query.toLowerCase().replace(/\s+/g, '');
    const haystack = text.toLowerCase().replace(/\s+/g, '');
    if (!needle) return true;
    if (haystack.includes(needle)) return true;
    let index = 0;
    for (const character of haystack) {
      if (character === needle[index]) index += 1;
      if (index === needle.length) return true;
    }
    return false;
  }

  function collapsibleInspector(node: HTMLElement, query = '') {
    const collapsed = loadCollapsedSections();
    let currentQuery = query;
    const renderers = new WeakMap<HTMLElement, () => void>();
    const save = () => {
      try {
        localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify([...collapsed]));
      } catch {
        // Persistence is optional when storage is blocked or full.
      }
    };
    const applyFilter = () => {
      node.querySelectorAll<HTMLElement>('.prop-group').forEach(section => {
        section.hidden = !fuzzyPropertyMatch(currentQuery, section.textContent ?? '');
        renderers.get(section)?.();
      });
    };
    const configure = () => {
      node.querySelectorAll<HTMLElement>('.prop-group').forEach(section => {
        if (section.dataset.collapsibleReady === 'true') return;
        if (section.dataset.noCollapse === 'true') return;
        const heading = section.querySelector<HTMLElement>(':scope > .group-label');
        if (!heading) return;
        const label = heading.dataset.visibleLabel || heading.textContent?.trim() || 'Properties';
        const collapseLabel = heading.dataset.collapseLabel || label;
        const key = heading.dataset.collapseKey || collapseLabel.toLowerCase();
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'section-toggle';
        const labelNode = document.createElement('span');
        labelNode.textContent = label;
        const chevronNode = document.createElement('span');
        chevronNode.className = 'section-chevron';
        chevronNode.setAttribute('aria-hidden', 'true');
        button.append(labelNode, chevronNode);
        heading.textContent = '';
        heading.append(button);
        section.dataset.collapsibleReady = 'true';

        const render = () => {
          const queryActive = currentQuery.trim().length > 0 && section.dataset.searchToggled !== 'true';
          const isCollapsed = collapsed.has(key) && !queryActive;
          section.classList.toggle('collapsed', isCollapsed);
          Array.from(section.children).forEach(child => {
            if (child !== heading && child instanceof HTMLElement) child.hidden = isCollapsed;
          });
          button.setAttribute('aria-expanded', String(!isCollapsed));
          button.setAttribute('aria-label', `${isCollapsed ? 'Expand' : 'Collapse'} ${collapseLabel}`);
        };
        renderers.set(section, render);
        button.addEventListener('click', () => {
          if (currentQuery.trim()) section.dataset.searchToggled = 'true';
          const expanded = button.getAttribute('aria-expanded') === 'true';
          if (expanded) collapsed.add(key);
          else collapsed.delete(key);
          save();
          render();
        });
        render();
      });
      applyFilter();
    };
    configure();
    const observer = new MutationObserver(configure);
    observer.observe(node, { childList: true, subtree: true });
    return {
      update(nextQuery: string) {
        if (nextQuery !== currentQuery) {
          node.querySelectorAll<HTMLElement>('.prop-group').forEach(section => {
            delete section.dataset.searchToggled;
          });
        }
        currentQuery = nextQuery;
        applyFilter();
      },
      destroy() {
        observer.disconnect();
      },
    };
  }

  function propertyDocKey(text: string): string {
    return text.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function propertyDocs(node: HTMLElement) {
    let hoverTimer: number | null = null;
    let hideTimer: number | null = null;
    let activeTarget: HTMLElement | null = null;
    let tooltip: HTMLElement | null = null;

    const clearHoverTimer = () => {
      if (hoverTimer !== null) {
        window.clearTimeout(hoverTimer);
        hoverTimer = null;
      }
    };

    const clearHideTimer = () => {
      if (hideTimer !== null) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
      }
    };

    const removeTooltip = () => {
      clearHoverTimer();
      clearHideTimer();
      activeTarget?.removeAttribute('aria-describedby');
      activeTarget = null;
      tooltip?.remove();
      tooltip = null;
    };

    const findLabel = (target: EventTarget | null): HTMLElement | null => {
      if (!(target instanceof HTMLElement)) return null;
      return target.closest<HTMLElement>('.prop-field > span, .prop-label, .sub-label');
    };

    const renderTooltip = (target: HTMLElement, doc: PropertyDoc) => {
      removeTooltip();
      activeTarget = target;
      tooltip = document.createElement('div');
      tooltip.id = `property-doc-${Math.random().toString(36).slice(2)}`;
      tooltip.className = 'property-doc-tooltip inspector-ui-only';
      tooltip.setAttribute('role', 'tooltip');

      const description = document.createElement('div');
      description.className = 'property-doc-description';
      description.textContent = doc.description;

      const link = document.createElement('a');
      link.href = doc.href;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = doc.linkLabel;

      tooltip.append(description, link);
      node.append(tooltip);
      target.setAttribute('aria-describedby', tooltip.id);

      const targetRect = target.getBoundingClientRect();
      const panelRect = node.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const left = Math.max(8, Math.min(targetRect.left - panelRect.left, node.clientWidth - tooltipRect.width - 8));
      const top = Math.max(8, targetRect.bottom - panelRect.top + 8);
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;

      tooltip.addEventListener('pointerenter', clearHideTimer);
      tooltip.addEventListener('pointerleave', () => {
        hideTimer = window.setTimeout(removeTooltip, 120);
      });
    };

    const scheduleHide = (event: PointerEvent) => {
      const related = event.relatedTarget;
      if (related instanceof Node && (activeTarget?.contains(related) || tooltip?.contains(related))) return;
      clearHoverTimer();
      clearHideTimer();
      hideTimer = window.setTimeout(removeTooltip, 120);
    };

    const handlePointerOver = (event: PointerEvent) => {
      const target = findLabel(event.target);
      if (!target) return;
      const related = event.relatedTarget;
      if (related instanceof Node && target.contains(related)) return;
      const doc = PROPERTY_DOCS[propertyDocKey(target.textContent ?? '')];
      if (!doc) return;
      clearHoverTimer();
      clearHideTimer();
      hoverTimer = window.setTimeout(() => renderTooltip(target, doc), 120);
    };

    const handlePointerOut = (event: PointerEvent) => {
      const target = findLabel(event.target);
      if (!target) return;
      scheduleHide(event);
    };

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') removeTooltip();
    };

    const handleScroll = () => {
      if (tooltip) removeTooltip();
    };

    node.addEventListener('pointerover', handlePointerOver);
    node.addEventListener('pointerout', handlePointerOut);
    node.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', removeTooltip);
    window.addEventListener('keydown', handleKeydown);

    return {
      destroy() {
        node.removeEventListener('pointerover', handlePointerOver);
        node.removeEventListener('pointerout', handlePointerOut);
        node.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', removeTooltip);
        window.removeEventListener('keydown', handleKeydown);
        removeTooltip();
      },
    };
  }
</script>

<aside
  bind:this={rightPanelRef}
  class="right-panel"
  class:read-only={readOnly}
  data-tour="inspector"
  use:observeInspectorFocus
  use:collapsibleInspector={propertyQuery}
  use:propertyDocs
  use:readonlyInteractionGuard
>
  {#if RELEASE_FLAGS.showInspectorPlaceholderChrome}
    <div class="inspector-figma-topbar" aria-label="Figma-like inspector header">
      <button type="button" class="figma-avatar-btn" aria-label="Profile placeholder">
        <span class="figma-avatar-dot">S</span>
        <span class="figma-chevron">⌄</span>
      </button>
      <div class="figma-topbar-actions">
        <button type="button" class="figma-play-btn" aria-label="Play prototype preview">▷</button>
        <button type="button" class="figma-share-btn" aria-label="Share placeholder">Share</button>
      </div>
    </div>
  {/if}
  <div class="inspector-tabs-line">
    <div class="inspector-tabs" role="tablist" aria-label="Inspector tabs">
      <button
        type="button"
        role="tab"
        aria-selected={inspectorTab === 'design'}
        class:active={inspectorTab === 'design'}
        on:click={() => (inspectorTab = 'design')}
      >Design</button>
      {#if RELEASE_FLAGS.showPrototypeInspector}
        <button
          type="button"
          role="tab"
          aria-selected={inspectorTab === 'prototype'}
          class:active={inspectorTab === 'prototype'}
          on:click={() => (inspectorTab = 'prototype')}
        >Prototype</button>
      {/if}
    </div>
    {#if RELEASE_FLAGS.showInspectorPlaceholderChrome}
      <button type="button" class="figma-zoom-btn" aria-label="Zoom placeholder">36%⌄</button>
    {/if}
  </div>
  <label class="property-search" class:active={propertyQuery.trim().length > 0 || propertySearchFocused}>
    <span class="sr-only">Search inspector properties</span>
    <input
      bind:this={propertySearchInput}
      type="search"
      aria-label="Search inspector properties"
      placeholder="Search properties..."
      bind:value={propertyQuery}
      on:focus={() => (propertySearchFocused = true)}
      on:blur={() => (propertySearchFocused = false)}
    />
  </label>
  {#if readOnly}
    <div class="read-only-banner" role="status" aria-live="polite">
      <strong>{permissionLabel}</strong>
      <span>Properties are read-only. Selection, navigation, export, and allowed comments still work.</span>
    </div>
  {/if}

  {#if inspectorTab === 'prototype'}
    <div class="inspector-tab-content">
      {#if PrototypeInspectorComponent}
        <svelte:component this={PrototypeInspectorComponent} {selectedElement} {activeFrame} />
      {:else if prototypeInspectorLoadError}
        <div class="inspector-section-loader" role="alert">
          Prototype inspector failed to load: {prototypeInspectorLoadError}
        </div>
      {:else}
        <div class="inspector-section-loader" role="status" aria-live="polite">
          Loading prototype inspector...
        </div>
      {/if}
    </div>
  {:else}
  <div class="inspector-tab-content">
  {#if multiElementSelection}
    <!-- Multi-element inspector — align/distribute -->
    <div class="inspector-header">
      <span class="inspector-tag">elements</span>
      <span class="inspector-title">{state.selectedElementIds.length} selected</span>
      {#if selectedElement}
        <span class="inspector-subtitle">Primary: {selectedElement.name || selectedElement.content || elementDisplayLabel(selectedElement)}</span>
      {/if}
    </div>

    <div class="inspector-body">
      <section class="prop-group">
        <h4 class="group-label">Align</h4>
        <div class="align-grid">
          <button class="align-btn" title="Align left" on:click={() => onAlignSelection('left')}>⊨</button>
          <button class="align-btn" title="Align horizontal center" on:click={() => onAlignSelection('h-center')}>⫯</button>
          <button class="align-btn" title="Align right" on:click={() => onAlignSelection('right')}>⊨⃫</button>
          <button class="align-btn" title="Align top" on:click={() => onAlignSelection('top')}>⊤</button>
          <button class="align-btn" title="Align vertical middle" on:click={() => onAlignSelection('v-center')}>⫬</button>
          <button class="align-btn" title="Align bottom" on:click={() => onAlignSelection('bottom')}>⊥</button>
        </div>
      </section>
      <section class="prop-group">
        <h4 class="group-label">Distribute</h4>
        <div class="distribute-row">
          <button
            class="action-btn"
            title="Distribute horizontally (centers evenly between leftmost and rightmost)"
            on:click={() => onDistributeSelection('h')}
            disabled={state.selectedElementIds.length < 3}
          >↔ Horizontal</button>
          <button
            class="action-btn"
            title="Distribute vertically (centers evenly between topmost and bottommost)"
            on:click={() => onDistributeSelection('v')}
            disabled={state.selectedElementIds.length < 3}
          >↕ Vertical</button>
          <button
            class="action-btn"
            title="Tidy up selection into even left-to-right spacing"
            on:click={onTidySelection}
            disabled={state.selectedElementIds.length < 2}
          >Tidy up</button>
        </div>
        {#if state.selectedElementIds.length < 3}
          <div class="meta-hint distribute-hint">Distribute needs 3+ elements selected.</div>
        {/if}
      </section>
      <section class="prop-group">
        <h4 class="group-label">Transform</h4>
        <div class="transform-action-row">
          <button type="button" class="action-btn" aria-label="Rotate selection -90 degrees" on:click={() => onRotateSelection(-90)}>↺ -90°</button>
          <button type="button" class="action-btn" aria-label="Rotate selection 90 degrees" on:click={() => onRotateSelection(90)}>↻ 90°</button>
          <button type="button" class="action-btn" aria-label="Flip selection horizontally" on:click={() => onFlipSelection('horizontal')}>Flip H</button>
          <button type="button" class="action-btn" aria-label="Flip selection vertically" on:click={() => onFlipSelection('vertical')}>Flip V</button>
        </div>
      </section>
      <section class="prop-group">
        <h4 class="group-label">Selection colors</h4>
        <div class="selection-color-summary" aria-label="Selection color summary">
          <span>Text: {selectionValueSummary('color')}</span>
          <span>Fill: {selectionValueSummary('background')}</span>
        </div>
        <div class="prop-field prop-field--full">
          <span>Bulk text color</span>
          <div class="color-row">
            <ColorPicker
              value={commonSelectionValue('color') ?? primarySelectionElement?.color ?? '#f7f1e8'}
              onChange={(v) => updateBulkColor('color', v)}
              onBeginEdit={onBeginInspectorEdit}
              {projectId}
            />
            <input
              type="text"
              class="color-text"
              aria-label="Bulk text color"
              placeholder="mixed"
              value={commonSelectionValue('color') ?? ''}
              on:input={(e) => updateBulkColor('color', e.currentTarget.value)}
            />
          </div>
        </div>
        <div class="prop-field prop-field--full">
          <span>Bulk fill color</span>
          <div class="color-row">
            <ColorPicker
              value={commonSelectionValue('background') ?? primarySelectionElement?.background ?? 'transparent'}
              onChange={(v) => updateBulkColor('background', v)}
              onBeginEdit={onBeginInspectorEdit}
              {projectId}
            />
            <input
              type="text"
              class="color-text"
              aria-label="Bulk fill color"
              placeholder="mixed"
              value={commonSelectionValue('background') ?? ''}
              on:input={(e) => updateBulkColor('background', e.currentTarget.value)}
            />
          </div>
        </div>
      </section>
      <section class="prop-group">
        <h4 class="group-label">Bulk styles</h4>
        <div class="style-action-row">
          <button type="button" class="action-btn" aria-label="Enable bulk stroke" on:click={() => bulkUpdateSelection({ border: { ...firstSelectionBorder() } })}>Enable stroke</button>
          <button type="button" class="action-btn" aria-label="Clear bulk stroke" on:click={() => bulkUpdateSelection({ border: undefined })}>Clear stroke</button>
        </div>
        <div class="prop-field prop-field--full" style="margin-top:6px">
          <span>Bulk stroke color</span>
          <div class="color-row">
            <ColorPicker
              value={commonBorderColor() ?? firstSelectionBorder().color}
              onChange={updateBulkBorderColor}
              onBeginEdit={onBeginInspectorEdit}
              {projectId}
            />
            <input
              type="text"
              class="color-text"
              aria-label="Bulk stroke color"
              placeholder="mixed"
              value={commonBorderColor() ?? ''}
              on:input={(e) => updateBulkBorderColor(e.currentTarget.value)}
            />
          </div>
        </div>
        <div class="style-action-row">
          <button type="button" class="action-btn" aria-label="Enable bulk shadow" on:click={() => bulkUpdateSelection({ shadow: { ...firstSelectionShadow() } })}>Enable shadow</button>
          <button type="button" class="action-btn" aria-label="Clear bulk shadow" on:click={() => bulkUpdateSelection({ shadow: undefined, textShadow: undefined })}>Clear shadow</button>
        </div>
        <div class="prop-field prop-field--full" style="margin-top:6px">
          <span>Bulk shadow color</span>
          <div class="color-row">
            <ColorPicker
              value={commonShadowColor() ?? firstSelectionShadow().color}
              onChange={updateBulkShadowColor}
              onBeginEdit={onBeginInspectorEdit}
              {projectId}
            />
            <input
              type="text"
              class="color-text"
              aria-label="Bulk shadow color"
              placeholder="mixed"
              value={commonShadowColor() ?? ''}
              on:input={(e) => updateBulkShadowColor(e.currentTarget.value)}
            />
          </div>
        </div>
      </section>
      <section class="prop-group">
        <h4 class="group-label">Select matching</h4>
        <div class="matching-grid">
          <button type="button" class="action-btn" on:click={() => onSelectSimilar('fill')} disabled={!canSelectMatching('fill')}>Same fill</button>
          <button type="button" class="action-btn" on:click={() => onSelectSimilar('stroke')} disabled={!canSelectMatching('stroke')}>Same stroke</button>
          <button type="button" class="action-btn" on:click={() => onSelectSimilar('effect')} disabled={!canSelectMatching('effect')}>Same effect</button>
          <button type="button" class="action-btn" on:click={() => onSelectSimilar('font')} disabled={!canSelectMatching('font')}>Same font</button>
          <button type="button" class="action-btn" on:click={() => onSelectSimilar('instance')} disabled={!canSelectMatching('instance')}>Same instance</button>
        </div>
      </section>
      <InspectorExportDock
        model={inspectorExport}
        frameCount={state.frames.length}
        canExportCurrent={!!activeFrame}
        copySummary={inspectorExportCopySummary}
        {onExportCurrentFrame}
        {onExportAllFrames}
        {onCopyExportSummary}
      />
    </div>

  {:else if selectedElement}
    <!-- Element inspector (framed or orphan) -->
    <div class="inspector-header">
      <span class="inspector-tag">
        {elementDisplayLabel(selectedElement)}{#if isOrphanSelected} · loose{/if}
      </span>
      <span class="inspector-title">{selectedElement.content || '—'}</span>
    </div>

    <div class="inspector-body">
      {#if selectedElement.componentInstance}
        <section class="prop-group" data-inspector-section="custom">
          <h4 class="group-label">Component</h4>
          {#if selectedComponentMaster}
            <label class="prop-field prop-field--full">
              <span>Master</span>
              <input type="text" value={selectedComponentMaster.name} readonly />
            </label>
            <label class="prop-field prop-field--full">
              <span>Variant</span>
              <select
                aria-label="Component variant"
                value={selectedElement.componentInstance.variantId ?? ''}
                on:change={(e) => onSetComponentInstanceVariant(e.currentTarget.value || undefined)}
              >
                <option value="">Default</option>
                {#each selectedComponentMaster.variants ?? [] as variant (variant.id)}
                  <option value={variant.id}>{variant.name}</option>
                {/each}
              </select>
            </label>
            <div class="component-summary-card" aria-label="Component variant and property summary">
              <span><strong>{selectedComponentMaster.variants?.length ?? 0}</strong> variants</span>
              <span><strong>{selectedComponentProperties.length}</strong> properties</span>
              <span><strong>{componentMasters.length}</strong> masters</span>
            </div>
            <p class="meta-hint component-discovery-copy">
              Add Hover/Active variants from the Components panel. Create properties here on an instance; the controls then appear for every instance of this master.
            </p>
            {#if !(selectedComponentMaster.variants?.length)}
              <p class="meta-hint">Add Hover or Active variants from the Components panel.</p>
            {/if}
            <div class="matching-grid component-property-actions" aria-label="Create component properties">
              <button type="button" class="action-btn" aria-label="Create boolean component property" title="Expose a checkbox property on this component" on:click={() => onCreateComponentProperty('boolean')}>Expose Boolean</button>
              <button type="button" class="action-btn" aria-label="Create text component property" title="Expose text content as an instance property" on:click={() => onCreateComponentProperty('text')}>Expose Text</button>
              <button type="button" class="action-btn" aria-label="Create instance swap component property" title="Expose a component swap dropdown" on:click={() => onCreateComponentProperty('instance-swap')}>Expose Swap</button>
              <button type="button" class="action-btn" aria-label="Create variant component property" title="Expose the component variant selector as a named property" on:click={() => onCreateComponentProperty('variant')}>Expose Variant</button>
            </div>
            {#if selectedComponentProperties.length}
              <div class="component-property-list" aria-label="Component property controls">
                {#each selectedComponentProperties as property (property.id)}
                  {#if property.kind === 'boolean'}
                    <label class="prop-field prop-field--full checkbox-row">
                      <input
                        type="checkbox"
                        aria-label="{property.name} boolean property"
                        checked={componentPropertyValue(property) !== false}
                        on:change={(e) => onSetComponentPropertyValue(property.id, e.currentTarget.checked)}
                      />
                      <span>{property.name}</span>
                    </label>
                  {:else if property.kind === 'text'}
                    <label class="prop-field prop-field--full">
                      <span>{property.name}</span>
                      <input
                        type="text"
                        aria-label="{property.name} text property"
                        value={String(componentPropertyValue(property))}
                        on:input={(e) => onSetComponentPropertyValue(property.id, e.currentTarget.value)}
                      />
                    </label>
                  {:else if property.kind === 'instance-swap'}
                    <label class="prop-field prop-field--full">
                      <span>{property.name}</span>
                      <select
                        aria-label="{property.name} instance swap property"
                        value={String(componentPropertyValue(property))}
                        on:change={(e) => onSetComponentPropertyValue(property.id, e.currentTarget.value)}
                      >
                        <option value="">None</option>
                        {#each componentMasters as master (master.id)}
                          <option value={master.id}>{master.name}</option>
                        {/each}
                      </select>
                    </label>
                  {:else}
                    <label class="prop-field prop-field--full">
                      <span>{property.name}</span>
                      <select
                        aria-label="{property.name} variant property"
                        value={selectedElement.componentInstance.variantId ?? ''}
                        on:change={(e) => onSetComponentPropertyValue(property.id, e.currentTarget.value)}
                      >
                        <option value="">Default</option>
                        {#each selectedComponentMaster.variants ?? [] as variant (variant.id)}
                          <option value={variant.id}>{variant.name}</option>
                        {/each}
                      </select>
                    </label>
                  {/if}
                {/each}
              </div>
            {:else}
              <p class="meta-hint">Create properties to expose text, visibility, swaps, or variants on this instance.</p>
            {/if}
          {:else}
            <p class="meta-hint danger">Missing component master. This instance will export its last materialized layer data.</p>
          {/if}
        </section>
      {/if}

      <section class="prop-group" data-inspector-section="custom">
        <h4 class="group-label">Mask</h4>
        <div class="mask-kind-grid" role="group" aria-label="Mask creation controls">
          {#each MASK_KIND_OPTIONS as option}
            <button
              type="button"
              class="action-btn"
              aria-label={`Create ${option.label} mask`}
              aria-pressed={selectedElement.mask?.kind === option.value && selectedElement.mask?.enabled !== false}
              on:click={() => setSelectedMask(option.value)}
            >{option.label}</button>
          {/each}
        </div>
        {#if selectedElement.mask}
          <div class="prop-grid-2" style="margin-top:8px">
            <label class="prop-field">
              <span>Kind</span>
              <select
                aria-label="Mask kind"
                value={selectedElement.mask.kind}
                on:change={(e) => updateSelectedMask({ kind: e.currentTarget.value as ElementMaskKind })}
              >
                {#each MASK_KIND_OPTIONS as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </label>
            <label class="prop-field checkbox-row">
              <input
                type="checkbox"
                aria-label="Enable mask"
                checked={selectedElement.mask.enabled !== false}
                on:change={(e) => updateSelectedMask({ enabled: e.currentTarget.checked })}
              />
              <span>Enabled</span>
            </label>
            <label class="prop-field checkbox-row">
              <input
                type="checkbox"
                aria-label="Invert mask"
                checked={!!selectedElement.mask.inverted}
                on:change={(e) => updateSelectedMask({ inverted: e.currentTarget.checked })}
              />
              <span>Invert</span>
            </label>
          </div>
          <button type="button" class="action-btn danger-action" aria-label="Remove mask" on:click={onRemoveSelectionMask}>Remove mask</button>
          <div class="meta-hint">Export maps Alpha to opacity, Vector to clip-path inset, and Luminance to grayscale mask intent metadata.</div>
        {:else}
          <div class="meta-hint">Create a mask from the selected layer, or use More for a luminance mask shortcut.</div>
        {/if}
      </section>

      <!-- Position & Size -->
      <section class="prop-group" data-inspector-section="position">
        <h4 class="group-label" data-visible-label="Position" data-collapse-label="Transform" data-collapse-key="transform">Position</h4>
        <!--
          Math expressions (item 53): X/Y/W/H/Rotation use `type="text"` with
          `inputmode="numeric"` so users can type `180+20`, `(100*2)/4`, `48-12`
          and `evalMath` resolves it. `type="number"` would strip operators
          before JS could see them. The decimal inputmode still summons the
          number keyboard on mobile. Unit suffixes (px/%/em/rem) are converted
          to px for canvas geometry and preserved for export.
        -->
        <div class="figma-icon-split" aria-label="Element alignment controls">
          <div class="figma-icon-row" role="group" aria-label="Horizontal alignment">
            <button type="button" title="Align left" aria-label="Align left" on:click={() => onAlignSelection('left')}>╞</button>
            <button type="button" title="Align horizontal center" aria-label="Align horizontal center" on:click={() => onAlignSelection('h-center')}>┼</button>
            <button type="button" title="Align right" aria-label="Align right" on:click={() => onAlignSelection('right')}>╡</button>
          </div>
          <div class="figma-icon-row" role="group" aria-label="Vertical alignment">
            <button type="button" title="Align top" aria-label="Align top" on:click={() => onAlignSelection('top')}>╥</button>
            <button type="button" title="Align vertical center" aria-label="Align vertical center" on:click={() => onAlignSelection('v-center')}>╫</button>
            <button type="button" title="Align bottom" aria-label="Align bottom" on:click={() => onAlignSelection('bottom')}>╨</button>
          </div>
        </div>
        <div class="prop-grid-4">
          <label class="prop-field">
            <span use:scrub={{ get: () => selectedElement?.x ?? 0, set: (v) => scrubGeometry('x', v) }}>X</span>
            <input aria-label="Element X" type="text" inputmode="decimal" value={formatGeometryValue(selectedElement, 'x')}
              on:change={(e) => commitGeometryInput('x', e.currentTarget.value)} />
          </label>
          <label class="prop-field">
            <span use:scrub={{ get: () => selectedElement?.y ?? 0, set: (v) => scrubGeometry('y', v) }}>Y</span>
            <input aria-label="Element Y" type="text" inputmode="decimal" value={formatGeometryValue(selectedElement, 'y')}
              on:change={(e) => commitGeometryInput('y', e.currentTarget.value)} />
          </label>
          <label class="prop-field">
            <span use:scrub={{ get: () => selectedElement?.width ?? 0, set: (v) => scrubGeometry('width', v), min: 1 }}>W</span>
            <input aria-label="Element width" type="text" inputmode="decimal" value={formatGeometryValue(selectedElement, 'width')}
              on:change={(e) => commitGeometryInput('width', e.currentTarget.value)} />
          </label>
          <label class="prop-field">
            <span use:scrub={{ get: () => selectedElement?.height ?? 0, set: (v) => scrubGeometry('height', v), min: 1 }}>H</span>
            <input aria-label="Element height" type="text" inputmode="decimal" value={formatGeometryValue(selectedElement, 'height')}
              on:change={(e) => commitGeometryInput('height', e.currentTarget.value)} />
          </label>
        </div>
        <!-- Rotation (item 46) — applied via CSS rotate around the center. -->
        <label class="prop-field prop-field--full" style="margin-top:6px">
          <span>Rotation <span class="meta-hint">(°, -360..360)</span></span>
          <input
            type="text"
            inputmode="decimal"
            value={selectedElement.rotation ?? 0}
            on:change={(e) => {
              const n = num(e.currentTarget.value);
              setElementRotation(n);
            }}
          />
        </label>
        <div class="transform-action-row">
          <button type="button" class="action-btn icon-action" aria-label="Rotate selected element -90 degrees" on:click={() => rotateElementBy(-90)}>↺ -90°</button>
          <button type="button" class="action-btn icon-action" aria-label="Rotate selected element 90 degrees" on:click={() => rotateElementBy(90)}>↻ 90°</button>
          <button type="button" class="action-btn icon-action" aria-label="Flip selected element horizontally" on:click={() => toggleElementFlip('x')}>⇤⇥</button>
          <button type="button" class="action-btn icon-action" aria-label="Flip selected element vertically" on:click={() => toggleElementFlip('y')}>↥↧</button>
        </div>
        <label class="prop-field prop-field--full" style="margin-top:6px">
          <span>Rotation origin</span>
          <select
            aria-label="Rotation origin"
            value={selectedElement.transformOrigin ?? 'center center'}
            on:change={(e) => updateEl('transformOrigin', e.currentTarget.value as FrameElement['transformOrigin'])}
          >
            <option value="center center">Center</option>
            <option value="top left">Top left</option>
            <option value="top center">Top</option>
            <option value="top right">Top right</option>
            <option value="center left">Left</option>
            <option value="center right">Right</option>
            <option value="bottom left">Bottom left</option>
            <option value="bottom center">Bottom</option>
            <option value="bottom right">Bottom right</option>
          </select>
        </label>
        {#if selectedElementEffectiveFlowExport}
          <label class="prop-field prop-field--full checkbox-row" title="Keep this layer absolutely positioned when exporting flow HTML">
            <input
              aria-label="Pin for export"
              type="checkbox"
              checked={selectedElement.exportPinned === true}
              on:change={(e) => {
                onBeginInspectorEdit();
                updateEl('exportPinned', e.currentTarget.checked ? true : undefined);
              }}
            />
            <span>Pin for export</span>
          </label>
          <div class="meta-hint">Flow export keeps pinned layers absolute above the generated layout.</div>
        {/if}
        <div class="constraints-card" aria-label="Constraints diagram">
          <div class="constraints-header">
            <span>Constraints</span>
            <span class="meta-hint">Default: Left + Top</span>
          </div>
          <div class="constraints-body">
            <div class="constraints-preview" aria-hidden="true">
              <span class:active={currentConstraints.vertical === 'top' || currentConstraints.vertical === 'top-bottom'} class="constraint-edge edge-top"></span>
              <span class:active={currentConstraints.vertical === 'bottom' || currentConstraints.vertical === 'top-bottom'} class="constraint-edge edge-bottom"></span>
              <span class:active={currentConstraints.horizontal === 'left' || currentConstraints.horizontal === 'left-right'} class="constraint-edge edge-left"></span>
              <span class:active={currentConstraints.horizontal === 'right' || currentConstraints.horizontal === 'left-right'} class="constraint-edge edge-right"></span>
              <span class:active={currentConstraints.horizontal === 'center'} class="constraint-center center-x"></span>
              <span class:active={currentConstraints.vertical === 'center'} class="constraint-center center-y"></span>
              <span class:active={currentConstraints.horizontal === 'scale'} class="constraint-scale scale-x">%</span>
              <span class:active={currentConstraints.vertical === 'scale'} class="constraint-scale scale-y">%</span>
              <span class="constraint-object"></span>
            </div>
            <div class="constraints-controls">
              <label class="prop-field prop-field--full">
                <span>Horizontal</span>
                <select
                  aria-label="Horizontal constraint"
                  value={currentConstraints.horizontal}
                  on:change={(e) => updateElementConstraint('horizontal', e.currentTarget.value as HorizontalConstraint)}
                >
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                  <option value="left-right">Left &amp; Right</option>
                  <option value="center">Center</option>
                  <option value="scale">Scale</option>
                </select>
              </label>
              <label class="prop-field prop-field--full">
                <span>Vertical</span>
                <select
                  aria-label="Vertical constraint"
                  value={currentConstraints.vertical}
                  on:change={(e) => updateElementConstraint('vertical', e.currentTarget.value as VerticalConstraint)}
                >
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                  <option value="top-bottom">Top &amp; Bottom</option>
                  <option value="center">Center</option>
                  <option value="scale">Scale</option>
                </select>
              </label>
            </div>
          </div>
        </div>
      </section>

      {#if selectedElement.type === 'text'}
        <section class="prop-group" data-inspector-section="layout">
          <h4 class="group-label">Layout</h4>
          <span class="sr-only">Text box sizing</span>
          <div class="text-resizing-card">
            <div class="text-resizing-header">
              <span>Resizing</span>
              <span class="meta-hint">{selectedTextResizingSummaryValue}</span>
            </div>
            <div class="text-resizing-options" role="group" aria-label="Text resizing controls">
              <button
                type="button"
                class="action-btn"
                aria-label="Set text fixed size"
                aria-pressed={selectedTextBoxModeValue === 'fixed'}
                on:click={() => updateTextBoxMode('fixed')}
              >Fixed</button>
              <button
                type="button"
                class="action-btn"
                aria-label="Set text hug height"
                aria-pressed={selectedTextBoxModeValue === 'auto-height'}
                on:click={() => updateTextBoxMode('auto-height')}
              >Hug height</button>
              <button
                type="button"
                class="action-btn"
                aria-label="Set text hug width"
                aria-pressed={selectedTextBoxModeValue === 'auto-width'}
                on:click={() => updateTextBoxMode('auto-width')}
              >Hug width</button>
            </div>
            <div class="meta-hint">Use Hug height to keep wrapped text visible while width stays fixed.</div>
          </div>
        </section>
      {/if}

      <!-- Content -->
      <section class="prop-group" data-inspector-section="content">
        <h4 class="group-label">{selectedElement.type === 'text' ? 'Text' : 'Layer'}</h4>
        <label class="prop-field prop-field--full">
          <span>Layer name</span>
          <input
            type="text"
            value={selectedElement.name ?? ''}
            placeholder="Auto: content or element type"
            on:input={(e) => updateEl('name', e.currentTarget.value || undefined)}
          />
        </label>
        {#if selectedElement.type !== 'image'}
          <textarea
            bind:this={contentTextarea}
            class="content-input"
            rows="3"
            value={selectedElement.content}
            on:input={(e) => updateTextContent(e.currentTarget.value)}
            on:paste={handleTextPaste}
          ></textarea>
        {/if}
      </section>

      {#if selectedElement.type === 'slice'}
        <section class="prop-group" data-inspector-section="custom">
          <h4 class="group-label">Slice Export</h4>
          <label class="prop-field prop-field--full">
            <span>Export filename</span>
            <input
              type="text"
              value={selectedElement.filename ?? ''}
              placeholder="slice.html"
              aria-label="Slice export filename"
              on:input={(e) => updateEl('filename', e.currentTarget.value || undefined)}
            />
          </label>
          <div class="meta-hint">Slices do not render inside page HTML. Download All and folder export emit each slice as a cropped HTML region.</div>
        </section>
      {/if}

      <!-- Typography (hidden for image) -->
      {#if selectedElement.type !== 'image'}
        <section class="prop-group" data-inspector-section="typography">
          <h4 class="group-label">Typography</h4>
          {#if selectedElement.type === 'text'}
            <div class="rich-text-toolbar" role="toolbar" aria-label="Inline text formatting">
              <button type="button" title="Bold selected text" aria-label="Bold selected text" on:mousedown|preventDefault on:click={() => formatSelectedRange('bold')}><strong>B</strong></button>
              <button type="button" title="Italic selected text" aria-label="Italic selected text" on:mousedown|preventDefault on:click={() => formatSelectedRange('italic')}><em>I</em></button>
              <button type="button" title="Underline selected text" aria-label="Underline selected text" on:mousedown|preventDefault on:click={() => formatSelectedRange('underline')}><u>U</u></button>
              <span class="meta-hint">Select text in Content, then format.</span>
            </div>
          {/if}
          <div class="text-style-tools">
            <label class="prop-field text-style-select">
              <span>Text style preset</span>
              <select
                aria-label="Text style preset"
                value={selectedTextStylePresetId}
                on:change={(e) => applyTextStylePreset(e.currentTarget.value as TextStylePresetId)}
              >
                {#each resolvedTextStylePresets as preset}
                  <option value={preset.id}>{preset.label}</option>
                {/each}
              </select>
            </label>
            <button
              type="button"
              class="action-btn text-style-save"
              aria-label="Save current text style preset"
              title="Save current typography into the selected preset"
              on:click={() => saveCurrentTextStylePreset(selectedTextStylePresetId)}
            >Save current</button>
          </div>
          <div class="meta-hint text-style-hint">Presets are stored with this project and apply size, weight, tracking, line height, decoration, and transform.</div>
          <div class="prop-grid-2" style="margin-top:6px">
            <label class="prop-field">
              <span>Mode</span>
              <select
                aria-label="Typography mode"
                value={selectedElement.typographyMode ?? 'basics'}
                on:change={(e) => updateEl('typographyMode', e.currentTarget.value === 'basics' ? undefined : e.currentTarget.value as TypographyPanelMode)}
              >
                <option value="basics">Basics</option>
                <option value="details">Details</option>
                <option value="variable">Variable</option>
              </select>
            </label>
            <label class="prop-field">
              <span>Source</span>
              <select
                aria-label="Font source"
                value={selectedElement.fontSource ?? 'project'}
                on:change={(e) => updateEl('fontSource', e.currentTarget.value === 'project' ? undefined : e.currentTarget.value as FontSource)}
              >
                <option value="project">Project font</option>
                <option value="system">System stack</option>
                <option value="variable">Variable font</option>
              </select>
            </label>
          </div>
          <div class="prop-grid-2">
            <label class="prop-field">
              <span>Size</span>
              <input type="number" value={selectedElement.fontSize}
                on:input={(e) => updateEl('fontSize', num(e.currentTarget.value))} />
            </label>
            <label class="prop-field">
              <span>Weight</span>
              <select value={selectedElement.fontWeight}
                on:change={(e) => updateEl('fontWeight', e.currentTarget.value)}>
                <option value="300">Light</option>
                <option value="400">Regular</option>
                <option value="500">Medium</option>
                <option value="600">Semibold</option>
                <option value="700">Bold</option>
                <option value="800">Extrabold</option>
                <option value="900">Black</option>
              </select>
            </label>
          </div>
          <div class="prop-grid-2" style="margin-top:6px">
            <label class="prop-field">
              <span>Align</span>
              <select
                aria-label="Text alignment"
                value={selectedElement.textAlign ?? 'center'}
                on:change={(e) => updateEl('textAlign', e.currentTarget.value === 'center' ? undefined : e.currentTarget.value as TextAlign)}
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
                <option value="justify">Justify</option>
              </select>
            </label>
            <label class="prop-field">
              <span>Vertical</span>
              <select
                aria-label="Text vertical alignment"
                value={selectedElement.textVerticalAlign ?? 'center'}
                on:change={(e) => updateEl('textVerticalAlign', e.currentTarget.value === 'center' ? undefined : e.currentTarget.value as TextVerticalAlign)}
              >
                <option value="top">Top</option>
                <option value="center">Center</option>
                <option value="bottom">Bottom</option>
              </select>
            </label>
          </div>
          {#if selectedElement.type === 'text'}
            <label class="prop-field prop-field--full" style="margin-top:8px">
              <span>Text box sizing</span>
              <select
                aria-label="Text box sizing"
                value={selectedElement.textBoxMode ?? 'fixed'}
                on:change={(e) => updateTextBoxMode(e.currentTarget.value as NonNullable<FrameElement['textBoxMode']>)}
              >
                <option value="auto-width">Auto width</option>
                <option value="auto-height">Auto height</option>
                <option value="fixed">Fixed size</option>
              </select>
            </label>
            <label class="prop-field prop-field--full al-toggle" style="margin-top:8px">
              <span>Auto-resize to fit width</span>
              <input
                type="checkbox"
                checked={!!selectedElement.fitText}
                on:change={(e) => updateEl('fitText', e.currentTarget.checked || undefined)}
              />
            </label>
            {#if selectedElement.fitText}
              <div class="meta-hint">Size is the maximum; text shrinks to fit its box.</div>
            {/if}
            <label class="prop-field prop-field--full" style="margin-top:8px">
              <span>Overflow</span>
              <select
                aria-label="Text overflow behavior"
                value={selectedElement.textOverflow ?? 'wrap'}
                on:change={(e) => updateEl('textOverflow', e.currentTarget.value === 'wrap' ? undefined : e.currentTarget.value as 'clip' | 'ellipsis' | 'none')}
              >
                <option value="wrap">Wrap</option>
                <option value="clip">Clip</option>
                <option value="ellipsis">Ellipsis</option>
                <option value="none">None</option>
              </select>
            </label>
          {/if}
          <!-- Letter-spacing + line-height (item 51) -->
          <div class="prop-grid-2" style="margin-top:6px">
            <label class="prop-field">
              <span>Tracking <span class="meta-hint">(em)</span></span>
              <input type="number" step="0.01" value={selectedElement.letterSpacing ?? 0}
                on:input={(e) => {
                  const n = num(e.currentTarget.value);
                  updateEl('letterSpacing', n === 0 ? undefined : n);
                }} />
            </label>
            <label class="prop-field">
              <span>Line height</span>
              <input type="number" step="0.05" min="0.5" value={selectedElement.lineHeight ?? ''}
                placeholder="auto"
                on:input={(e) => {
                  const raw = e.currentTarget.value;
                  if (raw === '') updateEl('lineHeight', undefined);
                  else updateEl('lineHeight', Math.max(0.5, num(raw)));
                }} />
            </label>
          </div>
          <div class="prop-grid-2" style="margin-top:6px">
            <label class="prop-field">
              <span>Case</span>
              <select
                aria-label="Text case"
                value={selectedElement.textCase ?? (selectedElement.smallCaps ? 'small-caps' : selectedElement.textTransform ?? 'none')}
                on:change={(e) => {
                  const v = e.currentTarget.value as TextCase;
                  updateSelectedElement({
                    textCase: v === 'none' ? undefined : v,
                    textTransform: v === 'uppercase' || v === 'lowercase' || v === 'capitalize' ? v : undefined,
                    smallCaps: v === 'small-caps' ? true : undefined,
                  });
                }}
              >
                <option value="none">None</option>
                <option value="uppercase">Uppercase</option>
                <option value="lowercase">Lowercase</option>
                <option value="capitalize">Capitalize</option>
                <option value="small-caps">Small caps</option>
              </select>
            </label>
            <label class="prop-field">
              <span>Text trim</span>
              <select
                aria-label="Text trim"
                value={selectedElement.textTrim ?? 'none'}
                on:change={(e) => updateEl('textTrim', e.currentTarget.value === 'none' ? undefined : e.currentTarget.value as TextTrim)}
              >
                <option value="none">None</option>
                <option value="cap-height">Cap height</option>
                <option value="both">Both edges</option>
              </select>
            </label>
          </div>
          <div class="prop-grid-2" style="margin-top:6px">
            <label class="prop-field">
              <span>Max lines</span>
              <input
                aria-label="Max text lines"
                type="number"
                min="0"
                value={selectedElement.maxLines ?? 0}
                on:input={(e) => {
                  const n = Math.max(0, Math.round(num(e.currentTarget.value)));
                  updateEl('maxLines', n === 0 ? undefined : n);
                }}
              />
            </label>
            <label class="prop-field">
              <span>Indent</span>
              <input
                aria-label="Paragraph indent"
                type="number"
                value={selectedElement.paragraphIndent ?? 0}
                on:input={(e) => {
                  const n = num(e.currentTarget.value);
                  updateEl('paragraphIndent', n === 0 ? undefined : n);
                }}
              />
            </label>
            <label class="prop-field">
              <span>Paragraph gap</span>
              <input
                aria-label="Paragraph spacing"
                type="number"
                min="0"
                value={selectedElement.paragraphSpacing ?? 0}
                on:input={(e) => {
                  const n = Math.max(0, num(e.currentTarget.value));
                  updateEl('paragraphSpacing', n === 0 ? undefined : n);
                }}
              />
            </label>
            <label class="prop-field">
              <span>List indent</span>
              <input
                aria-label="List indent"
                type="number"
                min="0"
                value={selectedElement.listIndent ?? 0}
                on:input={(e) => {
                  const n = Math.max(0, num(e.currentTarget.value));
                  updateEl('listIndent', n === 0 ? undefined : n);
                }}
              />
            </label>
          </div>
          <label class="prop-field prop-field--full al-toggle" style="margin-top:8px">
            <span>Hanging punctuation</span>
            <input
              aria-label="Hanging punctuation"
              type="checkbox"
              checked={!!selectedElement.hangingPunctuation}
              on:change={(e) => updateEl('hangingPunctuation', e.currentTarget.checked || undefined)}
            />
          </label>
          <label class="prop-field prop-field--full" style="margin-top:8px">
            <span>OpenType settings</span>
            <input
              aria-label="OpenType settings"
              type="text"
              value={selectedElement.openTypeSettings ?? ''}
              placeholder="'liga' 1, 'ss01' 1"
              on:input={(e) => updateEl('openTypeSettings', e.currentTarget.value || undefined)}
            />
          </label>
          <!-- Decoration + transform -->
          <div class="prop-grid-2" style="margin-top:6px">
            <label class="prop-field">
              <span>Decoration</span>
              <select value={selectedElement.textDecoration ?? 'none'}
                on:change={(e) => {
                  const v = e.currentTarget.value;
                  updateEl('textDecoration', v === 'none' ? undefined : v as 'underline' | 'line-through' | 'overline');
                }}>
                <option value="none">None</option>
                <option value="underline">Underline</option>
                <option value="line-through">Strike</option>
                <option value="overline">Overline</option>
              </select>
            </label>
            <label class="prop-field">
              <span>Transform</span>
              <select value={selectedElement.textTransform ?? 'none'}
                on:change={(e) => {
                  const v = e.currentTarget.value;
                  updateEl('textTransform', v === 'none' ? undefined : v as 'uppercase' | 'lowercase' | 'capitalize');
                }}>
                <option value="none">None</option>
                <option value="uppercase">UPPERCASE</option>
                <option value="lowercase">lowercase</option>
                <option value="capitalize">Capitalize</option>
              </select>
            </label>
          </div>
          <!-- Text shadow (item 102) — enable toggle + numeric grid + colour. -->
          <label class="prop-field prop-field--full al-toggle" style="margin-top:8px">
            <span>Text shadow</span>
            <input
              type="checkbox"
              checked={!!selectedElement.textShadow}
              on:change={(e) => {
                if (e.currentTarget.checked) {
                  updateEl('textShadow', selectedElement?.textShadow ?? { x: 0, y: 2, blur: 6, color: 'rgba(0,0,0,0.45)' });
                } else {
                  updateEl('textShadow', undefined);
                }
              }}
            />
          </label>
          {#if selectedElement.textShadow}
            {@const ts = selectedElement.textShadow}
            <div class="prop-grid-4">
              <label class="prop-field">
                <span>X</span>
                <input type="number" value={ts.x}
                  on:input={(e) => updateEl('textShadow', { ...ts, x: num(e.currentTarget.value) })} />
              </label>
              <label class="prop-field">
                <span>Y</span>
                <input type="number" value={ts.y}
                  on:input={(e) => updateEl('textShadow', { ...ts, y: num(e.currentTarget.value) })} />
              </label>
              <label class="prop-field">
                <span>Blur</span>
                <input type="number" min="0" value={ts.blur}
                  on:input={(e) => updateEl('textShadow', { ...ts, blur: Math.max(0, num(e.currentTarget.value)) })} />
              </label>
              <label class="prop-field">
                <span>—</span>
                <ColorPicker
                  value={ts.color}
                  onChange={(v) => updateEl('textShadow', { ...ts, color: v })}
                  onBeginEdit={onBeginInspectorEdit}
                  {projectId}
                />
              </label>
            </div>
          {/if}
        </section>
      {/if}

      <!-- Appearance -->
      <section class="prop-group" data-inspector-section="appearance">
        <h4 class="group-label">Appearance</h4>
        {#if selectedContrastIssue}
          {@const ratio = issueNumber(selectedContrastIssue, 'ratio')}
          {@const threshold = issueNumber(selectedContrastIssue, 'threshold')}
          {@const suggestedColor = issueString(selectedContrastIssue, 'suggestedColor')}
          <div class="a11y-warning" role="status" aria-live="polite">
            <div>
              <strong>{selectedContrastIssue.title}</strong>
              <span>
                {ratio?.toFixed(2) ?? 'Low'}:1 contrast{#if threshold} · target {threshold}:1{/if}
              </span>
            </div>
            {#if suggestedColor}
              <button
                type="button"
                class="mini-action"
                aria-label={selectedContrastIssue.actionLabel ?? 'Use suggested contrast colour'}
                on:click={() => applyContrastSuggestion(selectedContrastIssue)}
              >{selectedContrastIssue.actionLabel ?? 'Use suggested colour'}</button>
            {/if}
          </div>
        {/if}
        <label class="prop-field">
          <span>Radius</span>
          <input type="number" value={selectedElement.borderRadius}
            on:input={(e) => updateUniformRadius(num(e.currentTarget.value))} />
        </label>
        <div class="prop-field prop-field--full">
          <span>Independent corners</span>
          <div class="corner-grid">
            <label>
              <span>TL</span>
              <input aria-label="Top left radius" type="number" min="0" value={currentCornerRadii().topLeft}
                on:input={(e) => updateCornerRadius('topLeft', num(e.currentTarget.value))} />
            </label>
            <label>
              <span>TR</span>
              <input aria-label="Top right radius" type="number" min="0" value={currentCornerRadii().topRight}
                on:input={(e) => updateCornerRadius('topRight', num(e.currentTarget.value))} />
            </label>
            <label>
              <span>BR</span>
              <input aria-label="Bottom right radius" type="number" min="0" value={currentCornerRadii().bottomRight}
                on:input={(e) => updateCornerRadius('bottomRight', num(e.currentTarget.value))} />
            </label>
            <label>
              <span>BL</span>
              <input aria-label="Bottom left radius" type="number" min="0" value={currentCornerRadii().bottomLeft}
                on:input={(e) => updateCornerRadius('bottomLeft', num(e.currentTarget.value))} />
            </label>
          </div>
        </div>
        <div class="prop-field prop-field--full">
          <span>Corner smoothing <span class="meta-hint">({Math.round((selectedElement.cornerSmoothing ?? 0) * 100)}%)</span></span>
          <div class="opacity-row-controls">
            <input
              aria-label="Corner smoothing"
              type="range"
              min="0"
              max="100"
              value={Math.round((selectedElement.cornerSmoothing ?? 0) * 100)}
              on:input={(e) => setCornerSmoothing(num(e.currentTarget.value) / 100)}
            />
            <input
              aria-label="Corner smoothing value"
              type="number"
              min="0"
              max="100"
              value={Math.round((selectedElement.cornerSmoothing ?? 0) * 100)}
              on:input={(e) => setCornerSmoothing(num(e.currentTarget.value) / 100)}
            />
          </div>
          <button
            type="button"
            class="mini-action"
            aria-label="Use iOS corner smoothing preset"
            on:click={() => setCornerSmoothing(0.6)}
          >iOS 60%</button>
          <div class="meta-hint">Smoothing is persisted as design intent; current CSS export keeps the closest per-corner radius fallback.</div>
        </div>
        <!-- Opacity (item 47) — 0..100 % slider + numeric companion. -->
        <label class="prop-field prop-field--full opacity-row" style="margin-top:8px">
          <span>Opacity <span class="meta-hint">({Math.round((selectedElement.opacity ?? 1) * 100)}%)</span></span>
          <div class="opacity-row-controls">
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round((selectedElement.opacity ?? 1) * 100)}
              on:input={(e) => {
                const pct = num(e.currentTarget.value);
                const v = Math.max(0, Math.min(1, pct / 100));
                updateEl('opacity', v >= 1 ? undefined : v);
              }}
            />
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              class="opacity-pct"
              value={Math.round((selectedElement.opacity ?? 1) * 100)}
              on:input={(e) => {
                const pct = num(e.currentTarget.value);
                const v = Math.max(0, Math.min(1, pct / 100));
                updateEl('opacity', v >= 1 ? undefined : v);
              }}
            />
          </div>
        </label>
        <div class="prop-grid-2" style="margin-top:8px">
          <label class="prop-field">
            <span>Opacity mode</span>
            <select
              aria-label="Opacity mode"
              value={selectedElement.opacityMode ?? 'fixed'}
              on:change={(e) => updateEl('opacityMode', e.currentTarget.value === 'fixed' ? undefined : e.currentTarget.value as AppearanceValueMode)}
            >
              <option value="fixed">Fixed</option>
              <option value="variable">Variable</option>
            </select>
          </label>
          <label class="prop-field">
            <span>Visibility mode</span>
            <select
              aria-label="Visibility mode"
              value={selectedElement.visibilityMode ?? 'fixed'}
              on:change={(e) => updateVisibilityMode(e.currentTarget.value as AppearanceValueMode)}
            >
              <option value="fixed">Fixed</option>
              <option value="variable">Variable</option>
            </select>
          </label>
        </div>
        <label class="prop-field prop-field--full al-toggle" style="margin-top:8px">
          <span>Visible</span>
          <input
            aria-label="Layer visible"
            type="checkbox"
            checked={!selectedElement.hidden}
            on:change={(e) => updateEl('hidden', e.currentTarget.checked ? undefined : true)}
          />
        </label>
        <label class="prop-field prop-field--full" style="margin-top:8px">
          <span>Blend mode</span>
          <select
            aria-label="Blend mode"
            value={selectedElement.blendMode ?? 'normal'}
            on:change={(e) => setSelectedBlendMode(e.currentTarget.value as BlendMode)}
          >
            {#each BLEND_MODE_OPTIONS as mode}
              <option value={mode.value}>{mode.label}</option>
            {/each}
          </select>
        </label>
        <div class="blend-preview-row" role="group" aria-label="Blend mode hover preview" on:pointerleave={() => previewSelectedBlendMode(null)}>
          {#each BLEND_MODE_OPTIONS.filter(mode => mode.value !== 'normal') as mode}
            <button
              type="button"
              class:active={(selectedElement.blendMode ?? 'normal') === mode.value}
              aria-label="Preview blend mode {mode.label}"
              title="Hover to preview {mode.label}; click to apply"
              on:pointerenter={() => previewSelectedBlendMode(mode.value)}
              on:mouseover={() => previewSelectedBlendMode(mode.value)}
              on:focus={() => previewSelectedBlendMode(mode.value)}
              on:blur={() => previewSelectedBlendMode(null)}
              on:click={() => setSelectedBlendMode(mode.value)}
            >{mode.label}</button>
          {/each}
        </div>
        <div class="meta-hint">Variable modes are persisted as inspector intent; current exports keep concrete opacity and visibility values.</div>
      </section>

      <section class="prop-group" data-inspector-section="fill">
        <h4 class="group-label">Fill</h4>
        <div class="prop-field prop-field--full">
          <span>Fill architecture</span>
          <div class="fill-architecture-grid">
            <label>
              <span>Type</span>
              <select
                aria-label="Fill type"
                value={selectedFill.kind}
                on:change={(e) => setFillKind(e.currentTarget.value as FillKind)}
              >
                {#each FILL_KIND_OPTIONS as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </label>
            <label>
              <span>Color model</span>
              <select
                aria-label="Fill color model"
                value={selectedFill.colorModel ?? 'hex'}
                on:change={(e) => updateFillMeta({ colorModel: e.currentTarget.value as FillColorModel })}
              >
                <option value="hex">HEX</option>
                <option value="rgb">RGB</option>
                <option value="hsl">HSL</option>
                <option value="variable">Variable</option>
              </select>
            </label>
            <label>
              <span>Source</span>
              <select
                aria-label="Fill source"
                value={selectedFill.source ?? 'document'}
                on:change={(e) => updateFillMeta({ source: e.currentTarget.value as FillSource })}
              >
                <option value="document">Document colors</option>
                <option value="library">Library colors</option>
                <option value="local">Local override</option>
              </select>
            </label>
          </div>
          {#if selectedFill.colorModel === 'variable'}
            <label class="prop-field prop-field--full" style="margin-top:7px">
              <span>Variable reference</span>
              <input
                aria-label="Fill variable reference"
                type="text"
                value={selectedFill.variableRef ?? ''}
                placeholder="colors/accent"
                on:input={(e) => updateFillMeta({ variableRef: e.currentTarget.value || undefined })}
              />
            </label>
          {/if}
          {#if selectedFill.kind === 'gradient'}
            <div class="fill-gradient-grid">
              <label class="prop-field">
                <span>Gradient</span>
                <select
                  aria-label="Gradient type"
                  value={selectedFill.gradient?.type ?? 'linear'}
                  on:change={(e) => updateGradientFill({ type: e.currentTarget.value as FillGradientKind })}
                >
                  {#each GRADIENT_KIND_OPTIONS as option}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
              </label>
              <label class="prop-field">
                <span>Rotation</span>
                <input
                  aria-label="Gradient rotation"
                  type="number"
                  min="0"
                  max="360"
                  value={selectedFill.gradient?.angle ?? 180}
                  on:input={(e) => updateGradientFill({ angle: normalizedAngle(num(e.currentTarget.value)) })}
                />
              </label>
              <div class="gradient-flip-row">
                <button
                  type="button"
                  class:active={!!selectedFill.gradient?.flipX}
                  aria-label="Flip gradient horizontally"
                  on:click={() => updateGradientFill({ flipX: selectedFill.gradient?.flipX ? undefined : true })}
                >Flip H</button>
                <button
                  type="button"
                  class:active={!!selectedFill.gradient?.flipY}
                  aria-label="Flip gradient vertically"
                  on:click={() => updateGradientFill({ flipY: selectedFill.gradient?.flipY ? undefined : true })}
                >Flip V</button>
              </div>
            </div>
            <div class="gradient-stop-list" aria-label="Gradient stops">
              {#each (selectedFill.gradient?.stops ?? defaultGradientFill().stops) as stop, i (i)}
                <div class="gradient-stop-row">
                  <span>Stop {i + 1}</span>
                  <ColorPicker
                    value={stop.color}
                    onChange={(v) => updateGradientStop(i, { color: v })}
                    onBeginEdit={onBeginInspectorEdit}
                    {projectId}
                  />
                  <input
                    aria-label={`Gradient stop ${i + 1} position`}
                    type="number"
                    min="0"
                    max="100"
                    value={stop.pos}
                    on:input={(e) => updateGradientStop(i, { pos: clampPercent(num(e.currentTarget.value)) })}
                  />
                  <input
                    aria-label={`Gradient stop ${i + 1} variable`}
                    type="text"
                    value={stop.variableRef ?? ''}
                    placeholder="colors/accent"
                    on:input={(e) => updateGradientStop(i, { variableRef: e.currentTarget.value || undefined })}
                  />
                  {#if (selectedFill.gradient?.stops ?? defaultGradientFill().stops).length > 2}
                    <button type="button" aria-label={`Remove gradient stop ${i + 1}`} on:click={() => removeGradientStop(i)}>×</button>
                  {/if}
                </div>
              {/each}
              <button type="button" class="mini-action" aria-label="Add gradient stop" on:click={addGradientStop}>＋ Add stop</button>
            </div>
          {/if}
          {#if selectedFill.kind === 'pattern'}
            <div class="fill-pattern-grid">
              <label class="prop-field">
                <span>Pattern</span>
                <select
                  aria-label="Pattern style"
                  value={selectedFill.pattern?.style ?? 'diagonal'}
                  on:change={(e) => updatePatternFill({ style: e.currentTarget.value as NonNullable<ElementFill['pattern']>['style'] })}
                >
                  <option value="diagonal">Diagonal</option>
                  <option value="grid">Grid</option>
                  <option value="dots">Dots</option>
                </select>
              </label>
              <label class="prop-field">
                <span>Size</span>
                <input
                  aria-label="Pattern size"
                  type="number"
                  min="4"
                  value={selectedFill.pattern?.size ?? 12}
                  on:input={(e) => updatePatternFill({ size: Math.max(4, num(e.currentTarget.value)) })}
                />
              </label>
              <label class="prop-field">
                <span>Source</span>
                <select
                  aria-label="Pattern source"
                  value={selectedFill.pattern?.source ?? selectedFill.source ?? 'document'}
                  on:change={(e) => updatePatternFill({ source: e.currentTarget.value as FillSource })}
                >
                  <option value="document">Document</option>
                  <option value="library">Library</option>
                  <option value="local">Local</option>
                </select>
              </label>
              <label class="prop-field">
                <span>Tiling</span>
                <select
                  aria-label="Pattern tiling"
                  value={selectedFill.pattern?.tiling ?? 'repeat'}
                  on:change={(e) => updatePatternFill({ tiling: e.currentTarget.value as FillPatternTiling })}
                >
                  {#each PATTERN_TILING_OPTIONS as option}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
              </label>
              <label class="prop-field">
                <span>Scale</span>
                <input
                  aria-label="Pattern scale"
                  type="number"
                  min="10"
                  value={selectedFill.pattern?.scale ?? 100}
                  on:input={(e) => updatePatternFill({ scale: Math.max(10, num(e.currentTarget.value)) })}
                />
              </label>
              <label class="prop-field">
                <span>Spacing</span>
                <input
                  aria-label="Pattern spacing"
                  type="number"
                  min="0"
                  value={selectedFill.pattern?.spacing ?? 12}
                  on:input={(e) => updatePatternFill({ spacing: Math.max(0, num(e.currentTarget.value)) })}
                />
              </label>
              <label class="prop-field">
                <span>Align</span>
                <select
                  aria-label="Pattern alignment"
                  value={selectedFill.pattern?.alignment ?? 'center'}
                  on:change={(e) => updatePatternFill({ alignment: e.currentTarget.value as FillPatternAlignment })}
                >
                  {#each PATTERN_ALIGNMENT_OPTIONS as option}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
              </label>
              <label class="prop-field">
                <span>Opacity</span>
                <input
                  aria-label="Pattern opacity"
                  type="number"
                  min="0"
                  max="100"
                  value={Math.round((selectedFill.pattern?.opacity ?? 1) * 100)}
                  on:input={(e) => updatePatternFill({ opacity: clampPercent(num(e.currentTarget.value), 100) / 100 })}
                />
              </label>
              <label class="prop-field">
                <span>Foreground</span>
                <div class="color-row">
                  <ColorPicker
                    value={selectedFill.pattern?.foreground ?? defaultPatternFill().foreground}
                    onChange={(v) => updatePatternFill({ foreground: v })}
                    onBeginEdit={onBeginInspectorEdit}
                    {projectId}
                  />
                  <input
                    aria-label="Pattern foreground"
                    type="text"
                    value={selectedFill.pattern?.foreground ?? defaultPatternFill().foreground}
                    on:input={(e) => updatePatternFill({ foreground: e.currentTarget.value })}
                  />
                </div>
              </label>
              <label class="prop-field">
                <span>Background</span>
                <div class="color-row">
                  <ColorPicker
                    value={selectedFill.pattern?.background ?? defaultPatternFill().background}
                    onChange={(v) => updatePatternFill({ background: v })}
                    onBeginEdit={onBeginInspectorEdit}
                    {projectId}
                  />
                  <input
                    aria-label="Pattern background"
                    type="text"
                    value={selectedFill.pattern?.background ?? defaultPatternFill().background}
                    on:input={(e) => updatePatternFill({ background: e.currentTarget.value })}
                  />
                </div>
              </label>
            </div>
          {/if}
          <div class="meta-hint">Current export uses the concrete background/media fill while this metadata keeps the selected fill type, source, and variable intent portable.</div>
        </div>
        <div class="prop-field prop-field--full">
          <span>Text color</span>
          <div class="color-row">
            <ColorPicker
              value={selectedElement.color}
              onChange={(v) => updateEl('color', v)}
              onBeginEdit={onBeginInspectorEdit}
              {projectId}
            />
            <input type="text" class="color-text" value={selectedElement.color}
              on:input={(e) => updateEl('color', e.currentTarget.value)} />
          </div>
        </div>
        <div class="prop-field prop-field--full">
          <span>Background</span>
          <div class="color-row">
            <ColorPicker
              value={selectedElement.background}
              onChange={(v) => updateEl('background', v)}
              onBeginEdit={onBeginInspectorEdit}
              {projectId}
            />
            <input type="text" class="color-text" value={selectedElement.background}
              on:input={(e) => updateEl('background', e.currentTarget.value)} />
          </div>
          <!-- Gradient editor (item 50) — opens when background is already a gradient string. -->
          <GradientEditor
            value={selectedElement.background}
            onChange={(v) => updateEl('background', v)}
            onBeginEdit={onBeginInspectorEdit}
            {projectId}
          />
        </div>
      </section>

      <section class="prop-group" data-inspector-section="custom">
        <h4 class="group-label">Styles & presets</h4>
        <div class="prop-field prop-field--full">
          <span>Appearance preset</span>
          <div class="preset-apply-row">
            <select
              aria-label="Appearance preset"
              value={selectedAppearancePresetId}
              on:change={(e) => (selectedAppearancePresetId = e.currentTarget.value)}
            >
              {#each resolvedAppearancePresets as preset}
                <option value={preset.id}>{preset.label}</option>
              {/each}
            </select>
            <button
              type="button"
              class="mini-action"
              aria-label="Apply appearance preset"
              title="Apply background, radius, border, shadow, and colour fields"
              on:click={() => applyAppearancePreset(selectedAppearancePresetId)}
            >Apply</button>
            <button
              type="button"
              class="mini-action"
              aria-label="Save current appearance preset"
              title="Save current appearance into the selected preset"
              on:click={() => saveCurrentAppearancePreset(selectedAppearancePresetId)}
            >Save current</button>
          </div>
          <div class="meta-hint">Appearance presets do not change typography or content.</div>
        </div>
        <div class="prop-field prop-field--full">
          <span>Project style library</span>
          <div class="matching-grid">
            {#each resolvedProjectStyles.filter(style => style.kind !== 'layout-guide') as style (style.id)}
              <button type="button" class="action-btn" aria-label="Apply project style {style.name}" on:click={() => onApplyProjectStyle(style.id)}>{style.name}</button>
            {/each}
          </div>
          <div class="preset-apply-row">
            <button type="button" class="mini-action" aria-label="Create text style from selection" on:click={() => createProjectStyle('text')}>+ Text</button>
            <button type="button" class="mini-action" aria-label="Create color style from selection" on:click={() => createProjectStyle('color')}>+ Color</button>
            <button type="button" class="mini-action" aria-label="Create effect style from selection" on:click={() => createProjectStyle('effect')}>+ Effect</button>
            <button type="button" class="mini-action" aria-label="Create variable from selection" on:click={createVariableFromSelection}>+ Variable</button>
            <button type="button" class="mini-action" aria-label="Manage project styles and variables" on:click={onOpenProjectTokensPanel}>Manage</button>
          </div>
          <div class="meta-hint">Styles and variables keep concrete fallback values so export remains deterministic.</div>
        </div>
      </section>

      <section class="prop-group" data-inspector-section="effects">
        <h4 class="group-label">Effects</h4>
        <div class="effect-toggle-list">
          {#each EFFECT_ORDER as kind}
            <label class="prop-field prop-field--full al-toggle">
              <span>{EFFECT_LABELS[kind]}</span>
              <input
                aria-label="Enable {EFFECT_LABELS[kind]}"
                type="checkbox"
                checked={selectedEffectMap.has(kind)}
                on:change={(e) => setSelectedEffect(kind, e.currentTarget.checked)}
              />
            </label>
          {/each}
        </div>
        {#if dropShadowStackEffect?.settings.shadow}
          {@const fx = dropShadowStackEffect.settings.shadow}
          <div class="nested-effect">
            <strong>Drop shadow settings</strong>
            <div class="prop-grid-4">
              <label class="prop-field"><span>X</span><input aria-label="Effect drop shadow X" type="number" value={fx.x} on:input={(e) => updateSelectedShadowEffect('drop-shadow', { x: num(e.currentTarget.value) })} /></label>
              <label class="prop-field"><span>Y</span><input aria-label="Effect drop shadow Y" type="number" value={fx.y} on:input={(e) => updateSelectedShadowEffect('drop-shadow', { y: num(e.currentTarget.value) })} /></label>
              <label class="prop-field"><span>Blur</span><input aria-label="Effect drop shadow blur" type="number" min="0" value={fx.blur} on:input={(e) => updateSelectedShadowEffect('drop-shadow', { blur: Math.max(0, num(e.currentTarget.value)) })} /></label>
              <label class="prop-field"><span>Spread</span><input aria-label="Effect drop shadow spread" type="number" value={fx.spread} on:input={(e) => updateSelectedShadowEffect('drop-shadow', { spread: num(e.currentTarget.value) })} /></label>
            </div>
            <label class="prop-field prop-field--full">
              <span>Colour</span>
              <input aria-label="Effect drop shadow color" type="text" value={fx.color} on:input={(e) => updateSelectedShadowEffect('drop-shadow', { color: e.currentTarget.value })} />
            </label>
          </div>
        {/if}
        {#if innerShadowStackEffect?.settings.shadow}
          {@const fx = innerShadowStackEffect.settings.shadow}
          <div class="nested-effect">
            <strong>Inner shadow settings</strong>
            <div class="prop-grid-4">
              <label class="prop-field"><span>X</span><input aria-label="Inner shadow X" type="number" value={fx.x} on:input={(e) => updateSelectedShadowEffect('inner-shadow', { x: num(e.currentTarget.value) })} /></label>
              <label class="prop-field"><span>Y</span><input aria-label="Inner shadow Y" type="number" value={fx.y} on:input={(e) => updateSelectedShadowEffect('inner-shadow', { y: num(e.currentTarget.value) })} /></label>
              <label class="prop-field"><span>Blur</span><input aria-label="Inner shadow blur" type="number" min="0" value={fx.blur} on:input={(e) => updateSelectedShadowEffect('inner-shadow', { blur: Math.max(0, num(e.currentTarget.value)) })} /></label>
              <label class="prop-field"><span>Spread</span><input aria-label="Inner shadow spread" type="number" value={fx.spread} on:input={(e) => updateSelectedShadowEffect('inner-shadow', { spread: num(e.currentTarget.value) })} /></label>
            </div>
            <label class="prop-field prop-field--full">
              <span>Colour</span>
              <input aria-label="Inner shadow color" type="text" value={fx.color} on:input={(e) => updateSelectedShadowEffect('inner-shadow', { color: e.currentTarget.value })} />
            </label>
          </div>
        {/if}
        {#if layerBlurEffect?.settings.blur}
          {@const fx = layerBlurEffect.settings.blur}
          <label class="prop-field prop-field--full">
            <span>Layer blur radius</span>
            <input aria-label="Layer blur radius" type="number" min="0" step="0.5" value={fx.radius} on:input={(e) => updateSelectedEffect('layer-blur', { blur: { radius: Math.max(0, num(e.currentTarget.value)) } })} />
          </label>
        {/if}
        {#if backgroundBlurEffect?.settings.blur}
          {@const fx = backgroundBlurEffect.settings.blur}
          <label class="prop-field prop-field--full">
            <span>Background blur radius</span>
            <input aria-label="Background blur radius" type="number" min="0" step="0.5" value={fx.radius} on:input={(e) => updateSelectedEffect('background-blur', { blur: { radius: Math.max(0, num(e.currentTarget.value)) } })} />
          </label>
        {/if}
        {#if glassEffect?.settings.glass}
          {@const fx = glassEffect.settings.glass}
          <div class="nested-effect">
            <strong>Glass settings</strong>
            <div class="prop-grid-2">
              <label class="prop-field"><span>Blur</span><input aria-label="Glass blur" type="number" min="0" step="0.5" value={fx.blur} on:input={(e) => updateSelectedEffect('glass', { glass: { ...fx, blur: Math.max(0, num(e.currentTarget.value)) } })} /></label>
              <label class="prop-field"><span>Saturation</span><input aria-label="Glass saturation" type="number" min="0" max="300" value={fx.saturation} on:input={(e) => updateSelectedEffect('glass', { glass: { ...fx, saturation: Math.max(0, num(e.currentTarget.value)) } })} /></label>
              <label class="prop-field"><span>Opacity</span><input aria-label="Glass opacity" type="number" min="0" max="1" step="0.05" value={fx.opacity} on:input={(e) => updateSelectedEffect('glass', { glass: { ...fx, opacity: Math.max(0, Math.min(1, num(e.currentTarget.value))) } })} /></label>
              <label class="prop-field"><span>Tint</span><input aria-label="Glass tint" type="text" value={fx.tint} on:input={(e) => updateSelectedEffect('glass', { glass: { ...fx, tint: e.currentTarget.value } })} /></label>
            </div>
          </div>
        {/if}
        {#if noiseEffect?.settings.noise}
          {@const fx = noiseEffect.settings.noise}
          <div class="nested-effect">
            <strong>Noise settings</strong>
            <div class="prop-grid-2">
              <label class="prop-field"><span>Opacity</span><input aria-label="Noise opacity" type="number" min="0" max="1" step="0.05" value={fx.opacity} on:input={(e) => updateSelectedEffect('noise', { noise: { ...fx, opacity: Math.max(0, Math.min(1, num(e.currentTarget.value))) } })} /></label>
              <label class="prop-field"><span>Size</span><input aria-label="Noise size" type="number" min="1" value={fx.size} on:input={(e) => updateSelectedEffect('noise', { noise: { ...fx, size: Math.max(1, num(e.currentTarget.value)) } })} /></label>
            </div>
          </div>
        {/if}
        {#if textureEffect?.settings.texture}
          {@const fx = textureEffect.settings.texture}
          <div class="nested-effect">
            <strong>Texture settings</strong>
            <div class="prop-grid-2">
              <label class="prop-field">
                <span>Style</span>
                <select aria-label="Texture style" value={fx.style} on:change={(e) => updateSelectedEffect('texture', { texture: { ...fx, style: e.currentTarget.value as TextureEffectStyle } })}>
                  {#each TEXTURE_STYLE_OPTIONS as option}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
              </label>
              <label class="prop-field"><span>Scale</span><input aria-label="Texture scale" type="number" min="2" value={fx.scale} on:input={(e) => updateSelectedEffect('texture', { texture: { ...fx, scale: Math.max(2, num(e.currentTarget.value)) } })} /></label>
              <label class="prop-field"><span>Opacity</span><input aria-label="Texture opacity" type="number" min="0" max="1" step="0.05" value={fx.opacity} on:input={(e) => updateSelectedEffect('texture', { texture: { ...fx, opacity: Math.max(0, Math.min(1, num(e.currentTarget.value))) } })} /></label>
              <label class="prop-field"><span>Colour</span><input aria-label="Texture color" type="text" value={fx.color} on:input={(e) => updateSelectedEffect('texture', { texture: { ...fx, color: e.currentTarget.value } })} /></label>
            </div>
          </div>
        {/if}
        <div class="meta-hint">Effect stack exports CSS fallbacks for shadows, blur, glass, noise, and texture.</div>
      </section>

      <!-- Border / stroke (item 49) — width + style + colour. -->
      {#if selectedElement.type === 'vector'}
        <section class="prop-group" data-inspector-section="custom">
          <h4 class="group-label">Vector edit</h4>
          <div class="vector-mode-row">
            <button
              type="button"
              class="action-btn"
              aria-label={currentVectorEdit().active ? 'Exit vector edit mode' : 'Enter vector edit mode'}
              aria-pressed={!!currentVectorEdit().active}
              on:click={() => setVectorEditActive(!currentVectorEdit().active)}
            >
              {currentVectorEdit().active ? 'Exit edit mode' : 'Enter edit mode'}
            </button>
          </div>
          <div class="vector-tool-grid" role="group" aria-label="Vector edit tools">
            {#each VECTOR_EDIT_TOOLS as tool}
              <button
                type="button"
                class="action-btn"
                aria-label={`Vector ${tool.label} tool`}
                aria-pressed={currentVectorEdit().active && currentVectorEdit().tool === tool.value}
                on:click={() => setVectorEditTool(tool.value)}
              >
                {tool.label}
              </button>
            {/each}
          </div>
          <div class="prop-grid-2" style="margin-top:8px">
            <label class="prop-field">
              <span>Bezier points</span>
              <input type="number" readonly value={selectedElement.vectorPoints?.length ?? 0} />
            </label>
            <label class="prop-field">
              <span>Variable width</span>
              <input
                aria-label="Vector variable width"
                type="number"
                min="1"
                max="48"
                value={currentVectorEdit().variableWidths?.[0] ?? selectedElement.border?.width ?? 2}
                on:input={(e) => setVectorVariableWidth(num(e.currentTarget.value))}
              />
            </label>
          </div>
          <label class="prop-field prop-field--full" style="margin-top:8px">
            <span>Paint colour</span>
            <div class="color-row">
              <ColorPicker
                value={currentVectorEdit().paintColor ?? selectedElement.border?.color ?? selectedElement.background ?? '#f7f1e8'}
                onChange={setVectorPaintColor}
                onBeginEdit={onBeginInspectorEdit}
                {projectId}
              />
              <input
                type="text"
                class="color-text"
                value={currentVectorEdit().paintColor ?? selectedElement.border?.color ?? selectedElement.background ?? '#f7f1e8'}
                on:input={(e) => setVectorPaintColor(e.currentTarget.value)}
              />
            </div>
          </label>
          <div class="vector-operation-grid" role="group" aria-label="Vector boolean operations">
            {#each ['merge', 'extract', 'subtract'] as operation}
              <button
                type="button"
                class="action-btn"
                aria-label={`Vector ${VECTOR_OPERATION_LABELS[operation as VectorEditOperationKind]} operation`}
                on:click={() => addVectorOperation(operation as VectorEditOperationKind)}
              >
                {VECTOR_OPERATION_LABELS[operation as VectorEditOperationKind]}
              </button>
            {/each}
          </div>
          <div class="meta-hint">
            Active: {currentVectorEdit().active ? currentVectorEdit().tool ?? 'select' : 'off'} ·
            caps: {selectedElement.border?.startCap ?? selectedElement.border?.cap ?? 'round'} / {selectedElement.border?.endCap ?? selectedElement.border?.cap ?? 'round'} ·
            operations: {currentVectorEdit().operations?.length ?? 0}
          </div>
        </section>
      {/if}

      <section class="prop-group" data-inspector-section="stroke">
        <h4 class="group-label" data-visible-label="Stroke" data-collapse-label="Border" data-collapse-key="border">Stroke</h4>
        <label class="prop-field prop-field--full al-toggle">
          <span>Enable border</span>
          <input
            type="checkbox"
            checked={!!selectedElement.border}
            on:change={(e) => {
              if (e.currentTarget.checked) {
                updateEl('border', selectedElement?.border ?? DEFAULT_ELEMENT_BORDER);
              } else {
                updateEl('border', undefined);
              }
            }}
          />
        </label>
        {#if selectedElement.border}
          {@const br = selectedElement.border}
          <div class="prop-grid-2">
            <label class="prop-field">
              <span>Width</span>
              <input type="number" min="0" value={br.width}
                on:input={(e) => updateEl('border', { ...br, width: Math.max(0, num(e.currentTarget.value)) })} />
            </label>
            <label class="prop-field">
              <span>Style</span>
              <select value={br.style}
                on:change={(e) => updateSelectedBorder({ style: e.currentTarget.value as StrokeStyle })}>
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            </label>
          </div>
          <div class="prop-field prop-field--full" style="margin-top:6px">
            <span>Colour</span>
            <div class="color-row">
              <ColorPicker
                value={br.color}
                onChange={(v) => updateSelectedBorder({ color: v })}
                onBeginEdit={onBeginInspectorEdit}
                {projectId}
              />
              <input
                type="text"
                class="color-text"
                value={br.color}
                on:input={(e) => updateSelectedBorder({ color: e.currentTarget.value })}
              />
            </div>
          </div>
          <div class="prop-grid-2" style="margin-top:6px">
            <label class="prop-field">
              <span>Placement</span>
              <select
                aria-label="Stroke placement"
                value={br.placement ?? 'inside'}
                on:change={(e) => updateSelectedBorder({ placement: e.currentTarget.value as StrokePlacement })}
              >
                {#each STROKE_PLACEMENT_OPTIONS as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </label>
            <label class="prop-field">
              <span>Width profile</span>
              <select
                aria-label="Stroke width profile"
                value={br.widthProfile ?? 'uniform'}
                on:change={(e) => updateSelectedBorder({ widthProfile: e.currentTarget.value as StrokeWidthProfile })}
              >
                {#each STROKE_PROFILE_OPTIONS as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </label>
            <label class="prop-field">
              <span>Dash</span>
              <input
                aria-label="Stroke dash length"
                type="number"
                min="0"
                value={br.dash ?? 0}
                on:input={(e) => updateSelectedBorder({ dash: Math.max(0, num(e.currentTarget.value)) || undefined })}
              />
            </label>
            <label class="prop-field">
              <span>Gap</span>
              <input
                aria-label="Stroke gap length"
                type="number"
                min="0"
                value={br.gap ?? 0}
                on:input={(e) => updateSelectedBorder({ gap: Math.max(0, num(e.currentTarget.value)) || undefined })}
              />
            </label>
            <label class="prop-field">
              <span>Cap</span>
              <select
                aria-label="Stroke cap"
                value={br.cap ?? 'round'}
                on:change={(e) => updateSelectedBorder({ cap: e.currentTarget.value as StrokeCap })}
              >
                {#each STROKE_CAP_OPTIONS as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </label>
            <label class="prop-field">
              <span>Brush direction</span>
              <select
                aria-label="Stroke brush direction"
                value={br.brushDirection ?? 'forward'}
                on:change={(e) => updateSelectedBorder({ brushDirection: e.currentTarget.value as StrokeBrushDirection })}
              >
                <option value="forward">Forward</option>
                <option value="reverse">Reverse</option>
              </select>
            </label>
            <label class="prop-field">
              <span>Start cap</span>
              <select
                aria-label="Open path start cap"
                value={br.startCap ?? br.cap ?? 'round'}
                on:change={(e) => updateSelectedBorder({ startCap: e.currentTarget.value as StrokeCap })}
              >
                {#each STROKE_CAP_OPTIONS as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </label>
            <label class="prop-field">
              <span>End cap</span>
              <select
                aria-label="Open path end cap"
                value={br.endCap ?? br.cap ?? 'round'}
                on:change={(e) => updateSelectedBorder({ endCap: e.currentTarget.value as StrokeCap })}
              >
                {#each STROKE_CAP_OPTIONS as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </label>
          </div>
          <div class="stroke-side-grid">
            {#each ['top', 'right', 'bottom', 'left'] as side}
              <label class="prop-field">
                <span>{side}</span>
                <input
                  aria-label={`Stroke ${side} width`}
                  type="number"
                  min="0"
                  value={br.sides?.[side as 'top' | 'right' | 'bottom' | 'left']?.width ?? br.width}
                  on:input={(e) => updateSelectedBorderSide(side as 'top' | 'right' | 'bottom' | 'left', { width: Math.max(0, num(e.currentTarget.value)) })}
                />
              </label>
            {/each}
          </div>
          <div class="meta-hint">Placement, profiles, caps, dash/gap, and side widths are persisted as stroke metadata. DOM export maps what CSS supports directly; vector paths use stroke-width, dasharray, and linecap fallbacks.</div>
        {/if}
      </section>

      <section class="prop-group" data-inspector-section="layout">
        <h4 class="group-label">Layout item</h4>
        <label class="prop-field prop-field--full al-toggle">
          <span>Ignore layout</span>
          <input
            aria-label="Ignore auto layout"
            type="checkbox"
            checked={!!selectedElement.ignoreAutoLayout}
            on:change={(e) => updateEl('ignoreAutoLayout', e.currentTarget.checked ? true : undefined)}
          />
        </label>
        <div class="prop-grid-2">
          <label class="prop-field">
            <span>Horizontal sizing</span>
            <select
              aria-label="Horizontal layout sizing"
              value={selectedElement.layoutSizing?.horizontal ?? 'fixed'}
              on:change={(e) => updateLayoutSizing('horizontal', e.currentTarget.value as AutoLayoutSizingMode)}
            >
              {#each SIZING_OPTIONS as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </label>
          <label class="prop-field">
            <span>Vertical sizing</span>
            <select
              aria-label="Vertical layout sizing"
              value={selectedElement.layoutSizing?.vertical ?? 'fixed'}
              on:change={(e) => updateLayoutSizing('vertical', e.currentTarget.value as AutoLayoutSizingMode)}
            >
              {#each SIZING_OPTIONS as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </label>
        </div>
        <div class="prop-grid-4" style="margin-top:6px">
          <label class="prop-field"><span>Min W</span><input aria-label="Layout min width" type="number" min="0" value={selectedElement.layoutSizing?.minWidth ?? 0} on:input={(e) => updateLayoutSizingLimit('minWidth', num(e.currentTarget.value))} /></label>
          <label class="prop-field"><span>Max W</span><input aria-label="Layout max width" type="number" min="0" value={selectedElement.layoutSizing?.maxWidth ?? 0} on:input={(e) => updateLayoutSizingLimit('maxWidth', num(e.currentTarget.value))} /></label>
          <label class="prop-field"><span>Min H</span><input aria-label="Layout min height" type="number" min="0" value={selectedElement.layoutSizing?.minHeight ?? 0} on:input={(e) => updateLayoutSizingLimit('minHeight', num(e.currentTarget.value))} /></label>
          <label class="prop-field"><span>Max H</span><input aria-label="Layout max height" type="number" min="0" value={selectedElement.layoutSizing?.maxHeight ?? 0} on:input={(e) => updateLayoutSizingLimit('maxHeight', num(e.currentTarget.value))} /></label>
        </div>
      </section>

      <!-- Container / Auto Layout -->
      {#if selectedElement.type === 'group' || selectedElement.type === 'section'}
        <section class="prop-group" data-inspector-section="layout">
          <h4 class="group-label">Auto Layout</h4>
          <div class="auto-layout-flow-row" role="group" aria-label="Element auto layout flow">
            <button
              type="button"
              aria-label="Element auto layout horizontal"
              aria-pressed={!!selectedElement.autoLayout && selectedElement.autoLayout.direction === 'row' && (selectedElement.autoLayout.mode ?? 'flex') === 'flex'}
              on:click={() => setElementAutoLayoutFlow('row')}
            >|→</button>
            <button
              type="button"
              aria-label="Element auto layout vertical"
              aria-pressed={!!selectedElement.autoLayout && selectedElement.autoLayout.direction === 'column' && (selectedElement.autoLayout.mode ?? 'flex') === 'flex'}
              on:click={() => setElementAutoLayoutFlow('column')}
            >↓|</button>
            <button
              type="button"
              aria-label="Element auto layout grid"
              aria-pressed={!!selectedElement.autoLayout && (selectedElement.autoLayout.mode ?? 'flex') === 'grid'}
              on:click={() => setElementAutoLayoutFlow(selectedElement.autoLayout?.direction ?? 'row', 'grid')}
            >▦</button>
            <button
              type="button"
              aria-label="Disable element auto layout"
              aria-pressed={!selectedElement.autoLayout}
              disabled={!selectedElement.autoLayout}
              on:click={toggleAutoLayout}
            >—</button>
          </div>
          <label class="prop-field prop-field--full al-toggle auto-layout-enable-row">
            <span>Enable flex layout</span>
            <input aria-label="Enable element flex layout" type="checkbox" checked={!!selectedElement.autoLayout} on:change={toggleAutoLayout} />
          </label>
          {#if selectedElement.autoLayout}
            {@const al = selectedElement.autoLayout}
            <div class="prop-grid-2">
              <label class="prop-field">
                <span>Mode</span>
                <select aria-label="Element auto layout mode" value={al.mode ?? 'flex'} on:change={(e) => setAutoLayoutMode('element', e.currentTarget.value as NonNullable<AutoLayout['mode']>)}>
                  <option value="flex">Flex</option>
                  <option value="grid">Grid</option>
                </select>
              </label>
              <label class="prop-field">
                <span>Infer</span>
                <button type="button" class="action-btn" aria-label="Infer element auto layout" on:click={() => updateEl('autoLayout', inferAutoLayout(selectedElement.children))}>Infer from children</button>
              </label>
              <label class="prop-field">
                <span>Direction</span>
                <select value={al.direction} on:change={(e) => updateAutoLayout('direction', e.currentTarget.value)}>
                  <option value="row">→ Row</option>
                  <option value="column">↓ Column</option>
                </select>
              </label>
              <label class="prop-field">
                <span>Gap</span>
                <input type="number" value={al.gap} min="0"
                  on:input={(e) => updateAutoLayout('gap', num(e.currentTarget.value))} />
              </label>
            </div>
            <div class="prop-grid-2">
              <label class="prop-field">
                <span>Align (cross)</span>
                <select value={al.align} on:change={(e) => updateAutoLayout('align', e.currentTarget.value)}>
                  <option value="start">Start</option>
                  <option value="center">Center</option>
                  <option value="end">End</option>
                  <option value="stretch">Stretch</option>
                </select>
              </label>
              <label class="prop-field">
                <span>Justify (main)</span>
                <select value={al.justify ?? 'start'} on:change={(e) => updateAutoLayout('justify', e.currentTarget.value)}>
                  <option value="start">Start</option>
                  <option value="center">Center</option>
                  <option value="end">End</option>
                  <option value="space-between">Space between</option>
                  <option value="space-around">Space around</option>
                </select>
              </label>
            </div>
            <label class="prop-field prop-field--full al-toggle">
              <span>Wrap</span>
              <input type="checkbox" checked={!!al.wrap} on:change={(e) => updateAutoLayout('wrap', e.currentTarget.checked)} />
            </label>
            {#if (al.mode ?? 'flex') === 'grid'}
              <h5 class="sub-label">Grid</h5>
              <div class="prop-grid-2">
                <label class="prop-field"><span>Columns</span><input aria-label="Element auto layout grid columns" type="number" min="1" value={al.grid?.columns ?? 2} on:input={(e) => updateAutoLayoutGrid('element', { columns: Math.max(1, num(e.currentTarget.value)) })} /></label>
                <label class="prop-field"><span>Rows</span><input aria-label="Element auto layout grid rows" type="number" min="1" value={al.grid?.rows ?? 1} on:input={(e) => updateAutoLayoutGrid('element', { rows: Math.max(1, num(e.currentTarget.value)) })} /></label>
                <label class="prop-field"><span>Column gap</span><input aria-label="Element auto layout column gap" type="number" min="0" value={al.grid?.columnGap ?? al.gap} on:input={(e) => updateAutoLayoutGrid('element', { columnGap: Math.max(0, num(e.currentTarget.value)) })} /></label>
                <label class="prop-field"><span>Row gap</span><input aria-label="Element auto layout row gap" type="number" min="0" value={al.grid?.rowGap ?? al.gap} on:input={(e) => updateAutoLayoutGrid('element', { rowGap: Math.max(0, num(e.currentTarget.value)) })} /></label>
                <label class="prop-field prop-field--full"><span>Column tracks</span><input aria-label="Element auto layout column tracks" type="text" value={al.grid?.columnTracks ?? 'repeat(2, minmax(0, 1fr))'} on:input={(e) => updateAutoLayoutGrid('element', { columnTracks: e.currentTarget.value })} /></label>
                <label class="prop-field prop-field--full"><span>Row tracks</span><input aria-label="Element auto layout row tracks" type="text" value={al.grid?.rowTracks ?? 'auto'} on:input={(e) => updateAutoLayoutGrid('element', { rowTracks: e.currentTarget.value })} /></label>
              </div>
            {/if}
            <h5 class="sub-label">Padding</h5>
            <div class="prop-grid-4 padding-grid">
              <label class="prop-field"><span>T</span>
                <input type="number" value={al.padding.t} min="0"
                  on:input={(e) => updateAutoLayoutPadding('t', num(e.currentTarget.value))} />
              </label>
              <label class="prop-field"><span>R</span>
                <input type="number" value={al.padding.r} min="0"
                  on:input={(e) => updateAutoLayoutPadding('r', num(e.currentTarget.value))} />
              </label>
              <label class="prop-field"><span>B</span>
                <input type="number" value={al.padding.b} min="0"
                  on:input={(e) => updateAutoLayoutPadding('b', num(e.currentTarget.value))} />
              </label>
              <label class="prop-field"><span>L</span>
                <input type="number" value={al.padding.l} min="0"
                  on:input={(e) => updateAutoLayoutPadding('l', num(e.currentTarget.value))} />
              </label>
              <button
                type="button"
                class:linked={elementPaddingLinked}
                class="padding-link-button inspector-ui-only"
                aria-pressed={elementPaddingLinked}
                aria-label={elementPaddingLinked ? 'Unlink element auto layout padding values' : 'Link element auto layout padding values'}
                title={elementPaddingLinked ? 'Unlink padding values' : 'Link padding values'}
                on:click={() => togglePaddingLink('element', selectedElement.id)}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                  <path d="M6.6 5.1 8.4 3.3a3 3 0 1 1 4.3 4.2l-1.8 1.8" />
                  <path d="M9.4 10.9 7.6 12.7a3 3 0 1 1-4.3-4.2l1.8-1.8" />
                  <path d="M6 10 10 6" />
                </svg>
              </button>
            </div>
          {/if}
        </section>
      {/if}

      <!-- List config -->
      {#if selectedElement.type === 'list'}
        <section class="prop-group" data-inspector-section="custom">
          <h4 class="group-label">List</h4>
          <div class="prop-field prop-field--full">
            <span>Style</span>
            <select
              class="target-select"
              value={selectedElement.listKind ?? 'ul'}
              on:change={(e) => updateEl('listKind', e.currentTarget.value === 'ol' ? 'ol' : 'ul')}
            >
              <option value="ul">• Bulleted (ul)</option>
              <option value="ol">1. Numbered (ol)</option>
            </select>
          </div>
          <div class="meta-hint">Items are separated by newlines in the Content field above.</div>
        </section>
      {/if}

      <!-- Iframe source -->
      {#if selectedElement.type === 'iframe'}
        <section class="prop-group" data-inspector-section="custom">
          <h4 class="group-label">Iframe</h4>
          <label class="prop-field prop-field--full">
            <span>URL</span>
            <input
              type="text"
              spellcheck="false"
              value={selectedElement.iframeSrc ?? ''}
              placeholder="https://example.com"
              on:input={(e) => updateEl('iframeSrc', e.currentTarget.value)}
            />
          </label>
          <div class="meta-hint">Exported with sandbox=allow-scripts allow-same-origin allow-forms.</div>
          {#if !isSafeIframeSrc(selectedElement.iframeSrc)}
            <div class="meta-hint danger">Unsafe iframe URL will export as about:blank.</div>
          {/if}
        </section>
      {/if}

      <!-- Image source & settings -->
      {#if selectedElement.type === 'image'}
        <section class="prop-group" data-inspector-section="custom">
          <h4 class="group-label">Image</h4>
          <div class="img-preview-wrap">
            {#if imageRenderSrc(selectedElement, $assetUrls)}
              <img
                src={imageRenderSrc(selectedElement, $assetUrls)}
                alt={selectedElement.alt ?? ''}
                class="img-preview"
                style:object-fit={selectedElement.objectFit ?? 'cover'}
                style:object-position={objectPositionForElement(selectedElement)}
                style:filter={cssFilterForElement(selectedElement)}
                style:transform={selectedMediaPreviewTransform()}
              />
            {:else if selectedElement.imageAssetPath}
              <div class="img-empty" role={assetPreviewRole(selectedElement)} aria-live="polite">
                {assetPreviewMessage(selectedElement)}
              </div>
            {:else}
              <div class="img-empty">No image selected</div>
            {/if}
          </div>
          <button class="action-btn" style="margin-bottom:8px" on:click={() => imageReplaceInput.click()}>
            ↑ {selectedElement.imageSrc ? 'Replace' : 'Pick'} image
          </button>
          <input
            bind:this={imageReplaceInput}
            type="file"
            accept="image/*"
            style="display:none"
            on:change={handleImageReplace}
          />
          <label class="prop-field prop-field--full">
            <span>URL <span class="meta-hint">(or paste data:)</span></span>
            <input
              type="text"
              value={selectedElement.imageSrc ?? ''}
              placeholder="https://example.com/image.jpg"
              on:input={(e) => updateEl('imageSrc', e.currentTarget.value || undefined)}
            />
          </label>
          <label class="prop-field prop-field--full">
            <span>Alt text</span>
            <input
              type="text"
              value={selectedElement.alt ?? ''}
              placeholder="Describe this image for accessibility"
              on:input={(e) => updateEl('alt', e.currentTarget.value || undefined)}
            />
          </label>
          <label class="prop-field prop-field--full">
            <span>Object fit</span>
            <select
              value={selectedElement.objectFit ?? 'cover'}
              on:change={(e) => updateEl('objectFit', e.currentTarget.value)}
            >
              <option value="cover">Cover (crop to fill)</option>
              <option value="contain">Contain (letterbox)</option>
              <option value="fill">Fill (stretch)</option>
              <option value="none">None (original size)</option>
            </select>
          </label>
          <div class="crop-control-row">
            <button
              type="button"
              class="action-btn inspector-ui-only"
              aria-pressed={cropImageElementId === selectedElement.id}
              aria-label={cropImageElementId === selectedElement.id ? 'Exit image crop mode' : 'Crop image'}
              on:click={() => onToggleImageCrop(selectedElement.id)}
            >{cropImageElementId === selectedElement.id ? 'Done cropping' : 'Crop image'}</button>
            <button
              type="button"
              class="action-btn inspector-ui-only"
              aria-label="Reset image crop"
              on:click={() => onResetImageCrop(selectedElement.id)}
            >Reset crop</button>
          </div>
          <div class="crop-control-row crop-aspect-row" role="group" aria-label="Image crop aspect ratios">
            {#each CROP_ASPECT_OPTIONS as option}
              <button
                type="button"
                class="action-btn inspector-ui-only"
                aria-label={`Image crop aspect ${option.label}`}
                aria-pressed={(selectedMediaTransform()?.cropAspectRatio ?? 'free') === option.value}
                on:click={() => setCropAspectRatio(option.value)}
              >{option.label}</button>
            {/each}
          </div>
          <button
            type="button"
            class="action-btn inspector-ui-only"
            aria-label="Resize image media to fit"
            on:click={resizeSelectedMediaToFit}
          >Resize to fit</button>
          <div class="prop-grid-2" style="margin-top:8px">
            <label class="prop-field">
              <span>Scale</span>
              <input aria-label="Image internal scale" type="number" min="0.1" max="4" step="0.1" value={selectedMediaTransform()?.scale ?? 1} on:input={(e) => updateSelectedMediaInternalTransform({ scale: Math.max(0.1, num(e.currentTarget.value)), translateX: selectedMediaTransform()?.translateX ?? 0, translateY: selectedMediaTransform()?.translateY ?? 0 })} />
            </label>
            <label class="prop-field">
              <span>X offset</span>
              <input aria-label="Image internal x offset" type="number" min="-100" max="100" step="1" value={selectedMediaTransform()?.translateX ?? 0} on:input={(e) => updateSelectedMediaInternalTransform({ scale: selectedMediaTransform()?.scale ?? 1, translateX: num(e.currentTarget.value), translateY: selectedMediaTransform()?.translateY ?? 0 })} />
            </label>
            <label class="prop-field">
              <span>Y offset</span>
              <input aria-label="Image internal y offset" type="number" min="-100" max="100" step="1" value={selectedMediaTransform()?.translateY ?? 0} on:input={(e) => updateSelectedMediaInternalTransform({ scale: selectedMediaTransform()?.scale ?? 1, translateX: selectedMediaTransform()?.translateX ?? 0, translateY: num(e.currentTarget.value) })} />
            </label>
          </div>
          <div class="meta-hint">Object position: {objectPositionForElement(selectedElement)}</div>
          <div class="filter-control-head">
            <h5>Filters</h5>
            <button type="button" class="text-action" aria-label="Reset image filters" on:click={resetImageFilters}>Reset filters</button>
          </div>
          <label class="prop-field prop-field--full filter-row">
            <span>Brightness <span class="meta-hint">({Math.round(imageFilterDisplayValue('brightness'))}%)</span></span>
            <div class="filter-row-controls">
              <input aria-label="Image brightness" type="range" min="0" max="200" step="1" value={imageFilterDisplayValue('brightness')} on:input={(e) => updateImageFilter('brightness', num(e.currentTarget.value))} />
              <input aria-label="Image brightness value" class="filter-value" type="number" min="0" max="200" step="1" value={imageFilterDisplayValue('brightness')} on:input={(e) => updateImageFilter('brightness', num(e.currentTarget.value))} />
            </div>
          </label>
          <label class="prop-field prop-field--full filter-row">
            <span>Contrast <span class="meta-hint">({Math.round(imageFilterDisplayValue('contrast'))}%)</span></span>
            <div class="filter-row-controls">
              <input aria-label="Image contrast" type="range" min="0" max="200" step="1" value={imageFilterDisplayValue('contrast')} on:input={(e) => updateImageFilter('contrast', num(e.currentTarget.value))} />
              <input aria-label="Image contrast value" class="filter-value" type="number" min="0" max="200" step="1" value={imageFilterDisplayValue('contrast')} on:input={(e) => updateImageFilter('contrast', num(e.currentTarget.value))} />
            </div>
          </label>
          <label class="prop-field prop-field--full filter-row">
            <span>Saturation <span class="meta-hint">({Math.round(imageFilterDisplayValue('saturation'))}%)</span></span>
            <div class="filter-row-controls">
              <input aria-label="Image saturation" type="range" min="0" max="200" step="1" value={imageFilterDisplayValue('saturation')} on:input={(e) => updateImageFilter('saturation', num(e.currentTarget.value))} />
              <input aria-label="Image saturation value" class="filter-value" type="number" min="0" max="200" step="1" value={imageFilterDisplayValue('saturation')} on:input={(e) => updateImageFilter('saturation', num(e.currentTarget.value))} />
            </div>
          </label>
          <label class="prop-field prop-field--full filter-row">
            <span>Blur <span class="meta-hint">({imageFilterDisplayValue('blur')}px)</span></span>
            <div class="filter-row-controls">
              <input aria-label="Image blur" type="range" min="0" max="40" step="0.5" value={imageFilterDisplayValue('blur')} on:input={(e) => updateImageFilter('blur', num(e.currentTarget.value))} />
              <input aria-label="Image blur value" class="filter-value" type="number" min="0" max="40" step="0.5" value={imageFilterDisplayValue('blur')} on:input={(e) => updateImageFilter('blur', num(e.currentTarget.value))} />
            </div>
          </label>
          <label class="prop-field prop-field--full filter-row">
            <span>Hue <span class="meta-hint">({Math.round(imageFilterDisplayValue('hue'))}°)</span></span>
            <div class="filter-row-controls">
              <input aria-label="Image hue" type="range" min="-180" max="180" step="1" value={imageFilterDisplayValue('hue')} on:input={(e) => updateImageFilter('hue', num(e.currentTarget.value))} />
              <input aria-label="Image hue value" class="filter-value" type="number" min="-180" max="180" step="1" value={imageFilterDisplayValue('hue')} on:input={(e) => updateImageFilter('hue', num(e.currentTarget.value))} />
            </div>
          </label>
        </section>
      {/if}

      {#if selectedElement.type !== 'image' && selectedElement.mediaFill}
        <section class="prop-group" data-inspector-section="custom">
          <h4 class="group-label">Media fill</h4>
          <div class="img-preview-wrap">
            {#if imageRenderSrc(selectedElement, $assetUrls)}
              <img
                src={imageRenderSrc(selectedElement, $assetUrls)}
                alt={mediaFillForElement(selectedElement)?.alt ?? ''}
                class="img-preview"
                style:object-fit={mediaFillModeToObjectFit(mediaFillForElement(selectedElement)?.transform?.fill?.mode)}
                style:object-position={objectPositionForElement({ objectPosition: undefined, mediaTransform: mediaFillForElement(selectedElement)?.transform })}
                style:filter={cssFilterForElement({ mediaTransform: mediaFillForElement(selectedElement)?.transform })}
                style:transform={selectedMediaPreviewTransform()}
              />
            {:else if mediaFillForElement(selectedElement)?.assetPath}
              <div class="img-empty" role={assetPreviewRole(selectedElement)} aria-live="polite">
                {assetPreviewMessage(selectedElement)}
              </div>
            {:else}
              <div class="img-empty">No media selected</div>
            {/if}
          </div>
          <button class="action-btn" style="margin-bottom:8px" on:click={() => imageReplaceInput.click()}>
            ↑ Replace media fill
          </button>
          <input
            bind:this={imageReplaceInput}
            type="file"
            accept="image/*"
            style="display:none"
            on:change={handleImageReplace}
          />
          <label class="prop-field prop-field--full">
            <span>URL <span class="meta-hint">(or paste data:)</span></span>
            <input
              type="text"
              value={mediaFillForElement(selectedElement)?.src ?? ''}
              placeholder="https://example.com/image.jpg"
              on:input={(e) => updateMediaFill({ src: e.currentTarget.value || undefined, assetId: undefined, assetPath: undefined, mime: undefined })}
            />
          </label>
          <label class="prop-field prop-field--full">
            <span>Alt / note <span class="meta-hint">(decorative by default)</span></span>
            <input
              type="text"
              value={mediaFillForElement(selectedElement)?.alt ?? ''}
              placeholder="Optional description for meaningful media"
              on:input={(e) => updateMediaFill({ alt: e.currentTarget.value || undefined })}
            />
          </label>
          <label class="prop-field prop-field--full">
            <span>Fill mode</span>
            <select
              value={mediaFillForElement(selectedElement)?.transform?.fill?.mode ?? 'fill'}
              on:change={(e) => updateMediaFillMode(e.currentTarget.value as 'fit' | 'fill' | 'stretch' | 'original' | 'tile')}
            >
              <option value="fill">Fill (crop to shape)</option>
              <option value="fit">Fit (contain)</option>
              <option value="stretch">Stretch</option>
              <option value="original">Original size</option>
              <option value="tile">Tile</option>
            </select>
          </label>
          <div class="crop-control-row">
            <button
              type="button"
              class="action-btn inspector-ui-only"
              aria-pressed={cropImageElementId === selectedElement.id}
              aria-label={cropImageElementId === selectedElement.id ? 'Exit media fill crop mode' : 'Crop media fill'}
              on:click={() => onToggleImageCrop(selectedElement.id)}
            >{cropImageElementId === selectedElement.id ? 'Done cropping' : 'Crop fill'}</button>
            <button
              type="button"
              class="action-btn inspector-ui-only"
              aria-label="Reset media fill crop"
              on:click={() => onResetImageCrop(selectedElement.id)}
            >Reset crop</button>
          </div>
          <div class="crop-control-row crop-aspect-row" role="group" aria-label="Media fill crop aspect ratios">
            {#each CROP_ASPECT_OPTIONS as option}
              <button
                type="button"
                class="action-btn inspector-ui-only"
                aria-label={`Media fill crop aspect ${option.label}`}
                aria-pressed={(selectedMediaTransform()?.cropAspectRatio ?? 'free') === option.value}
                on:click={() => setCropAspectRatio(option.value)}
              >{option.label}</button>
            {/each}
          </div>
          <button
            type="button"
            class="action-btn inspector-ui-only"
            aria-label="Resize media fill to fit"
            on:click={resizeSelectedMediaToFit}
          >Resize to fit</button>
          <div class="prop-grid-2" style="margin-top:8px">
            <label class="prop-field">
              <span>Scale</span>
              <input aria-label="Media fill internal scale" type="number" min="0.1" max="4" step="0.1" value={selectedMediaTransform()?.scale ?? 1} on:input={(e) => updateSelectedMediaInternalTransform({ scale: Math.max(0.1, num(e.currentTarget.value)), translateX: selectedMediaTransform()?.translateX ?? 0, translateY: selectedMediaTransform()?.translateY ?? 0 })} />
            </label>
            <label class="prop-field">
              <span>X offset</span>
              <input aria-label="Media fill internal x offset" type="number" min="-100" max="100" step="1" value={selectedMediaTransform()?.translateX ?? 0} on:input={(e) => updateSelectedMediaInternalTransform({ scale: selectedMediaTransform()?.scale ?? 1, translateX: num(e.currentTarget.value), translateY: selectedMediaTransform()?.translateY ?? 0 })} />
            </label>
            <label class="prop-field">
              <span>Y offset</span>
              <input aria-label="Media fill internal y offset" type="number" min="-100" max="100" step="1" value={selectedMediaTransform()?.translateY ?? 0} on:input={(e) => updateSelectedMediaInternalTransform({ scale: selectedMediaTransform()?.scale ?? 1, translateX: selectedMediaTransform()?.translateX ?? 0, translateY: num(e.currentTarget.value) })} />
            </label>
          </div>
          {#if selectedElement.shapeKind}
            <div class="meta-hint">Vector shapes keep their path silhouette by masking the media fill in canvas and export.</div>
          {:else}
            <div class="meta-hint">Media fill is stored on the shape; old image elements remain compatible.</div>
          {/if}
        </section>
      {/if}

      <!-- Button toggle — any element (including groups) can become a button -->
      <section class="prop-group" data-inspector-section="custom" data-tour="link-buttons">
        <h4 class="group-label">Interaction</h4>
        <label class="button-toggle">
          <input
            type="checkbox"
            checked={selectedElement.isButton === true}
            on:change={(e) => updateEl('isButton', e.currentTarget.checked || undefined)}
          />
          <span class="button-toggle-label">Button</span>
          <span class="button-toggle-hint">
            {#if selectedElement.children?.length}
              Each child element will link to the target
            {:else}
              Make this element a clickable link
            {/if}
          </span>
        </label>
      </section>

      <!-- Button link -->
      {#if selectedElement.isButton}
        <section class="prop-group" data-inspector-section="custom">
          <h4 class="group-label">Link target</h4>
          <div class="prop-field prop-field--full">
            <span class="prop-label">Target page</span>
            <select
              class="target-select"
              value={selectedElement.targetFrameId ?? ''}
              on:change={(e) => updateEl('targetFrameId', e.currentTarget.value || null)}
            >
              <option value="">— No link —</option>
              {#each state.frames as frame (frame.id)}
                {#if frame.id !== activeFrame?.id}
                  <option value={frame.id}>{frame.name} ({frame.filename})</option>
                {/if}
              {/each}
            </select>
          </div>
          {#if selectedElement.targetFrameId}
            {@const target = state.frames.find(f => f.id === selectedElement?.targetFrameId)}
            {#if target}
              <div class="link-badge">
                ⬡ Links to: <strong>{target.name}</strong> → {target.filename}
              </div>
            {/if}
          {/if}
        </section>
      {/if}
      <section class="prop-group" data-inspector-section="custom">
        <h4 class="group-label">Selection utilities</h4>
        <div class="inspector-quick-actions" aria-label="Selection quick actions">
          <button type="button" disabled title="Parent navigation is not available yet">Parent</button>
          <button type="button" disabled={!selectedElement.componentInstance} title={selectedElement.componentInstance ? 'Open the main component for this instance' : 'Only available for component instances'}>Main component</button>
          <button type="button" aria-pressed={!!selectedElement.mask} title="Toggle alpha mask metadata" on:click={() => setSelectedMask(selectedElement.mask?.kind ?? 'alpha')}>Mask</button>
          <button type="button" disabled title="Boolean operations are not available for this layer">Boolean</button>
          <button type="button" aria-label="Use luminance mask" title="Use luminance as the selected layer mask" on:click={() => setSelectedMask('luminance')}>Luma mask</button>
        </div>
      </section>
      <InspectorExportDock
        model={inspectorExport}
        frameCount={state.frames.length}
        canExportCurrent={!!activeFrame}
        copySummary={inspectorExportCopySummary}
        {onExportCurrentFrame}
        {onExportAllFrames}
        {onCopyExportSummary}
      />
    </div>

  {:else if selectedFrames.length > 1}
    <div class="inspector-header">
      <span class="inspector-tag">frames</span>
      <span class="inspector-title">{selectedFrames.length} selected</span>
    </div>

    <div class="inspector-body">
      <section class="prop-group">
        <h4 class="group-label">Selection</h4>
        {#each selectedFrames as frame (frame.id)}
          <div class="info-row">
            <span>{frame.name}</span>
            <strong>{frame.filename}</strong>
          </div>
        {/each}
      </section>
      <InspectorExportDock
        model={inspectorExport}
        frameCount={state.frames.length}
        canExportCurrent={!!activeFrame}
        copySummary={inspectorExportCopySummary}
        {onExportCurrentFrame}
        {onExportAllFrames}
        {onCopyExportSummary}
      />
    </div>

  {:else if activeFrame}
    <!-- Frame inspector -->
    <div class="inspector-header">
      <span class="inspector-tag">frame</span>
      <span class="inspector-title">{activeFrame.name}</span>
    </div>

    <div class="inspector-body">
      <section class="prop-group frame-summary-group" data-inspector-section="content">
        <div class="frame-summary-head">
          <h4 class="group-label">Frame <span class="frame-title-caret">⌄</span></h4>
          <div class="frame-summary-icons" aria-label="Frame quick actions">
            <button type="button" aria-label="Frame resources" title="Frame resources">⌗</button>
            <button type="button" aria-label="Frame variables" title="Frame variables">❖</button>
            <button type="button" aria-label="Frame appearance" title="Frame appearance">◐</button>
            <button type="button" aria-label="Frame duplicate" title="Frame duplicate">▣</button>
            <button type="button" aria-label="Frame actions menu" title="Frame actions menu">⌄</button>
          </div>
        </div>
      </section>

      <!-- Project-wide typography (item 68) — emitted in every generated HTML page. -->
      <section class="prop-group" data-inspector-section="advanced">
        <h4 class="group-label">Typography</h4>
        <label class="prop-field prop-field--full">
          <span>Project font <span class="meta-hint">(Google Fonts)</span></span>
          <select
            aria-label="Project font"
            value={state.fontFamily ?? 'Inter'}
            on:change={(e) => onUpdateProjectFont(e.currentTarget.value as ProjectFontFamily)}
          >
            {#each PROJECT_FONT_OPTIONS as option (option.family)}
              <option value={option.family}>{option.family}</option>
            {/each}
          </select>
        </label>
        <div class="meta-hint">Applied across exported pages and loose elements.</div>
      </section>

      <!-- SEO meta tags (item 70) — all optional. -->
      <section class="prop-group" data-inspector-section="advanced">
        <h4 class="group-label">SEO</h4>
        <label class="prop-field prop-field--full">
          <span>OG title <span class="meta-hint">(social previews)</span></span>
          <input type="text" value={activeFrame.ogTitle ?? ''}
            placeholder="Fallback: page name"
            on:input={(e) => updateFrame('ogTitle', e.currentTarget.value || undefined)} />
        </label>
        <label class="prop-field prop-field--full">
          <span>OG image URL</span>
          <input type="text" value={activeFrame.ogImage ?? ''}
            placeholder="https://… 1200×630 recommended"
            on:input={(e) => updateFrame('ogImage', e.currentTarget.value || undefined)} />
        </label>
        <div class="prop-grid-2">
          <label class="prop-field">
            <span>Twitter card</span>
            <select value={activeFrame.twitterCard ?? ''}
              on:change={(e) => {
                const v = e.currentTarget.value;
                updateFrame('twitterCard', (v === 'summary' || v === 'summary_large_image') ? v : undefined);
              }}>
              <option value="">— None —</option>
              <option value="summary">Summary</option>
              <option value="summary_large_image">Large image</option>
            </select>
          </label>
          <label class="prop-field">
            <span>Theme color</span>
            <input type="text" value={activeFrame.themeColor ?? ''}
              placeholder="#0a0a0f"
              on:input={(e) => updateFrame('themeColor', e.currentTarget.value || undefined)} />
          </label>
        </div>
        <label class="prop-field prop-field--full" style="margin-top:6px">
          <span>Keywords <span class="meta-hint">(comma-separated)</span></span>
          <input type="text" value={activeFrame.keywords ?? ''}
            placeholder="design, landing, ..."
            on:input={(e) => updateFrame('keywords', e.currentTarget.value || undefined)} />
        </label>
      </section>

      <section class="prop-group" data-inspector-section="advanced">
        <h4 class="group-label">Export options</h4>
        <label class="prop-field prop-field--full">
          <span>Dark-mode CSS</span>
          <select
            aria-label="Frame dark-mode export"
            value={activeFrame.exportSettings?.darkModeEnabled === undefined ? 'inherit' : activeFrame.exportSettings.darkModeEnabled ? 'on' : 'off'}
            on:change={(e) => {
              const value = e.currentTarget.value;
              updateFrameExportSettings({
                darkModeEnabled: value === 'inherit' ? undefined : value === 'on',
              });
            }}
          >
            <option value="inherit">Inherit project setting</option>
            <option value="on">Force on for this page</option>
            <option value="off">Force off for this page</option>
          </select>
        </label>
        <label class="prop-field prop-field--full al-toggle">
          <span>Exclude from PWA cache</span>
          <input
            aria-label="Exclude frame from PWA export"
            type="checkbox"
            checked={activeFrame.exportSettings?.pwaExcluded === true}
            on:change={(e) => updateFrameExportSettings({ pwaExcluded: e.currentTarget.checked ? true : undefined })}
          />
        </label>
        <label class="prop-field prop-field--full al-toggle">
          <span>Strict CSP export</span>
          <input
            aria-label="Strict CSP export setting"
            type="checkbox"
            checked={state.exportSettings?.strictCsp === true}
            on:change={(e) => onUpdateExportSettings({ strictCsp: e.currentTarget.checked })}
          />
        </label>
        <label class="prop-field prop-field--full">
          <span>Default favicon</span>
          <select
            aria-label="Project default favicon"
            value={state.exportSettings?.defaultFaviconAssetId ?? ''}
            on:change={(e) => onUpdateExportSettings({ defaultFaviconAssetId: e.currentTarget.value || null })}
          >
            <option value="">No project favicon</option>
            {#each faviconAssetOptions as asset (asset.key)}
              <option value={asset.assetId}>{faviconAssetLabel(asset)}</option>
            {/each}
          </select>
        </label>
        <label class="prop-field prop-field--full">
          <span>Page favicon</span>
          <select
            aria-label="Frame favicon"
            value={activeFrame.exportSettings?.faviconAssetId === undefined ? '__inherit__' : activeFrame.exportSettings.faviconAssetId === null ? '__none__' : activeFrame.exportSettings.faviconAssetId}
            on:change={(e) => {
              const value = e.currentTarget.value;
              updateFrameExportSettings({
                faviconAssetId: value === '__inherit__' ? undefined : value === '__none__' ? null : value,
              });
            }}
          >
            <option value="__inherit__">Inherit project favicon</option>
            <option value="__none__">No favicon on this page</option>
            {#each faviconAssetOptions as asset (asset.key)}
              <option value={asset.assetId}>{faviconAssetLabel(asset)}</option>
            {/each}
          </select>
        </label>
        <div class="meta-hint">Controls this page's dark CSS, PWA cache listing, strict CSP meta, and exported favicon link.</div>
      </section>

      <section class="prop-group" data-inspector-section="position">
        <h4 class="group-label" data-visible-label="Position" data-collapse-label="Transform" data-collapse-key="transform">Position</h4>
        <div class="figma-icon-split" aria-label="Frame alignment controls">
          <div class="figma-icon-row" role="group" aria-label="Horizontal alignment">
            <button type="button" title="Align left" aria-label="Align selected layers left">╞</button>
            <button type="button" title="Align horizontal center" aria-label="Align selected layers horizontal center">┼</button>
            <button type="button" title="Align right" aria-label="Align selected layers right">╡</button>
          </div>
          <div class="figma-icon-row" role="group" aria-label="Vertical alignment">
            <button type="button" title="Align top" aria-label="Align selected layers top">╥</button>
            <button type="button" title="Align vertical center" aria-label="Align selected layers vertical center">╫</button>
            <button type="button" title="Align bottom" aria-label="Align selected layers bottom">╨</button>
          </div>
        </div>
        <div class="prop-grid-2 frame-inline-grid">
          <label class="prop-field">
            <span>X</span>
            <input type="number" value={activeFrame.x}
              on:input={(e) => updateFrame('x', num(e.currentTarget.value))} />
          </label>
          <label class="prop-field">
            <span>Y</span>
            <input type="number" value={activeFrame.y}
              on:input={(e) => updateFrame('y', num(e.currentTarget.value))} />
          </label>
        </div>
        <div class="prop-grid-2 frame-rotation-row">
          <label class="prop-field">
            <span>Rotation</span>
            <input
              aria-label="Frame rotation"
              type="text"
              value={`${activeFrame.rotation ?? 0}°`}
              on:change={(e) => updateFrameRotation(e.currentTarget.value)}
            />
          </label>
          <div class="figma-icon-row" role="group" aria-label="Frame transform actions">
            <button type="button" title="Reset rotation" aria-label="Reset frame rotation" on:click={() => updateFrame('rotation', undefined)}>◇</button>
            <button type="button" title="Flip horizontal" aria-label="Flip frame horizontally">↔</button>
            <button type="button" title="Flip vertical" aria-label="Flip frame vertically">↕</button>
          </div>
        </div>
      </section>

      {#if !hasFrameLayoutGuides && propertyQuery.trim().length === 0}
        <section class="prop-group frame-row-group" data-no-collapse="true" data-inspector-section="layout-guide">
          <div class="frame-row-heading">
            <h4 class="group-label">Layout guide</h4>
            <button type="button" aria-label="Add frame layout guide" on:click={() => setFrameLayoutGuide('uniform', true)}>+</button>
          </div>
        </section>
      {:else}
        <section class="prop-group" data-inspector-section="layout-guide">
          <h4 class="group-label" data-visible-label="Layout guide" data-collapse-label="Layout guide" data-collapse-key="layout-guide">Layout guide</h4>
          <div class="prop-field prop-field--full">
            <span>Guide styles</span>
            <div class="matching-grid">
              {#each resolvedProjectStyles.filter(style => style.kind === 'layout-guide') as style (style.id)}
                <button type="button" class="action-btn" aria-label="Apply layout guide style {style.name}" on:click={() => onApplyProjectStyle(style.id)}>{style.name}</button>
              {/each}
            </div>
            <button type="button" class="mini-action" aria-label="Create layout guide style from frame" on:click={() => createProjectStyle('layout-guide')}>+ Layout guide style</button>
          </div>
          <label class="prop-field prop-field--full al-toggle">
            <span>Uniform grid</span>
            <input aria-label="Enable uniform layout grid" type="checkbox" checked={!!uniformLayoutGuide} on:change={(e) => setFrameLayoutGuide('uniform', e.currentTarget.checked)} />
          </label>
          {#if uniformLayoutGuide}
            {@const guide = uniformLayoutGuide}
            <div class="prop-grid-2">
              <label class="prop-field"><span>Size</span><input aria-label="Uniform grid size" type="number" min="2" value={guide.size ?? 8} on:input={(e) => updateFrameLayoutGuide('uniform', { size: Math.max(2, num(e.currentTarget.value)) })} /></label>
              <label class="prop-field"><span>Variable</span><input aria-label="Uniform grid variable" type="text" value={guide.variableRef ?? ''} on:input={(e) => updateFrameLayoutGuide('uniform', { variableRef: e.currentTarget.value || undefined })} /></label>
            </div>
          {/if}
          <label class="prop-field prop-field--full al-toggle" style="margin-top:8px">
            <span>Columns</span>
            <input aria-label="Enable column guides" type="checkbox" checked={!!columnLayoutGuide} on:change={(e) => setFrameLayoutGuide('columns', e.currentTarget.checked)} />
          </label>
          {#if columnLayoutGuide}
            {@const guide = columnLayoutGuide}
            <div class="prop-grid-2">
              <label class="prop-field"><span>Count</span><input aria-label="Column guide count" type="number" min="1" value={guide.count ?? 12} on:input={(e) => updateFrameLayoutGuide('columns', { count: Math.max(1, num(e.currentTarget.value)) })} /></label>
              <label class="prop-field"><span>Type</span><select aria-label="Column guide type" value={guide.trackType ?? 'stretch'} on:change={(e) => updateFrameLayoutGuide('columns', { trackType: e.currentTarget.value as FrameLayoutGuideTrackType })}><option value="stretch">Stretch</option><option value="center">Center</option><option value="start">Start</option><option value="end">End</option></select></label>
              <label class="prop-field"><span>Margin</span><input aria-label="Column guide margin" type="number" min="0" value={guide.margin ?? 64} on:input={(e) => updateFrameLayoutGuide('columns', { margin: Math.max(0, num(e.currentTarget.value)) })} /></label>
              <label class="prop-field"><span>Gutter</span><input aria-label="Column guide gutter" type="number" min="0" value={guide.gutter ?? 24} on:input={(e) => updateFrameLayoutGuide('columns', { gutter: Math.max(0, num(e.currentTarget.value)) })} /></label>
              <label class="prop-field prop-field--full"><span>Variable</span><input aria-label="Column guide variable" type="text" value={guide.variableRef ?? ''} on:input={(e) => updateFrameLayoutGuide('columns', { variableRef: e.currentTarget.value || undefined })} /></label>
            </div>
          {/if}
          <label class="prop-field prop-field--full al-toggle" style="margin-top:8px">
            <span>Rows</span>
            <input aria-label="Enable row guides" type="checkbox" checked={!!rowLayoutGuide} on:change={(e) => setFrameLayoutGuide('rows', e.currentTarget.checked)} />
          </label>
          {#if rowLayoutGuide}
            {@const guide = rowLayoutGuide}
            <div class="prop-grid-2">
              <label class="prop-field"><span>Count</span><input aria-label="Row guide count" type="number" min="1" value={guide.count ?? 6} on:input={(e) => updateFrameLayoutGuide('rows', { count: Math.max(1, num(e.currentTarget.value)) })} /></label>
              <label class="prop-field"><span>Type</span><select aria-label="Row guide type" value={guide.trackType ?? 'stretch'} on:change={(e) => updateFrameLayoutGuide('rows', { trackType: e.currentTarget.value as FrameLayoutGuideTrackType })}><option value="stretch">Stretch</option><option value="center">Center</option><option value="start">Start</option><option value="end">End</option></select></label>
              <label class="prop-field"><span>Margin</span><input aria-label="Row guide margin" type="number" min="0" value={guide.margin ?? 64} on:input={(e) => updateFrameLayoutGuide('rows', { margin: Math.max(0, num(e.currentTarget.value)) })} /></label>
              <label class="prop-field"><span>Gutter</span><input aria-label="Row guide gutter" type="number" min="0" value={guide.gutter ?? 24} on:input={(e) => updateFrameLayoutGuide('rows', { gutter: Math.max(0, num(e.currentTarget.value)) })} /></label>
              <label class="prop-field prop-field--full"><span>Variable</span><input aria-label="Row guide variable" type="text" value={guide.variableRef ?? ''} on:input={(e) => updateFrameLayoutGuide('rows', { variableRef: e.currentTarget.value || undefined })} /></label>
            </div>
          {/if}
        </section>
      {/if}

      <section class="prop-group" data-inspector-section="advanced">
        <h4 class="group-label">Responsive variants</h4>
        {#if activeFrame.breakpointBaseId}
          {@const responsiveBase = state.frames.find(frame => frame.id === activeFrame?.breakpointBaseId)}
          <div class="link-badge">
            {activeFrame.breakpoint ?? 'variant'} layout for:
            <strong>{responsiveBase?.name ?? 'Missing base page'}</strong>
          </div>
          <div class="meta-hint" style="margin-top:7px">Copy remains synced from the base page; layout/style edits are local overrides.</div>
        {:else}
          <div class="meta-hint">Create linked layouts that export into this page through media queries.</div>
          <div class="preset-row" style="margin-top:8px">
            <button
              class="preset-btn"
              disabled={state.frames.some(frame => frame.breakpointBaseId === activeFrame?.id && frame.breakpoint === 'tablet')}
              on:click={() => onCreateBreakpointVariant(activeFrame.id, 'tablet')}
            >+ Tablet<span class="preset-dim">768</span></button>
            <button
              class="preset-btn"
              disabled={state.frames.some(frame => frame.breakpointBaseId === activeFrame?.id && frame.breakpoint === 'mobile')}
              on:click={() => onCreateBreakpointVariant(activeFrame.id, 'mobile')}
            >+ Mobile<span class="preset-dim">390</span></button>
          </div>
        {/if}
      </section>

      {#if $recentFrameSizes.length > 0 || framePresets.length > 0}
        <section class="prop-group" data-inspector-section="advanced">
          <h4 class="group-label">Frame sizes</h4>
          <button
            type="button"
            class="action-btn frame-resize-to-fit"
            aria-label="Resize frame to fit content"
            disabled={!activeFrame.elements.some(element => !element.hidden && !element.isFrameBackground && element.type !== 'slice')}
            on:click={resizeActiveFrameToFit}
          >Resize to fit</button>
          {#if $recentFrameSizes.length > 0}
            <h5 class="sub-label">Recent</h5>
            <div class="preset-row">
              {#each $recentFrameSizes as r (`${r.width}x${r.height}`)}
                <button
                  class="preset-btn"
                  title={`${r.width}×${r.height}`}
                  class:preset-active={activeFrame.width === r.width && activeFrame.height === r.height}
                  on:click={() => onApplyFramePreset(r.width, r.height)}
                ><span class="preset-dim">{r.width}×{r.height}</span></button>
              {/each}
            </div>
          {/if}
          {#if framePresets.length > 0}
            <h5 class="sub-label">Presets</h5>
            <div class="preset-row">
              {#each framePresets as preset (preset.label)}
                <button
                  class="preset-btn"
                  title={`${preset.label} — ${preset.width}×${preset.height}`}
                  class:preset-active={activeFrame.width === preset.width && activeFrame.height === preset.height}
                  on:click={() => onApplyFramePreset(preset.width, preset.height)}
                >{preset.label}<span class="preset-dim">{preset.width}×{preset.height}</span></button>
              {/each}
            </div>
          {/if}
        </section>
      {/if}

      <section class="prop-group" data-inspector-section="layout">
        <h4 class="group-label">Layout</h4>
        <span class="frame-section-caption">Flow</span>
        <div class="auto-layout-flow-row" role="group" aria-label="Frame auto layout flow">
          <button
            type="button"
            aria-label="Frame auto layout horizontal"
            aria-pressed={!!activeFrame.autoLayout && activeFrame.autoLayout.direction === 'row' && (activeFrame.autoLayout.mode ?? 'flex') === 'flex'}
            on:click={() => setFrameAutoLayoutFlow('row')}
          >|→</button>
          <button
            type="button"
            aria-label="Frame auto layout vertical"
            aria-pressed={!!activeFrame.autoLayout && activeFrame.autoLayout.direction === 'column' && (activeFrame.autoLayout.mode ?? 'flex') === 'flex'}
            on:click={() => setFrameAutoLayoutFlow('column')}
          >↓|</button>
          <button
            type="button"
            aria-label="Frame auto layout grid"
            aria-pressed={!!activeFrame.autoLayout && (activeFrame.autoLayout.mode ?? 'flex') === 'grid'}
            on:click={() => setFrameAutoLayoutFlow(activeFrame.autoLayout?.direction ?? 'row', 'grid')}
          >▦</button>
          <button
            type="button"
            aria-label="Disable frame auto layout"
            aria-pressed={!activeFrame.autoLayout}
            disabled={!activeFrame.autoLayout}
            on:click={toggleFrameAutoLayout}
          >—</button>
        </div>
        <span class="frame-section-caption">Dimensions</span>
        <div class="prop-grid-2 frame-inline-grid">
          <label class="prop-field">
            <span>W</span>
            <input type="number" value={activeFrame.width}
              on:input={(e) => updateFrame('width', num(e.currentTarget.value))} />
          </label>
          <label class="prop-field">
            <span>H</span>
            <input type="number" value={activeFrame.height}
              on:input={(e) => updateFrame('height', num(e.currentTarget.value))} />
          </label>
        </div>
        <label class="prop-field prop-field--full al-toggle frame-clip-row">
          <span>Clip content</span>
          <input
            aria-label="Clip frame content"
            type="checkbox"
            checked={activeFrame.clipContent !== false}
            on:change={(e) => updateFrame('clipContent', e.currentTarget.checked ? undefined : false)}
          />
        </label>
        {#if activeFrame.autoLayout}
          {@const al = activeFrame.autoLayout}
          <div class="prop-grid-2">
            <label class="prop-field">
              <span>Mode</span>
              <select aria-label="Frame auto layout mode" value={al.mode ?? 'flex'} on:change={(e) => setAutoLayoutMode('frame', e.currentTarget.value as NonNullable<AutoLayout['mode']>)}>
                <option value="flex">Flex</option>
                <option value="grid">Grid</option>
              </select>
            </label>
            <label class="prop-field">
              <span>Infer</span>
              <button type="button" class="action-btn" aria-label="Infer frame auto layout" on:click={() => updateFrame('autoLayout', inferAutoLayout(activeFrame.elements))}>Infer from layers</button>
            </label>
            <label class="prop-field">
              <span>Direction</span>
              <select aria-label="Frame auto layout direction" value={al.direction} on:change={(e) => updateFrameAutoLayout('direction', e.currentTarget.value)}>
                <option value="row">→ Row</option>
                <option value="column">↓ Column</option>
              </select>
            </label>
            <label class="prop-field">
              <span>Gap</span>
              <input aria-label="Frame auto layout gap" type="number" value={al.gap} min="0"
                on:input={(e) => updateFrameAutoLayout('gap', num(e.currentTarget.value))} />
            </label>
          </div>
          <div class="prop-grid-2">
            <label class="prop-field">
              <span>Align (cross)</span>
              <select aria-label="Frame auto layout align" value={al.align} on:change={(e) => updateFrameAutoLayout('align', e.currentTarget.value)}>
                <option value="start">Start</option>
                <option value="center">Center</option>
                <option value="end">End</option>
                <option value="stretch">Stretch</option>
              </select>
            </label>
            <label class="prop-field">
              <span>Justify (main)</span>
              <select aria-label="Frame auto layout justify" value={al.justify ?? 'start'} on:change={(e) => updateFrameAutoLayout('justify', e.currentTarget.value)}>
                <option value="start">Start</option>
                <option value="center">Center</option>
                <option value="end">End</option>
                <option value="space-between">Space between</option>
                <option value="space-around">Space around</option>
              </select>
            </label>
          </div>
          <label class="prop-field prop-field--full al-toggle">
            <span>Wrap</span>
            <input aria-label="Frame auto layout wrap" type="checkbox" checked={!!al.wrap} on:change={(e) => updateFrameAutoLayout('wrap', e.currentTarget.checked)} />
          </label>
          {#if (al.mode ?? 'flex') === 'grid'}
            <h5 class="sub-label">Grid</h5>
            <div class="prop-grid-2">
              <label class="prop-field"><span>Columns</span><input aria-label="Frame auto layout grid columns" type="number" min="1" value={al.grid?.columns ?? 2} on:input={(e) => updateAutoLayoutGrid('frame', { columns: Math.max(1, num(e.currentTarget.value)) })} /></label>
              <label class="prop-field"><span>Rows</span><input aria-label="Frame auto layout grid rows" type="number" min="1" value={al.grid?.rows ?? 1} on:input={(e) => updateAutoLayoutGrid('frame', { rows: Math.max(1, num(e.currentTarget.value)) })} /></label>
              <label class="prop-field"><span>Column gap</span><input aria-label="Frame auto layout column gap" type="number" min="0" value={al.grid?.columnGap ?? al.gap} on:input={(e) => updateAutoLayoutGrid('frame', { columnGap: Math.max(0, num(e.currentTarget.value)) })} /></label>
              <label class="prop-field"><span>Row gap</span><input aria-label="Frame auto layout row gap" type="number" min="0" value={al.grid?.rowGap ?? al.gap} on:input={(e) => updateAutoLayoutGrid('frame', { rowGap: Math.max(0, num(e.currentTarget.value)) })} /></label>
              <label class="prop-field prop-field--full"><span>Column tracks</span><input aria-label="Frame auto layout column tracks" type="text" value={al.grid?.columnTracks ?? 'repeat(2, minmax(0, 1fr))'} on:input={(e) => updateAutoLayoutGrid('frame', { columnTracks: e.currentTarget.value })} /></label>
              <label class="prop-field prop-field--full"><span>Row tracks</span><input aria-label="Frame auto layout row tracks" type="text" value={al.grid?.rowTracks ?? 'auto'} on:input={(e) => updateAutoLayoutGrid('frame', { rowTracks: e.currentTarget.value })} /></label>
            </div>
          {/if}
          <h5 class="sub-label">Padding</h5>
          <div class="prop-grid-4 padding-grid">
            <label class="prop-field"><span>T</span>
              <input aria-label="Frame auto layout padding top" type="number" value={al.padding.t} min="0"
                on:input={(e) => updateFrameAutoLayoutPadding('t', num(e.currentTarget.value))} />
            </label>
            <label class="prop-field"><span>R</span>
              <input aria-label="Frame auto layout padding right" type="number" value={al.padding.r} min="0"
                on:input={(e) => updateFrameAutoLayoutPadding('r', num(e.currentTarget.value))} />
            </label>
            <label class="prop-field"><span>B</span>
              <input aria-label="Frame auto layout padding bottom" type="number" value={al.padding.b} min="0"
                on:input={(e) => updateFrameAutoLayoutPadding('b', num(e.currentTarget.value))} />
            </label>
            <label class="prop-field"><span>L</span>
              <input aria-label="Frame auto layout padding left" type="number" value={al.padding.l} min="0"
                on:input={(e) => updateFrameAutoLayoutPadding('l', num(e.currentTarget.value))} />
            </label>
            <button
              type="button"
              class:linked={framePaddingLinked}
              class="padding-link-button inspector-ui-only"
              aria-pressed={framePaddingLinked}
              aria-label={framePaddingLinked ? 'Unlink frame auto layout padding values' : 'Link frame auto layout padding values'}
              title={framePaddingLinked ? 'Unlink padding values' : 'Link padding values'}
              on:click={() => togglePaddingLink('frame', activeFrame.id)}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path d="M6.6 5.1 8.4 3.3a3 3 0 1 1 4.3 4.2l-1.8 1.8" />
                <path d="M9.4 10.9 7.6 12.7a3 3 0 1 1-4.3-4.2l1.8-1.8" />
                <path d="M6 10 10 6" />
              </svg>
            </button>
          </div>
          <div class="meta-hint" style="margin-top:7px">The page background remains fixed behind flowed content.</div>
        {/if}
      </section>

      <section class="prop-group" data-inspector-section="appearance">
        <h4 class="group-label">Appearance</h4>
        <div class="prop-grid-2">
          <label class="prop-field">
            <span>Opacity</span>
            <input
              aria-label="Frame opacity"
              type="text"
              value={`${Math.round((activeFrame.opacity ?? 1) * 100)}%`}
              on:change={(e) => updateFrameOpacity(num(e.currentTarget.value.replace('%', '')))}
            />
          </label>
          <label class="prop-field">
            <span>Corner radius</span>
            <input
              aria-label="Frame corner radius"
              type="number"
              min="0"
              value={activeFrame.borderRadius ?? 0}
              on:input={(e) => updateFrame('borderRadius', num(e.currentTarget.value) > 0 ? num(e.currentTarget.value) : undefined)}
            />
          </label>
        </div>
      </section>

      <section class="prop-group" data-inspector-section="fill">
        <h4 class="group-label" data-visible-label="Fill" data-collapse-label="Background" data-collapse-key="background">Fill</h4>
        <div class="frame-fill-row">
          <div class="color-row frame-fill-color">
            <ColorPicker
              value={activeFrame.background}
              onChange={(v) => updateFrame('background', v)}
              onBeginEdit={onBeginInspectorEdit}
              {projectId}
            />
            <input type="text" class="color-text" value={activeFrame.background}
              on:input={(e) => updateFrame('background', e.currentTarget.value)} />
          </div>
          <input class="frame-fill-opacity" aria-label="Frame fill opacity" type="text" value="100%" readonly />
          <button type="button" class="frame-row-icon-btn" aria-label="Toggle frame fill visibility" title="Toggle fill visibility">◉</button>
          <button type="button" class="frame-row-icon-btn" aria-label="Clear frame fill" title="Clear fill" on:click={() => updateFrame('background', 'transparent')}>−</button>
        </div>
      </section>

      {#if activeFrame.border}
        <section class="prop-group" data-inspector-section="stroke">
          <h4 class="group-label">Stroke</h4>
          <div class="prop-grid-2">
            <label class="prop-field">
              <span>Width</span>
              <input aria-label="Frame stroke width" type="number" min="0" value={activeFrame.border.width}
                on:input={(e) => updateFrameBorder({ width: Math.max(0, num(e.currentTarget.value)) })} />
            </label>
            <label class="prop-field">
              <span>Style</span>
              <select aria-label="Frame stroke style" value={activeFrame.border.style}
                on:change={(e) => updateFrameBorder({ style: e.currentTarget.value as StrokeStyle })}>
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            </label>
          </div>
          <div class="color-row frame-stroke-color">
            <ColorPicker
              value={activeFrame.border.color}
              onChange={(v) => updateFrameBorder({ color: v })}
              onBeginEdit={onBeginInspectorEdit}
              {projectId}
            />
            <input type="text" class="color-text" aria-label="Frame stroke color" value={activeFrame.border.color}
              on:input={(e) => updateFrameBorder({ color: e.currentTarget.value })} />
            <button type="button" class="mini-action" aria-label="Remove frame stroke" on:click={() => updateFrame('border', undefined)}>−</button>
          </div>
        </section>
      {:else}
        <section class="prop-group frame-row-group" data-no-collapse="true" data-inspector-section="stroke">
          <div class="frame-row-heading">
            <h4 class="group-label">Stroke</h4>
            <button type="button" aria-label="Add frame stroke" on:click={() => updateFrame('border', DEFAULT_FRAME_BORDER)}>+</button>
          </div>
        </section>
      {/if}

      {#if activeFrame.shadow}
        <section class="prop-group" data-inspector-section="effects">
          <h4 class="group-label">Effects</h4>
          <div class="prop-grid-4">
            <label class="prop-field"><span>X</span><input aria-label="Frame shadow X" type="number" value={activeFrame.shadow.x} on:input={(e) => updateFrameShadow({ x: num(e.currentTarget.value) })} /></label>
            <label class="prop-field"><span>Y</span><input aria-label="Frame shadow Y" type="number" value={activeFrame.shadow.y} on:input={(e) => updateFrameShadow({ y: num(e.currentTarget.value) })} /></label>
            <label class="prop-field"><span>Blur</span><input aria-label="Frame shadow blur" type="number" min="0" value={activeFrame.shadow.blur} on:input={(e) => updateFrameShadow({ blur: Math.max(0, num(e.currentTarget.value)) })} /></label>
            <label class="prop-field"><span>Spread</span><input aria-label="Frame shadow spread" type="number" value={activeFrame.shadow.spread} on:input={(e) => updateFrameShadow({ spread: num(e.currentTarget.value) })} /></label>
          </div>
          <div class="color-row frame-stroke-color">
            <ColorPicker
              value={activeFrame.shadow.color}
              onChange={(v) => updateFrameShadow({ color: v })}
              onBeginEdit={onBeginInspectorEdit}
              {projectId}
            />
            <input type="text" class="color-text" aria-label="Frame shadow color" value={activeFrame.shadow.color}
              on:input={(e) => updateFrameShadow({ color: e.currentTarget.value })} />
            <button type="button" class="mini-action" aria-label="Remove frame effect" on:click={() => updateFrame('shadow', undefined)}>−</button>
          </div>
        </section>
      {:else}
        <section class="prop-group frame-row-group" data-no-collapse="true" data-inspector-section="effects">
          <div class="frame-row-heading">
            <h4 class="group-label">Effects</h4>
            <button type="button" aria-label="Add frame effect" on:click={() => updateFrame('shadow', DEFAULT_FRAME_SHADOW)}>+</button>
          </div>
        </section>
      {/if}

      <section class="prop-group frame-row-group" data-no-collapse="true" data-inspector-section="selection-colors">
        <div class="frame-row-heading">
          <h4 class="group-label">Selection colors</h4>
          <div class="frame-selection-colors" aria-label="Frame selection colors">
            <span style={`background:${activeFrame.background}`}></span>
            <span style={`background:${activeFrame.border?.color ?? '#ffffff'}`}></span>
            <span style={`background:${activeFrame.shadow?.color ?? 'rgba(0,0,0,0.28)'}`}></span>
            <strong>+{Math.max(0, resolvedProjectStyles.length + resolvedVariableCollections.length)}</strong>
          </div>
        </div>
      </section>

      <section class="prop-group" data-inspector-section="advanced">
        <h4 class="group-label">Background image</h4>
        <GradientEditor
          value={activeFrame.background}
          onChange={(v) => updateFrame('background', v)}
          onBeginEdit={onBeginInspectorEdit}
        />
        <label class="prop-field prop-field--full" style="margin-top:10px">
          <span>Background image URL</span>
          <input
            type="url"
            aria-label="Frame background image URL"
            value={activeFrame.backgroundImage ?? ''}
            placeholder="https://..."
            on:input={(e) => updateFrame('backgroundImage', e.currentTarget.value || undefined)}
          />
        </label>
        <div class="prop-grid-2" style="margin-top:6px">
          <label class="prop-field">
            <span>Image fit</span>
            <select
              aria-label="Frame background image fit"
              value={activeFrame.backgroundImageSize ?? 'cover'}
              on:change={(e) => updateFrame('backgroundImageSize', e.currentTarget.value)}
            >
              <option value="cover">Cover</option>
              <option value="contain">Contain</option>
              <option value="auto">Original</option>
            </select>
          </label>
          <label class="prop-field">
            <span>Repeat</span>
            <select
              aria-label="Frame background image repeat"
              value={activeFrame.backgroundImageRepeat ?? 'no-repeat'}
              on:change={(e) => updateFrame('backgroundImageRepeat', e.currentTarget.value)}
            >
              <option value="no-repeat">No repeat</option>
              <option value="repeat">Repeat</option>
              <option value="repeat-x">Repeat X</option>
              <option value="repeat-y">Repeat Y</option>
            </select>
          </label>
        </div>
        <label class="prop-field prop-field--full" style="margin-top:6px">
          <span>Position</span>
          <select
            aria-label="Frame background image position"
            value={activeFrame.backgroundImagePosition ?? 'center'}
            on:change={(e) => updateFrame('backgroundImagePosition', e.currentTarget.value)}
          >
            <option value="center">Center</option>
            <option value="top">Top</option>
            <option value="bottom">Bottom</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </label>
      </section>

      <section class="prop-group" data-inspector-section="advanced">
        <h4 class="group-label">Preview</h4>
        <button class="action-btn" on:click={() => activeFrame && onPreviewFrame(activeFrame)}>
          Open preview ↗
        </button>
      </section>

      <section class="prop-group" data-inspector-section="advanced">
        <h4 class="group-label">Info</h4>
        <div class="info-rows">
          <div class="info-row"><span>Elements</span><strong>{activeFrame.elements.length}</strong></div>
          <div class="info-row"><span>Buttons</span><strong>{activeFrame.elements.filter(e => e.isButton).length}</strong></div>
          <div class="info-row">
            <span>Links</span>
            <strong>{activeFrame.elements.filter(e => e.isButton && e.targetFrameId).length}</strong>
          </div>
        </div>
      </section>
      <InspectorExportDock
        model={inspectorExport}
        frameCount={state.frames.length}
        canExportCurrent={!!activeFrame}
        copySummary={inspectorExportCopySummary}
        {onExportCurrentFrame}
        {onExportAllFrames}
        {onCopyExportSummary}
      />
    </div>

  {:else}
    <div class="empty-inspector">
      <div class="empty-icon">⊡</div>
      <p>No selection</p>
      <span class="empty-subcopy">Select a page or layer to edit. Export stays available below.</span>
      <section class="prop-group no-selection-card" data-inspector-section="content">
        <h4 class="group-label">Project</h4>
        <div class="info-rows">
          <div class="info-row"><span>Pages</span><strong>{state.frames.length}</strong></div>
          <div class="info-row"><span>Loose layers</span><strong>{state.orphanElements.length}</strong></div>
          <div class="info-row"><span>Assets</span><strong>{assetInventory.length}</strong></div>
        </div>
      </section>
      <section class="prop-group no-selection-card" data-inspector-section="custom">
        <h4 class="group-label">Local resources</h4>
        <div class="meta-hint">Open Assets for components, snippets, media, styles, and variables.</div>
      </section>
      <section class="prop-group no-selection-card" data-inspector-section="custom" aria-label="Styles and variables manager">
        <h4 class="group-label">Styles & variables</h4>
        <div class="info-rows">
          <div class="info-row"><span>Styles</span><strong>{resolvedProjectStyles.length}</strong></div>
          <div class="info-row"><span>Collections</span><strong>{resolvedVariableCollections.length}</strong></div>
          <div class="info-row"><span>Variables</span><strong>{resolvedVariableCollections.reduce((sum, collection) => sum + collection.variables.length, 0)}</strong></div>
        </div>
        <div class="preset-apply-row">
          <button type="button" class="mini-action" aria-label="Create default selection variable" on:click={createVariableFromSelection}>+ Variable</button>
          <button type="button" class="mini-action" aria-label="Create color style from project fallback" on:click={() => createProjectStyle('color')}>+ Color style</button>
          <button type="button" class="mini-action" aria-label="Manage project styles and variables" on:click={onOpenProjectTokensPanel}>Manage</button>
        </div>
        <div class="meta-hint">Variables stay local and use fallback CSS until a layer references them.</div>
      </section>
      <InspectorExportDock
        model={inspectorExport}
        frameCount={state.frames.length}
        canExportCurrent={!!activeFrame}
        copySummary={inspectorExportCopySummary}
        {onExportCurrentFrame}
        {onExportAllFrames}
        {onCopyExportSummary}
      />
    </div>
  {/if}
  </div>
  {/if}
</aside>

<style>
  .right-panel {
    position: relative;
    display: flex;
    flex-direction: column;
    background: #2c2c2c;
    border-left: 1px solid #3b3b3b;
    color: #f5f5f5;
    overflow: hidden;
    min-height: 0;
  }

  .right-panel.read-only {
    border-left-color: rgba(255, 189, 46, 0.22);
  }

  .read-only-banner {
    order: 3;
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin: 10px 12px 0;
    padding: 9px 10px;
    border: 1px solid rgba(255, 189, 46, 0.22);
    border-radius: 10px;
    background: rgba(255, 189, 46, 0.08);
    color: rgba(255, 255, 255, 0.62);
    font-size: 11px;
    line-height: 1.35;
  }

  .read-only-banner strong {
    color: #ffe0a0;
    font-size: 12px;
  }

  .inspector-figma-topbar {
    order: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 46px;
    padding: 8px 10px 6px;
  }

  .figma-avatar-btn,
  .figma-play-btn,
  .figma-share-btn,
  .figma-zoom-btn {
    border: 0;
    background: transparent;
    color: rgba(255,255,255,0.9);
  }

  .figma-avatar-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0;
  }

  .figma-avatar-dot {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: linear-gradient(135deg, #ffe1d2, #f36b3d);
    color: #20110b;
    font-size: 11px;
    font-weight: 900;
  }

  .figma-chevron {
    color: rgba(255,255,255,0.62);
    font-size: 12px;
    transform: translateY(-1px);
  }

  .figma-topbar-actions {
    display: flex;
    align-items: center;
    gap: 13px;
  }

  .figma-play-btn {
    width: 30px;
    height: 30px;
    font-size: 18px;
  }

  .figma-share-btn {
    min-height: 32px;
    padding: 0 14px;
    border-radius: 6px;
    background: #0d99ff;
    color: #fff;
    font-size: 12px;
    font-weight: 750;
  }

  .inspector-tabs-line {
    order: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 35px;
    padding: 0 10px 8px;
    border-bottom: 1px solid #3b3b3b;
  }

  .inspector-tabs {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .inspector-tabs button {
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: #b8b8b8;
    padding: 6px 10px;
    font-size: 12px;
    font-weight: 650;
    cursor: pointer;
  }

  .inspector-tabs button.active {
    background: #3a3a3a;
    color: #ffffff;
  }

  .figma-zoom-btn {
    min-width: 48px;
    padding: 4px 0;
    color: rgba(255,255,255,0.86);
    font-size: 12px;
    font-weight: 750;
    text-align: right;
  }

  .inspector-section-loader {
    flex: 1;
    display: grid;
    place-items: center;
    min-height: 180px;
    padding: 24px;
    color: rgba(255,255,255,0.45);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-align: center;
    text-transform: uppercase;
  }

  .inspector-tab-content {
    order: 4;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .inspector-quick-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 5px;
  }

  .inspector-quick-actions button {
    border: 0;
    border-radius: 5px;
    background: #3a3a3a;
    color: #d4d4d4;
    padding: 6px 7px;
    font-size: 10.5px;
    font-weight: 750;
  }

  .inspector-quick-actions button:focus-visible {
    outline: 2px solid rgba(246, 118, 54, 0.85);
    outline-offset: 2px;
  }

  .inspector-quick-actions button:disabled {
    color: rgba(255,255,255,0.5);
    background: rgba(255,255,255,0.035);
    border-color: rgba(255,255,255,0.1);
    opacity: 1;
    cursor: not-allowed;
  }

  .inspector-header {
    order: 5;
    padding: 8px 18px;
    border-bottom: 1px solid #3b3b3b;
    flex-shrink: 0;
    display: none;
    flex-direction: column;
    gap: 3px;
  }
  .property-search {
    order: 3;
    display: block;
    max-height: 0;
    overflow: hidden;
    padding: 0 10px;
    border-bottom: 1px solid #3b3b3b;
    opacity: 0;
    transition: max-height 0.12s, padding 0.12s, opacity 0.12s;
  }

  .property-search.active {
    max-height: 42px;
    padding: 7px 10px;
    opacity: 1;
  }
  .property-search input {
    width: 100%;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border: 0;
    border-radius: 5px;
    background: #3a3a3a;
    color: #f0f0f0;
    padding: 6px 9px;
    font-size: 12px;
  }
  .property-search input:focus {
    outline: 2px solid rgba(100,140,255,0.5);
    outline-offset: 0;
    border-color: transparent;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

  .inspector-tag {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #8e8e8e;
  }

  .inspector-title {
    font-size: 13px;
    font-weight: 600;
    color: #f5f5f5;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .inspector-subtitle {
    font-size: 11px;
    color: rgba(255,255,255,0.45);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .inspector-body {
    order: 6;
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0;
  }

  .prop-group {
    min-width: 0;
    padding: 13px 16px;
    border-bottom: 1px solid #3b3b3b;
    background: transparent;
  }

  .prop-group[data-inspector-section="content"] { order: 10; }
  .prop-group[data-inspector-section="position"] { order: 20; }
  .prop-group[data-inspector-section="layout"] { order: 30; }
  .prop-group[data-inspector-section="appearance"] { order: 40; }
  .prop-group[data-inspector-section="fill"] { order: 50; }
  .prop-group[data-inspector-section="stroke"] { order: 60; }
  .prop-group[data-inspector-section="effects"] { order: 70; }
  .prop-group[data-inspector-section="selection-colors"] { order: 80; }
  .prop-group[data-inspector-section="layout-guide"] { order: 90; }
  .prop-group[data-inspector-section="typography"] { order: 92; }
  .prop-group[data-inspector-section="custom"] { order: 94; }
  .prop-group[data-inspector-section="advanced"] { order: 96; }

  .group-label {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: none;
    color: #ffffff;
    margin: 0 0 12px;
  }

  .frame-summary-group {
    padding-block: 12px;
  }

  .frame-summary-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    gap: 10px;
  }

  .frame-summary-head .group-label {
    margin: 0;
  }

  .frame-title-caret {
    margin-left: 3px;
    color: rgba(255,255,255,0.72);
    font-size: 11px;
    font-weight: 650;
  }

  .frame-summary-icons {
    display: flex;
    align-items: center;
    gap: 10px;
    color: rgba(255,255,255,0.86);
  }

  .frame-summary-icons button {
    width: 17px;
    height: 17px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font-size: 12px;
    line-height: 1;
  }

  .frame-summary-icons button:hover,
  .frame-summary-icons button:focus-visible {
    background: rgba(255,255,255,0.08);
    outline: none;
  }

  .frame-section-caption {
    display: block;
    margin: 2px 0 6px;
    color: rgba(255,255,255,0.58);
    font-size: 10px;
    font-weight: 700;
  }

  .frame-rotation-row {
    margin-top: 8px;
    align-items: end;
  }

  .frame-clip-row {
    margin: 8px 0 0;
  }

  .frame-resize-to-fit {
    margin-top: 6px;
    text-align: center;
  }

  .frame-inline-grid .prop-field {
    position: relative;
    gap: 0;
  }

  .frame-inline-grid .prop-field > span {
    position: absolute;
    z-index: 1;
    left: 9px;
    top: 50%;
    transform: translateY(-50%);
    color: rgba(255,255,255,0.82);
    font-size: 11px;
    font-weight: 750;
    line-height: 1;
    pointer-events: none;
  }

  .frame-inline-grid .prop-field input {
    padding-left: 28px;
  }

  .frame-fill-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 56px 28px 28px;
    gap: 0;
    overflow: hidden;
    border-radius: 5px;
    background: #383838;
  }

  .frame-fill-color {
    gap: 0;
  }

  .frame-fill-color .color-text {
    border-radius: 0;
    background: transparent;
    border-color: transparent;
  }

  .frame-fill-opacity {
    min-width: 0;
    border: 0;
    border-left: 1px solid rgba(0,0,0,0.22);
    background: transparent;
    color: rgba(255,255,255,0.86);
    font-size: 12px;
    font-weight: 700;
    text-align: center;
  }

  .frame-row-icon-btn {
    min-width: 0;
    border: 0;
    border-left: 1px solid rgba(0,0,0,0.22);
    background: transparent;
    color: rgba(255,255,255,0.68);
    font-size: 12px;
    line-height: 1;
  }

  .frame-row-icon-btn:hover,
  .frame-row-icon-btn:focus-visible {
    background: rgba(255,255,255,0.08);
    color: #fff;
    outline: none;
  }

  .frame-row-group {
    padding-block: 12px;
  }

  .frame-row-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 20px;
    gap: 10px;
  }

  .frame-row-heading .group-label {
    margin: 0;
  }

  .frame-row-heading button {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: rgba(255,255,255,0.82);
    font-size: 17px;
    line-height: 1;
  }

  .frame-row-heading button:hover,
  .frame-row-heading button:focus-visible {
    background: rgba(255,255,255,0.08);
    outline: none;
  }

  .frame-stroke-color {
    margin-top: 8px;
  }

  .frame-stroke-color .mini-action {
    flex: 0 0 auto;
    width: 32px;
    padding-inline: 0;
    text-align: center;
  }

  .frame-selection-colors {
    display: flex;
    align-items: center;
    gap: 9px;
    min-height: 24px;
  }

  .frame-selection-colors span {
    width: 16px;
    height: 16px;
    border-radius: 3px;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.12);
  }

  .frame-selection-colors strong {
    color: rgba(255,255,255,0.72);
    font-size: 11px;
  }
  :global(.prop-group.collapsed) {
    padding-bottom: 10px;
  }
  :global(.prop-group > [hidden]) {
    display: none !important;
  }
  :global(.prop-group[hidden]) {
    display: none !important;
  }
  :global(.section-toggle) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    border: 0;
    padding: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
    cursor: pointer;
  }
  :global(.section-toggle:hover) {
    color: rgba(255,255,255,0.52);
  }
  :global(.section-toggle:focus-visible) {
    outline: 2px solid rgba(100,140,255,0.55);
    outline-offset: 3px;
    border-radius: 3px;
  }
  :global(.section-chevron) {
    width: 6px;
    height: 6px;
    border-right: 1px solid currentColor;
    border-bottom: 1px solid currentColor;
    transform: rotate(45deg);
    transition: transform 0.12s;
  }
  :global(.prop-group.collapsed) :global(.section-chevron) {
    transform: rotate(-45deg);
  }

  .prop-grid-4 {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    min-width: 0;
    gap: 6px;
  }

  .figma-icon-split {
    display: grid;
    grid-template-columns: 1fr 1fr;
    min-width: 0;
    gap: 8px;
    margin-bottom: 8px;
  }

  .figma-icon-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    min-width: 0;
    overflow: hidden;
    border-radius: 5px;
    background: #383838;
  }

  .figma-icon-row button {
    min-width: 0;
    height: 25px;
    border: 0;
    border-right: 1px solid rgba(0,0,0,0.22);
    background: transparent;
    color: rgba(255,255,255,0.82);
    font-size: 13px;
    line-height: 1;
  }

  .figma-icon-row button:last-child {
    border-right: 0;
  }

  .figma-icon-row button:hover:not(:disabled),
  .figma-icon-row button:focus-visible {
    background: rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.95);
    outline: none;
  }

  .figma-icon-row button:disabled {
    color: rgba(255,255,255,0.22);
    cursor: not-allowed;
  }

  .padding-grid {
    position: relative;
  }

  .padding-link-button {
    position: absolute;
    z-index: 2;
    left: 50%;
    top: 50%;
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    transform: translate(-50%, -10%);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 999px;
    color: rgba(255,255,255,0.46);
    background: #191a1f;
    box-shadow: 0 3px 8px rgba(0,0,0,0.28);
    cursor: pointer;
  }

  .padding-link-button:hover,
  .padding-link-button:focus-visible {
    color: rgba(255,255,255,0.82);
    border-color: rgba(100,140,255,0.48);
    outline: none;
  }

  .padding-link-button.linked {
    color: #ffb089;
    border-color: rgba(255,107,57,0.72);
    background: rgba(255,107,57,0.16);
  }

  .padding-link-button svg {
    width: 13px;
    height: 13px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.45;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .prop-grid-2 {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    min-width: 0;
    gap: 6px;
  }

  .text-resizing-card {
    display: grid;
    gap: 7px;
    margin-top: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .text-resizing-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    gap: 8px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.34);
  }

  .text-resizing-header .meta-hint {
    min-width: 0;
    overflow: hidden;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-transform: none;
  }

  .text-resizing-options {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    min-width: 0;
    gap: 5px;
  }

  .text-resizing-options .action-btn {
    padding: 6px 6px;
    text-align: center;
    font-size: 11px;
  }

  .text-resizing-options .action-btn[aria-pressed="true"] {
    border-color: #5b5b5b;
    background: #454545;
    color: #ffffff;
  }

  .auto-layout-flow-row {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    min-width: 0;
    overflow: hidden;
    margin-bottom: 8px;
    border-radius: 5px;
    background: #383838;
  }

  .auto-layout-flow-row button {
    height: 26px;
    border: 0;
    border-right: 1px solid rgba(0,0,0,0.22);
    background: transparent;
    color: rgba(255,255,255,0.68);
    font-size: 12px;
    font-weight: 750;
  }

  .auto-layout-flow-row button:last-child {
    border-right: 0;
  }

  .auto-layout-flow-row button[aria-pressed="true"] {
    background: #454545;
    color: #ffffff;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
  }

  .auto-layout-flow-row button:hover:not(:disabled),
  .auto-layout-flow-row button:focus-visible {
    background: rgba(255,255,255,0.08);
    color: #fff;
    outline: none;
  }

  .auto-layout-flow-row button:disabled {
    color: rgba(255,255,255,0.22);
    cursor: not-allowed;
  }

  .text-style-tools {
    display: flex;
    align-items: end;
    gap: 6px;
    margin-bottom: 6px;
  }

  .text-style-select {
    flex: 1;
    min-width: 0;
  }

  .text-style-save {
    flex: none;
    min-height: 29px;
    padding-inline: 9px;
    white-space: nowrap;
  }

  .text-style-hint {
    margin: -1px 0 8px;
  }

  .preset-apply-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 6px;
    align-items: center;
  }

  .mini-action {
    border: 0;
    border-radius: 5px;
    background: #3a3a3a;
    color: #e5e5e5;
    font-size: 11px;
    font-weight: 700;
    padding: 6px 8px;
    white-space: nowrap;
    cursor: pointer;
  }

  .mini-action:hover {
    background: #454545;
    color: #ffffff;
  }

  .a11y-warning {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    margin-bottom: 8px;
    padding: 9px;
    border: 1px solid rgba(255, 196, 77, 0.28);
    border-radius: 10px;
    background: rgba(255, 196, 77, 0.08);
    color: rgba(255,255,255,0.88);
  }

  .a11y-warning strong,
  .a11y-warning span {
    display: block;
  }

  .a11y-warning strong {
    font-size: 11px;
    color: #ffd486;
  }

  .a11y-warning span {
    margin-top: 2px;
    font-size: 10px;
    color: rgba(255,255,255,0.56);
  }

  .al-toggle {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }

  .sub-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.2);
    margin: 6px 0 4px;
  }

  .prop-field {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 3px;
  }

  .prop-field--full {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 4px;
    margin-bottom: 6px;
  }

  .prop-field--full.al-toggle {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .prop-field--full.al-toggle input[type="checkbox"] {
    flex: 0 0 auto;
    width: 14px;
    height: 14px;
    accent-color: #f5c542;
  }

  .prop-field > span,
  .prop-field label > span,
  .prop-label {
    display: block;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10px;
    color: #bdbdbd;
    font-weight: 600;
    letter-spacing: 0;
  }

  /* Item 52 — drag-to-scrub: action toggles `scrubbable` + `is-scrubbing`. */
  :global(.scrubbable) {
    cursor: ew-resize;
    user-select: none;
  }
  :global(.scrubbable:hover) {
    color: rgba(255, 107, 57, 0.75);
  }
  :global(.scrubbable.is-scrubbing) {
    color: #ff9d6e;
  }

  .meta-hint {
    color: rgba(255,255,255,0.5);
    font-size: 11px;
    font-weight: 400;
    line-height: 1.35;
    opacity: 1;
    letter-spacing: 0;
    overflow-wrap: anywhere;
  }

  .prop-field > span .meta-hint,
  .constraints-header .meta-hint {
    font-size: inherit;
    line-height: inherit;
  }
  .meta-hint.danger {
    color: #ff8a68;
    opacity: 0.95;
  }

  :global(.property-doc-tooltip) {
    position: absolute;
    z-index: 80;
    width: min(240px, calc(100% - 16px));
    padding: 9px 10px;
    border: 1px solid rgba(100,140,255,0.28);
    border-radius: 9px;
    background: rgba(19,20,27,0.98);
    box-shadow: 0 12px 28px rgba(0,0,0,0.42);
    color: rgba(255,255,255,0.78);
    font-size: 11px;
    line-height: 1.35;
    pointer-events: auto;
  }

  :global(.property-doc-description) {
    margin-bottom: 6px;
  }

  :global(.property-doc-tooltip a) {
    color: #9bb9ff;
    font-weight: 700;
    text-decoration: none;
  }

  :global(.property-doc-tooltip a:hover) {
    text-decoration: underline;
  }

  .prop-field input[type="number"],
  .prop-field input[type="text"],
  .prop-field input[type="url"],
  .prop-field select {
    width: 100%;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    background: #3a3a3a;
    border: 1px solid transparent;
    border-radius: 5px;
    color: #f2f2f2;
    font-size: 12px;
    padding: 5px 8px;
    transition: border-color 0.12s, background 0.12s;
  }

  .frame-inline-grid .prop-field input[type="number"] {
    padding-left: 28px;
  }

  .prop-field input:focus,
  .prop-field select:focus {
    border-color: #6f6f6f;
    background: #404040;
    outline: none;
  }

  .prop-field select {
    cursor: pointer;
  }

  /* Opacity row (item 47) — slider + numeric % side-by-side. */
  .opacity-row-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .opacity-row-controls input[type="range"] {
    flex: 1;
    accent-color: #ff6b39;
  }
  .opacity-pct {
    width: 56px;
  }

  .color-row {
    display: flex;
    min-width: 0;
    gap: 6px;
    align-items: center;
  }

  .color-row input.color-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 6px;
    color: rgba(255,255,255,0.8);
    font-size: 12px;
    padding: 5px 7px;
    font-family: 'SFMono-Regular', monospace;
  }

  .color-row input.color-text:focus {
    border-color: rgba(100,140,255,0.5);
    outline: none;
  }

  .effect-toggle-list {
    display: grid;
    gap: 6px;
  }

  .effect-toggle-list .al-toggle {
    min-height: 29px;
    margin: 0;
    padding: 6px 8px;
    border-radius: 5px;
    background: #383838;
  }

  .effect-toggle-list .al-toggle > span {
    color: rgba(255,255,255,0.86);
    font-size: 11px;
    font-weight: 650;
  }

  .nested-effect {
    display: grid;
    gap: 8px;
    margin-top: 10px;
    padding: 10px;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px;
    background: rgba(255,255,255,0.035);
  }

  .nested-effect strong {
    color: rgba(255,255,255,0.82);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .content-input {
    width: 100%;
    min-width: 0;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 6px;
    color: rgba(255,255,255,0.82);
    font-size: 12px;
    padding: 7px 8px;
    resize: vertical;
    line-height: 1.5;
    overflow-wrap: anywhere;
    min-height: 60px;
    transition: border-color 0.12s;
  }

  .content-input:focus {
    border-color: rgba(100,140,255,0.5);
    background: rgba(100,140,255,0.07);
    outline: none;
  }
  .rich-text-toolbar {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 5px;
    margin-top: 6px;
  }
  .rich-text-toolbar button {
    width: 26px;
    height: 25px;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 5px;
    color: rgba(255,255,255,0.8);
    background: rgba(255,255,255,0.04);
    font-size: 12px;
  }
  .rich-text-toolbar button:hover {
    border-color: rgba(100,140,255,0.5);
    background: rgba(100,140,255,0.12);
  }
  .target-select {
    width: 100%;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-top: 4px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 6px;
    color: rgba(255,255,255,0.82);
    font-size: 12px;
    padding: 6px 8px;
    cursor: pointer;
  }

  .target-select:focus {
    border-color: rgba(255,107,57,0.5);
    outline: none;
  }

  .link-badge {
    margin-top: 8px;
    min-width: 0;
    background: rgba(255,107,57,0.1);
    border: 1px solid rgba(255,107,57,0.25);
    border-radius: 6px;
    padding: 7px 10px;
    font-size: 11px;
    color: rgba(255,180,140,0.85);
    line-height: 1.4;
    overflow-wrap: anywhere;
  }

  .link-badge strong {
    color: #ff8c5e;
    overflow-wrap: anywhere;
  }

  .img-preview-wrap {
    width: 100%;
    height: 120px;
    border-radius: 8px;
    overflow: hidden;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .img-preview {
    width: 100%;
    height: 100%;
    display: block;
    transform-origin: center;
  }

  .img-empty {
    font-size: 11px;
    color: rgba(255,255,255,0.45);
    font-weight: 500;
    text-align: center;
    padding: 12px;
  }

  .action-btn {
    width: 100%;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    background: #3a3a3a;
    border: 1px solid transparent;
    border-radius: 5px;
    padding: 7px 10px;
    font-size: 12px;
    color: #e1e1e1;
    transition: background 0.12s, color 0.12s;
    text-align: left;
  }

  .action-btn:hover:not(:disabled) {
    background: #464646;
    color: #ffffff;
  }

  .action-btn:disabled {
    color: #9a9a9a;
    background: #343434;
    border-color: transparent;
    opacity: 1;
    cursor: not-allowed;
  }
  .crop-control-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    min-width: 0;
    gap: 8px;
    margin: 8px 0;
  }
  .crop-control-row .action-btn {
    text-align: center;
  }
  .crop-control-row .action-btn[aria-pressed="true"] {
    border-color: #5b5b5b;
    background: #454545;
    color: #ffffff;
  }

  .crop-aspect-row {
    grid-template-columns: repeat(3, 1fr);
  }

  .vector-mode-row,
  .vector-tool-grid,
  .vector-operation-grid {
    display: grid;
    gap: 8px;
    margin-top: 8px;
  }

  .vector-tool-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .vector-operation-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .vector-tool-grid .action-btn,
  .vector-operation-grid .action-btn,
  .vector-mode-row .action-btn {
    text-align: center;
    padding-inline: 8px;
  }

  .vector-tool-grid .action-btn[aria-pressed="true"],
  .vector-mode-row .action-btn[aria-pressed="true"] {
    border-color: rgba(249, 115, 22, 0.72);
    background: rgba(249, 115, 22, 0.18);
    color: #fed7aa;
  }
  .filter-control-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin: 12px 0 8px;
  }
  .filter-control-head h5 {
    margin: 0;
    font-size: 11px;
    color: rgba(255,255,255,0.55);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .filter-row-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .filter-row-controls input[type="range"] {
    flex: 1;
    min-width: 0;
  }
  .filter-value {
    width: 64px;
  }

  .align-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 4px;
  }

  .align-btn {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.7);
    border-radius: 6px;
    padding: 8px 0;
    font-size: 14px;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }

  .align-btn:hover {
    background: rgba(100,140,255,0.18);
    color: rgba(180,210,255,0.95);
    border-color: rgba(100,140,255,0.35);
  }

  .distribute-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }

  .constraints-card {
    margin-top: 8px;
    border: 0;
    border-radius: 0;
    background: transparent;
    padding: 0;
  }

  .constraints-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
    color: #d7d7d7;
    font-size: 11px;
    font-weight: 800;
    text-transform: none;
    letter-spacing: 0;
  }

  .constraints-body {
    display: grid;
    grid-template-columns: 74px 1fr;
    gap: 9px;
    align-items: center;
  }

  .constraints-preview {
    position: relative;
    width: 74px;
    height: 74px;
    border: 1px dashed rgba(255,255,255,0.22);
    border-radius: 9px;
    background: rgba(0,0,0,0.16);
  }

  .constraint-object {
    position: absolute;
    left: 24px;
    top: 24px;
    width: 26px;
    height: 26px;
    border-radius: 5px;
    background: rgba(255,189,46,0.20);
    border: 1px solid rgba(255,189,46,0.74);
  }

  .constraint-edge,
  .constraint-center {
    position: absolute;
    background: rgba(255,255,255,0.18);
  }

  .constraint-edge.active,
  .constraint-center.active {
    background: #ffbd2e;
    box-shadow: 0 0 0 1px rgba(255,189,46,0.24);
  }

  .edge-top,
  .edge-bottom {
    left: 28px;
    width: 18px;
    height: 2px;
  }

  .edge-top { top: 8px; }
  .edge-bottom { bottom: 8px; }

  .edge-left,
  .edge-right {
    top: 28px;
    width: 2px;
    height: 18px;
  }

  .edge-left { left: 8px; }
  .edge-right { right: 8px; }

  .center-x {
    top: 8px;
    bottom: 8px;
    left: 50%;
    width: 2px;
  }

  .center-y {
    left: 8px;
    right: 8px;
    top: 50%;
    height: 2px;
  }

  .constraint-scale {
    position: absolute;
    color: rgba(255,255,255,0.18);
    font-size: 10px;
    font-weight: 900;
    line-height: 1;
  }

  .constraint-scale.active {
    color: #ffbd2e;
  }

  .scale-x {
    right: 7px;
    top: 6px;
  }

  .scale-y {
    left: 7px;
    bottom: 6px;
  }

  .constraints-controls {
    display: grid;
    gap: 7px;
  }

  .blend-preview-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    min-width: 0;
    gap: 5px;
    margin-top: 8px;
  }

  .blend-preview-row button {
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 7px;
    background: linear-gradient(135deg, rgba(255,189,46,0.12), rgba(77,136,255,0.10));
    color: rgba(255,255,255,0.62);
    padding: 6px 5px;
    font-size: 10.5px;
    font-weight: 750;
    cursor: pointer;
  }

  .blend-preview-row button:hover,
  .blend-preview-row button:focus-visible,
  .blend-preview-row button.active {
    border-color: rgba(255,189,46,0.42);
    color: #ffdb91;
    background: linear-gradient(135deg, rgba(255,189,46,0.22), rgba(77,136,255,0.18));
  }

  .fill-architecture-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }

  .fill-architecture-grid label {
    display: grid;
    gap: 4px;
    color: rgba(255,255,255,0.5);
    font-size: 10.5px;
    font-weight: 750;
  }

  .fill-gradient-grid,
  .fill-pattern-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    min-width: 0;
    gap: 6px;
    margin-top: 7px;
  }

  .gradient-flip-row {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .gradient-flip-row button,
  .gradient-stop-row button {
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.045);
    color: rgba(255,255,255,0.7);
    border-radius: 6px;
    font-size: 10.5px;
    font-weight: 750;
    padding: 6px 8px;
    cursor: pointer;
  }

  .gradient-flip-row button:hover,
  .gradient-flip-row button:focus-visible,
  .gradient-flip-row button.active,
  .gradient-stop-row button:hover,
  .gradient-stop-row button:focus-visible {
    border-color: rgba(255,189,46,0.42);
    color: #ffdb91;
    background: linear-gradient(135deg, rgba(255,189,46,0.18), rgba(77,136,255,0.14));
  }

  .gradient-stop-list {
    display: grid;
    gap: 6px;
    margin-top: 7px;
  }

  .gradient-stop-row {
    display: grid;
    grid-template-columns: auto auto 58px minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
    padding: 5px;
    border-radius: 7px;
    background: rgba(255,255,255,0.035);
  }

  .gradient-stop-row span {
    color: rgba(255,255,255,0.52);
    font-size: 10.5px;
    font-weight: 750;
  }

  .stroke-side-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    min-width: 0;
    gap: 6px;
    margin-top: 6px;
  }

  .corner-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    min-width: 0;
    gap: 6px;
  }

  .corner-grid label {
    display: grid;
    gap: 4px;
    color: rgba(255,255,255,0.5);
    font-size: 10.5px;
    font-weight: 750;
  }

  .selection-color-summary {
    display: grid;
    gap: 4px;
    margin-bottom: 8px;
    color: rgba(255,255,255,0.52);
    font-size: 11px;
    line-height: 1.35;
  }

  .style-action-row,
  .transform-action-row,
  .matching-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    min-width: 0;
    gap: 6px;
    margin-top: 6px;
  }

  .matching-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .distribute-row .action-btn {
    text-align: center;
    padding: 7px 8px;
    font-size: 11.5px;
  }

  .style-action-row .action-btn,
  .transform-action-row .action-btn,
  .matching-grid .action-btn {
    text-align: center;
    padding: 7px 8px;
    font-size: 11.5px;
  }

  .component-summary-card {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
    margin-top: 7px;
  }

  .component-summary-card span {
    min-width: 0;
    padding: 8px;
    border: 1px solid rgba(255, 107, 57, 0.18);
    border-radius: 9px;
    background: rgba(255, 107, 57, 0.07);
    color: rgba(255,255,255,0.6);
    font-size: 10px;
    font-weight: 800;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .component-summary-card strong {
    display: block;
    margin-bottom: 2px;
    color: rgba(255,255,255,0.9);
    font-size: 15px;
    letter-spacing: 0;
  }

  .component-discovery-copy {
    margin-top: 8px;
  }

  .mask-kind-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    min-width: 0;
    gap: 6px;
  }

  .mask-kind-grid .action-btn {
    text-align: center;
    padding-inline: 7px;
  }

  .mask-kind-grid .action-btn[aria-pressed="true"] {
    border-color: rgba(249, 115, 22, 0.72);
    background: rgba(249, 115, 22, 0.18);
    color: #fed7aa;
  }

  .danger-action {
    margin-top: 8px;
    border-color: rgba(248, 113, 113, 0.35);
    color: #fecaca;
  }

  .distribute-hint {
    margin-top: 6px;
    font-size: 10.5px;
    color: rgba(255,255,255,0.35);
  }

  .preset-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    min-width: 0;
    gap: 4px;
    margin-top: 2px;
  }

  .preset-btn {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    min-width: 0;
    gap: 2px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.7);
    border-radius: 6px;
    padding: 5px 8px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.12s;
  }

  .preset-btn:hover {
    background: rgba(255,255,255,0.12);
    color: rgba(255,255,255,0.95);
  }

  .preset-btn.preset-active {
    background: rgba(100,140,255,0.18);
    color: rgba(180,210,255,0.95);
    border-color: rgba(100,140,255,0.35);
  }

  .preset-dim {
    font-size: 9.5px;
    font-weight: 400;
    opacity: 0.55;
    font-variant-numeric: tabular-nums;
  }

  .info-rows {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    min-width: 0;
    gap: 8px;
    font-size: 11.5px;
  }

  .info-row span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: rgba(255,255,255,0.35);
  }

  .info-row strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: rgba(255,255,255,0.65);
    font-variant-numeric: tabular-nums;
  }

  .empty-inspector {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    gap: 10px;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 18px 0 0;
    text-align: center;
  }

  .empty-icon {
    font-size: 28px;
    opacity: 0.2;
  }

  .empty-inspector p {
    font-size: 12px;
    color: rgba(255,255,255,0.45);
    line-height: 1.6;
    margin: 0;
  }

  .empty-subcopy {
    display: block;
    margin: -6px 14px 2px;
    color: rgba(255,255,255,0.38);
    font-size: 11px;
    line-height: 1.35;
  }

  .no-selection-card {
    width: 100%;
    max-width: none;
    text-align: left;
  }

  @media (max-width: 760px) {
    .right-panel {
      display: none;
    }
  }

  /* "Button" toggle — convert any element into a button */
  .button-toggle {
    display: grid;
    grid-template-columns: 16px 1fr;
    grid-template-rows: auto auto;
    column-gap: 8px;
    align-items: center;
    cursor: pointer;
    user-select: none;
    padding: 4px 2px;
  }

  .button-toggle input[type="checkbox"] {
    grid-column: 1;
    grid-row: 1 / span 2;
    width: 16px;
    height: 16px;
    margin: 0;
    accent-color: #ff6b39;
    cursor: pointer;
  }

  .button-toggle-label {
    grid-column: 2;
    grid-row: 1;
    font-size: 12.5px;
    font-weight: 700;
    color: rgba(255,255,255,0.78);
    letter-spacing: 0.01em;
  }

  .button-toggle-hint {
    grid-column: 2;
    grid-row: 2;
    font-size: 10.5px;
    color: rgba(255,255,255,0.32);
    line-height: 1.3;
  }
</style>
