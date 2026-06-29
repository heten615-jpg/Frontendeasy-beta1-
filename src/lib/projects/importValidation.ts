export const MAX_IMPORTED_PROJECT_JSON_BYTES = 50 * 1024 * 1024;
export const MAX_IMPORTED_PROJECT_JSON_DEPTH = 80;
export const MAX_IMPORTED_ELEMENT_TREE_DEPTH = 32;

export interface ImportValidationOptions {
  maxBytes?: number;
  maxDepth?: number;
  maxElementTreeDepth?: number;
  sourceBytes?: number;
}

function formatMiB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function jsonTextByteLength(raw: string): number {
  return new Blob([raw]).size;
}

export function validateImportFileSize(
  file: Pick<File, 'size'>,
  maxBytes = MAX_IMPORTED_PROJECT_JSON_BYTES,
): void {
  if (!Number.isFinite(file.size) || file.size < 0) {
    throw new Error('Import file size is unavailable.');
  }
  if (file.size > maxBytes) {
    throw new Error(`Import file is too large (${formatMiB(file.size)}). Maximum supported size is ${formatMiB(maxBytes)}.`);
  }
}

export function validateJsonDepth(value: unknown, maxDepth = MAX_IMPORTED_PROJECT_JSON_DEPTH): number {
  const seen = new WeakSet<object>();
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 1 }];
  let deepest = 0;

  while (stack.length > 0) {
    const current = stack.pop()!;
    deepest = Math.max(deepest, current.depth);
    if (current.depth > maxDepth) {
      throw new Error(`Import JSON is nested too deeply. Maximum supported depth is ${maxDepth}.`);
    }
    if (!current.value || typeof current.value !== 'object') continue;
    const objectValue = current.value as object;
    if (seen.has(objectValue)) continue;
    seen.add(objectValue);
    const children = Array.isArray(current.value)
      ? current.value
      : Object.values(current.value as Record<string, unknown>);
    for (const child of children) {
      if (child && typeof child === 'object') stack.push({ value: child, depth: current.depth + 1 });
    }
  }

  return deepest;
}

export function validateImportedProjectJsonValue(value: unknown, options: ImportValidationOptions = {}): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid project JSON: expected an object.');
  }
  validateJsonDepth(value, options.maxDepth ?? MAX_IMPORTED_PROJECT_JSON_DEPTH);
  const root = value as Record<string, unknown>;
  validateImportedElementTreeDepth(root, options.maxElementTreeDepth ?? MAX_IMPORTED_ELEMENT_TREE_DEPTH);
  return root;
}

export function parseImportedProjectJSON(raw: string, options: ImportValidationOptions = {}): Record<string, unknown> {
  const maxBytes = options.maxBytes ?? MAX_IMPORTED_PROJECT_JSON_BYTES;
  const bytes = options.sourceBytes ?? jsonTextByteLength(raw);
  if (bytes > maxBytes) {
    throw new Error(`Import file is too large (${formatMiB(bytes)}). Maximum supported size is ${formatMiB(maxBytes)}.`);
  }
  const parsed = JSON.parse(raw) as unknown;
  return validateImportedProjectJsonValue(parsed, options);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function validateImportedElementTreeDepth(
  value: Record<string, unknown>,
  maxDepth = MAX_IMPORTED_ELEMENT_TREE_DEPTH,
): void {
  const stack: Array<{ value: unknown; depth: number; path: string }> = [];
  const seenElements = new WeakSet<object>();

  const pushElement = (element: unknown, depth: number, path: string): void => {
    const record = asRecord(element);
    if (!record) return;
    stack.push({ value: record, depth, path });
  };

  const pushElementList = (elements: unknown, depth: number, path: string): void => {
    if (!Array.isArray(elements)) return;
    elements.forEach((element, index) => pushElement(element, depth, `${path}[${index}]`));
  };

  const pushProjectPayloadRoots = (payload: Record<string, unknown>, prefix: string): void => {
    const frames = payload.frames;
    if (Array.isArray(frames)) {
      frames.forEach((frame, index) => {
        const frameRecord = asRecord(frame);
        if (frameRecord) pushElementList(frameRecord.elements, 1, `${prefix}.frames[${index}].elements`);
      });
    }

    pushElementList(payload.orphanElements, 1, `${prefix}.orphanElements`);

    const masters = payload.componentMasters;
    if (Array.isArray(masters)) {
      masters.forEach((master, masterIndex) => {
        const masterRecord = asRecord(master);
        if (!masterRecord) return;
        pushElement(masterRecord.root, 1, `${prefix}.componentMasters[${masterIndex}].root`);
        const variants = masterRecord.variants;
        if (!Array.isArray(variants)) return;
        variants.forEach((variant, variantIndex) => {
          const variantRecord = asRecord(variant);
          if (variantRecord) {
            pushElement(variantRecord.root, 1, `${prefix}.componentMasters[${masterIndex}].variants[${variantIndex}].root`);
          }
        });
      });
    }

    const snippets = payload.snippets;
    if (Array.isArray(snippets)) {
      snippets.forEach((snippet, snippetIndex) => {
        const snippetRecord = asRecord(snippet);
        if (snippetRecord) pushElementList(snippetRecord.roots, 1, `${prefix}.snippets[${snippetIndex}].roots`);
      });
    }
  };

  pushProjectPayloadRoots(value, '$');
  const envelopePayload = asRecord(value.payload);
  if (envelopePayload) pushProjectPayloadRoots(envelopePayload, '$.payload');

  while (stack.length > 0) {
    const current = stack.pop()!;
    const record = current.value as Record<string, unknown>;
    if (current.depth > maxDepth) {
      throw new Error(
        `Import element tree is nested too deeply at ${current.path}. Maximum supported element depth is ${maxDepth}.`,
      );
    }
    const objectValue = record as object;
    if (seenElements.has(objectValue)) continue;
    seenElements.add(objectValue);
    const children = record.children;
    if (!Array.isArray(children)) continue;
    children.forEach((child, index) => {
      pushElement(child, current.depth + 1, `${current.path}.children[${index}]`);
    });
  }
}
