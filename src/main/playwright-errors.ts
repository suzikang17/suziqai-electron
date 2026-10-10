// Playwright action errors put the useful part last: "Timeout 5000ms exceeded" first, then a call
// log ending in why it never acted ("<div class=popover> intercepts pointer events", "element is
// not visible"). Goal mode feeds these to Claude, so keep the headline plus the reason.

const REASON = /intercepts pointer events|element is not (visible|enabled|stable|editable)|not attached|detached|outside of the viewport|resolved to \d+ elements|strict mode violation|waiting for .* to be (visible|enabled)/i;

export function summarizePlaywrightError(message: string): string {
  const clean = message.replace(/\u001b\[[0-9;]*m/g, '');
  const [headline, ...rest] = clean.split('\n').map((l) => l.trim()).filter(Boolean);
  const reasons = rest.filter((l) => REASON.test(l)).map((l) => l.replace(/^-\s*/, ''));
  // The last reason is the latest retry's — the one still blocking the action
  const reason = reasons.at(-1);
  const short = (s: string) => (s.length > 220 ? s.slice(0, 217) + '…' : s);
  return reason && !headline.includes(reason) ? `${short(headline)} — ${short(reason)}` : short(headline ?? clean);
}
