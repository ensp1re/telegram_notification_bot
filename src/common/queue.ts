export enum RequestPriority {
  HIGH = 0,
  MEDIUM = 1,
  LOW = 2,
}

export interface QueuedRequest<T = unknown> {
  priority: RequestPriority;
  timestamp: number;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

export class PriorityQueue {
  private items: QueuedRequest[] = [];
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  enqueue<T>(
    priority: RequestPriority,
    execute: () => Promise<T>,
  ): Promise<T> {
    if (this.items.length >= this.maxSize) {
      return Promise.reject(new Error("Request queue is full"));
    }

    return new Promise<T>((resolve, reject) => {
      const request: QueuedRequest<T> = {
        priority,
        timestamp: Date.now(),
        execute,
        resolve: resolve as (value: unknown) => void,
        reject,
      };

      let insertIdx = this.items.length;
      for (let i = 0; i < this.items.length; i++) {
        if (
          priority < this.items[i].priority ||
          (priority === this.items[i].priority &&
            request.timestamp < this.items[i].timestamp)
        ) {
          insertIdx = i;
          break;
        }
      }
      this.items.splice(insertIdx, 0, request as QueuedRequest);
    });
  }

  dequeue(): QueuedRequest | undefined {
    return this.items.shift();
  }

  get length(): number {
    return this.items.length;
  }

  get isFull(): boolean {
    return this.items.length >= this.maxSize;
  }
}
