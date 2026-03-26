import type { BrowserView, BrowserWindow } from 'electron';

const PICKER_SCRIPT = `
(function() {
  if (window.__suziqaiPicker) return;
  window.__suziqaiPicker = true;

  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #0969da;background:rgba(9,105,218,0.1);transition:all 0.05s ease;display:none;';
  document.documentElement.appendChild(overlay);

  var currentEl = null;

  document.addEventListener('mousemove', function(e) {
    var el = e.target;
    if (el === overlay) return;
    currentEl = el;
    var rect = el.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.left = rect.left + 'px';
    overlay.style.top = rect.top + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
  }, true);

  document.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (!currentEl) return false;

    var el = currentEl;
    var text = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 3) text += el.childNodes[i].textContent;
    }
    text = text.trim();

    var tag = el.tagName.toLowerCase();
    var result = {
      tag: tag,
      text: (el.textContent || '').trim().substring(0, 100),
      directText: text,
      id: el.id || null,
      role: el.getAttribute('role') || null,
      ariaLabel: el.getAttribute('aria-label') || null,
      ariaLabelledBy: null,
      ariaDescribedBy: null,
      placeholder: el.getAttribute('placeholder') || null,
      testId: el.getAttribute('data-testid') || el.getAttribute('data-test-id') || null,
      type: el.getAttribute('type') || null,
      href: el.getAttribute('href') || null,
      classes: Array.from(el.classList || []).slice(0, 3),
      labelFor: null,
      parentLabelText: null,
      outerHtml: el.outerHTML.substring(0, 500),
      parentChain: [],
    };

    // Capture parent chain (tag + key attrs, 3 levels)
    var par = el.parentElement;
    for (var d = 0; d < 3 && par && par !== document.body; d++) {
      var ptag = par.tagName.toLowerCase();
      var pattrs = '';
      if (par.id) pattrs += ' id="' + par.id + '"';
      if (par.className && typeof par.className === 'string' && par.className.trim()) pattrs += ' class="' + par.className.trim().substring(0, 40) + '"';
      result.parentChain.push(ptag + pattrs);
      par = par.parentElement;
    }

    // Resolve aria-labelledby
    var labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      var labelEl = document.getElementById(labelledBy);
      if (labelEl) result.ariaLabelledBy = labelEl.textContent.trim();
    }

    // Resolve aria-describedby
    var describedBy = el.getAttribute('aria-describedby');
    if (describedBy) {
      var descEl = document.getElementById(describedBy);
      if (descEl) result.ariaDescribedBy = descEl.textContent.trim();
    }

    // Check for associated label
    if (el.id) {
      var lbl = document.querySelector('label[for="' + el.id + '"]');
      if (lbl) result.labelFor = lbl.textContent.trim();
    }
    var parentLabel = el.closest('label');
    if (parentLabel) result.parentLabelText = parentLabel.textContent.trim();

    window.__suziqaiPickResult = result;
    return false;
  }, true);

  window.__suziqaiPickerCleanup = function() {
    window.__suziqaiPicker = false;
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    window.__suziqaiPickResult = null;
    window.__suziqaiPickerCleanup = null;
  };
})();
true;
`;

