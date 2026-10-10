// SUZIQAI_TIMING=1 logs how long each part of a goal run takes ("[timing] plan 4210ms"), to find
// where the time goes before optimising it.

const enabled = () => !!process.env.SUZIQAI_TIMING;

export async function timed<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (!enabled()) return fn();
  const t = Date.now();
  try {
    return await fn();
  } finally {
    console.log(`[timing] ${name} ${Date.now() - t}ms`);
  }
}

/** Wraps every async function of a deps object (freshStart, observe, plan, execute…) in timed(). */
export function timedDeps<T extends object>(deps: T): T {
  const out = { ...deps } as Record<string, unknown>;
  for (const [key, value] of Object.entries(deps)) {
    if (typeof value === 'function' && key !== 'emit') {
      out[key] = (...args: unknown[]) => timed(key, () => Promise.resolve((value as (...a: unknown[]) => unknown)(...args)));
    }
  }
  return out as T;
}
