export type DialogTone = 'default' | 'warning' | 'danger';

export interface DialogRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string | null;
  tone?: DialogTone;
  input?: {
    label: string;
    value?: string;
    placeholder?: string;
  };
}

export interface DialogResult {
  confirmed: boolean;
  value: string;
}
