const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const controller = fs.readFileSync(
  path.join(ROOT, 'assets/js/controllers/admin/admin-cadu.controller.js'),
  'utf8'
);

function extractFunction(name) {
  const start = controller.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found`);
  const bodyStart = controller.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < controller.length; index += 1) {
    if (controller[index] === '{') depth += 1;
    if (controller[index] === '}') depth -= 1;
    if (depth === 0) {
      return Function(`"use strict"; return (${controller.slice(start, index + 1)});`)();
    }
  }
  throw new Error(`function ${name} is incomplete`);
}

describe('Cadu pipeline header authentication contract', () => {
  const splitSSEBuffer = extractFunction('splitSSEBuffer');
  const parseSSEBlock = extractFunction('parseSSEBlock');

  test('admin credentials are never added to browser URLs', () => {
    expect(controller).not.toContain('buildCaduUrlForBrowser');
    expect(controller).not.toContain('kc_admin_token');
    expect(controller).not.toMatch(/[?&]token=/);
    expect(controller).not.toContain('new EventSource');
    expect(controller).toContain("headers.Authorization = 'Bearer ' + adminToken");
    expect(controller).toContain("headers.Authorization = 'Bearer ' + cfg.token");
  });

  test('streaming uses abortable fetch and falls back to authenticated polling', () => {
    const start = controller.indexOf('async function connectPipelineStream(');
    const end = controller.indexOf('\n  function splitSSEBuffer(', start);
    const implementation = controller.slice(start, end);
    expect(implementation).toContain('new AbortController()');
    expect(implementation).toContain('await caduFetchRaw(path');
    expect(implementation).toContain("'Accept': 'text/event-stream'");
    expect(implementation).toContain('res.body.getReader()');
    expect(implementation).toContain('connectPipelineLogPolling(runId)');
    expect(implementation).toContain('buffer.length > 512 * 1024');
    expect(implementation).toContain('pipelineStreamRequest !== request');
    expect(implementation).toContain('parsed.blocks[i].length > 512 * 1024');
  });

  test('polling rejects overlapping and stale responses', () => {
    expect(controller).toContain('var pipelineLogPollState = null;');
    expect(controller).toContain('pipelineLogPollState !== pollState || pollState.inFlight');
    expect(controller).toContain('if (pipelineLogPollState !== pollState) return;');
    expect(controller).toContain('if (pipelineLogPollState === pollState) pollState.inFlight = false;');
  });

  test.each(['api/cadu/pipeline.js', 'api/cadu/pipeline-router.js'])(
    '%s aborts the upstream SSE when the browser disconnects',
    (relativePath) => {
      const proxy = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
      expect(proxy).toContain('const upstreamController = new AbortController();');
      expect(proxy).toContain("req.once('aborted', abortUpstream)");
      expect(proxy).toContain("res.once('close', abortUpstream)");
      expect(proxy).toContain('signal: upstreamController.signal');
      expect(proxy).toContain('await reader.cancel()');
      expect(proxy).toContain('if (!res.writableEnded && !res.destroyed) res.end()');
    }
  );

  test('log download uses an authenticated fetch and a local Blob', () => {
    const start = controller.indexOf('async function downloadRunLog(');
    const end = controller.indexOf('\n  function downloadRunExport(', start);
    const implementation = controller.slice(start, end);
    expect(implementation).toContain('await caduFetchRaw(path');
    expect(implementation).toContain('await res.blob()');
    expect(implementation).toContain('URL.createObjectURL(blob)');
    expect(implementation).not.toContain('window.open');
  });

  test('SSE parser handles CRLF frames and preserves incomplete data', () => {
    const firstChunk = splitSSEBuffer('event: log\r');
    expect(firstChunk.blocks).toEqual([]);
    expect(firstChunk.remainder).toBe('event: log\r');

    const parsed = splitSSEBuffer(firstChunk.remainder +
      '\ndata: {"line":"primeira"}\r\n\r\nevent: done\ndata: {"status":"finished"}');
    expect(parsed.blocks).toEqual(['event: log\ndata: {"line":"primeira"}']);
    expect(parsed.remainder).toBe('event: done\ndata: {"status":"finished"}');
    expect(parseSSEBlock(parsed.blocks[0])).toEqual({
      type: 'log',
      data: { line: 'primeira' }
    });
    expect(parseSSEBlock(':keepalive')).toBeNull();
    expect(parseSSEBlock('event: log\ndata: {invalid}')).toBeNull();
  });
});
