import { useState } from 'react';
import type { FeaturePlan, Scenario } from '@shared/types';

export type ScenarioStatus = 'running' | 'verified' | 'unverified' | 'stuck' | 'stopped' | 'error' | 'needs-sandbox' | 'skipped';

interface FeaturePlanPanelProps {
  plan: FeaturePlan;
  statuses: Record<string, ScenarioStatus>;
  running: boolean;
  onRun: (scenarioIds: string[]) => void;
  onDiscard: () => void;
}

const STATUS_LABEL: Record<ScenarioStatus, string> = {
  running: '⏳ running',
  verified: '✅ verified',
  unverified: '⚠️ done, replay failed',
  stuck: '🛑 stuck',
  stopped: '■ stopped',
  error: '✗ error',
  'needs-sandbox': '🏖 needs a sandbox',
  skipped: '– skipped',
};

const KIND_COLOR: Record<Scenario['kind'], string> = {
  happy: 'var(--accent-green)',
  edge: 'var(--accent-yellow, #d29922)',
  permission: 'var(--accent-blue, #0969da)',
};

/** Review a feature test plan before running it: tick scenarios, see why some can't run here. */
export function FeaturePlanPanel({ plan, statuses, running, onRun, onDiscard }: FeaturePlanPanelProps) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(plan.scenarios.filter((s) => s.runnable === 'now').map((s) => s.id)),
  );
  const toggle = (id: string) =>
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  return (
    <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', padding: '8px 12px', maxHeight: '45%', overflowY: 'auto', fontSize: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <strong style={{ fontSize: 13 }}>Test plan: {plan.feature}</strong>
        <span style={{ color: 'var(--text-muted)' }}>{plan.scenarios.length} scenarios — review, then run</span>
      </div>
      {plan.summary && <div style={{ color: 'var(--text-secondary)', marginBottom: 6 }}>{plan.summary}</div>}

      {plan.scenarios.map((s) => {
        const status = statuses[s.id];
        const blocked = s.runnable !== 'now';
        return (
          <label key={s.id} style={{ display: 'grid', gridTemplateColumns: '18px 1fr auto', gap: 8, alignItems: 'start', padding: '5px 0', borderTop: '1px solid var(--border)', opacity: blocked ? 0.7 : 1 }}>
            <input type="checkbox" checked={selected.has(s.id)} disabled={blocked || running} onChange={() => toggle(s.id)} aria-label={`Run ${s.name}`} />
            <div>
              <div>
                <span style={{ color: KIND_COLOR[s.kind], fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginRight: 6 }}>{s.kind}</span>
                <strong>{s.name}</strong>
                {blocked && <span style={{ marginLeft: 8, color: 'var(--accent-yellow, #d29922)' }}>needs a sandbox: it {s.writes ? 'writes data' : 'cannot run here'}</span>}
              </div>
              <div style={{ color: 'var(--text-secondary)' }}>{s.goal}</div>
              {s.expected && <div style={{ color: 'var(--text-muted)' }}>Expect: {s.expected}</div>}
            </div>
            <span style={{ whiteSpace: 'nowrap' }}>{status ? STATUS_LABEL[status] : ''}</span>
          </label>
        );
      })}

      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button
          onClick={() => onRun([...selected])}
          disabled={running || selected.size === 0}
          style={{ background: 'var(--accent-blue, #0969da)', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}
        >
          {running ? 'Running…' : `Run ${selected.size} selected`}
        </button>
        <button onClick={onDiscard} disabled={running} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)' }}>
          Discard plan
        </button>
      </div>
    </div>
  );
}
