===
const http = require('http');
const https = require('https');
const config = require('./config');

const errorCounts = {};
config.services.forEach(s => { errorCounts[s.id] = 0; });

function pingService(service) {
  return new Promise((resolve) => {
    const start = Date.now();
    const url = new URL(service.url);
    const lib = url.protocol === 'https:' ? https : http;
    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      timeout: config.requestTimeoutMs,
    };

    const req = lib.request(opts, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        const latency = Date.now() - start;
        const isUp = res.statusCode >= 200 && res.statusCode < 400;
        if (!isUp) errorCounts[service.id]++;
        resolve({
          serviceId: service.id,
          serviceName: service.name,
          status: isUp ? 'up' : 'degraded',
          statusCode: res.statusCode,
          latencyMs: latency,
          errorCount: errorCounts[service.id],
          checkedAt: new Date().toISOString(),
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      errorCounts[service.id]++;
      resolve({
        serviceId: service.id,
        serviceName: service.name,
        status: 'down',
        statusCode: null,
        latencyMs: config.requestTimeoutMs,
        errorCount: errorCounts[service.id],
        checkedAt: new Date().toISOString(),
        error: 'timeout',
      });
    });

    req.on('error', (err) => {
      errorCounts[service.id]++;
      resolve({
        serviceId: service.id,
        serviceName: service.name,
        status: 'down',
        statusCode: null,
        latencyMs: Date.now() - start,
        errorCount: errorCounts[service.id],
        checkedAt: new Date().toISOString(),
        error: err.code || err.message,
      });
    });

    req.end();
  });
}

function pushToDashboard(results) {
  const payload = JSON.stringify({ agent: 'health-check-agent', timestamp: new Date().toISOString(), results });
  const url = new URL(config.dashboardApiUrl);
  const lib = url.protocol === 'https:' ? https : http;
  const opts = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    timeout: config.requestTimeoutMs,
  };

  return new Promise((resolve) => {
    const req = lib.request(opts, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(payload);
    req.end();
  });
}

async function runCheckCycle() {
  const checks = config.services.map(svc => pingService(svc));
  const results = await Promise.all(checks);
  const status = pushToDashboard(results);
  const code = await status;
  const summary = results.map(r => `${r.serviceId}=${r.status}(${r.latencyMs}ms)`).join(' ');
  console.log(`[${new Date().toISOString()}] cycle complete | ${summary} | push=${code || 'failed'}`);
}

function start() {
  console.log(`health-check-agent starting | interval=${config.pollIntervalMs}ms | services=${config.services.map(s=>s.id).join(',')}`);
  runCheckCycle();
  const timer = setInterval(runCheckCycle, config.pollIntervalMs);
  const shutdown = () => { clearInterval(timer); console.log('health-check-agent stopped'); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
===