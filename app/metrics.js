const http = require('node:http');
const client = require('prom-client');

const registry = new client.Registry();
registry.setDefaultLabels({ app: 'esport-club' });
client.collectDefaultMetrics({ register: registry });

const requests = new client.Counter({
  name: 'club_http_requests_total',
  help: 'Total completed HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [registry]
});

const duration = new client.Histogram({
  name: 'club_http_request_duration_seconds',
  help: 'HTTP response duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry]
});

function normalizeRoute(url) {
  const path = String(url || '').split('?')[0];

  const fixed = [
    '/', '/login', '/logout', '/health',
    '/members', '/members/new',
    '/activities', '/activities/new',
    '/contributions', '/meetings', '/meetings/new'
  ];
  if (fixed.includes(path)) return path;

  if (/^\/members\/[1-9][0-9]*\/edit$/.test(path)) {
    return '/members/:id/edit';
  }
  if (/^\/activities\/[1-9][0-9]*\/edit$/.test(path)) {
    return '/activities/:id/edit';
  }
  if (/^\/activities\/[1-9][0-9]*\/participants$/.test(path)) {
    return '/activities/:id/participants';
  }
  if (/^\/meetings\/[1-9][0-9]*\/edit$/.test(path)) {
    return '/meetings/:id/edit';
  }
  return 'other';
}

module.exports = function observeRequest(req, res) {
  const started = process.hrtime.bigint();
  const route = normalizeRoute(req.url);
  const method = ['GET', 'POST', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE']
    .includes(req.method) ? req.method : 'OTHER';

  res.once('finish', () => {
    const labels = {
      method,
      route,
      status: String(res.statusCode)
    };
    const seconds = Number(process.hrtime.bigint() - started) / 1e9;
    requests.inc(labels);
    duration.observe(labels, seconds);
  });
};

const metricsServer = http.createServer(async (req, res) => {
  if (req.method !== 'GET' || req.url !== '/metrics') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  try {
    const body = await registry.metrics();
    res.writeHead(200, {
      'Content-Type': registry.contentType,
      'Cache-Control': 'no-store'
    });
    res.end(body);
  } catch (err) {
    console.error('METRICS_ERROR', err.code || err.name);
    res.writeHead(500);
    res.end('Cannot collect metrics');
  }
});

metricsServer.on('error', err => {
  console.error('METRICS_SERVER_ERROR', err.code || err.name);
});

metricsServer.listen(9464, '0.0.0.0', () => {
  console.log('Metrics listening on internal port 9464');
});
