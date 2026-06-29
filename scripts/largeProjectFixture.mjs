export function createLargeProject({ frameCount = 36, elementsPerFrame = 60 } = {}) {
  const frames = [];
  const cols = Math.ceil(Math.sqrt(frameCount));
  for (let i = 0; i < frameCount; i += 1) {
    const frameId = `perf-frame-${i}`;
    const row = Math.floor(i / cols);
    const col = i % cols;
    const elements = [
      element(`${frameId}-bg`, 'section', 0, 0, 1280, 720, {
        background: i % 2 === 0 ? '#0f1118' : '#121018',
        borderRadius: 0,
        isFrameBackground: true,
      }),
    ];
    for (let j = 0; j < elementsPerFrame; j += 1) {
      const isText = j % 5 === 0;
      elements.push(element(
        `${frameId}-el-${j}`,
        isText ? 'text' : 'section',
        36 + (j % 10) * 118,
        56 + Math.floor(j / 10) * 94,
        isText ? 150 : 90,
        isText ? 34 : 58,
        {
          name: `Layer ${i}-${j}`,
          content: isText ? `Label ${i}-${j}` : '',
          color: isText ? '#f7f1e8' : '#ffffff',
          background: isText ? 'transparent' : `hsl(${(i * 37 + j * 11) % 360} 54% 38% / 0.72)`,
          borderRadius: isText ? 0 : 14,
          fontSize: isText ? 18 : 14,
          fontWeight: isText ? '700' : '500',
          shadow: j % 7 === 0 ? { x: 0, y: 8, blur: 18, spread: 0, color: 'rgba(0,0,0,0.28)' } : undefined,
        },
      ));
    }
    frames.push({
      id: frameId,
      name: `Perf ${i + 1}`,
      filename: `perf-${i + 1}.html`,
      x: 80 + col * 1420,
      y: 80 + row * 860,
      width: 1280,
      height: 720,
      background: '#0f1118',
      elements,
    });
  }

  const now = Date.now();
  return {
    id: 'perf-project',
    title: `Canvas perf ${frameCount}x${elementsPerFrame}`,
    payload: {
      schemaVersion: 22,
      fontFamily: 'Inter',
      textStylePresets: [],
      appearancePresets: [],
      projectStyles: [],
      variableCollections: [],
      exportSettings: {
        minifyHtml: false,
        strictCsp: false,
        includeInspectorMetadata: false,
        darkMode: { enabled: false, palette: {} },
        pwa: { enabled: false },
        defaultFaviconAssetId: null,
      },
      comments: [],
      reviewOverlays: [],
      guides: [],
      componentMasters: [],
      snippets: [],
      frames,
      orphanElements: [],
    },
    lastClientRev: 0,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    ownerUserId: null,
    thumbnailAssetId: null,
  };
}

function element(id, type, x, y, width, height, extra = {}) {
  return {
    id,
    type,
    x,
    y,
    width,
    height,
    content: extra.content ?? '',
    color: extra.color ?? '#f7f1e8',
    background: extra.background ?? 'rgba(255,255,255,0.08)',
    borderRadius: extra.borderRadius ?? 10,
    fontSize: extra.fontSize ?? 14,
    fontWeight: extra.fontWeight ?? '500',
    targetFrameId: null,
    ...extra,
  };
}
