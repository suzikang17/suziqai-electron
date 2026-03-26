import React, { useState } from 'react';

interface ProjectSetupProps {
  onProjectOpened: (path: string) => void;
}

export function ProjectSetup({ onProjectOpened }: ProjectSetupProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');

  const handleOpen = async () => {
    const path = await window.suziqai.showOpenDialog();
    if (!path) return;

    setStatus('loading');
    try {
      await window.suziqai.openProject(path);
      onProjectOpened(path);
    } catch (err) {
      setStatus('error');
      setError((err as Error).message);
    }
  };

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <h1 style={{ color: 'var(--accent-red)', fontSize: 36, marginBottom: 8 }}>suziQai</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 32 }}>
          AI-assisted browser test authoring
        </p>

        <button
          onClick={handleOpen}
          disabled={status === 'loading'}
          style={{
            background: 'var(--accent-green)',
            color: 'var(--bg-primary)',
            borderRadius: 6,
            padding: '12px 32px',
            fontSize: 14,
            fontWeight: 'bold',
            opacity: status === 'loading' ? 0.6 : 1,
          }}
        >
          {status === 'loading' ? 'Opening...' : 'Open Project'}
        </button>

        {status === 'error' && (
          <p style={{ color: 'var(--accent-red)', fontSize: 12, marginTop: 16 }}>{error}</p>
        )}

        <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 24 }}>
          Select a project directory to get started.
          <br />
          suziQai will detect your Playwright configuration automatically.
        </p>
      </div>
    </div>
  );
}
