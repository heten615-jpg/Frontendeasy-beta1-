<script lang="ts">
  /**
   * GradientEditor (item 50) — tiny linear/radial gradient builder.
   *
   * Stateless wrapper that turns the parent's `value` string into a
   * `{type, angle, stops[]}` shape, lets the user tweak it, then emits a
   * fresh `linear-gradient()` / `radial-gradient()` CSS string back via
   * `onChange`. Falls back to passing the value through unchanged when the
   * input isn't a gradient (so the same field can hold a solid colour too).
   */
  import ColorPicker from './ColorPicker.svelte';

  export let value: string = '';
  export let onChange: (next: string) => void;
  export let onBeginEdit: () => void = () => {};
  export let projectId: string | null = null;

  type GType = 'linear' | 'radial' | 'angular' | 'diamond';
  type Stop = { color: string; pos: number };

  function parse(v: string): { type: GType; angle: number; stops: Stop[] } | null {
    const conic = /^conic-gradient\(([\s\S]+)\)$/i.exec(v.trim());
    const m = conic ?? /^(linear|radial)-gradient\(([\s\S]+)\)$/i.exec(v.trim());
    if (!m) return null;
    const type = conic ? 'angular' : (m[1].toLowerCase() as GType);
    const inner = conic ? m[1] : m[2];
    // Split on commas not inside parens (rgba()-aware).
    const parts: string[] = [];
    let depth = 0;
    let buf = '';
    for (const ch of inner) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { parts.push(buf.trim()); buf = ''; }
      else buf += ch;
    }
    if (buf.trim()) parts.push(buf.trim());

    let angle = 180;
    let first = 0;
    // First part may be an angle like `45deg` (linear) or `circle`/`ellipse` (radial).
    if (type === 'linear') {
      const am = /^(-?[\d.]+)deg$/i.exec(parts[0] ?? '');
      if (am) { angle = parseFloat(am[1]); first = 1; }
    } else if (type === 'angular') {
      const am = /^from\s+(-?[\d.]+)deg/i.exec(parts[0] ?? '');
      if (am) { angle = parseFloat(am[1]); first = 1; }
    } else if (/^(circle|ellipse|at )/i.test(parts[0] ?? '')) {
      first = 1;
    }
    const stops: Stop[] = [];
    for (let i = first; i < parts.length; i++) {
      const part = parts[i];
      const sm = /^(.+?)\s+(-?[\d.]+)%$/.exec(part);
      if (sm) stops.push({ color: sm[1].trim(), pos: parseFloat(sm[2]) });
      else stops.push({ color: part, pos: stops.length === 0 ? 0 : 100 });
    }
    if (stops.length < 2) return null;
    return { type, angle, stops };
  }

  function build(g: { type: GType; angle: number; stops: Stop[] }): string {
    const stops = g.stops.map(s => `${s.color} ${Math.round(s.pos)}%`).join(', ');
    if (g.type === 'angular') return `conic-gradient(from ${g.angle}deg, ${stops})`;
    if (g.type === 'diamond') return `conic-gradient(from ${g.angle + 45}deg at 50% 50%, ${stops})`;
    const head = g.type === 'linear' ? `${g.angle}deg` : 'circle';
    return `${g.type}-gradient(${head}, ${stops})`;
  }

  $: parsed = parse(value);
  $: isGradient = parsed !== null;

  function enableGradient() {
    onBeginEdit();
    onChange(build({ type: 'linear', angle: 180, stops: [
      { color: '#ff6b39', pos: 0 },
      { color: '#1a0a2e', pos: 100 },
    ]}));
  }

  function updateGradient(patch: Partial<{ type: GType; angle: number; stops: Stop[] }>) {
    if (!parsed) return;
    onBeginEdit();
    onChange(build({ ...parsed, ...patch }));
  }

  function updateStop(i: number, patch: Partial<Stop>) {
    if (!parsed) return;
    const stops = parsed.stops.map((s, j) => j === i ? { ...s, ...patch } : s);
    updateGradient({ stops });
  }

  function addStop() {
    if (!parsed) return;
    const last = parsed.stops[parsed.stops.length - 1];
    const stops = [...parsed.stops, { color: last.color, pos: Math.min(100, last.pos + 25) }];
    updateGradient({ stops });
  }

  function removeStop(i: number) {
    if (!parsed || parsed.stops.length <= 2) return;
    updateGradient({ stops: parsed.stops.filter((_, j) => j !== i) });
  }
