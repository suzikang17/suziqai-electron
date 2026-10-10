// Parses Playwright locator expressions as Claude and the exporter write them, e.g.
//   getByRole('button', { name: 'Save', exact: true })
//   locator('main').getByRole('button', { name: /next week/i }).first()
//   page.getByRole('dialog').getByLabel("Email")
// into a list of method calls to replay on a Page. Anything else (plain CSS, text=…) is not a
// chain and is used as a CSS/selector-engine string.

export type LocatorArg = string | number | boolean | RegExp | { [key: string]: LocatorArg };
export interface LocatorCall {
  method: string;
  args: LocatorArg[];
}

/** Methods we allow in a chain — all exist on both Page and Locator (first/last/nth/filter on Locator). */
export const CHAIN_METHODS = new Set([
  'getByRole', 'getByText', 'getByLabel', 'getByPlaceholder', 'getByTestId', 'getByAltText', 'getByTitle',
  'locator', 'filter', 'first', 'last', 'nth',
]);

class Parser {
  i = 0;
  constructor(private readonly s: string) {}

  ws() {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++;
  }
  peek() {
    return this.s[this.i];
  }
  eat(c: string) {
    this.ws();
    if (this.s[this.i] !== c) throw new Error(`expected ${c} at ${this.i}`);
    this.i++;
  }
  ident(): string {
    this.ws();
    const m = /^[A-Za-z_$][\w$]*/.exec(this.s.slice(this.i));
    if (!m) throw new Error(`expected identifier at ${this.i}`);
    this.i += m[0].length;
    return m[0];
  }
  string(): string {
    const quote = this.s[this.i++];
    let out = '';
    while (this.i < this.s.length && this.s[this.i] !== quote) {
      if (this.s[this.i] === '\\') {
        const next = this.s[++this.i];
        out += next === 'n' ? '\n' : next === 't' ? '\t' : next;
      } else {
        out += this.s[this.i];
      }
      this.i++;
    }
    if (this.s[this.i] !== quote) throw new Error('unterminated string');
    this.i++;
    return out;
  }
  regex(): RegExp {
    this.i++; // opening /
    let body = '';
    let inClass = false;
    while (this.i < this.s.length && (this.s[this.i] !== '/' || inClass)) {
      const c = this.s[this.i];
      if (c === '\\') {
        body += c + this.s[this.i + 1];
        this.i += 2;
        continue;
      }
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      body += c;
      this.i++;
    }
    if (this.s[this.i] !== '/') throw new Error('unterminated regex');
    this.i++;
    const flags = /^[a-z]*/.exec(this.s.slice(this.i))![0];
    this.i += flags.length;
    return new RegExp(body, flags);
  }
  value(): LocatorArg {
    this.ws();
    const c = this.peek();
    if (c === "'" || c === '"' || c === '`') return this.string();
    if (c === '/') return this.regex();
    if (c === '{') return this.object();
    const m = /^(-?\d+(?:\.\d+)?|true|false)/.exec(this.s.slice(this.i));
    if (!m) throw new Error(`unexpected value at ${this.i}`);
    this.i += m[0].length;
    return m[0] === 'true' ? true : m[0] === 'false' ? false : Number(m[0]);
  }
  object(): { [key: string]: LocatorArg } {
    this.eat('{');
    const out: { [key: string]: LocatorArg } = {};
    this.ws();
    while (this.peek() !== '}') {
      this.ws();
      const key = this.peek() === "'" || this.peek() === '"' ? this.string() : this.ident();
      this.eat(':');
      out[key] = this.value();
      this.ws();
      if (this.peek() === ',') this.i++;
      this.ws();
    }
    this.eat('}');
    return out;
  }
  chain(): LocatorCall[] {
    const calls: LocatorCall[] = [];
    this.ws();
    if (this.s.startsWith('page.', this.i)) this.i += 5;
    for (;;) {
      const method = this.ident();
      this.eat('(');
      const args: LocatorArg[] = [];
      this.ws();
      while (this.peek() !== ')') {
        args.push(this.value());
        this.ws();
        if (this.peek() === ',') this.i++;
        this.ws();
      }
      this.eat(')');
      calls.push({ method, args });
      this.ws();
      if (this.i >= this.s.length) return calls;
      this.eat('.');
    }
  }
}

/** The chain of calls in a locator expression, or null if it isn't one (e.g. plain CSS). */
export function parseLocatorChain(selector: string): LocatorCall[] | null {
  try {
    const calls = new Parser(selector.trim()).chain();
    return calls.length > 0 && calls.every((c) => CHAIN_METHODS.has(c.method)) ? calls : null;
  } catch {
    return null;
  }
}
