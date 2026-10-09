/**
 * Cost Tracker Service
 * Tracks AI API usage and costs across providers
 */

import { CostInfo, PROVIDER_PRICING, TokenPricing } from '../types';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const LOG_FILE_NAME = '.ai-costs.json';
const COST_LOG_FILE = path.join(process.cwd(), LOG_FILE_NAME);

/** Errors meaning "this location cannot be written" (e.g. Vercel's read-only /var/task) */
const NOT_WRITABLE = new Set(['EROFS', 'EACCES', 'EPERM']);

interface CostRecord {
  date: string;
  records: CostInfo[];
  totalCostUSD: number;
}

export class CostTracker {
  private costs: CostInfo[] = [];
  private totalCost: number = 0;
  private logFile: string = COST_LOG_FILE;
  private warnedAboutSave = false;

  constructor() {
    this.loadFromFile();
  }

  /**
   * Record a new API call cost
   */
  recordCost(
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number
  ): CostInfo {
    const pricing = this.getTokenPricing(provider, model);
    const costUSD =
      (inputTokens / 1_000_000) * pricing.inputPrice +
      (outputTokens / 1_000_000) * pricing.outputPrice;

    const costInfo: CostInfo = {
      provider,
      model,
      inputTokens,
      outputTokens,
      costUSD,
      totalTokens: inputTokens + outputTokens,
      timestamp: new Date(),
    };

    this.costs.push(costInfo);
    this.totalCost += costUSD;
    this.saveToFile();

    return costInfo;
  }

  /**
   * Get pricing for a specific provider and model
   */
  private getTokenPricing(provider: string, model: string): TokenPricing {
    const providerPricing = PROVIDER_PRICING[provider.toLowerCase()];
    if (!providerPricing) {
      return { inputPrice: 0, outputPrice: 0 };
    }

    return providerPricing[model] || { inputPrice: 0, outputPrice: 0 };
  }

  /**
   * Get total cost in USD
   */
  getTotalCost(): number {
    return this.totalCost;
  }

  /**
   * Get costs by provider
   */
  getCostsByProvider(): Record<string, number> {
    const costs: Record<string, number> = {};
    this.costs.forEach((cost) => {
      costs[cost.provider] = (costs[cost.provider] || 0) + cost.costUSD;
    });
    return costs;
  }

  /**
   * Get costs by model
   */
  getCostsByModel(): Record<string, number> {
    const costs: Record<string, number> = {};
    this.costs.forEach((cost) => {
      const key = `${cost.provider}/${cost.model}`;
      costs[key] = (costs[key] || 0) + cost.costUSD;
    });
    return costs;
  }

  /**
   * Get all cost records
   */
  getAllCosts(): CostInfo[] {
    return [...this.costs];
  }

  /**
   * Get cost summary
   */
  getSummary() {
    const totalTokens = this.costs.reduce((sum, c) => sum + c.totalTokens, 0);
    const avgTokensPerCall =
      this.costs.length > 0 ? totalTokens / this.costs.length : 0;

    return {
      totalCostUSD: this.totalCost,
      totalCalls: this.costs.length,
      totalTokens,
      avgTokensPerCall: Math.round(avgTokensPerCall),
      costsByProvider: this.getCostsByProvider(),
      costsByModel: this.getCostsByModel(),
    };
  }

  /**
   * Save costs to file for persistence.
   * If the project folder is read-only (serverless), fall back to the OS temp
   * folder once. Persistence is best-effort: a failure never breaks a request,
   * and it is reported only once instead of on every call.
   */
  private saveToFile(): void {
    const data: CostRecord = {
      date: new Date().toISOString(),
      records: this.costs,
      totalCostUSD: this.totalCost,
    };
    const json = JSON.stringify(data, null, 2);

    try {
      fs.writeFileSync(this.logFile, json);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const fallback = path.join(os.tmpdir(), LOG_FILE_NAME);

      if (code && NOT_WRITABLE.has(code) && this.logFile !== fallback) {
        this.logFile = fallback;
        try {
          fs.writeFileSync(this.logFile, json);
          return;
        } catch (fallbackError) {
          error = fallbackError;
        }
      }

      if (!this.warnedAboutSave) {
        this.warnedAboutSave = true;
        console.warn('Failed to save cost tracking data (further failures not logged):', error);
      }
    }
  }

  /**
   * Load costs from file
   */
  private loadFromFile(): void {
    try {
      if (fs.existsSync(this.logFile)) {
        const data = JSON.parse(fs.readFileSync(this.logFile, 'utf-8'));
        this.costs = data.records || [];
        this.totalCost = data.totalCostUSD || 0;
      }
    } catch (error) {
      console.warn('Failed to load cost tracking data:', error);
    }
  }

  /**
   * Reset all tracked costs (for testing)
   */
  resetCosts(): void {
    this.costs = [];
    this.totalCost = 0;
    try {
      if (fs.existsSync(this.logFile)) {
        fs.unlinkSync(this.logFile);
      }
    } catch (error) {
      console.warn('Failed to delete cost tracking file:', error);
    }
  }
}

export const costTracker = new CostTracker();