</script>

<div class="ge-root">
  {#if !isGradient}
    <button class="ge-enable" on:click={enableGradient}>＋ Convert to gradient</button>
  {:else if parsed}
    <div class="ge-row ge-type-row">
      <select
        class="ge-type"
        aria-label="Gradient editor type"
        value={parsed.type}
        on:change={(e) => updateGradient({ type: e.currentTarget.value as GType })}
      >
        <option value="linear">Linear</option>
        <option value="radial">Radial</option>
        <option value="angular">Angular</option>
        <option value="diamond">Diamond</option>
      </select>
      {#if parsed.type === 'linear' || parsed.type === 'angular' || parsed.type === 'diamond'}
        <input
          type="range"
          aria-label="Gradient editor angle"
          min="0"
          max="360"
          step="1"
          value={parsed.angle}
          class="ge-angle"
          on:input={(e) => updateGradient({ angle: parseInt(e.currentTarget.value, 10) })}
        />
        <span class="ge-angle-val">{parsed.angle}°</span>
      {/if}
    </div>
    <div class="ge-stops">
      {#each parsed.stops as s, i (i)}
        <div class="ge-stop">
          <ColorPicker
            value={s.color}
            onChange={(v) => updateStop(i, { color: v })}
            onBeginEdit={onBeginEdit}
            {projectId}
          />
          <input
            type="number"
            min="0"
            max="100"
            class="ge-pos"
            value={s.pos}
            on:input={(e) => updateStop(i, { pos: Math.max(0, Math.min(100, parseFloat(e.currentTarget.value) || 0)) })}
          />
          <span class="ge-pct">%</span>
          {#if parsed.stops.length > 2}
            <button class="ge-remove" title="Remove stop" on:click={() => removeStop(i)}>×</button>
          {/if}
        </div>
      {/each}
      <button class="ge-add" on:click={addStop}>＋ Add stop</button>
    </div>
  {/if}
</div>

<style>
  .ge-root { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
  .ge-enable {
    background: rgba(255,255,255,0.05);
    border: 1px dashed rgba(255,255,255,0.18);
    color: rgba(255,255,255,0.6);
    padding: 6px 8px;
    border-radius: 6px;
    font-size: 11.5px;
    cursor: pointer;
  }
  .ge-enable:hover { background: rgba(255,107,57,0.1); border-color: rgba(255,107,57,0.4); color: #ffd9b8; }
  .ge-row { display: flex; align-items: center; gap: 6px; }
  .ge-type {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 5px;
    color: rgba(255,255,255,0.82);
    font-size: 11.5px;
    padding: 4px 6px;
  }
  .ge-angle { flex: 1; accent-color: #ff6b39; }
  .ge-angle-val { font-size: 10.5px; color: rgba(255,255,255,0.45); width: 32px; text-align: right; font-variant-numeric: tabular-nums; }
  .ge-stops { display: flex; flex-direction: column; gap: 4px; }
  .ge-stop {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px;
    border-radius: 5px;
    background: rgba(255,255,255,0.03);
  }
  .ge-pos {
    width: 50px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 4px;
    color: rgba(255,255,255,0.82);
    font-size: 11px;
    padding: 3px 5px;
    text-align: right;
  }
  .ge-pct { font-size: 10px; color: rgba(255,255,255,0.4); }
  .ge-remove {
    margin-left: auto;
    width: 20px; height: 20px;
    border-radius: 4px;
    background: transparent;
    border: 0;
    color: rgba(255,255,255,0.4);
    font-size: 13px;
    cursor: pointer;
    line-height: 1;
  }
  .ge-remove:hover { background: rgba(255,100,100,0.18); color: #ff9090; }
  .ge-add {
    background: rgba(255,255,255,0.04);
    border: 1px dashed rgba(255,255,255,0.12);
    color: rgba(255,255,255,0.5);
    padding: 4px 6px;
    border-radius: 5px;
    font-size: 11px;
    cursor: pointer;
  }
  .ge-add:hover { color: rgba(255,255,255,0.85); border-color: rgba(255,255,255,0.25); }
</style>
