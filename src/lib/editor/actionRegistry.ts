import type { CommandPaletteItem } from '../commandPaletteTypes';
import type { CtxItem } from '../contextMenuTypes';

export type EditorActionId =
  | 'select-tool'
  | 'hand-tool'
  | 'scale-tool'
  | 'slice-tool'
  | 'pen-tool'
  | 'pencil-tool'
  | 'add-page'
  | 'add-text'
  | 'add-rectangle'
  | 'add-ellipse'
  | 'add-image'
  | 'save-component'
  | 'goto-position'
  | 'toggle-grid-overlay'
  | 'toggle-rulers-guides'
  | 'toggle-snap'
  | 'cycle-nudge'
  | 'fit-view'
  | 'shortcuts'
  | 'focus-mode'
  | 'select-all-frames'
  | 'select-current-frame'
  | 'rename-selection'
  | 'collapse-layers'
  | 'expand-layers'
  | 'place-media'
  | 'rasterize-selection'
  | 'paste-replace'
  | 'flip-horizontal'
  | 'flip-vertical'
  | 'detach-instance'
  | 'show-versions'
  | 'create-snapshot'
  | 'export-current-page'
  | 'export-all-pages'
  | 'export-json'
  | 'align-left'
  | 'align-horizontal-center'
  | 'align-right'
  | 'align-top'
  | 'align-vertical-center'
  | 'align-bottom'
  | 'distribute-horizontal'
  | 'distribute-vertical'
  | 'tidy-up-selection'
  | 'create-auto-layout'
  | 'mask-alpha'
  | 'mask-vector'
  | 'mask-luminance'
  | 'mask-remove'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'duplicate'
  | 'copy-styles'
  | 'paste-styles'
  | 'save-snippet'
  | 'select-same-type'
  | 'select-same-fill'
  | 'select-same-stroke'
  | 'select-same-effect'
  | 'select-same-font'
  | 'select-same-instance'
  | 'group'
  | 'ungroup'
  | 'bring-forward'
  | 'send-backward'
  | 'bring-front'
  | 'send-back'
  | 'delete';

export interface EditorActionDefinition {
  id: EditorActionId;
  label: string;
  shortcut?: string;
  aliases?: string[];
  detail?: string;
  danger?: boolean;
}

