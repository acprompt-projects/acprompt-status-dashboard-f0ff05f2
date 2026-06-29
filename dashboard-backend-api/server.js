const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const os = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(cors());
app.use(express.json());

const startTime = Date.now();

const agents = [
  { id: 'agent-orchestrator', name: 'Orchestrator', status: 'active', lastHeartbeat: Date.now() },
  { id: 'agent-scout-core', name: 'Scout Core', status: 'active', lastHeartbeat: Date.now() },
  { id: 'agent-builder', name: 'Builder', status: 'idle', lastHeartbeat: Date.now() - 15000 },
  { id: 'agent-reviewer', name: 'Reviewer', status: 'active', lastHeartbeat: Date.now() - 3000 },
  { id: 'agent-deployer', name: 'Deployer', status: 'error', lastHeartbeat: Date.now() - 120000 },
];

let metrics = {
  totalRequests: 14832,
  totalErrors: 47,
  avgLatencyMs: 142,
  p95LatencyMs: 387,
  p99LatencyMs: 612,
};

function getUptimeSeconds() {
  return Math.floor((Date.now() - startTime) / 1000);
}

function getSystemHealth() {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  return {
    uptimeSeconds: getUptimeSeconds(),
    hostname: os.hostname(),
    cpuCount: cpus.length,
    cpuModel: cpus[0]?.model || 'unknown',
    memoryTotalMb: Math.round(totalMem / 1024 / 1024),
    memoryUsedMb: Math.round((totalMem - freeMem) / 1024 / 1024),
    memoryUsagePercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
    loadAvg1m: os.loadavg()[0].toFixed(2),
  };
}

function getServices() {
  const now = Date.now();
  return [
    { name: 'API Gateway', status: 'healthy', uptimeSeconds: getUptimeSeconds(), latencyMs: 23, errorRate: 0.002 },
    { name: 'Agent Runtime', status: 'healthy', uptimeSeconds: getUptimeSeconds(), latencyMs: 87, errorRate: 0.008 },
    { name: 'Task Queue', status: 'degraded', uptimeSeconds: getUptimeSeconds(), latencyMs: 312, errorRate: 0.041 },
    { name: 'WebSocket Hub', status: 'healthy', uptimeSeconds: getUptimeSeconds(), latencyMs: 5, errorRate: 0.001 },
  ];
}

function getAgentStatuses() {
  const now = Date.now();
  agents.forEach(a => {
    if (a.status !== 'error' && now - a.lastHeartbeat > 60000) a.status = 'stale';
  });
  return agents.map(a => ({ ...a, heartbeatAgeMs: now - a.lastHeartbeat }));
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptimeSeconds: getUptimeSeconds(), timestamp: new Date().toISOString() });
});

app.get('/api/system', (_req, res) => {
  res.json(getSystemHealth());
});

app.get('/api/services', (_req, res) => {
  res.json(getServices());
});

app.get('/api/agents', (_req, res) => {
  res.json(getAgentStatuses());
});

app.get('/api/metrics', (_req, res) => {
  res.json({
    ...metrics,
    errorRate: (metrics.totalErrors / metrics.totalRequests).toFixed(4),
    requestsPerMinute: Math.round(metrics.totalRequests / (getUptimeSeconds() / 60 || 1)),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/dashboard', (_req, res) => {
  res.json({
    system: getSystemHealth(),
    services: getServices(),
    agents: getAgentStatuses(),
    metrics: { ...metrics, errorRate: (metrics.totalErrors / metrics.totalRequests).toFixed(4) },
    timestamp: new Date().toISOString(),
  });
});

function simulateUpdates() {
  metrics.totalRequests += Math.floor(Math.random() * 5);
  if (Math.random() < 0.05) metrics.totalErrors += 1;
  metrics.avgLatencyMs = Math.max(50, metrics.avgLatencyMs + Math.floor(Math.random() * 20 - 10));
  metrics.p95LatencyMs = Math.max(100, metrics.p95LatencyMs + Math.floor(Math.random() * 40 - 20));
  metrics.p99LatencyMs = Math.max(200, metrics.p99LatencyMs + Math.floor(Math.random() * 60 - 30));

  agents.forEach(a => {
    if (a.status !== 'error' && Math.random() < 0.3) {
      a.lastHeartbeat = Date.now();
      a.status = Math.random() < 0.15 ? 'idle' : 'active';
    }
  });
}

function broadcastUpdate() {
  simulateUpdates();
  const payload = JSON.stringify({
    type: 'dashboard-update',
    data: {
      system: getSystemHealth(),
      services: getServices(),
      agents: getAgentStatuses(),
      metrics: { ...metrics, errorRate: (metrics.totalErrors / metrics.totalRequests).toFixed(4) },
      timestamp: new Date().toISOString(),
    },
  });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(payload);
  });
}

setInterval(broadcastUpdate, 3000);

wss.on('connection', ws => {
  ws.send(JSON.stringify({
    type: 'connected',
    data: { message: 'ACP Dashboard real-time feed active', intervalMs: 3000 },
  }));
  ws.send(JSON.stringify({
    type: 'dashboard-update',
    data: {
      system: getSystemHealth(),
      services: getServices(),
      agents: getAgentStatuses(),
      metrics: { ...metrics, errorRate: (metrics.totalErrors / metrics.totalRequests).toFixed(4) },
      timestamp: new Date().toISOString(),
    },
  }));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`ACP Dashboard API running on http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
});