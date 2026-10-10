// Claude is asked for JSON but sometimes thinks out loud first, wraps it in a fence, or revises
// itself ("Actually, … ```json {…}```"). A greedy /\{[\s\S]*\}/ spans from the first brace in the
// prose to the last one and fails to parse, which goal mode then reads as "stuck".

/** Every balanced top-level {…} in the text, in order (braces inside strings are ignored). */
function balancedObjects(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"' && depth > 0) inString = true;
    else if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}' && depth > 0) {
      depth--;
      if (depth === 0) out.push(text.slice(start, i + 1));
    }
  }
  return out;
}

/**
 * The reply's JSON object: the last one that parses (a revised answer wins over an earlier
 * draft), preferring ones that satisfy `accept`. Returns undefined if none parse.
 */
export function extractJson<T = Record<string, unknown>>(
  text: string,
  accept: (value: Record<string, unknown>) => boolean = () => true,
): T | undefined {
  const parsed: Record<string, unknown>[] = [];
  for (const candidate of balancedObjects(text)) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === 'object' && !Array.isArray(value)) parsed.push(value);
    } catch {
      // prose that happens to contain braces
    }
  }
  const accepted = parsed.filter(accept);
  return (accepted.at(-1) ?? parsed.at(-1)) as T | undefined;
}
