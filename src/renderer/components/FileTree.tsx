import React, { useState, useEffect } from 'react';

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface FileTreeNodeProps {
  entry: FileEntry;
  depth: number;
  onSelectDir: (path: string) => void;
  selectedPath: string | null;
}

function FileTreeNode({ entry, depth, onSelectDir, selectedPath }: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const isSelected = selectedPath === entry.path;

  const toggle = async () => {
    if (!entry.isDirectory) return;

    if (!expanded && children.length === 0) {
      setLoading(true);
      try {
        const entries = await window.suziqai.readDir(entry.path);
        setChildren(entries);
      } catch {
        setChildren([]);
      }
      setLoading(false);
    }
    setExpanded(!expanded);
  };

  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (entry.isDirectory) {
      onSelectDir(entry.path);
    }
  };

  return (
    <div>
      <div
        onClick={toggle}
        onDoubleClick={handleSelect}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 6px',
          paddingLeft: depth * 16 + 6,
          cursor: entry.isDirectory ? 'pointer' : 'default',
          background: isSelected ? 'var(--bg-tertiary)' : 'transparent',
          borderRadius: 3,
          fontSize: 12,
          color: entry.isDirectory ? 'var(--text-primary)' : 'var(--text-muted)',
          userSelect: 'none',
        }}
      >
        {entry.isDirectory ? (
          <span style={{ color: 'var(--accent-yellow)', fontSize: 10, width: 12, textAlign: 'center' }}>
            {loading ? '...' : expanded ? '▼' : '▶'}
          </span>
        ) : (
          <span style={{ width: 12, textAlign: 'center', fontSize: 10, color: 'var(--text-muted)' }}>◇</span>
        )}
        <span style={{
          color: entry.isDirectory ? 'var(--accent-yellow)' : 'var(--text-secondary)',
          fontWeight: entry.isDirectory ? 500 : 400,
        }}>
          {entry.name}
        </span>
      </div>
      {expanded && children.map(child => (
        <FileTreeNode
          key={child.path}
          entry={child}
          depth={depth + 1}
          onSelectDir={onSelectDir}
          selectedPath={selectedPath}
        />
      ))}
    </div>
  );
}

interface FileTreeProps {
  rootPath: string;
  onSelectDir: (path: string) => void;
  selectedPath: string | null;
  style?: React.CSSProperties;
}

export function FileTree({ rootPath, onSelectDir, selectedPath, style }: FileTreeProps) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    window.suziqai.readDir(rootPath).then(e => {
      setEntries(e);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [rootPath]);

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      overflowY: 'auto',
      ...style,
    }}>
      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 11, padding: 10 }}>Loading...</div>
      ) : (
        entries.map(entry => (
          <FileTreeNode
            key={entry.path}
            entry={entry}
            depth={0}
            onSelectDir={onSelectDir}
            selectedPath={selectedPath}
          />
        ))
      )}
    </div>
  );
}
