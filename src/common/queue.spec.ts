import { PriorityQueue, RequestPriority } from "./queue";

describe("PriorityQueue", () => {
  it("dequeues items in priority order", () => {
    const queue = new PriorityQueue(10);

    // Enqueue but don't await (they'll pend until dequeued)
    queue.enqueue(RequestPriority.LOW, async () => "low");
    queue.enqueue(RequestPriority.HIGH, async () => "high");
    queue.enqueue(RequestPriority.MEDIUM, async () => "med");

    expect(queue.length).toBe(3);

    const first = queue.dequeue();
    const second = queue.dequeue();
    const third = queue.dequeue();

    expect(first!.priority).toBe(RequestPriority.HIGH);
    expect(second!.priority).toBe(RequestPriority.MEDIUM);
    expect(third!.priority).toBe(RequestPriority.LOW);
  });

  it("rejects when the queue is full", async () => {
    const queue = new PriorityQueue(2);
    queue.enqueue(RequestPriority.LOW, async () => "a");
    queue.enqueue(RequestPriority.LOW, async () => "b");

    await expect(
      queue.enqueue(RequestPriority.LOW, async () => "c"),
    ).rejects.toThrow("Request queue is full");
  });

  it("returns undefined when dequeuing from an empty queue", () => {
    const queue = new PriorityQueue();
    expect(queue.dequeue()).toBeUndefined();
  });
});
