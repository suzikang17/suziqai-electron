import React from 'react';
import type { LibraryEntry } from '@shared/types';

interface LibraryViewProps {
  entries: LibraryEntry[];
  onLoad: (fileName: string) => void;
  onDelete: (fileName: string) => void;
  onRefresh: () => void;
}

export function LibraryView({ entries, onLoad, onDelete, onRefresh }: LibraryViewProps) {
  if (entries.length === 0) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', marginTop: 40, padding: '0 10px' }}>
        No saved tests yet. Save a test from the session to see it here.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {entries.map(entry => (
        <div
          key={entry.fileName}
          onClick={() => !entry.imported && onLoad(entry.fileName)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 8px',
            borderRadius: 3,
            background: 'var(--bg-tertiary)',
            cursor: entry.imported ? 'default' : 'pointer',
            opacity: entry.imported ? 0.7 : 1,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {entry.name}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1, display: 'flex', gap: 6 }}>
              {entry.imported ? (
                <span style={{ color: 'var(--accent-yellow, #d29922)', fontWeight: 500 }}>imported</span>
              ) : (
                <>
                  <span>{entry.stepCount} steps</span>
                  {entry.updatedAt && (
                    <span>{new Date(entry.updatedAt).toLocaleDateString()}</span>
                  )}
                </>
              )}
            </div>
          </div>
          {!entry.imported && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(entry.fileName); }}
              style={{
                background: 'none',
                color: 'var(--text-muted)',
                fontSize: 11,
                padding: '0 2px',
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
