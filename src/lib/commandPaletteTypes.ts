export interface CommandPaletteItem {
  id: string;
  category: 'Action' | 'Page' | 'Layer' | 'Inspector';
  label: string;
  detail?: string;
  shortcut?: string;
  keywords?: string;
  run: () => void;
}
