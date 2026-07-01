===
module.exports = {
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS, 10) || 15000,
  dashboardApiUrl: process.env.DASHBOARD_API_URL || 'http://localhost:3000/api/health-results',
  requestTimeoutMs: 5000,
  services: [
    { id: 'auth-service', name: 'Auth Service', url: process.env.AUTH_SERVICE_URL || 'http://localhost:3001/health' },
    { id: 'task-service', name: 'Task Service', url: process.env.TASK_SERVICE_URL || 'http://localhost:3002/health' },
    { id: 'collab-service', name: 'Collaborator Service', url: process.env.COLLAB_SERVICE_URL || 'http://localhost:3003/health' },
    { id: 'dashboard-api', name: 'Dashboard API', url: process.env.DASHBOARD_API_HEALTH_URL || 'http://localhost:3000/health' },
  ],
};
===