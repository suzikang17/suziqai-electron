import React, { useState, useEffect } from 'react';
import { FileTree } from './FileTree';

interface ProjectSetupProps {
  onProjectOpened: (path: string) => void;
}

export function ProjectSetup({ onProjectOpened }: ProjectSetupProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');
  const [homePath, setHomePath] = useState<string>('/');

  useEffect(() => {
    window.suziqai.getHomePath().then(setHomePath);
  }, []);

  const handleOpen = async () => {
    if (!selectedPath) return;
    setStatus('loading');
    try {
      await window.suziqai.openProject(selectedPath);
      onProjectOpened(selectedPath);
    } catch (err) {
      setStatus('error');
      setError((err as Error).message);
    }
  };

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-primary)',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', padding: '24px 0 16px' }}>
        <h1 style={{ color: 'var(--accent-red)', fontSize: 28, marginBottom: 4 }}>suziQai</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          Select a project directory to get started
        </p>
      </div>

      {/* File Tree */}
      <FileTree
        rootPath={homePath}
        onSelectDir={setSelectedPath}
        selectedPath={selectedPath}
        style={{ flex: 1, margin: '0 24px', borderRadius: 6, border: '1px solid var(--border)' }}
      />

      {/* Footer */}
      <div style={{ padding: '16px 24px', textAlign: 'center' }}>
        {selectedPath && (
          <p style={{ color: 'var(--text-secondary)', fontSize: 11, marginBottom: 8 }}>
            Selected: {selectedPath}
          </p>
        )}
        <button
          onClick={handleOpen}
          disabled={!selectedPath || status === 'loading'}
          style={{
            background: selectedPath ? 'var(--accent-green)' : 'var(--bg-tertiary)',
            color: selectedPath ? 'var(--bg-primary)' : 'var(--text-muted)',
            borderRadius: 6,
            padding: '10px 32px',
            fontSize: 14,
            fontWeight: 'bold',
            opacity: status === 'loading' ? 0.6 : 1,
          }}
        >
          {status === 'loading' ? 'Opening...' : 'Open Project'}
        </button>
        {status === 'error' && (
          <p style={{ color: 'var(--accent-red)', fontSize: 12, marginTop: 8 }}>{error}</p>
        )}
      </div>
    </div>
  );
}
