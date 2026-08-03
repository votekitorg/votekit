import { describe, expect, it } from 'vitest';
import { SerialTaskQueue } from '@/lib/serial-task-queue';

describe('SerialTaskQueue', () => {
  it('runs rapid saves in the order they were queued', async () => {
    const queue = new SerialTaskQueue();
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });

    const first = queue.enqueue(async () => {
      events.push('first-start');
      await firstGate;
      events.push('first-end');
    });
    const second = queue.enqueue(async () => { events.push('second'); });
    const third = queue.enqueue(async () => { events.push('third'); });

    await Promise.resolve();
    expect(events).toEqual(['first-start']);
    releaseFirst();
    await Promise.all([first, second, third]);
    expect(events).toEqual(['first-start', 'first-end', 'second', 'third']);
  });

  it('continues after a failed save', async () => {
    const queue = new SerialTaskQueue();
    const failed = queue.enqueue(async () => { throw new Error('network'); });
    const recovered = queue.enqueue(async () => 'saved');

    await expect(failed).rejects.toThrow('network');
    await expect(recovered).resolves.toBe('saved');
  });
});
