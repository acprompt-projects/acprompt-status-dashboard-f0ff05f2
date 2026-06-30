import React from 'react';
import useWebSocket from './hooks/useWebSocket';

const WS_URL = `ws://${window.location.hostname}:3001`;

function StatusDot({ ok }) {
  return (
    <span style={{
      display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
      background: ok ? '#22c55e' : '#ef4444', marginRight: 8, boxShadow: `0 0 6px ${ok ? '#22c55e' : '#ef4444'}`,
    }} />
  );
}

function Sparkline({ points = [], width = 100, height = 28 }) {
  if (!points.length) return <span style={{ color: '#666', fontSize: 12 }}>no data</span>;
  const max = Math.max(...points, 1);
  const step = width / (points.length - 1 || 1);
  const coords = points.map((v, i) => `${i * step},${height - (v / max) * (height - 4) - 2}`);
  const pathD = `M${coords.join(' L')}`;
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <path d={pathD} fill="none" stroke="#38bdf8" strokeWidth="1.5" />
    </svg>
  );
}

function ServiceCard({ service }) {
  const latency = service.latencyHistory || [];
  const latest = latency.length ? latency[latency.length - 1] : null;
  return (
    <div style={{
      background: '#1e293b', borderRadius: 8, padding: 16, minWidth: 220,
      border: `1px solid ${service.healthy ? '#334155' : '#7f1d1d'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <StatusDot ok={service.healthy} />
        <strong style={{ color: '#f1f5f9' }}>{service.name}</strong>
      </div>
      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
        Latency: <span style={{ color: latest && latest > 500 ? '#f87171' : '#4ade80' }}>{latest != null ? `${latest}ms` : '—'}</span>
      </div>
      <Sparkline points={latency} />
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
        Uptime: {service.uptime ?? '—'}%
      </div>
    </div>
  );
}

function ActivityFeed({ items }) {
  return (
    <div style={{ background: '#1e293b', borderRadius: 8, padding: 16, maxHeight: 320, overflowY: 'auto' }}>
      <h3 style={{ margin: '0 0 10px', color: '#e2e8f0', fontSize: 14 }}>Agent Activity</h3>
      {items.length === 0 && <div style={{ color: '#64748b', fontSize: 12 }}>No activity yet</div>}
      {items.map((a, i) => (
        <div key={a.id ?? i} style={{ padding: '6px 0', borderBottom: '1px solid #334155', fontSize: 12 }}>
          <span style={{ color: '#38bdf8', fontWeight: 600 }}>{a.agent}</span>
          <span style={{ color: '#94a3b8' }}> {a.action} </span>
          <span style={{ color: '#64748b' }}>{a.target}</span>
          <span style={{ float: 'right', color: '#475569' }}>{new Date(a.timestamp).toLocaleTimeString()}</span>
        </div>
      ))}
    </div>
  );
}

function IncidentTimeline({ incidents }) {
  const severityColor = { critical: '#ef4444', warning: '#f59e0b', info: '#38bdf8' };
  return (
    <div style={{ background: '#1e293b', borderRadius: 8, padding: 16, maxHeight: 320, overflowY: 'auto' }}>
      <h3 style={{ margin: '0 0 10px', color: '#e2e8f0', fontSize: 14 }}>Incidents</h3>
      {incidents.length === 0 && <div style={{ color: '#64748b', fontSize: 12 }}>All clear 🎉</div>}
      {incidents.map((inc, i) => (
        <div key={inc.id ?? i} style={{
          padding: '8px 10px', marginBottom: 6, borderRadius: 4,
          borderLeft: `3px solid ${severityColor[inc.severity] || '#64748b'}`,
          background: '#0f172a', fontSize: 12,
        }}>
          <div style={{ color: '#f1f5f9', fontWeight: 600 }}>{inc.title}</div>
          <div style={{ color: '#94a3b8', marginTop: 2 }}>{inc.description}</div>
          <div style={{ color: '#475569', marginTop: 4 }}>
            {inc.severity} · {new Date(inc.timestamp).toLocaleString()}
            {inc.resolved && <span style={{ color: '#22c55e', marginLeft: 8 }}>✔ Resolved</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { data, status } = useWebSocket(WS_URL);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', background: '#0f172a', color: '#e2e8f0', minHeight: '100vh', padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>⚡ ACPrompt Status</h1>
        <span style={{
          fontSize: 12, padding: '4px 10px', borderRadius: 12, fontWeight: 600,
          background: status === 'connected' ? '#14532d' : '#7f1d1d',
          color: status === 'connected' ? '#4ade80' : '#fca5a5',
        }}>
          {status.toUpperCase()}
        </span>
      </header>

      <section style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        {data.services.map((s) => <ServiceCard key={s.id} service={s} />)}
        {data.services.length === 0 && <div style={{ color: '#64748b', fontSize: 14 }}>Waiting for service data…</div>}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <ActivityFeed items={data.activity} />
        <IncidentTimeline incidents={data.incidents} />
      </section>
    </div>
  );
}