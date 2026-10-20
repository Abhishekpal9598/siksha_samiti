import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';

test('GET /api/v1/health returns 200 and valid health status', async () => {
  const server = app.listen(0); // random available port
  const port = server.address().port;

  try {
    const response = await fetch(`http://localhost:${port}/api/v1/health`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'Education Committee Competition API');
    assert.equal(typeof body.timestamp, 'string');
    assert.ok(response.headers.get('x-request-id'), 'X-Request-Id header must be present');
    assert.equal(body.requestId, response.headers.get('x-request-id'));
  } finally {
    server.close();
  }
});

test('GET /api/v1/non-existent returns 404 in standard error format', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://localhost:${port}/api/v1/non-existent`);
    assert.equal(response.status, 404);

    const body = await response.json();
    assert.ok(body.error, 'error object must be present');
    assert.equal(body.error.code, 'NOT_FOUND');
    assert.ok(body.error.message.includes('NOT_FOUND') || body.error.message.includes('not found'));
    assert.ok(body.error.requestId);
  } finally {
    server.close();
  }
});
