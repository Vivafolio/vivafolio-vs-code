/**
 * Advanced Event Emitter for pub/sub pattern with filtering and async support
 */
export interface EventListener<T = any> {
  id: string;
  callback: (payload: T) => void | Promise<void>;
  filter?: (payload: T) => boolean;
  priority?: number;
  once?: boolean;
}

export interface EventEmitterOptions {
  maxListeners?: number;
  asyncDelivery?: boolean;
  errorHandler?: (error: Error, eventName: string, listener: EventListener) => void;
}

export class EventEmitter {
  private listeners: Map<string, EventListener[]> = new Map();
  private options: Required<EventEmitterOptions>;
  private listenerIdCounter = 0;

  constructor(options: EventEmitterOptions = {}) {
    this.options = {
      maxListeners: options.maxListeners ?? 10,
      asyncDelivery: options.asyncDelivery ?? true,
      errorHandler: options.errorHandler ?? this.defaultErrorHandler
    };
  }

  /**
   * Subscribe to an event with optional filtering
   */
  on<T = any>(
    event: string,
    callback: (payload: T) => void | Promise<void>,
    options: {
      filter?: (payload: T) => boolean;
      priority?: number;
      once?: boolean;
    } = {}
  ): string {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    const listeners = this.listeners.get(event)!;

    if (listeners.length >= this.options.maxListeners) {
      console.warn(`EventEmitter: Maximum listeners (${this.options.maxListeners}) reached for event '${event}'`);
    }

    const listener: EventListener<T> = {
      id: `listener_${++this.listenerIdCounter}`,
      callback,
      filter: options.filter,
      priority: options.priority ?? 0,
      once: options.once ?? false
    };

    // Insert listener in priority order (higher priority first)
    const insertIndex = listeners.findIndex(l => (l.priority ?? 0) < (listener.priority ?? 0));
    if (insertIndex === -1) {
      listeners.push(listener);
    } else {
      listeners.splice(insertIndex, 0, listener);
    }

    return listener.id;
  }

  /**
   * Subscribe to an event once
   */
  once<T = any>(
    event: string,
    callback: (payload: T) => void | Promise<void>,
    options: {
      filter?: (payload: T) => boolean;
      priority?: number;
    } = {}
  ): string {
    return this.on(event, callback, { ...options, once: true });
  }

  /**
   * Unsubscribe from an event
   */
  off(event: string, listenerId: string): boolean {
    const listeners = this.listeners.get(event);
    if (!listeners) return false;

    const index = listeners.findIndex(l => l.id === listenerId);
    if (index === -1) return false;

    listeners.splice(index, 1);
    return true;
  }

  /**
   * Unsubscribe all listeners for an event
   */
  offAll(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get the number of listeners for an event
   */
  listenerCount(event: string): number {
    return this.listeners.get(event)?.length ?? 0;
  }

  /**
   * Get all listener IDs for an event
   */
  getListenerIds(event: string): string[] {
    return this.listeners.get(event)?.map(l => l.id) ?? [];
  }

  /**
   * Emit an event to all matching listeners
   */
  async emit<T = any>(event: string, payload: T): Promise<void> {
    const listeners = this.listeners.get(event);
    if (!listeners || listeners.length === 0) {
      return;
    }

    // Filter listeners and collect those that should be removed (once listeners)
    const activeListeners: EventListener<T>[] = [];
    const toRemove: EventListener<T>[] = [];

    for (const listener of listeners) {
      // Check filter if provided
      if (listener.filter && !listener.filter(payload)) {
        continue;
      }

      activeListeners.push(listener);

      // Mark once listeners for removal
      if (listener.once) {
        toRemove.push(listener);
      }
    }

    if (activeListeners.length === 0) {
      return;
    }

    // Deliver events
    if (this.options.asyncDelivery) {
      await this.deliverAsync(activeListeners, payload, event);
    } else {
      this.deliverSync(activeListeners, payload, event);
    }

    // Remove once listeners
    for (const listener of toRemove) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Wait for an event to be emitted with optional timeout
   */
  waitFor<T = any>(
    event: string,
    options: {
      filter?: (payload: T) => boolean;
      timeout?: number;
    } = {}
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | undefined;

      const listenerId = this.once(event, (payload) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        resolve(payload);
      }, {
        filter: options.filter
      });

      if (options.timeout) {
        timeoutId = setTimeout(() => {
          this.off(event, listenerId);
          reject(new Error(`Timeout waiting for event '${event}'`));
        }, options.timeout);
      }
    });
  }

  /**
   * Get event names that have listeners
   */
  eventNames(): string[] {
    return Array.from(this.listeners.keys());
  }

  /**
   * Check if there are listeners for an event
   */
  hasListeners(event: string): boolean {
    return this.listenerCount(event) > 0;
  }

  private async deliverAsync<T>(
    listeners: EventListener<T>[],
    payload: T,
    event: string
  ): Promise<void> {
    const promises = listeners.map(async (listener) => {
      try {
        await listener.callback(payload);
      } catch (error) {
        this.options.errorHandler(error as Error, event, listener);
      }
    });

    await Promise.allSettled(promises);
  }

  private deliverSync<T>(
    listeners: EventListener<T>[],
    payload: T,
    event: string
  ): void {
    for (const listener of listeners) {
      try {
        const result = listener.callback(payload);
        // Handle promise rejections in sync mode
        if (result && typeof result.catch === 'function') {
          result.catch((error: Error) => {
            this.options.errorHandler(error, event, listener);
          });
        }
      } catch (error) {
        this.options.errorHandler(error as Error, event, listener);
      }
    }
  }

  private defaultErrorHandler(error: Error, eventName: string, listener: EventListener): void {
    console.error(`EventEmitter: Error in listener for event '${eventName}':`, error);
  }
}
