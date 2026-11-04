'use strict';

/**
 * Keyed async mutex for synchronizing critical sections per resource key (e.g., materielId).
 * Ensures sequential execution of concurrent operations on the same resource without race conditions.
 */
class KeyedMutex {
  constructor() {
    this.chains = new Map();
  }

  /**
   * Executes an async task function with an exclusive lock on the specified resource key.
   * @param {string|object} key Resource identifier
   * @param {Function} task Async function returning a promise
   * @returns {Promise<any>}
   */
  async withLock(key, task) {
    const k = String(key);
    const prev = this.chains.get(k) || Promise.resolve();

    let release;
    const current = new Promise((resolve) => {
      release = resolve;
    });

    const tail = prev.then(async () => {
      try {
        return await task();
      } finally {
        release();
      }
    });

    this.chains.set(k, tail.catch(() => {}));

    try {
      return await tail;
    } finally {
      if (this.chains.get(k) === tail.catch(() => {})) {
        this.chains.delete(k);
      }
    }
  }
}

const defaultMutex = new KeyedMutex();

module.exports = {
  KeyedMutex,
  withLock: (key, task) => defaultMutex.withLock(key, task),
};
