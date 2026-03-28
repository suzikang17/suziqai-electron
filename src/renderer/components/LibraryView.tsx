import React, { useState } from 'react';
import type { LibraryEntry } from '@shared/types';

interface LibraryViewProps {
  entries: LibraryEntry[];
  onLoad: (fileName: string) => void;
  onDelete: (fileName: string) => void;
  onRefresh: () => void;
}

function RelativeTime({ date }: { date: string }) {
  if (!date) return null;
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  let label: string;
  if (mins < 1) label = 'just now';
  else if (mins < 60) label = `${mins}m ago`;
  else if (hours < 24) label = `${hours}h ago`;
  else if (days < 30) label = `${days}d ago`;
  else label = new Date(date).toLocaleDateString();

  return <span>{label}</span>;
}

export function LibraryView({ entries, onLoad, onDelete, onRefresh }: LibraryViewProps) {
  const [hoveredEntry, setHoveredEntry] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        marginTop: 60,
        padding: '0 20px',
      }}>
        <div style={{ fontSize: 24, opacity: 0.3 }}>{'{ }'}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 11, textAlign: 'center', lineHeight: 1.5 }}>
          No saved tests yet.
          <br />
          Save a test from the session to build your library.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, overflowY: 'auto' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
      }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {entries.length} test{entries.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={onRefresh}
          style={{
            background: 'none',
            color: 'var(--text-muted)',
            fontSize: 11,
            cursor: 'pointer',
            padding: '2px 4px',
            borderRadius: 3,
          }}
          title="Refresh library"
        >
          Refresh
        </button>
      </div>

      {entries.map(entry => {
        const isHovered = hoveredEntry === entry.fileName;
        const isConfirming = confirmDelete === entry.fileName;

        return (
          <div
            key={entry.fileName}
            onMouseEnter={() => setHoveredEntry(entry.fileName)}
            onMouseLeave={() => { setHoveredEntry(null); setConfirmDelete(null); }}
            onClick={() => !entry.imported && !isConfirming && onLoad(entry.fileName)}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '7px 8px',
              borderRadius: 4,
              background: isHovered && !entry.imported ? 'var(--bg-primary)' : 'var(--bg-tertiary)',
              cursor: entry.imported ? 'default' : 'pointer',
              borderLeft: entry.imported
                ? '3px solid var(--accent-yellow, #d29922)'
                : '3px solid var(--accent-green)',
              transition: 'background 0.1s ease',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 11,
                color: 'var(--text-primary)',
                fontWeight: 'bold',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {entry.name}
              </div>
              <div style={{
                fontSize: 9,
                color: 'var(--text-muted)',
                marginTop: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                {entry.imported ? (
                  <span style={{ color: 'var(--accent-yellow, #d29922)', fontWeight: 500 }}>imported</span>
                ) : (
                  <>
                    <span>{entry.stepCount} step{entry.stepCount !== 1 ? 's' : ''}</span>
                    <span style={{ color: 'var(--border)' }}>|</span>
                    <RelativeTime date={entry.updatedAt} />
                  </>
                )}
              </div>
            </div>

            {!entry.imported && isHovered && (
              isConfirming ? (
                <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(entry.fileName); setConfirmDelete(null); }}
                    style={{
                      background: 'var(--accent-red)',
                      color: '#fff',
                      fontSize: 9,
                      fontWeight: 'bold',
                      padding: '2px 6px',
                      borderRadius: 3,
                      cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }}
                    style={{
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-muted)',
                      fontSize: 9,
                      padding: '2px 6px',
                      borderRadius: 3,
                      cursor: 'pointer',
                      border: '1px solid var(--border)',
                    }}
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(entry.fileName); }}
                  style={{
                    background: 'none',
                    color: 'var(--text-muted)',
                    fontSize: 13,
                    padding: '0 4px',
                    cursor: 'pointer',
                    flexShrink: 0,
                    lineHeight: 1,
                  }}
                  title="Delete test"
                >
                  ×
                </button>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}
