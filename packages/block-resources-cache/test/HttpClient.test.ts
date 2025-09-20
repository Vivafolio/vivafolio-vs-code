import { HttpClient } from '../src/HttpClient';
import nock from 'nock';

describe('HttpClient', () => {
  let httpClient: HttpClient;

  beforeEach(() => {
    httpClient = new HttpClient();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('fetchResource', () => {
    it('should fetch a resource successfully', async () => {
      const testContent = 'Hello World';
      const testUrl = 'https://example.com/test.txt';

      nock('https://example.com')
        .get('/test.txt')
        .reply(200, testContent, {
          'content-type': 'text/plain',
          'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT',
          'etag': '"abc123"',
        });

      const resource = await httpClient.fetchResource(testUrl);

      expect(resource.url).toBe(testUrl);
      expect(resource.content).toBe(testContent);
      expect(resource.contentType).toBe('text/plain');
      expect(resource.size).toBe(testContent.length);
      expect(resource.lastModified).toBe('Wed, 21 Oct 2015 07:28:00 GMT');
      expect(resource.etag).toBe('"abc123"');
      expect(resource.sha256).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle JSON responses', async () => {
      const testData = { message: 'Hello World' };
      const testUrl = 'https://api.example.com/data';

      nock('https://api.example.com')
        .get('/data')
        .reply(200, testData, {
          'content-type': 'application/json',
        });

      const resource = await httpClient.fetchResource(testUrl);

      expect(JSON.parse(resource.content)).toEqual(testData);
      expect(resource.contentType).toBe('application/json');
    });

    it('should retry on failure', async () => {
      const testContent = 'Success';
      const testUrl = 'https://example.com/retry-test';

      nock('https://example.com')
        .get('/retry-test')
        .replyWithError('Network error')
        .get('/retry-test')
        .reply(200, testContent);

      const resource = await httpClient.fetchResource(testUrl, { retries: 1 });

      expect(resource.content).toBe(testContent);
    });

    it('should throw error after all retries exhausted', async () => {
      const testUrl = 'https://example.com/fail-test';

      nock('https://example.com')
        .get('/fail-test')
        .times(3)
        .replyWithError('Network error');

      await expect(
        httpClient.fetchResource(testUrl, { retries: 2 })
      ).rejects.toThrow('Failed to fetch resource after 3 attempts');
    }, 10000); // Increase timeout to 10 seconds
  });

  describe('fetchJson', () => {
    it('should fetch and parse JSON successfully', async () => {
      const testData = { id: 1, name: 'Test' };
      const testUrl = 'https://api.example.com/json';

      nock('https://api.example.com')
        .get('/json')
        .reply(200, testData);

      const result = await httpClient.fetchJson<typeof testData>(testUrl);

      expect(result).toEqual(testData);
    });

    it('should throw error for invalid JSON', async () => {
      const testUrl = 'https://api.example.com/invalid-json';

      nock('https://api.example.com')
        .get('/invalid-json')
        .reply(200, 'invalid json {');

      await expect(
        httpClient.fetchJson(testUrl)
      ).rejects.toThrow('Failed to parse JSON');
    });
  });

  describe('fetchText', () => {
    it('should fetch text content successfully', async () => {
      const testContent = 'Plain text content';
      const testUrl = 'https://example.com/text';

      nock('https://example.com')
        .get('/text')
        .reply(200, testContent);

      const result = await httpClient.fetchText(testUrl);

      expect(result).toBe(testContent);
    });
  });

  describe('head', () => {
    it('should perform HEAD request successfully', async () => {
      const testUrl = 'https://example.com/head-test';

      nock('https://example.com')
        .head('/head-test')
        .reply(200, '', {
          'content-type': 'text/plain',
          'content-length': '100',
          'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT',
        });

      const result = await httpClient.head(testUrl);

      expect(result.status).toBe(200);
      expect(result.headers['content-type']).toBe('text/plain');
      expect(result.headers['content-length']).toBe('100');
    });
  });
});
