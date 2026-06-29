type ClipboardLike = {
  writeText?: (value: string) => Promise<void>;
};

export function copyTextWithTextarea(value: string, doc: Document | null = typeof document !== 'undefined' ? document : null): boolean {
  if (!doc) return false;
  const textarea = doc.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  doc.body.appendChild(textarea);
  textarea.select();
  const copied = doc.execCommand('copy');
  textarea.remove();
  return copied;
}

export async function writeClipboardText(
  value: string,
  options: {
    clipboard?: ClipboardLike | null;
    doc?: Document | null;
    timeoutMs?: number;
    setTimeoutFn?: typeof setTimeout;
    clearTimeoutFn?: typeof clearTimeout;
  } = {},
): Promise<boolean> {
  const clipboard = options.clipboard ?? (typeof navigator !== 'undefined' ? navigator.clipboard : undefined);
  const writeText = clipboard?.writeText?.bind(clipboard);
  if (writeText) {
    const setTimer = options.setTimeoutFn ?? setTimeout;
    const clearTimer = options.clearTimeoutFn ?? clearTimeout;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      await Promise.race([
        writeText(value),
        new Promise<never>((_, reject) => {
          timeout = setTimer(() => reject(new Error('Clipboard write timed out')), options.timeoutMs ?? 750);
        }),
      ]);
      return true;
    } catch {
      // Chromium can leave Clipboard API writes pending in automation if permissions are withheld.
    } finally {
      if (timeout) clearTimer(timeout);
    }
  }
  return copyTextWithTextarea(value, options.doc ?? (typeof document !== 'undefined' ? document : null));
}