// Generates selectors in Playwright's recommended priority order:
// 1. getByRole — most resilient, accessibility-based
// 2. getByLabel — great for form inputs
// 3. getByPlaceholder — inputs without labels
// 4. getByText — non-interactive elements
// 5. getByTestId — explicit test hooks
// 6. CSS — last resort, most brittle
function generateSelectors(info: any): Array<{ type: string; selector: string; confidence: string }> {
  const selectors: Array<{ type: string; selector: string; confidence: string }> = [];
  const tag = info.tag;
  const text = info.directText || '';
  const esc = (s: string) => s.replace(/'/g, "\\'");

  // 1. getByRole (best)
  const implicitRoles: Record<string, string> = {
    a: 'link', button: 'button', h1: 'heading', h2: 'heading', h3: 'heading',
    h4: 'heading', h5: 'heading', h6: 'heading', input: 'textbox',
    select: 'combobox', textarea: 'textbox', nav: 'navigation', img: 'img',
  };
  if (tag === 'input') {
    const typeMap: Record<string, string> = { checkbox: 'checkbox', radio: 'radio', text: 'textbox', email: 'textbox', password: 'textbox', search: 'searchbox' };
    implicitRoles.input = typeMap[info.type || 'text'] || 'textbox';
  }
  const role = info.role || implicitRoles[tag];
  if (role) {
    const name = info.ariaLabel || info.ariaLabelledBy || text || info.text?.substring(0, 50) || '';
    if (name) {
      selectors.push({ type: 'getByRole', selector: "getByRole('" + role + "', { name: '" + esc(name) + "' })", confidence: 'recommended' });
    } else {
      selectors.push({ type: 'getByRole', selector: "getByRole('" + role + "')", confidence: 'high' });
    }
  }

  // 2. getByLabel (includes aria-labelledby resolution)
  const labelText = info.labelFor || info.parentLabelText || info.ariaLabel || info.ariaLabelledBy;
  if (labelText) {
    selectors.push({ type: 'getByLabel', selector: "getByLabel('" + esc(labelText) + "')", confidence: 'recommended' });
  }

  // 3. getByPlaceholder
  if (info.placeholder) {
    selectors.push({ type: 'getByPlaceholder', selector: "getByPlaceholder('" + esc(info.placeholder) + "')", confidence: 'high' });
  }

  // 4. getByText
  if (text && text.length > 0 && text.length < 80) {
    selectors.push({ type: 'getByText', selector: "getByText('" + esc(text) + "')", confidence: 'high' });
  }

  // 5. getByTestId
  if (info.testId) {
    selectors.push({ type: 'getByTestId', selector: "getByTestId('" + info.testId + "')", confidence: 'high' });
  }

  // 6. CSS (least preferred)
  if (info.id) {
    selectors.push({ type: 'css', selector: '#' + info.id, confidence: 'low' });
  } else if (info.classes && info.classes.length > 0) {
    selectors.push({ type: 'css', selector: tag + '.' + info.classes.join('.'), confidence: 'low' });
  } else {
    selectors.push({ type: 'css', selector: tag, confidence: 'low' });
  }

  return selectors;
}

export async function startPicker(view: BrowserView, mainWindow: BrowserWindow): Promise<void> {
  await view.webContents.executeJavaScript(PICKER_SCRIPT);

  const interval = setInterval(async () => {
    try {
      const result = await view.webContents.executeJavaScript(
        '(function(){ var r = window.__suziqaiPickResult; if (r) { window.__suziqaiPickResult = null; return JSON.parse(JSON.stringify(r)); } return null; })()'
      );
      if (result) {
        const selectors = generateSelectors(result);
        // Build DOM context in TypeScript from the captured data
        let domContext = '';
        const parents = (result.parentChain || []).reverse();
        for (let i = 0; i < parents.length; i++) {
          domContext += '  '.repeat(i) + '<' + parents[i] + '>\n';
        }
        // Trim outerHTML for display
        const html = (result.outerHtml || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        domContext += '  '.repeat(parents.length) + html.substring(0, 200) + (html.length > 200 ? '...' : '');
        for (let i = parents.length - 1; i >= 0; i--) {
          const closeTag = parents[i].split(' ')[0];
          domContext += '\n' + '  '.repeat(i) + '</' + closeTag + '>';
        }

        mainWindow.webContents.send('picker:result', {
          selectors,
          element: { tag: result.tag, text: result.text, id: result.id, domContext },
        });
      }
    } catch (e) {
      // BrowserView might have navigated
    }
  }, 200);

  (view as any).__pickerInterval = interval;
}

export async function stopPicker(view: BrowserView): Promise<void> {
  const interval = (view as any).__pickerInterval;
  if (interval) {
    clearInterval(interval);
    (view as any).__pickerInterval = null;
  }
  await view.webContents.executeJavaScript(
    'if (window.__suziqaiPickerCleanup) window.__suziqaiPickerCleanup(); true;'
  ).catch(() => {});
}
