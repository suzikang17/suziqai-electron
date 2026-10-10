import ts from 'typescript';
import { randomUUID } from 'crypto';
import path from 'path';
import type { AssertionType, Step, StepAction, TestBlock, TestSuite } from '../shared/types';

// Imports a hand-written Playwright .spec.ts into a suziQai suite, so its steps can be stepped
// through and replayed in the app. Converts the common linear patterns (goto, click/safeClick,
// fill, press, expect(...) assertions), following locals, string constants, for-of loops over
// string arrays and one level of same-file helper functions. Anything else is reported in
// `skipped` rather than guessed.

export interface SpecImport {
  suite: TestSuite;
  skipped: Array<{ line: number; code: string }>;
}

type Value = { kind: 'string'; value: string } | { kind: 'locator'; node: ts.Expression };
type Env = Map<string, Value>;

const MATCHERS: Record<string, AssertionType> = {
  toBeVisible: 'visible',
  toBeAttached: 'visible',
  toBeHidden: 'hidden',
  toBeDisabled: 'disabled',
  toBeEnabled: 'enabled',
  toBeChecked: 'checked',
  toBeFocused: 'focused',
  toBeEditable: 'editable',
  toBeEmpty: 'empty',
  toHaveValue: 'value',
  toHaveText: 'text',
  toContainText: 'text',
};

function quote(s: string): string {
  const q = s.includes("'") ? '"' : "'";
  return `${q}${s}${q}`;
}

