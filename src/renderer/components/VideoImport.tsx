import React, { useState, useRef, useEffect } from 'react';
import { Upload, Film, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';
import type { VideoImportProgress } from '@shared/types';

interface VideoImportProps {
  onClose: () => void;
}

const PHASE_LABELS: Record<VideoImportProgress['phase'], string> = {
  extracting: 'Extracting frames',
  analyzing: 'Analyzing video',
  replaying: 'Replaying in browser',
  resolving: 'Resolving selectors',
  finalizing: 'Finalizing',
};

const ACCEPTED_TYPES = ['.mp4', '.webm', '.mov'];
const MAX_SIZE_MB = 500;

export function VideoImport({ onClose }: VideoImportProps) {
  const [file, setFile] = useState<{ name: string; path: string; size: number } | null>(null);
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState<VideoImportProgress | null>(null);
  const [result, setResult] = useState<{ actionsDetected: number; selectorsResolved: number; selectorsByJev: number; unresolvedCount: number } | null>(null);
  const [error, setError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.suziqai.onVideoImportProgress((p: VideoImportProgress) => {
      setProgress(p);
    });
    return () => {
      window.suziqai.removeAllListeners('video:import:progress');
    };
  }, []);

  const validateFile = (name: string, size: number): string | null => {
    const ext = '.' + name.split('.').pop()?.toLowerCase();
    if (!ACCEPTED_TYPES.includes(ext)) {
      return `Unsupported format. Please use ${ACCEPTED_TYPES.join(', ')}`;
    }
    if (size > MAX_SIZE_MB * 1024 * 1024) {
      return `File too large (${Math.round(size / 1024 / 1024)}MB). Maximum is ${MAX_SIZE_MB}MB.`;
    }
    return null;
  };

  const handleFile = (filePath: string, fileName: string, fileSize: number) => {
    const err = validateFile(fileName, fileSize);
    if (err) {
      setError(err);
      return;
    }
    setFile({ name: fileName, path: filePath, size: fileSize });
    setError('');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      handleFile((dropped as any).path, dropped.name, dropped.size);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      handleFile((selected as any).path, selected.name, selected.size);
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setStatus('processing');
    setError('');
    setProgress({ phase: 'extracting', percent: 0, detail: 'Starting...' });

    try {
      const res = await window.suziqai.importVideo(file.path);
      if (res.success) {
        setStatus('done');
        setResult({
          actionsDetected: res.stats?.actionsDetected ?? 0,
          selectorsResolved: res.stats?.selectorsResolved ?? 0,
          selectorsByJev: res.stats?.selectorsByJev ?? 0,
          unresolvedCount: res.unresolvedCount ?? 0,
        });
      } else {
        setStatus('error');
        setError(res.error || 'Analysis failed');
      }
    } catch (err: any) {
      setStatus('error');
      setError(err.message || 'Unexpected error');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.5)',
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: 24, width: 440,
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)', position: 'relative',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Film size={20} color="#7c3aed" />
            <span style={{ fontWeight: 600, fontSize: 16 }}>Import from Video</span>
          </div>
          <button onClick={onClose} style={{
            border: 'none', background: 'none', cursor: 'pointer', padding: 4,
            borderRadius: 4, display: 'flex',
          }}>
            <X size={18} color="#666" />
          </button>
        </div>

        {/* Drop zone (idle state) */}
        {status === 'idle' && (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${isDragOver ? '#7c3aed' : '#d1d5db'}`,
                borderRadius: 8, padding: 32, textAlign: 'center', cursor: 'pointer',
                backgroundColor: isDragOver ? '#f5f3ff' : '#fafafa',
                transition: 'all 150ms',
              }}
            >
              <Upload size={32} color={isDragOver ? '#7c3aed' : '#9ca3af'} style={{ margin: '0 auto 8px' }} />
              <div style={{ fontSize: 14, color: '#374151', fontWeight: 500 }}>
                {file ? file.name : 'Drop a screen recording here'}
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                {file ? formatSize(file.size) : 'MP4, WebM, or MOV — up to 5 minutes'}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp4,.webm,.mov"
                onChange={handleFileInput}
                style={{ display: 'none' }}
              />
            </div>

            {file && (
              <button onClick={handleAnalyze} style={{
                marginTop: 12, width: '100%', padding: '10px 0',
                background: '#7c3aed', color: '#fff', border: 'none',
                borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>
                Analyze Recording
              </button>
            )}
          </>
        )}

        {/* Processing state */}
        {status === 'processing' && progress && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <Loader2 size={32} color="#7c3aed" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
            <div style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>
              {PHASE_LABELS[progress.phase]}
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
              {progress.detail}
            </div>
            {/* Progress bar */}
            <div style={{
              marginTop: 12, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', background: '#7c3aed', borderRadius: 3,
                width: `${progress.percent}%`, transition: 'width 300ms ease',
              }} />
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Done state */}
        {status === 'done' && result && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <CheckCircle2 size={32} color="#16a34a" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>
              Analysis Complete
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 8, lineHeight: 1.6 }}>
              {result.actionsDetected} actions detected<br />
              {result.selectorsResolved} selectors auto-resolved
              {result.selectorsByJev > 0 && ` (${result.selectorsByJev} by Jev)`}<br />
              {result.unresolvedCount > 0 && (
                <span style={{ color: '#d97706' }}>
                  {result.unresolvedCount} need manual refinement
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>
              Steps added to sidebar. Review and edit before exporting.
            </div>
            <button onClick={onClose} style={{
              marginTop: 12, padding: '8px 24px',
              background: '#7c3aed', color: '#fff', border: 'none',
              borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}>
              Done
            </button>
          </div>
        )}

        {/* Error state */}
        {(error || status === 'error') && (
          <div style={{
            marginTop: 12, padding: 12, background: '#fef2f2', borderRadius: 8,
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <AlertCircle size={16} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 13, color: '#991b1b' }}>{error}</div>
          </div>
        )}
      </div>
    </div>
  );
}
