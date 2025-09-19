import { EventEmitter, EventEmitterOptions } from '../src/EventEmitter';

// Test event types
interface TestEvents {
  'user-created': { userId: string; name: string };
  'user-updated': { userId: string; changes: Record<string, any> };
  'user-deleted': { userId: string };
  'batch-operation': { operations: any[]; timestamp: Date };
}

// Helper function to create test callbacks
function createCallback<T>(): jest.MockedFunction<(payload: T) => void> {
  return jest.fn();
}

describe('EventEmitter', () => {
  let emitter: EventEmitter;
  let options: EventEmitterOptions;

  beforeEach(() => {
    options = {
      maxListeners: 10,
      asyncDelivery: false, // Use sync for easier testing
      errorHandler: jest.fn()
    };
    emitter = new EventEmitter(options);
  });

  describe('initialization', () => {
    it('should create an EventEmitter with default options', () => {
      const defaultEmitter = new EventEmitter();
      expect(defaultEmitter).toBeDefined();
    });

    it('should create an EventEmitter with custom options', () => {
      expect(emitter).toBeDefined();
    });
  });

  describe('event subscription', () => {
    it('should subscribe to an event and return a listener ID', () => {
      const callback = createCallback<TestEvents['user-created']>();
      const listenerId = emitter.on('user-created', callback);

      expect(typeof listenerId).toBe('string');
      expect(listenerId).toMatch(/^listener_\d+$/);
    });

    it('should subscribe to an event once', () => {
      const callback = createCallback<TestEvents['user-created']>();
      const listenerId = emitter.once('user-created', callback);

      expect(typeof listenerId).toBe('string');
    });

    it('should handle multiple subscriptions to the same event', () => {
      const callback1 = createCallback<TestEvents['user-created']>();
      const callback2 = createCallback<TestEvents['user-created']>();

      emitter.on('user-created', callback1);
      emitter.on('user-created', callback2);

      expect(emitter.listenerCount('user-created')).toBe(2);
    });

    it('should support event filtering', () => {
      const callback = createCallback<TestEvents['user-created']>();
      const filter = (payload: TestEvents['user-created']) => payload.userId === 'user1';

      emitter.on('user-created', callback, { filter });

      // Emit event that should be filtered out
      emitter.emit('user-created', { userId: 'user2', name: 'John' });
      expect(callback).not.toHaveBeenCalled();

      // Emit event that should pass filter
      emitter.emit('user-created', { userId: 'user1', name: 'Jane' });
      expect(callback).toHaveBeenCalledWith({ userId: 'user1', name: 'Jane' });
    });

    it('should support priority ordering', () => {
      const calls: string[] = [];

      const callback1 = createCallback<TestEvents['user-created']>();
      callback1.mockImplementation(() => calls.push('low'));

      const callback2 = createCallback<TestEvents['user-created']>();
      callback2.mockImplementation(() => calls.push('high'));

      emitter.on('user-created', callback1, { priority: 0 });
      emitter.on('user-created', callback2, { priority: 10 });

      emitter.emit('user-created', { userId: 'user1', name: 'Test' });

      expect(calls).toEqual(['high', 'low']);
    });

    it('should limit the number of listeners', () => {
      const smallEmitter = new EventEmitter({ maxListeners: 2 });

      smallEmitter.on('user-created', createCallback<TestEvents['user-created']>());
      smallEmitter.on('user-created', createCallback<TestEvents['user-created']>());

      // Mock console.warn to capture the warning
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      smallEmitter.on('user-created', createCallback<TestEvents['user-created']>());

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Maximum listeners (2) reached')
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('event emission', () => {
    it('should emit events to subscribed listeners', async () => {
      const callback = jest.fn();
      emitter.on('user-created', callback);

      const payload = { userId: 'user1', name: 'John' };
      await emitter.emit('user-created', payload);

      expect(callback).toHaveBeenCalledWith(payload);
    });

    it('should handle multiple listeners for the same event', async () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      emitter.on('user-created', callback1);
      emitter.on('user-created', callback2);

      const payload = { userId: 'user1', name: 'John' };
      await emitter.emit('user-created', payload);

      expect(callback1).toHaveBeenCalledWith(payload);
      expect(callback2).toHaveBeenCalledWith(payload);
    });

    it('should handle async listeners', async () => {
      const asyncCallback = jest.fn().mockResolvedValue(undefined);
      emitter.on('user-created', asyncCallback);

      const payload = { userId: 'user1', name: 'John' };
      await emitter.emit('user-created', payload);

      expect(asyncCallback).toHaveBeenCalledWith(payload);
    });

    it('should handle async delivery option', async () => {
      const asyncEmitter = new EventEmitter({ asyncDelivery: true });
      const callback1 = createCallback<TestEvents['user-created']>();
      const callback2 = createCallback<TestEvents['user-created']>();

      asyncEmitter.on('user-created', callback1);
      asyncEmitter.on('user-created', callback2);

      const payload = { userId: 'user1', name: 'John' };
      await asyncEmitter.emit('user-created', payload);

      expect(callback1).toHaveBeenCalledWith(payload);
      expect(callback2).toHaveBeenCalledWith(payload);
    });

    it('should handle once listeners', async () => {
      const callback = createCallback<TestEvents['user-created']>();
      emitter.once('user-created', callback);

      const payload = { userId: 'user1', name: 'John' };

      // First emission should trigger the listener
      await emitter.emit('user-created', payload);
      expect(callback).toHaveBeenCalledTimes(1);

      // Second emission should not trigger (listener removed)
      await emitter.emit('user-created', payload);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should handle errors in listeners', async () => {
      const errorCallback = createCallback<TestEvents['user-created']>();
      errorCallback.mockImplementation(() => {
        throw new Error('Test error');
      });
      const normalCallback = createCallback<TestEvents['user-created']>();

      const errorEmitter = new EventEmitter({
        errorHandler: options.errorHandler as any
      });

      errorEmitter.on('user-created', errorCallback);
      errorEmitter.on('user-created', normalCallback);

      const payload = { userId: 'user1', name: 'John' };
      await errorEmitter.emit('user-created', payload);

      expect(errorCallback).toHaveBeenCalledWith(payload);
      expect(normalCallback).toHaveBeenCalledWith(payload);
      expect(options.errorHandler).toHaveBeenCalledWith(
        expect.any(Error),
        'user-created',
        expect.any(Object)
      );
    });
  });

  describe('event unsubscription', () => {
    it('should unsubscribe a specific listener', () => {
      const callback1 = createCallback<TestEvents['user-created']>();
      const callback2 = createCallback<TestEvents['user-created']>();

      const listenerId1 = emitter.on('user-created', callback1);
      emitter.on('user-created', callback2);

      expect(emitter.listenerCount('user-created')).toBe(2);

      const removed = emitter.off('user-created', listenerId1);
      expect(removed).toBe(true);
      expect(emitter.listenerCount('user-created')).toBe(1);

      emitter.emit('user-created', { userId: 'user1', name: 'John' });
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should return false when trying to remove non-existent listener', () => {
      const removed = emitter.off('user-created', 'non-existent-id');
      expect(removed).toBe(false);
    });

    it('should unsubscribe all listeners for an event', () => {
      emitter.on('user-created', createCallback<TestEvents['user-created']>());
      emitter.on('user-created', createCallback<TestEvents['user-created']>());
      emitter.on('user-updated', createCallback<TestEvents['user-updated']>());

      expect(emitter.listenerCount('user-created')).toBe(2);
      expect(emitter.listenerCount('user-updated')).toBe(1);

      emitter.offAll('user-created');

      expect(emitter.listenerCount('user-created')).toBe(0);
      expect(emitter.listenerCount('user-updated')).toBe(1);
    });

    it('should unsubscribe all listeners for all events', () => {
      emitter.on('user-created', createCallback<TestEvents['user-created']>());
      emitter.on('user-updated', createCallback<TestEvents['user-updated']>());

      expect(emitter.listenerCount('user-created')).toBe(1);
      expect(emitter.listenerCount('user-updated')).toBe(1);

      emitter.offAll();

      expect(emitter.listenerCount('user-created')).toBe(0);
      expect(emitter.listenerCount('user-updated')).toBe(0);
    });
  });

  describe('event utilities', () => {
    it('should return the correct listener count', () => {
      expect(emitter.listenerCount('user-created')).toBe(0);

      emitter.on('user-created', jest.fn());
      emitter.on('user-created', jest.fn());

      expect(emitter.listenerCount('user-created')).toBe(2);
    });

    it('should return listener IDs', () => {
      const id1 = emitter.on('user-created', jest.fn());
      const id2 = emitter.on('user-created', jest.fn());

      const ids = emitter.getListenerIds('user-created');
      expect(ids).toHaveLength(2);
      expect(ids).toContain(id1);
      expect(ids).toContain(id2);
    });

    it('should return event names', () => {
      emitter.on('user-created', jest.fn());
      emitter.on('user-updated', jest.fn());

      const eventNames = emitter.eventNames();
      expect(eventNames).toHaveLength(2);
      expect(eventNames).toContain('user-created');
      expect(eventNames).toContain('user-updated');
    });

    it('should check if there are listeners for an event', () => {
      expect(emitter.hasListeners('user-created')).toBe(false);

      emitter.on('user-created', jest.fn());
      expect(emitter.hasListeners('user-created')).toBe(true);
    });
  });

  describe('waitFor method', () => {
    it('should wait for an event to be emitted', async () => {
      const payload = { userId: 'user1', name: 'John' };

      setTimeout(() => {
        emitter.emit('user-created', payload);
      }, 10);

      const result = await emitter.waitFor('user-created');
      expect(result).toEqual(payload);
    });

    it('should wait for an event with filter', async () => {
      const targetPayload = { userId: 'user1', name: 'John' };
      const otherPayload = { userId: 'user2', name: 'Jane' };

      setTimeout(() => {
        emitter.emit('user-created', otherPayload); // Should be filtered out
        emitter.emit('user-created', targetPayload); // Should pass filter
      }, 10);

      const result = await emitter.waitFor('user-created', {
        filter: (payload) => payload.userId === 'user1'
      });

      expect(result).toEqual(targetPayload);
    });

    it('should timeout when waiting for an event', async () => {
      const promise = emitter.waitFor('user-created', { timeout: 50 });

      await expect(promise).rejects.toThrow('Timeout waiting for event');
    });
  });
});
