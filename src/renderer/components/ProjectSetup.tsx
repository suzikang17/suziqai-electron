import React, { useState, useEffect, useRef, useCallback } from 'react';

interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface ProjectSetupProps {
  onProjectOpened: (path: string) => void;
}

export function ProjectSetup({ onProjectOpened }: ProjectSetupProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DirEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');
  const [homePath, setHomePath] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Get home path on mount
  useEffect(() => {
    window.suziqai.getHomePath().then((p) => {
      setHomePath(p);
      setQuery(p + '/');
    });
  }, []);

  // Resolve ~ to home path
  const resolvePath = useCallback((input: string): string => {
    if (input.startsWith('~/') || input === '~') {
      return homePath + input.slice(1);
    }
    return input;
  }, [homePath]);

  // Fetch directory contents when query changes
  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }

    const resolved = resolvePath(query);

    // Find the directory part and the filter part
    let dirPath: string;
    let filter: string;

    if (resolved.endsWith('/')) {
      dirPath = resolved;
      filter = '';
    } else {
      const lastSlash = resolved.lastIndexOf('/');
      dirPath = resolved.substring(0, lastSlash + 1);
      filter = resolved.substring(lastSlash + 1).toLowerCase();
    }

    if (!dirPath) return;

    window.suziqai.readDir(dirPath).then((entries) => {
      let filtered = entries;
      if (filter) {
        // Fuzzy match: all filter chars must appear in order
        filtered = entries.filter(e => {
          const name = e.name.toLowerCase();
          let fi = 0;
          for (let ni = 0; ni < name.length && fi < filter.length; ni++) {
            if (name[ni] === filter[fi]) fi++;
          }
          return fi === filter.length;
        });
      }
      // Show directories first
      filtered.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
      setResults(filtered);
      setSelectedIndex(0);
    }).catch(() => {
      setResults([]);
    });
  }, [query, resolvePath]);

  // Scroll selected item into view
  useEffect(() => {
    resultRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const selected = results[selectedIndex];
      if (selected) {
        const newPath = selected.isDirectory ? selected.path + '/' : selected.path;
        setQuery(newPath);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = results[selectedIndex];
      if (selected && selected.isDirectory) {
        handleOpen(selected.path);
      }
    }
  };

  const handleOpen = async (dirPath: string) => {
    setStatus('loading');
    try {
      await window.suziqai.openProject(dirPath);
      onProjectOpened(dirPath);
    } catch (err) {
      setStatus('error');
      setError((err as Error).message);
    }
  };

  const handleResultClick = (entry: DirEntry, index: number) => {
    setSelectedIndex(index);
    if (entry.isDirectory) {
      setQuery(entry.path + '/');
    }
  };

  const handleResultDoubleClick = (entry: DirEntry) => {
    if (entry.isDirectory) {
      handleOpen(entry.path);
    }
  };

  // Highlight matching characters in fuzzy search
  const highlightMatch = (name: string, filter: string) => {
    if (!filter) return <span>{name}</span>;

    const chars: React.ReactNode[] = [];
    let fi = 0;
    for (let i = 0; i < name.length; i++) {
      if (fi < filter.length && name[i].toLowerCase() === filter[fi].toLowerCase()) {
        chars.push(<span key={i} style={{ color: 'var(--accent-green)', fontWeight: 'bold' }}>{name[i]}</span>);
        fi++;
      } else {
        chars.push(<span key={i}>{name[i]}</span>);
      }
    }
    return <>{chars}</>;
  };

  const getFilter = (): string => {
    const resolved = resolvePath(query);
    if (resolved.endsWith('/')) return '';
    const lastSlash = resolved.lastIndexOf('/');
    return resolved.substring(lastSlash + 1);
  };

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-primary)',
      padding: 24,
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <h1 style={{ color: 'var(--accent-red)', fontSize: 28, marginBottom: 4 }}>suziQai</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          Type a path to find your project
        </p>
      </div>

      {/* Search input */}
      <div style={{
        background: 'var(--bg-secondary)',
        borderRadius: '6px 6px 0 0',
        border: '1px solid var(--border)',
        borderBottom: 'none',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{ color: 'var(--accent-green)', fontSize: 14, fontWeight: 'bold' }}>❯</span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          spellCheck={false}
          style={{
            flex: 1,
            background: 'transparent',
            color: 'var(--text-primary)',
            fontSize: 14,
            fontFamily: 'monospace',
          }}
          placeholder="~/projects/my-app"
        />
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          {results.length} {results.length === 1 ? 'match' : 'matches'}
        </span>
      </div>

      {/* Results */}
      <div style={{
        flex: 1,
        background: 'var(--bg-dark)',
        border: '1px solid var(--border)',
        borderRadius: '0 0 6px 6px',
        overflowY: 'auto',
        fontFamily: 'monospace',
        fontSize: 13,
      }}>
        {results.map((entry, i) => (
          <div
            key={entry.path}
            ref={el => { resultRefs.current[i] = el; }}
            onClick={() => handleResultClick(entry, i)}
            onDoubleClick={() => handleResultDoubleClick(entry)}
            style={{
              padding: '6px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: i === selectedIndex ? 'var(--bg-tertiary)' : 'transparent',
              cursor: 'pointer',
              borderLeft: i === selectedIndex ? '2px solid var(--accent-green)' : '2px solid transparent',
            }}
          >
            <span style={{
              color: entry.isDirectory ? 'var(--accent-yellow)' : 'var(--text-muted)',
              fontSize: 11,
              width: 14,
            }}>
              {entry.isDirectory ? '📁' : '  '}
            </span>
            <span style={{
              color: entry.isDirectory ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}>
              {highlightMatch(entry.name, getFilter())}
            </span>
            {entry.isDirectory && (
              <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>/</span>
            )}
          </div>
        ))}
        {results.length === 0 && query && (
          <div style={{ color: 'var(--text-muted)', padding: '20px 14px', textAlign: 'center' }}>
            No matches found
          </div>
        )}
      </div>

      {/* Footer hints */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 16,
        marginTop: 12,
      }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          <kbd style={{ background: 'var(--bg-tertiary)', padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>↑↓</kbd> navigate
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          <kbd style={{ background: 'var(--bg-tertiary)', padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>Tab</kbd> autocomplete
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          <kbd style={{ background: 'var(--bg-tertiary)', padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>Enter</kbd> open project
        </span>
      </div>

      {status === 'error' && (
        <p style={{ color: 'var(--accent-red)', fontSize: 12, marginTop: 8, textAlign: 'center' }}>{error}</p>
      )}
    </div>
  );
}
