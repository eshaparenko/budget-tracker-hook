/**
 * Cost Tracker Tests
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CostTracker } from '../services/CostTracker';

// Passthrough by default; individual tests override writeFileSync to simulate a
// read-only filesystem. Mocked at module level because CostTracker holds its own
// reference to `fs`, so spying on the test's copy would not affect it.
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return { ...actual, writeFileSync: jest.fn(actual.writeFileSync) };
});
const realFs: typeof fs = jest.requireActual('fs');
const writeFileSync = fs.writeFileSync as unknown as jest.Mock;

describe('CostTracker', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker();
    tracker.resetCosts();
  });

  describe('recordCost', () => {
    it('should record a cost for Gemini provider', () => {
      const cost = tracker.recordCost('gemini', 'gemini-flash-lite-latest', 100, 50);

      expect(cost.provider).toBe('gemini');
      expect(cost.model).toBe('gemini-flash-lite-latest');
      expect(cost.inputTokens).toBe(100);
      expect(cost.outputTokens).toBe(50);
      expect(cost.totalTokens).toBe(150);
      expect(cost.costUSD).toBeGreaterThan(0);
    });

    it('should record a cost for Claude provider', () => {
      const cost = tracker.recordCost('claude', 'claude-3-5-haiku', 200, 100);

      expect(cost.provider).toBe('claude');
      expect(cost.model).toBe('claude-3-5-haiku');
      expect(cost.costUSD).toBeGreaterThan(0);
    });

    it('should record a cost for OpenAI provider', () => {
      const cost = tracker.recordCost('openai', 'gpt-3.5-turbo', 150, 75);

      expect(cost.provider).toBe('openai');
      expect(cost.model).toBe('gpt-3.5-turbo');
      expect(cost.costUSD).toBeGreaterThan(0);
    });

    it('should have zero cost for unknown provider/model', () => {
      const cost = tracker.recordCost('unknown', 'unknown-model', 100, 50);

      expect(cost.costUSD).toBe(0);
    });
  });

  describe('getTotalCost', () => {
    it('should return 0 for no recorded costs', () => {
      expect(tracker.getTotalCost()).toBe(0);
    });

    it('should accumulate costs across multiple calls', () => {
      tracker.recordCost('gemini', 'gemini-flash-lite-latest', 100, 50);
      tracker.recordCost('claude', 'claude-3-5-haiku', 200, 100);

      const total = tracker.getTotalCost();
      expect(total).toBeGreaterThan(0);
    });
  });

  describe('getCostsByProvider', () => {
    it('should group costs by provider', () => {
      tracker.recordCost('gemini', 'gemini-flash-lite-latest', 100, 50);
      tracker.recordCost('gemini', 'gemini-flash-lite-latest', 100, 50);
      tracker.recordCost('claude', 'claude-3-5-haiku', 200, 100);

      const costs = tracker.getCostsByProvider();

      expect(costs['gemini']).toBeGreaterThan(0);
      expect(costs['claude']).toBeGreaterThan(0);
      expect(costs['gemini']).toBeLessThan(costs['claude']); // Gemini is cheaper
    });
  });

  describe('getCostsByModel', () => {
    it('should group costs by model', () => {
      tracker.recordCost('gemini', 'gemini-flash-lite-latest', 100, 50);
      tracker.recordCost('gemini', 'gemini-pro', 100, 50);
      tracker.recordCost('claude', 'claude-3-5-haiku', 200, 100);

      const costs = tracker.getCostsByModel();

      expect(costs['gemini/gemini-flash-lite-latest']).toBeGreaterThan(0);
      expect(costs['gemini/gemini-pro']).toBeGreaterThan(0);
      expect(costs['claude/claude-3-5-haiku']).toBeGreaterThan(0);
    });
  });

  describe('getSummary', () => {
    it('should return summary with zero values when no costs', () => {
      const summary = tracker.getSummary();

      expect(summary.totalCostUSD).toBe(0);
      expect(summary.totalCalls).toBe(0);
      expect(summary.totalTokens).toBe(0);
      expect(summary.avgTokensPerCall).toBe(0);
    });

    it('should calculate correct summary after multiple calls', () => {
      tracker.recordCost('gemini', 'gemini-flash-lite-latest', 100, 50);
      tracker.recordCost('gemini', 'gemini-flash-lite-latest', 100, 50);

      const summary = tracker.getSummary();

      expect(summary.totalCalls).toBe(2);
      expect(summary.totalTokens).toBe(300);
      expect(summary.avgTokensPerCall).toBe(150);
      expect(summary.costsByProvider['gemini']).toBeGreaterThan(0);
    });
  });

  describe('resetCosts', () => {
    it('should clear all recorded costs', () => {
      tracker.recordCost('gemini', 'gemini-flash-lite-latest', 100, 50);
      expect(tracker.getTotalCost()).toBeGreaterThan(0);

      tracker.resetCosts();

      expect(tracker.getTotalCost()).toBe(0);
      expect(tracker.getAllCosts()).toHaveLength(0);
    });
  });

  describe('read-only filesystem (serverless)', () => {
    const tmpLog = path.join(os.tmpdir(), '.ai-costs.json');
    const failWith = (code: string) => () => {
      throw Object.assign(new Error(code), { code });
    };
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
      warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
      writeFileSync.mockReset();
      writeFileSync.mockImplementation(realFs.writeFileSync);
      warnSpy.mockRestore();
      realFs.rmSync(tmpLog, { force: true });
    });

    it('falls back to the temp folder when the project folder is read-only', () => {
      writeFileSync.mockImplementation((file: string, ...rest: unknown[]) => {
        if (!String(file).startsWith(os.tmpdir())) failWith('EROFS')();
        return (realFs.writeFileSync as (...a: unknown[]) => void)(file, ...rest);
      });

      const cost = tracker.recordCost('gemini', 'gemini-flash-lite-latest', 100, 50);

      expect(cost.costUSD).toBeGreaterThan(0);
      expect(tracker.getTotalCost()).toBeGreaterThan(0);
      expect(realFs.existsSync(tmpLog)).toBe(true);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('keeps using the temp folder for later calls instead of retrying the read-only one', () => {
      const attempts: string[] = [];
      writeFileSync.mockImplementation((file: string, ...rest: unknown[]) => {
        attempts.push(String(file));
        if (!String(file).startsWith(os.tmpdir())) failWith('EROFS')();
        return (realFs.writeFileSync as (...a: unknown[]) => void)(file, ...rest);
      });

      tracker.recordCost('gemini', 'gemini-flash-lite-latest', 100, 50);
      tracker.recordCost('gemini', 'gemini-flash-lite-latest', 100, 50);

      const readOnlyAttempts = attempts.filter((f) => !f.startsWith(os.tmpdir()));
      expect(readOnlyAttempts).toHaveLength(1);
    });

    it('keeps working and warns only once when nothing is writable', () => {
      writeFileSync.mockImplementation(failWith('EROFS'));

      tracker.recordCost('gemini', 'gemini-flash-lite-latest', 100, 50);
      tracker.recordCost('gemini', 'gemini-flash-lite-latest', 100, 50);
      tracker.recordCost('gemini', 'gemini-flash-lite-latest', 100, 50);

      expect(tracker.getAllCosts()).toHaveLength(3);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('does not hide unrelated write errors behind the fallback', () => {
      writeFileSync.mockImplementation(failWith('ENOSPC'));

      tracker.recordCost('gemini', 'gemini-flash-lite-latest', 100, 50);

      expect(writeFileSync).toHaveBeenCalledTimes(1); // no retry in the temp folder
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });
});
