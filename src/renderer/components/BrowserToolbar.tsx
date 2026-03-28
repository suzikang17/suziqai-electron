import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AppMode } from '@shared/types';

interface BrowserToolbarProps {
  url: string;
  mode: AppMode;
  isRecording: boolean;
  isPicking: boolean;
  onNavigate: (url: string) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onModeChange: (mode: AppMode) => void;
  onRecordToggle: () => void;
  onPickToggle: () => void;
}

export function BrowserToolbar({
  url,
  mode,
  isRecording,
  isPicking,
  onNavigate,
  onGoBack,
  onGoForward,
  onModeChange,
  onRecordToggle,
  onPickToggle,
}: BrowserToolbarProps) {
  const [urlInput, setUrlInput] = useState(url);

  useEffect(() => {
    setUrlInput(url);
  }, [url]);

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNavigate(urlInput);
  };

  return (
    <div
      style={{
        background: 'var(--bg-secondary)',
        padding: '6px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderBottom: '1px solid var(--border)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Back / Forward */}
      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
        <button
          onClick={onGoBack}
          style={{ background: 'none', padding: '2px', display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}
          title="Back"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={onGoForward}
          style={{ background: 'none', padding: '2px', display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}
          title="Forward"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* URL bar */}
      <form onSubmit={handleUrlSubmit} style={{ flex: 1, minWidth: 0 }}>
        <input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="Enter URL..."
          style={{
            width: '100%',
            background: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)',
            borderRadius: 4,
            padding: '4px 10px',
            fontSize: 12,
          }}
        />
      </form>

      {/* Pick element button */}
      <button
        onClick={onPickToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: isPicking ? 'var(--accent-blue, #0969da)' : 'var(--bg-tertiary)',
          color: isPicking ? 'white' : 'var(--text-secondary)',
          borderRadius: 4,
          padding: '4px 10px',
          fontSize: 10,
          fontWeight: 'bold',
        }}
      >
        {isPicking ? '⊙ Picking...' : '⊙ Pick'}
      </button>

      {/* Record button */}
      <button
        onClick={onRecordToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: isRecording ? 'var(--accent-red)' : 'var(--bg-tertiary)',
          color: isRecording ? 'white' : 'var(--text-secondary)',
          borderRadius: 4,
          padding: '4px 10px',
          fontSize: 10,
          fontWeight: 'bold',
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: isRecording ? 'white' : 'var(--accent-red)',
          }}
        />
        {isRecording ? 'Stop' : 'Record'}
      </button>

      {/* Mode selector */}
      <select
        value={mode}
        onChange={(e) => onModeChange(e.target.value as AppMode)}
        style={{
          background: 'var(--bg-tertiary)',
          color: 'var(--text-secondary)',
          borderRadius: 4,
          padding: '4px 8px',
          fontSize: 10,
          border: 'none',
        }}
      >
        <option value="command">Command</option>
        <option value="record">Record</option>
        <option value="observe">Observe</option>
      </select>
    </div>
  );
}
