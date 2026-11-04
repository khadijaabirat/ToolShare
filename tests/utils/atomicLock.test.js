'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { KeyedMutex, withLock } = require('../../src/utils/atomicLock');

describe('KeyedMutex & withLock (TOOL-38, TOOL-39)', () => {
  test('executes tasks on the same key sequentially', async () => {
    const mutex = new KeyedMutex();
    const log = [];

    const task1 = mutex.withLock('key1', async () => {
      log.push('start1');
      await new Promise((r) => setTimeout(r, 20));
      log.push('end1');
      return 'res1';
    });

    const task2 = mutex.withLock('key1', async () => {
      log.push('start2');
      await new Promise((r) => setTimeout(r, 10));
      log.push('end2');
      return 'res2';
    });

    const results = await Promise.all([task1, task2]);
    assert.deepEqual(results, ['res1', 'res2']);
    assert.deepEqual(log, ['start1', 'end1', 'start2', 'end2']);
  });

  test('executes tasks on different keys concurrently without blocking', async () => {
    const mutex = new KeyedMutex();
    const log = [];

    const taskA = mutex.withLock('keyA', async () => {
      log.push('startA');
      await new Promise((r) => setTimeout(r, 20));
      log.push('endA');
    });

    const taskB = mutex.withLock('keyB', async () => {
      log.push('startB');
      await new Promise((r) => setTimeout(r, 5));
      log.push('endB');
    });

    await Promise.all([taskA, taskB]);
    // taskB should finish before taskA because it runs concurrently on a different key
    assert.ok(log.indexOf('endB') < log.indexOf('endA'));
  });

  test('lock is released and does not deadlock even when a task throws an error', async () => {
    const mutex = new KeyedMutex();

    await assert.rejects(
      () =>
        mutex.withLock('keyError', async () => {
          throw new Error('boom');
        }),
      /boom/
    );

    // Next task on same key should succeed normally
    const result = await mutex.withLock('keyError', async () => 'recovered');
    assert.equal(result, 'recovered');
  });

  test('default withLock export works as expected', async () => {
    const res = await withLock('defaultKey', async () => 42);
    assert.equal(res, 42);
  });
});
