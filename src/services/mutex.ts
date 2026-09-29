/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * An asynchronous Mutex lock to serialize concurrent async operations
 * across plugins and the main storage layer, guaranteeing thread safety.
 */
export class AsyncMutex {
  private mutex = Promise.resolve();

  /**
   * Acquire lock and execute the provided critical section task.
   */
  async lock<T>(task: () => Promise<T> | T): Promise<T> {
    let release: () => void = () => {};

    const lockPromise = new Promise<void>((resolve) => {
      release = resolve;
    });

    const currentMutex = this.mutex;
    this.mutex = currentMutex.then(() => lockPromise);

    await currentMutex;
    try {
      return await task();
    } finally {
      release();
    }
  }
}