export function importSpec(source: string, fileName: string): SpecImport {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const skipped: SpecImport['skipped'] = [];
  const constants: Env = new Map();
  const helpers = new Map<string, ts.FunctionDeclaration>();
  const lineOf = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  // Only report lines that touch the page or assert; harness plumbing (context.close(), custom
  // guards, storageState) isn't a test step and would just be noise
  const skip = (node: ts.Node) => {
    const code = node.getText(sf).replace(/\s+/g, ' ').trim();
    if (/\bexpect\(|\bpage\.|\.(click|fill|press|check|selectOption|hover|type)\(/.test(code)) {
      skipped.push({ line: lineOf(node), code });
    }
  };

  // ── values ────────────────────────────────────────────────────────────────

  const unwrap = (e: ts.Expression): ts.Expression =>
    ts.isAwaitExpression(e) || ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) ? unwrap(e.expression) : e;

  function stringOf(e: ts.Expression, env: Env): string | null {
    e = unwrap(e);
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
    if (ts.isNumericLiteral(e)) return e.text;
    if (ts.isIdentifier(e)) {
      const v = env.get(e.text) ?? constants.get(e.text);
      return v?.kind === 'string' ? v.value : null;
    }
    if (ts.isTemplateExpression(e)) {
      let out = e.head.text;
      for (const span of e.templateSpans) {
        out += stringOf(span.expression, env) ?? `{{${span.expression.getText(sf)}}}`;
        out += span.literal.text;
      }
      return out;
    }
    return null;
  }

  function argList(args: readonly ts.Expression[], env: Env): string | null {
    const parts: string[] = [];
    for (const arg of args) {
      if (ts.isObjectLiteralExpression(arg)) {
        const props: string[] = [];
        for (const p of arg.properties) {
          if (ts.isShorthandPropertyAssignment(p)) {
            const v = stringOf(p.name, env);
            if (v === null) return null;
            props.push(`${p.name.text}: ${quote(v)}`);
          } else if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) {
            const init = unwrap(p.initializer);
            if (init.kind === ts.SyntaxKind.TrueKeyword || init.kind === ts.SyntaxKind.FalseKeyword) {
              props.push(`${p.name.text}: ${init.getText(sf)}`);
            } else {
              const v = stringOf(init, env);
              if (v === null) return null; // regex names, variables we can't resolve
              props.push(`${p.name.text}: ${quote(v)}`);
            }
          } else {
            return null;
          }
        }
        parts.push(`{ ${props.join(', ')} }`);
      } else {
        const v = stringOf(arg, env);
        if (v === null) return null;
        parts.push(quote(v));
      }
    }
    return parts.join(', ');
  }

  /** suziQai selector for a Playwright locator expression; parent scopes (dialog.getBy…) are dropped. */
  function selectorOf(e: ts.Expression, env: Env): string | null {
    e = unwrap(e);
    if (ts.isIdentifier(e)) {
      const v = env.get(e.text);
      return v?.kind === 'locator' ? selectorOf(v.node, env) : null;
    }
    if (!ts.isCallExpression(e) || !ts.isPropertyAccessExpression(e.expression)) return null;
    const method = e.expression.name.text;
    const base = e.expression.expression;

    if (method === 'first' || method === 'last') {
      const inner = selectorOf(base, env);
      return inner && `${inner}.${method}()`;
    }
    if (method === 'nth') {
      const inner = selectorOf(base, env);
      const n = e.arguments[0] && stringOf(e.arguments[0], env);
      return inner && n !== null ? `${inner}.nth(${n})` : null;
    }
    if (method === 'locator') {
      return e.arguments.length === 1 ? stringOf(e.arguments[0], env) : null;
    }
    if (method.startsWith('getBy')) {
      const args = argList(e.arguments, env);
      return args === null ? null : `${method}(${args})`;
    }
    return null;
  }

  function isLocatorExpr(e: ts.Expression, env: Env): boolean {
    e = unwrap(e);
    return selectorOf(e, env) !== null || (ts.isIdentifier(e) && env.get(e.text)?.kind === 'locator');
  }

  // ── statements ────────────────────────────────────────────────────────────

  function step(label: string, action: StepAction, unknownValue = false): Step {
    return { id: `step-${randomUUID()}`, label: unknownValue ? `${label} [needs value]` : label, action, status: 'pending' };
  }

  /** Steps for one call statement, or null if it isn't one we understand. */
  function convertCall(call: ts.CallExpression, env: Env, out: Step[], depth: number): boolean {
    const callee = call.expression;

    // safeClick(locator)
    if (ts.isIdentifier(callee) && callee.text === 'safeClick' && call.arguments[0]) {
      const sel = selectorOf(call.arguments[0], env);
      if (!sel) return false;
      out.push(step(`Click ${sel}`, { type: 'click', selector: sel }));
      return true;
    }

    // Same-file helper: inline one level, binding string args and defaults
    if (ts.isIdentifier(callee) && helpers.has(callee.text) && depth === 0) {
      const fn = helpers.get(callee.text)!;
      const local: Env = new Map(env);
      fn.parameters.forEach((p, i) => {
        if (!ts.isIdentifier(p.name)) return;
        const arg = call.arguments[i] ?? p.initializer;
        const v = arg && stringOf(arg, env);
        if (v !== null && v !== undefined) local.set(p.name.text, { kind: 'string', value: v });
      });
      fn.body?.statements.forEach((s) => convertStatement(s, local, out, depth + 1, true));
      return true;
    }

    if (!ts.isPropertyAccessExpression(callee)) return false;
    const method = callee.name.text;
    const target = callee.expression;

    // page.goto(url)
    if (method === 'goto' && ts.isIdentifier(target) && target.text === 'page') {
      const url = call.arguments[0] && stringOf(call.arguments[0], env);
      if (url === null || url === undefined) return false;
      out.push(step(`Go to ${url}`, { type: 'navigate', url }));
      return true;
    }

    // page.keyboard.press(key)
    if (method === 'press' && ts.isPropertyAccessExpression(target) && target.name.text === 'keyboard') {
      const key = call.arguments[0] && stringOf(call.arguments[0], env);
      if (!key) return false;
      out.push(step(`Press ${key}`, { type: 'press', selector: 'body', key }));
      return true;
    }

    // expect(x).[not.]matcher(arg)
    const expectCall = ts.isPropertyAccessExpression(target) && target.name.text === 'not' ? target.expression : target;
    const negated = expectCall !== target;
    if (ts.isCallExpression(expectCall) && ts.isIdentifier(expectCall.expression) && expectCall.expression.text === 'expect') {
      const subject = expectCall.arguments[0];
      if (!subject) return false;

      if (method === 'toHaveURL' && !negated) {
        const expected = call.arguments[0] && stringOf(call.arguments[0], env);
        if (expected === null || expected === undefined) return false;
        out.push(step(`URL is ${expected}`, { type: 'assert', assertionType: 'url', expected }));
        return true;
      }

      const sel = selectorOf(subject, env);
      if (!sel) return false;
      let assertionType: AssertionType | undefined = MATCHERS[method];
      if (method === 'toHaveCount' && call.arguments[0] && stringOf(call.arguments[0], env) === '0') assertionType = 'hidden';
      if (negated) assertionType = assertionType === 'visible' ? 'hidden' : assertionType === 'hidden' ? 'visible' : undefined;
      if (!assertionType) return false;

      let expected = '';
      if (assertionType === 'value' || assertionType === 'text') {
        const v = call.arguments[0] && stringOf(call.arguments[0], env);
        if (v === null || v === undefined) return false;
        expected = v;
      }
      out.push(step(`Expect ${sel} ${assertionType}${expected ? ` "${expected}"` : ''}`, { type: 'assert', assertionType, expected, selector: sel }));
      return true;
    }

    // locator.click() / .fill(v) / .press(k)
    if (method === 'click' || method === 'fill' || method === 'press') {
      const sel = selectorOf(target, env);
      if (!sel) return false;
      if (method === 'click') {
        out.push(step(`Click ${sel}`, { type: 'click', selector: sel }));
        return true;
      }
      const arg = call.arguments[0];
      const v = arg ? stringOf(arg, env) : null;
      if (method === 'press') {
        if (!v) return false;
        out.push(step(`Press ${v} on ${sel}`, { type: 'press', selector: sel, key: v }));
        return true;
      }
      const value = v ?? `{{${arg?.getText(sf) ?? ''}}}`;
      out.push(step(`Fill ${sel}`, { type: 'fill', selector: sel, value }, v === null));
      return true;
    }
    return false;
  }

  function convertStatement(s: ts.Statement, env: Env, out: Step[], depth: number, inHelper = false): void {
    if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) {
        if (!d.initializer) continue;
        const init = unwrap(d.initializer);
        if (ts.isIdentifier(d.name)) {
          const str = stringOf(init, env);
          if (str !== null) env.set(d.name.text, { kind: 'string', value: str });
          else if (isLocatorExpr(init, env)) env.set(d.name.text, { kind: 'locator', node: init });
        }
        // Calling a same-file helper for its side effects (e.g. `const { page } = await openBoard(…)`)
        if (ts.isCallExpression(init) && ts.isIdentifier(init.expression) && helpers.has(init.expression.text)) {
          convertCall(init, env, out, depth);
        }
        // Other declarations (contexts, credentials, counters) are setup: ignored, not steps
      }
      return;
    }
    if (ts.isForOfStatement(s)) {
      const list = unwrap(s.expression);
      const decl = ts.isVariableDeclarationList(s.initializer) ? s.initializer.declarations[0] : undefined;
      const values = ts.isArrayLiteralExpression(list) ? list.elements.map((el) => stringOf(el, env)) : null;
      if (!decl || !ts.isIdentifier(decl.name) || !values || values.some((v) => v === null)) {
        skip(s);
        return;
      }
      for (const v of values) {
        const loopEnv: Env = new Map(env);
        loopEnv.set(decl.name.text, { kind: 'string', value: v! });
        const body = ts.isBlock(s.statement) ? s.statement.statements : [s.statement];
        body.forEach((b) => convertStatement(b, loopEnv, out, depth, inHelper));
      }
      return;
    }
    if (ts.isReturnStatement(s)) return;
    if (ts.isExpressionStatement(s)) {
      const e = unwrap(s.expression);
      if (ts.isCallExpression(e) && convertCall(e, env, out, depth)) return;
      // Inside an inlined helper, unconvertible lines are its own plumbing (newPage, waitFor…)
      if (!inHelper) skip(s);
      return;
    }
    if (!inHelper) skip(s);
  }

  // ── file structure ────────────────────────────────────────────────────────

  for (const s of sf.statements) {
    if (ts.isFunctionDeclaration(s) && s.name) helpers.set(s.name.text, s);
    if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) {
        const v = d.initializer && ts.isIdentifier(d.name) ? stringOf(d.initializer, new Map()) : null;
        if (v !== null && ts.isIdentifier(d.name)) constants.set(d.name.text, { kind: 'string', value: v });
      }
    }
  }

  const describes: string[] = [];
  const blocks: TestBlock[] = [];
  const hooks: Record<'beforeAll' | 'beforeEach' | 'afterEach' | 'afterAll', Step[]> = {
    beforeAll: [], beforeEach: [], afterEach: [], afterAll: [],
  };

  function bodyOf(fn: ts.Expression | undefined): ts.NodeArray<ts.Statement> | null {
    if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && ts.isBlock(fn.body)) return fn.body.statements;
    return null;
  }

  function visit(node: ts.Node): void {
    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
      const call = node.expression;
      const callee = call.expression.getText(sf);
      const title = call.arguments[0] && stringOf(call.arguments[0], new Map());
      if (callee === 'test.describe' || callee === 'describe') {
        if (title) describes.push(title);
        bodyOf(call.arguments[1])?.forEach((s) => visit(s));
        return;
      }
      if ((callee === 'test' || callee === 'it' || callee === 'test.only') && title) {
        const steps: Step[] = [];
        bodyOf(call.arguments[call.arguments.length - 1])?.forEach((s) => convertStatement(s, new Map(), steps, 0));
        blocks.push({ id: `block-${randomUUID()}`, name: title, steps });
        return;
      }
      const hook = callee.replace(/^test\./, '') as keyof typeof hooks;
      if (hook in hooks) {
        bodyOf(call.arguments[call.arguments.length - 1])?.forEach((s) => convertStatement(s, new Map(), hooks[hook], 0));
      }
    }
  }
  sf.statements.forEach((s) => visit(s));

  const base = path.basename(fileName).replace(/\.(spec|test)\.[jt]sx?$/, '');
  return {
    suite: {
      id: `suite-${randomUUID()}`,
      name: describes[0] ?? base,
      fileName: base,
      ...hooks,
      tests: blocks,
      devices: [],
    },
    skipped,
  };
}
