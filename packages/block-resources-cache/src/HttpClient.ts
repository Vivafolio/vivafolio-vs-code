import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { createHash } from 'crypto';
import { FetchOptions, BlockResource } from './types';

export class HttpClient {
  private client: AxiosInstance;

  constructor(options: FetchOptions = {}) {
    this.client = axios.create({
      timeout: options.timeout || 30000,
      headers: {
        'User-Agent': options.userAgent || 'Vivafolio-Block-Cache/1.0',
        ...options.headers,
      },
    });
  }

  async fetchResource(url: string, options: FetchOptions = {}): Promise<BlockResource> {
    const retries = options.retries || 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response: AxiosResponse = await this.client.get(url, {
          timeout: options.timeout,
          headers: options.headers,
          validateStatus: (status: number) => status < 400,
        });

        const content = typeof response.data === 'string'
          ? response.data
          : JSON.stringify(response.data);

        const sha256 = createHash('sha256').update(content).digest('hex');
        const size = Buffer.byteLength(content, 'utf8');

        return {
          url,
          content,
          contentType: response.headers['content-type'] || 'application/octet-stream',
          sha256,
          size,
          lastModified: response.headers['last-modified'],
          etag: response.headers['etag'],
        };
      } catch (error) {
        lastError = error as Error;

        if (attempt < retries) {
          // Exponential backoff
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`Failed to fetch resource after ${retries + 1} attempts: ${lastError?.message}`);
  }

  async fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
    const resource = await this.fetchResource(url, options);
    try {
      return JSON.parse(resource.content) as T;
    } catch (error) {
      throw new Error(`Failed to parse JSON from ${url}: ${error}`);
    }
  }

  async fetchText(url: string, options: FetchOptions = {}): Promise<string> {
    const resource = await this.fetchResource(url, options);
    return resource.content;
  }

  async head(url: string, options: FetchOptions = {}): Promise<{
    status: number;
    headers: Record<string, string>;
    sha256?: string;
  }> {
    try {
      const response = await this.client.head(url, {
        timeout: options.timeout,
        headers: options.headers,
        validateStatus: (status: number) => status < 400,
      });

      return {
        status: response.status,
        headers: response.headers as Record<string, string>,
      };
    } catch (error) {
      throw new Error(`HEAD request failed for ${url}: ${error}`);
    }
  }
}
