import { createHash } from 'crypto';
import { get as httpsGet, request as httpsRequest } from 'https';
import { get as httpGet, request as httpRequest } from 'http';
import { URL } from 'url';
import { FetchOptions, BlockResource } from './types';

export class HttpClient {
  constructor(options: FetchOptions = {}) {
    // No client needed for built-in HTTP
  }

  async fetchResource(url: string, options: FetchOptions = {}): Promise<BlockResource> {
    const retries = options.retries || 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const parsedUrl = new URL(url);
        const client = parsedUrl.protocol === 'https:' ? httpsGet : httpGet;

        const content = await new Promise<{data: string, headers: Record<string, string | string[] | undefined>}>((resolve, reject) => {
          const request = client(url, {
            timeout: options.timeout || 30000,
            headers: {
              'User-Agent': options.userAgent || 'Vivafolio-Block-Cache/1.0',
              ...options.headers,
            },
          }, (res) => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              let data = '';
              res.setEncoding('utf8');
              res.on('data', (chunk) => data += chunk);
              res.on('end', () => resolve({ data, headers: res.headers }));
              res.on('error', reject);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
            }
          });

          request.on('timeout', () => {
            request.destroy();
            reject(new Error('Request timeout'));
          });

          request.on('error', reject);
          request.end();
        });

        const sha256 = createHash('sha256').update(content.data).digest('hex');
        const size = Buffer.byteLength(content.data, 'utf8');

        return {
          url,
          content: content.data,
          contentType: (content.headers['content-type'] as string) || 'application/octet-stream',
          sha256,
          size,
          lastModified: content.headers['last-modified'] as string,
          etag: content.headers['etag'] as string,
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
    const parsedUrl = new URL(url);

    if (parsedUrl.protocol === 'file:') {
      return {
        status: 200,
        headers: {},
      };
    }

    const client = parsedUrl.protocol === 'https:' ? httpsRequest : httpRequest;

    return new Promise((resolve, reject) => {
      const request = client(url, {
        method: 'HEAD',
        timeout: options.timeout || 30000,
        headers: {
          'User-Agent': options.userAgent || 'Vivafolio-Block-Cache/1.0',
          ...options.headers,
        },
      }, (res) => {
        const status = res.statusCode || 0;
        const headers: Record<string, string> = {};

        // Convert headers to string format
        for (const [key, value] of Object.entries(res.headers)) {
          if (value !== undefined) {
            headers[key] = Array.isArray(value) ? value.join(', ') : String(value);
          }
        }

        resolve({
          status,
          headers,
        });
      });

      request.on('timeout', () => {
        request.destroy();
        reject(new Error('HEAD request timeout'));
      });

      request.on('error', reject);
      request.end();
    });
  }
}
