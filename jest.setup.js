// Jest setup file
// Polyfill for TextEncoder/TextDecoder and Response (needed for @anthropic-ai/sdk and openai)
import { TextEncoder, TextDecoder } from 'util';

if (!global.TextEncoder) {
  global.TextEncoder = TextEncoder;
}

if (!global.TextDecoder) {
  global.TextDecoder = TextDecoder;
}

// Polyfill fetch for API clients
if (!global.fetch) {
  global.fetch = jest.fn();
}

// Polyfill Response for fetch API
if (!global.Response) {
  global.Response = class Response {
    constructor(body, options) {
      this.body = body;
      this.status = options?.status || 200;
      this.statusText = options?.statusText || 'OK';
      this.headers = new Map(Object.entries(options?.headers || {}));
    }
    
    async json() {
      return typeof this.body === 'string' ? JSON.parse(this.body) : this.body;
    }
    
    async text() {
      return String(this.body);
    }
  };
}

// No additional setup needed for unit tests
