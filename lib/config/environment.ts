/**
 * Environment Configuration
 * Validates and provides access to environment variables
 */

import { ValidationError } from '../utils/errorHandler';

export interface EnvironmentConfig {
  geminiApiKey: string;
  googleClientEmail: string;
  googlePrivateKey: string;
  googleSheetId: string;
  nodeEnv: 'development' | 'production' | 'test';
}

/**
 * Validates and loads environment configuration
 * Fails fast on startup if critical variables are missing
 */
export function loadEnvironmentConfig(): EnvironmentConfig {
  const errors: string[] = [];

  const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
  if (!geminiApiKey) {
    errors.push('GEMINI_API_KEY is not set');
  }

  const googleClientEmail = process.env.GOOGLE_CLIENT_EMAIL?.trim();
  if (!googleClientEmail) {
    errors.push('GOOGLE_CLIENT_EMAIL is not set');
  }

  const googlePrivateKey = process.env.GOOGLE_PRIVATE_KEY?.trim();
  if (!googlePrivateKey) {
    errors.push('GOOGLE_PRIVATE_KEY is not set');
  }

  const googleSheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (!googleSheetId) {
    errors.push('GOOGLE_SHEET_ID is not set');
  }

  if (errors.length > 0) {
    throw new ValidationError(
      `Missing environment variables:\n${errors.join('\n')}`,
      'environment'
    );
  }

  const nodeEnv = (process.env.NODE_ENV || 'production') as
    | 'development'
    | 'production'
    | 'test';

  return {
    geminiApiKey: geminiApiKey!,
    googleClientEmail: googleClientEmail!,
    googlePrivateKey: googlePrivateKey!,
    googleSheetId: googleSheetId!,
    nodeEnv,
  };
}

/**
 * Singleton environment config instance
 */
let envConfig: EnvironmentConfig | null = null;

export function getEnvironmentConfig(): EnvironmentConfig {
  if (!envConfig) {
    envConfig = loadEnvironmentConfig();
  }
  return envConfig;
}
