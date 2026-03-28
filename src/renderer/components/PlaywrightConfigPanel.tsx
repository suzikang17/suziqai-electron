import React from 'react';
import type { PlaywrightConfig } from '@shared/types';

interface PlaywrightConfigPanelProps {
  config: PlaywrightConfig;
  onChange: (config: PlaywrightConfig) => void;
  onSave: () => void;
}

const labelStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 10,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.5,
  minWidth: 70,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  borderRadius: 3,
  padding: '3px 6px',
  fontSize: 11,
  fontFamily: 'var(--font-mono, monospace)',
  outline: 'none',
  minWidth: 0,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginBottom: 4,
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  padding: '3px 4px',
};

export function PlaywrightConfigPanel({ config, onChange, onSave }: PlaywrightConfigPanelProps) {
  const update = (partial: Partial<PlaywrightConfig>) => {
    onChange({ ...config, ...partial });
  };

  const updateUse = (partial: Partial<PlaywrightConfig['use']>) => {
    onChange({ ...config, use: { ...config.use, ...partial } });
  };

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 'bold' }}>
          Config
        </span>
      </div>

      {/* Timeout */}
      <div style={rowStyle}>
        <span style={labelStyle}>Timeout</span>
        <input
          type="number"
          value={config.timeout}
          onChange={(e) => update({ timeout: parseInt(e.target.value) || 30000 })}
          style={inputStyle}
          title="Test timeout in ms"
        />
        <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>ms</span>
      </div>

      {/* Retries */}
      <div style={rowStyle}>
        <span style={labelStyle}>Retries</span>
        <input
          type="number"
          min={0}
          value={config.retries}
          onChange={(e) => update({ retries: parseInt(e.target.value) || 0 })}
          style={inputStyle}
        />
      </div>

      {/* Workers */}
      <div style={rowStyle}>
        <span style={labelStyle}>Workers</span>
        <input
          value={String(config.workers)}
          onChange={(e) => {
            const val = e.target.value;
            const num = parseInt(val);
            update({ workers: !isNaN(num) && !val.includes('%') ? num : val });
          }}
          style={inputStyle}
          title="Number or percentage (e.g. '50%')"
        />
      </div>

      {/* Reporter */}
      <div style={rowStyle}>
        <span style={labelStyle}>Reporter</span>
        <select
          value={config.reporter}
          onChange={(e) => update({ reporter: e.target.value as PlaywrightConfig['reporter'] })}
          style={selectStyle}
        >
          <option value="html">html</option>
          <option value="json">json</option>
          <option value="list">list</option>
          <option value="dot">dot</option>
        </select>
      </div>

      {/* Headless */}
      <div style={rowStyle}>
        <span style={labelStyle}>Headless</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 11, color: 'var(--text-secondary)' }}>
          <input
            type="checkbox"
            checked={config.use.headless}
            onChange={(e) => updateUse({ headless: e.target.checked })}
            style={{ margin: 0 }}
          />
          {config.use.headless ? 'On' : 'Off'}
        </label>
      </div>

      {/* On Failure section */}
      <div style={{ marginTop: 4, marginBottom: 4 }}>
        <span style={{ ...labelStyle, display: 'block', marginBottom: 4 }}>On Failure</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingLeft: 4 }}>
          {/* Screenshot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 10, minWidth: 60 }}>Screenshot</span>
            <select
              value={config.use.screenshot}
              onChange={(e) => updateUse({ screenshot: e.target.value as PlaywrightConfig['use']['screenshot'] })}
              style={{ ...selectStyle, flex: 1 }}
            >
              <option value="off">off</option>
              <option value="on">on</option>
              <option value="only-on-failure">only-on-failure</option>
            </select>
          </div>

          {/* Video */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 10, minWidth: 60 }}>Video</span>
            <select
              value={config.use.video}
              onChange={(e) => updateUse({ video: e.target.value as PlaywrightConfig['use']['video'] })}
              style={{ ...selectStyle, flex: 1 }}
            >
              <option value="off">off</option>
              <option value="on">on</option>
              <option value="retain-on-failure">retain-on-failure</option>
            </select>
          </div>

          {/* Trace */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 10, minWidth: 60 }}>Trace</span>
            <select
              value={config.use.trace}
              onChange={(e) => updateUse({ trace: e.target.value as PlaywrightConfig['use']['trace'] })}
              style={{ ...selectStyle, flex: 1 }}
            >
              <option value="off">off</option>
              <option value="on">on</option>
              <option value="retain-on-failure">retain-on-failure</option>
            </select>
          </div>
        </div>
      </div>

      {/* Save Config button */}
      <button
        onClick={onSave}
        style={{
          width: '100%',
          background: 'var(--bg-tertiary)',
          color: 'var(--accent-green)',
          borderRadius: 4,
          padding: '6px 0',
          fontSize: 10,
          fontWeight: 'bold',
          border: '1px solid var(--border)',
          cursor: 'pointer',
          marginTop: 4,
        }}
      >
        Save playwright.config.ts
      </button>
    </div>
  );
}
