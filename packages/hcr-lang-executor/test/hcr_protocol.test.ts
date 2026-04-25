import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';
import { ContentLengthTransport } from '../src/index';

const PROVIDER_SCRIPT = path.join(__dirname, '..', 'providers', 'python_hcr_provider.py');

/**
 * Helper: spawn the Python HCR provider as a child process and return
 * a transport-wrapped read/write interface.
 */
function spawnProvider(): {
  proc: ChildProcess;
  transport: ContentLengthTransport;
  send: (msg: object) => void;
  waitForMessage: (timeoutMs?: number) => Promise<any>;
  cleanup: () => void;
} {
  const proc = spawn('python3', ['-u', PROVIDER_SCRIPT], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const transport = new ContentLengthTransport();

  proc.stdout!.on('data', (data: Buffer) => {
    transport.feed(data);
  });

  const messageQueue: any[] = [];
  const waiters: Array<(msg: any) => void> = [];

  transport.on('message', (msg: any) => {
    const waiter = waiters.shift();
    if (waiter) {
      waiter(msg);
    } else {
      messageQueue.push(msg);
    }
  });

  function send(msg: object): void {
    const encoded = ContentLengthTransport.encode(msg);
    proc.stdin!.write(encoded);
  }

  function waitForMessage(timeoutMs = 5000): Promise<any> {
    const queued = messageQueue.shift();
    if (queued) return Promise.resolve(queued);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = waiters.indexOf(resolve);
        if (idx !== -1) waiters.splice(idx, 1);
        reject(new Error('Timed out waiting for message'));
      }, timeoutMs);

      waiters.push((msg: any) => {
        clearTimeout(timer);
        resolve(msg);
      });
    });
  }

  function cleanup(): void {
    proc.stdin!.end();
    proc.kill();
  }

  return { proc, transport, send, waitForMessage, cleanup };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Python HCR Provider protocol', () => {
  let provider: ReturnType<typeof spawnProvider>;

  beforeEach(() => {
    provider = spawnProvider();
  });

  afterEach(() => {
    provider.cleanup();
  });

  it('responds to hcr/capabilities with Python capabilities', async () => {
    provider.send({
      jsonrpc: '2.0',
      id: 1,
      method: 'hcr/capabilities',
      params: {}
    });

    const response = await provider.waitForMessage();

    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(1);
    expect(response.result).toBeDefined();
    expect(response.result.supportedLanguages).toContain('python');
    expect(response.result.providerType).toBe('python-importlib');
    expect(response.result.supportsPartialReload).toBe(true);
    expect(typeof response.result.maxConcurrentReloads).toBe('number');
  });

  it('accepts hcr/reload and sends hcr/patchApplied notification', async () => {
    // First negotiate capabilities
    provider.send({
      jsonrpc: '2.0',
      id: 1,
      method: 'hcr/capabilities',
      params: {}
    });
    await provider.waitForMessage(); // consume capabilities response

    // Send reload request for a non-existent module (should still succeed
    // with a synthetic patched-functions entry)
    provider.send({
      jsonrpc: '2.0',
      id: 2,
      method: 'hcr/reload',
      params: {
        changedFiles: [
          { uri: 'file:///tmp/test_module.py', version: 1 }
        ]
      }
    });

    // First message: the reload acknowledgment response
    const ack = await provider.waitForMessage();
    expect(ack.jsonrpc).toBe('2.0');
    expect(ack.id).toBe(2);
    expect(ack.result).toBeDefined();
    expect(ack.result.accepted).toBe(true);

    // Second message: the patchApplied notification
    const notification = await provider.waitForMessage();
    expect(notification.jsonrpc).toBe('2.0');
    expect(notification.method).toBe('hcr/patchApplied');
    expect(notification.params).toBeDefined();
    expect(notification.params.requestId).toBe(2);
    expect(Array.isArray(notification.params.patchedFunctions)).toBe(true);
    expect(typeof notification.params.timestamp).toBe('string');
  });

  it('responds to hcr/status with idle state', async () => {
    provider.send({
      jsonrpc: '2.0',
      id: 1,
      method: 'hcr/status',
      params: {}
    });

    const response = await provider.waitForMessage();

    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(1);
    expect(response.result.state).toBe('idle');
    expect(response.result.appliedPatches).toBe(0);
  });

  it('returns error for unknown method', async () => {
    provider.send({
      jsonrpc: '2.0',
      id: 99,
      method: 'hcr/nonexistent',
      params: {}
    });

    const response = await provider.waitForMessage();

    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(99);
    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32601);
  });
});
