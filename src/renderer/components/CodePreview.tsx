import React from 'react';
import type { TestCase } from '@shared/types';
import { generateSpec } from '@shared/utils/generateSpec';

interface CodePreviewProps {
  test: TestCase;
  baseUrl?: string;
}

export function CodePreview({ test, baseUrl }: CodePreviewProps) {
  const code = generateSpec(test, baseUrl);

  return (
    <div style={{
      height: '100%',
      background: 'var(--bg-dark)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
    }}>
      <div style={{
        padding: '6px 10px',
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
          {test.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'untitled'}.spec.ts
        </span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(code);
          }}
          style={{
            background: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)',
            borderRadius: 3,
            padding: '2px 8px',
            fontSize: 9,
          }}
        >
          Copy
        </button>
      </div>
      <pre style={{
        flex: 1,
        overflowY: 'auto',
        padding: 10,
        margin: 0,
        color: 'var(--text-secondary)',
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      }}>
        {highlightCode(code)}
      </pre>
    </div>
  );
}

function highlightCode(code: string): React.ReactNode[] {
  return code.split('\n').map((line, i) => (
    <div key={i} style={{ minHeight: '1.6em' }}>
      {colorLine(line)}
    </div>
  ));
}

function colorLine(line: string): React.ReactNode {
  // Comments
  if (line.trim().startsWith('//')) {
    return <span style={{ color: 'var(--text-muted)' }}>{line}</span>;
  }
  // Import
  if (line.trim().startsWith('import')) {
    return <span style={{ color: '#c792ea' }}>{line}</span>;
  }
  // test.describe / test(
  if (line.includes('test.describe') || line.match(/^\s*test\(/)) {
    return <span style={{ color: 'var(--accent-yellow)' }}>{line}</span>;
  }
  // await expect
  if (line.includes('expect(')) {
    return <span style={{ color: 'var(--accent-green)' }}>{line}</span>;
  }
  // await page.
  if (line.includes('await page.') || line.includes('await ')) {
    return <span style={{ color: '#82aaff' }}>{line}</span>;
  }
  return <span>{line}</span>;
}
