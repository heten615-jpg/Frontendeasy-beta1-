/**
 * Tiny math-expression evaluator for inspector numeric inputs (item 53).
 *
 * Users can type `180+20`, `(100*2)/4`, `48-12`, `1.5*16` and the field
 * commits the result. Falls back to `parseFloat` when the input isn't a
 * valid expression (e.g. legacy plain numbers continue to work).
 *
 * SECURITY — implemented as a tiny parser instead of `Function()`, so it works
 * under a strict CSP without `unsafe-eval`.
 */

const SAFE_RE = /^[0-9+\-*/()., \t]+$/;

class Parser {
  private pos = 0;

  constructor(private readonly source: string) {}

  parse(): number | null {
    const value = this.expression();
    this.skip();
    return this.pos === this.source.length && Number.isFinite(value) ? value : null;
  }

  private expression(): number {
    let value = this.term();
    while (true) {
      this.skip();
      if (this.consume('+')) value += this.term();
      else if (this.consume('-')) value -= this.term();
      else return value;
    }
  }

  private term(): number {
    let value = this.factor();
    while (true) {
      this.skip();
      if (this.consume('*')) value *= this.factor();
      else if (this.consume('/')) value /= this.factor();
      else return value;
    }
  }

  private factor(): number {
    this.skip();
    if (this.consume('+')) return this.factor();
    if (this.consume('-')) return -this.factor();
    if (this.consume('(')) {
      const value = this.expression();
      this.skip();
      if (!this.consume(')')) return NaN;
      return value;
    }
    return this.number();
  }

  private number(): number {
    this.skip();
    const start = this.pos;
    while (this.pos < this.source.length && /[0-9.]/.test(this.source[this.pos])) this.pos += 1;
    if (start === this.pos) return NaN;
    const raw = this.source.slice(start, this.pos);
    if ((raw.match(/\./g) ?? []).length > 1) return NaN;
    return Number(raw);
  }

  private consume(token: string): boolean {
    if (this.source[this.pos] !== token) return false;
    this.pos += 1;
    return true;
  }

  private skip(): void {
    while (this.pos < this.source.length && /[ \t]/.test(this.source[this.pos])) this.pos += 1;
  }
}

export function evalMath(input: string | number | null | undefined): number {
  if (typeof input === 'number') return isFinite(input) ? input : 0;
  if (input === null || input === undefined) return 0;
  const s = String(input).trim();
  if (s === '') return 0;
  // Accept European decimals — convert , → . but only when there isn't
  // already a `.` (so `1,000.5` doesn't get mangled, but `1,5` becomes `1.5`).
  const normalized = /\./.test(s) ? s : s.replace(/,/g, '.');
  if (!SAFE_RE.test(normalized)) {
    const n = parseFloat(normalized);
    return isNaN(n) ? 0 : n;
  }
  const result = new Parser(normalized).parse();
  if (result !== null) return result;
  const n = parseFloat(normalized);
  return isNaN(n) ? 0 : n;
}
