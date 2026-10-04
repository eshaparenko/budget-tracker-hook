/**
 * Cost Tracker Service
 * Tracks AI API usage and costs across providers
 */

import { CostInfo, PROVIDER_PRICING, TokenPricing } from '../types';
import * as fs from 'fs';
import * as path from 'path';

const COST_LOG_FILE = path.join(process.cwd(), '.ai-costs.json');

interface CostRecord {
  date: string;
  records: CostInfo[];
  totalCostUSD: number;
}

export class CostTracker {
  private costs: CostInfo[] = [];
  private totalCost: number = 0;

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
   * Save costs to file for persistence
   */
  private saveToFile(): void {
    try {
      const data: CostRecord = {
        date: new Date().toISOString(),
        records: this.costs,
        totalCostUSD: this.totalCost,
      };
      fs.writeFileSync(COST_LOG_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('Failed to save cost tracking data:', error);
    }
  }

  /**
   * Load costs from file
   */
  private loadFromFile(): void {
    try {
      if (fs.existsSync(COST_LOG_FILE)) {
        const data = JSON.parse(fs.readFileSync(COST_LOG_FILE, 'utf-8'));
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
      if (fs.existsSync(COST_LOG_FILE)) {
        fs.unlinkSync(COST_LOG_FILE);
      }
    } catch (error) {
      console.warn('Failed to delete cost tracking file:', error);
    }
  }
}

export const costTracker = new CostTracker();