export const ACTIONS: Record<EditorActionId, EditorActionDefinition> = {
  'select-tool': { id: 'select-tool', label: 'Select tool', shortcut: 'V', aliases: ['move', 'cursor'] },
  'hand-tool': { id: 'hand-tool', label: 'Hand tool', shortcut: 'H', aliases: ['pan', 'move canvas'] },
  'scale-tool': { id: 'scale-tool', label: 'Scale tool', shortcut: 'K', aliases: ['resize', 'proportional transform'] },
  'slice-tool': { id: 'slice-tool', label: 'Slice tool', shortcut: 'S', aliases: ['region', 'export crop'] },
  'pen-tool': { id: 'pen-tool', label: 'Pen tool', shortcut: 'P', aliases: ['vector', 'path', 'bezier'] },
  'pencil-tool': { id: 'pencil-tool', label: 'Pencil tool', shortcut: 'Shift+P', aliases: ['freehand', 'vector', 'smooth'] },
  'add-page': { id: 'add-page', label: 'Add page', shortcut: 'F', aliases: ['frame', 'create'] },
  'add-text': { id: 'add-text', label: 'Add text', shortcut: 'T', detail: 'Draw on canvas', aliases: ['tool', 'typography'] },
  'add-rectangle': { id: 'add-rectangle', label: 'Add rectangle', shortcut: 'R', detail: 'Draw on canvas', aliases: ['shape', 'rectangle'] },
  'add-ellipse': { id: 'add-ellipse', label: 'Add ellipse', shortcut: 'O', detail: 'Draw on canvas', aliases: ['circle', 'shape'] },
  'add-image': { id: 'add-image', label: 'Add image', shortcut: 'Shift+Cmd+K', detail: 'Draw on canvas', aliases: ['media', 'upload', 'picture'] },
  'save-component': { id: 'save-component', label: 'Save selection as component', shortcut: 'Cmd+Alt+K', detail: 'Stores a local master', aliases: ['component', 'master', 'reusable', 'library'] },
  'goto-position': { id: 'goto-position', label: 'Move selection to X,Y', shortcut: 'G', detail: 'Enter exact coordinates', aliases: ['goto', 'position', 'move', 'coordinates'] },
  'toggle-grid-overlay': { id: 'toggle-grid-overlay', label: 'Toggle grid overlay', aliases: ['rulers', 'guides', 'canvas'] },
  'toggle-rulers-guides': { id: 'toggle-rulers-guides', label: 'Toggle rulers and guides', aliases: ['ruler', 'rulers', 'guides', 'grid overlay', 'view'] },
  'toggle-snap': { id: 'toggle-snap', label: 'Toggle snapping', aliases: ['snap', 'snapping', 'grid snap', 'pixel snap'] },
  'cycle-nudge': { id: 'cycle-nudge', label: 'Cycle nudge / grid step', aliases: ['nudge', 'grid size', 'snap size', 'increment'] },
  'fit-view': { id: 'fit-view', label: 'Fit all pages to view', shortcut: 'Cmd+0', aliases: ['zoom', 'frames'] },
  shortcuts: { id: 'shortcuts', label: 'Keyboard shortcuts', shortcut: 'Cmd+/', aliases: ['help', 'commands'] },
  'focus-mode': { id: 'focus-mode', label: 'Toggle editor panels', shortcut: 'Cmd+\\', aliases: ['distraction', 'focus', 'interface'] },
  'select-all-frames': { id: 'select-all-frames', label: 'Select all frames', aliases: ['pages', 'frame selection', 'select pages'] },
  'select-current-frame': { id: 'select-current-frame', label: 'Select current frame', aliases: ['page', 'frame selection', 'active frame'] },
  'rename-selection': { id: 'rename-selection', label: 'Rename selection', aliases: ['rename layer', 'rename frame', 'name'] },
  'collapse-layers': { id: 'collapse-layers', label: 'Collapse all layers', aliases: ['layers', 'tree', 'panel'] },
  'expand-layers': { id: 'expand-layers', label: 'Expand all layers', aliases: ['layers', 'tree', 'panel'] },
  'place-media': { id: 'place-media', label: 'Place media', shortcut: 'Shift+Cmd+K', detail: 'Pick an image file', aliases: ['image', 'picture', 'asset', 'upload', 'file'] },
  'rasterize-selection': { id: 'rasterize-selection', label: 'Rasterize selection', detail: 'Unavailable in this build', aliases: ['flatten', 'bitmap', 'convert'] },
  'paste-replace': { id: 'paste-replace', label: 'Paste to replace', detail: 'Unavailable in this build', aliases: ['replace selection', 'swap'] },
  'flip-horizontal': { id: 'flip-horizontal', label: 'Flip horizontal', aliases: ['mirror', 'transform'] },
  'flip-vertical': { id: 'flip-vertical', label: 'Flip vertical', aliases: ['mirror', 'transform'] },
  'detach-instance': { id: 'detach-instance', label: 'Detach instance', aliases: ['component', 'unlink', 'detach component'] },
  'show-versions': { id: 'show-versions', label: 'Show versions', aliases: ['snapshots', 'history', 'version history'] },
  'create-snapshot': { id: 'create-snapshot', label: 'Create snapshot', aliases: ['version', 'save version', 'history'] },
  'export-current-page': { id: 'export-current-page', label: 'Export current page', aliases: ['download frame', 'html export', 'page export'] },
  'export-all-pages': { id: 'export-all-pages', label: 'Export all pages', aliases: ['download all', 'bulk export', 'html export'] },
  'export-json': { id: 'export-json', label: 'Export project JSON', aliases: ['backup', 'portable', 'project export'] },
  'align-left': { id: 'align-left', label: 'Align left', aliases: ['align', 'alignment'] },
  'align-horizontal-center': { id: 'align-horizontal-center', label: 'Align horizontal center', aliases: ['align', 'alignment', 'center'] },
  'align-right': { id: 'align-right', label: 'Align right', aliases: ['align', 'alignment'] },
  'align-top': { id: 'align-top', label: 'Align top', aliases: ['align', 'alignment'] },
  'align-vertical-center': { id: 'align-vertical-center', label: 'Align vertical center', aliases: ['align', 'alignment', 'middle'] },
  'align-bottom': { id: 'align-bottom', label: 'Align bottom', aliases: ['align', 'alignment'] },
  'distribute-horizontal': { id: 'distribute-horizontal', label: 'Distribute horizontal spacing', aliases: ['distribute', 'spacing', 'align'] },
  'distribute-vertical': { id: 'distribute-vertical', label: 'Distribute vertical spacing', aliases: ['distribute', 'spacing', 'align'] },
  'tidy-up-selection': { id: 'tidy-up-selection', label: 'Tidy up selection', aliases: ['tidy', 'clean up', 'spacing', 'align'] },
  'create-auto-layout': { id: 'create-auto-layout', label: 'Create Auto Layout', shortcut: 'Shift+A', aliases: ['auto layout', 'layout', 'stack', 'flex'] },
  'mask-alpha': { id: 'mask-alpha', label: 'Create alpha mask', aliases: ['mask', 'alpha'] },
  'mask-vector': { id: 'mask-vector', label: 'Create vector mask', aliases: ['mask', 'clip'] },
  'mask-luminance': { id: 'mask-luminance', label: 'Create luminance mask', aliases: ['mask', 'luma'] },
  'mask-remove': { id: 'mask-remove', label: 'Remove mask', aliases: ['mask', 'unmask'], danger: true },
  copy: { id: 'copy', label: 'Copy', shortcut: 'Cmd+C' },
  cut: { id: 'cut', label: 'Cut', shortcut: 'Cmd+X' },
  paste: { id: 'paste', label: 'Paste', shortcut: 'Cmd+V' },
  duplicate: { id: 'duplicate', label: 'Duplicate', shortcut: 'Cmd+D' },
  'copy-styles': { id: 'copy-styles', label: 'Copy styles', shortcut: 'Cmd+Alt+C' },
  'paste-styles': { id: 'paste-styles', label: 'Paste styles', shortcut: 'Cmd+Alt+V' },
  'save-snippet': { id: 'save-snippet', label: 'Save as snippet', aliases: ['snippet', 'library', 'reuse'] },
  'select-same-type': { id: 'select-same-type', label: 'Select all of same type', aliases: ['matching', 'similar'] },
  'select-same-fill': { id: 'select-same-fill', label: 'Select all of same fill', aliases: ['matching', 'similar', 'color'] },
  'select-same-stroke': { id: 'select-same-stroke', label: 'Select all of same stroke', aliases: ['matching', 'similar', 'border'] },
  'select-same-effect': { id: 'select-same-effect', label: 'Select all of same effect', aliases: ['matching', 'similar', 'shadow'] },
  'select-same-font': { id: 'select-same-font', label: 'Select all of same font', aliases: ['matching', 'similar', 'typography'] },
  'select-same-instance': { id: 'select-same-instance', label: 'Select all of same instance', aliases: ['matching', 'similar', 'component'] },
  group: { id: 'group', label: 'Group', shortcut: 'Cmd+G' },
  ungroup: { id: 'ungroup', label: 'Ungroup', shortcut: 'Cmd+Shift+G' },
  'bring-forward': { id: 'bring-forward', label: 'Bring forward', shortcut: 'Cmd+]' },
  'send-backward': { id: 'send-backward', label: 'Send backward', shortcut: 'Cmd+[' },
  'bring-front': { id: 'bring-front', label: 'Bring to front', shortcut: 'Cmd+Shift+]' },
  'send-back': { id: 'send-back', label: 'Send to back', shortcut: 'Cmd+Shift+[' },
  delete: { id: 'delete', label: 'Delete', shortcut: 'Delete', danger: true },
};

export function actionKeywords(action: EditorActionDefinition): string {
  return action.aliases?.join(' ') ?? '';
}

export function actionPaletteItem(
  id: EditorActionId,
  run: () => void,
  overrides: Partial<Pick<CommandPaletteItem, 'label' | 'detail' | 'shortcut' | 'keywords'>> = {},
): CommandPaletteItem {
  const action = ACTIONS[id];
  return {
    id: `action-${action.id}`,
    category: 'Action',
    label: overrides.label ?? action.label,
    detail: overrides.detail ?? action.detail,
    shortcut: overrides.shortcut ?? action.shortcut,
    keywords: [actionKeywords(action), overrides.keywords].filter(Boolean).join(' '),
    run,
  };
}

export function actionContextItem(
  id: EditorActionId,
  onClick: () => void,
  options: Partial<Pick<CtxItem, 'disabled' | 'danger'>> = {},
): CtxItem {
  const action = ACTIONS[id];
  return {
    label: action.label,
    keys: action.shortcut,
    onClick,
    disabled: options.disabled,
    danger: options.danger ?? action.danger,
  };
}
