/** Shared types for the right-click ContextMenu (item 90). */

export interface CtxItem {
  label: string;
  keys?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export interface CtxSeparator { separator: true }

export type CtxEntry = CtxItem | CtxSeparator;

export function isSeparator(e: CtxEntry): e is CtxSeparator {
  return (e as CtxSeparator).separator === true;
}
