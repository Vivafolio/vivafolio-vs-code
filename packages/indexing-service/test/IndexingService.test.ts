import * as fs from 'fs/promises';
import * as path from 'path';
import { IndexingService, IndexingServiceConfig } from '../src/IndexingService';

// Mock fs/promises
jest.mock('fs/promises');

// Mock chokidar
jest.mock('chokidar', () => ({
  default: {
    watch: jest.fn(() => ({
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined)
    }))
  }
}));

// Mock fast-glob
jest.mock('fast-glob', () => jest.fn());

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedFg = require('fast-glob');

describe('IndexingService', () => {
  let service: IndexingService;
  let config: IndexingServiceConfig;

  beforeEach(() => {
    config = {
      watchPaths: ['/test'],
      supportedExtensions: ['csv', 'md', 'rs'],
      excludePatterns: ['**/node_modules/**']
    };

    service = new IndexingService(config);
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with provided config', () => {
      expect(service).toBeDefined();
    });
  });

  describe('file processing', () => {
    beforeEach(() => {
      mockedFs.readFile.mockResolvedValue('');
    });

    it('should process CSV files and extract entities', async () => {
      const csvContent = `Name,Age,City
Alice,30,New York
Bob,25,London`;

      mockedFs.readFile.mockResolvedValue(csvContent);

      // Access private method for testing
      const processCSVFile = (service as any).processCSVFile.bind(service);
      await processCSVFile('/test/data.csv');

      const entities = service.getAllEntities();
      expect(entities).toHaveLength(2);
      expect(entities[0].entityId).toBe('data-row-0');
      expect(entities[0].properties).toEqual({ Name: 'Alice', Age: '30', City: 'New York' });
    });

    it('should process Markdown files with frontmatter', async () => {
      const mdContent = `---
title: Test Document
author: Alice
tags: [test, example]
---

# Test Document

This is a test document.`;

      mockedFs.readFile.mockResolvedValue(mdContent);

      // Access private method for testing
      const processMarkdownFile = (service as any).processMarkdownFile.bind(service);
      await processMarkdownFile('/test/document.md');

      const entities = service.getAllEntities();
      expect(entities).toHaveLength(1);
      expect(entities[0].entityId).toBe('document');
      expect(entities[0].properties).toEqual({
        title: 'Test Document',
        author: 'Alice',
        tags: ['test', 'example']
      });
    });

    it('should process source files with vivafolio_data constructs', async () => {
      // Create a VivafolioBlock notification as would come from LSP
      const notification = {
        entityId: 'tasks',
        sourcePath: '/test/tasks.rs',
        tableData: {
          headers: ['Task', 'Assignee', 'Status'],
          rows: [
            ['Write code', 'Alice', 'Done'],
            ['Test code', 'Bob', 'In Progress']
          ]
        },
        dslModule: {
          operations: {
            updateEntity: 'function updateEntity(entityId, properties) { /* mock */ }',
            createEntity: 'function createEntity(properties) { /* mock */ }',
            deleteEntity: 'function deleteEntity(entityId) { /* mock */ }'
          },
          source: { type: 'vivafolio_data_construct' }
        }
      };

      // Process the VivafolioBlock notification
      await service.handleVivafolioBlockNotification(notification);

      const entities = service.getAllEntities();
      expect(entities).toHaveLength(2);
      expect(entities[0].entityId).toBe('tasks-row-0');
      expect(entities[0].properties).toEqual({
        Task: 'Write code',
        Assignee: 'Alice',
        Status: 'Done'
      });
      expect(entities[0].dslModule).toBeDefined();
    });
  });

  describe('entity operations', () => {
    beforeEach(() => {
      // Set up a CSV file entity for testing
      const csvContent = `Name,Age,City
Alice,30,New York`;

      mockedFs.readFile.mockResolvedValue(csvContent);

      // Process the file to create entities
      const processCSVFile = (service as any).processCSVFile.bind(service);
      processCSVFile('/test/data.csv');
    });

    it('should update entity properties', async () => {
      const result = await service.updateEntity('data-row-0', { Name: 'Alice Updated', Age: '31' });

      expect(result).toBe(true);
      expect(mockedFs.writeFile).toHaveBeenCalled();

      const writeCall = mockedFs.writeFile.mock.calls[0];
      const updatedContent = writeCall[1];
      expect(updatedContent).toContain('Alice Updated');
      expect(updatedContent).toContain('31');
    });

    it('should create new entity', async () => {
      const metadata = {
        sourceType: 'csv',
        sourcePath: '/test/data.csv'
      };

      const result = await service.createEntity('data-row-1', { Name: 'Charlie', Age: '28', City: 'Boston' }, metadata);

      expect(result).toBe(true);
      expect(mockedFs.writeFile).toHaveBeenCalled();

      const entities = service.getAllEntities();
      expect(entities).toHaveLength(2); // Original + new
    });

    it('should delete entity', async () => {
      const result = await service.deleteEntity('data-row-0');

      expect(result).toBe(true);
      expect(mockedFs.writeFile).toHaveBeenCalled();

      const entities = service.getAllEntities();
      expect(entities).toHaveLength(0);
    });

    it('should return false for non-existent entity', async () => {
      const result = await service.updateEntity('non-existent-entity', { Name: 'Test' });
      expect(result).toBe(false);
    });
  });

  describe('enhanced event system', () => {
    it('should emit enhanced events when entities change', async () => {
      const csvContent = `Name,Age,City
Alice,30,New York`;

      mockedFs.readFile.mockResolvedValue(csvContent);

      // Process the file to create entities
      const processCSVFile = (service as any).processCSVFile.bind(service);
      await processCSVFile('/test/data.csv');

      const entityUpdatedHandler = jest.fn();
      service.on('entity-updated', entityUpdatedHandler);

      await service.updateEntity('data-row-0', { Name: 'Alice Updated' });

      expect(entityUpdatedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: 'data-row-0',
          properties: expect.objectContaining({ Name: 'Alice Updated' }),
          timestamp: expect.any(Date),
          sourcePath: '/test/data.csv',
          sourceType: 'csv',
          operationType: 'update'
        })
      );
    });

    it('should support event filtering', async () => {
      const csvContent = `Name,Age,City
Alice,30,New York
Bob,25,London`;

      mockedFs.readFile.mockResolvedValue(csvContent);

      // Process the file to create entities
      const processCSVFile = (service as any).processCSVFile.bind(service);
      await processCSVFile('/test/data.csv');

      const entityUpdatedHandler = jest.fn();
      service.on('entity-updated', entityUpdatedHandler, {
        filter: (payload) => payload.entityId === 'data-row-0'
      });

      // Update first entity (should trigger)
      await service.updateEntity('data-row-0', { Name: 'Alice Updated' });
      // Update second entity (should be filtered out)
      await service.updateEntity('data-row-1', { Name: 'Bob Updated' });

      expect(entityUpdatedHandler).toHaveBeenCalledTimes(1);
      expect(entityUpdatedHandler).toHaveBeenCalledWith(
        expect.objectContaining({ entityId: 'data-row-0' })
      );
    });

    it('should support event priority', async () => {
      const csvContent = `Name,Age,City
Alice,30,New York`;

      mockedFs.readFile.mockResolvedValue(csvContent);

      // Process the file to create entities
      const processCSVFile = (service as any).processCSVFile.bind(service);
      await processCSVFile('/test/data.csv');

      const calls: string[] = [];
      const highPriorityHandler = jest.fn(() => calls.push('high'));
      const lowPriorityHandler = jest.fn(() => calls.push('low'));

      service.on('entity-updated', highPriorityHandler as any, { priority: 10 });
      service.on('entity-updated', lowPriorityHandler as any, { priority: 0 });

      await service.updateEntity('data-row-0', { Name: 'Alice Updated' });

      expect(calls).toEqual(['high', 'low']);
    });

    it('should emit file-changed events with enhanced payload', async () => {
      const fileChangedHandler = jest.fn();
      service.on('file-changed', fileChangedHandler as any);

      const csvContent = `Name,Age,City
Alice,30,New York`;

      mockedFs.readFile.mockResolvedValue(csvContent);

      // Simulate file change event (this triggers the file-changed event)
      const handleFileChange = (service as any).handleFileChange.bind(service);
      await handleFileChange('/test/data.csv', 'add');

      expect(fileChangedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          filePath: '/test/data.csv',
          eventType: 'add',
          timestamp: expect.any(Date),
          affectedEntities: expect.arrayContaining(['data-row-0']),
          sourceType: 'csv'
        })
      );
    });

    it('should support waitFor method', async () => {
      const csvContent = `Name,Age,City
Alice,30,New York`;

      mockedFs.readFile.mockResolvedValue(csvContent);

      // Process the file to create entities
      const processCSVFile = (service as any).processCSVFile.bind(service);
      await processCSVFile('/test/data.csv');

      const waitPromise = service.waitFor('entity-updated');

      // Trigger the event after a short delay
      setTimeout(async () => {
        await service.updateEntity('data-row-0', { Name: 'Alice Updated' });
      }, 10);

      const result = await waitPromise;

      expect(result).toEqual(
        expect.objectContaining({
          entityId: 'data-row-0',
          properties: expect.objectContaining({ Name: 'Alice Updated' }),
          operationType: 'update'
        })
      );
    });

    it('should support batch operations', async () => {
      const batchOperationHandler = jest.fn();
      service.on('batch-operation', batchOperationHandler);

      const csvContent1 = `Name,Age,City
Alice,30,New York`;
      const csvContent2 = `Name,Age,City
Bob,25,London`;

      mockedFs.readFile.mockResolvedValueOnce(csvContent1).mockResolvedValueOnce(csvContent2);

      // Create initial entities
      const processCSVFile = (service as any).processCSVFile.bind(service);
      await processCSVFile('/test/data1.csv');
      await processCSVFile('/test/data2.csv');

      const operations = [
        {
          type: 'update' as const,
          entityId: 'data1-row-0',
          properties: { Name: 'Alice Updated' }
        },
        {
          type: 'update' as const,
          entityId: 'data2-row-0',
          properties: { Name: 'Bob Updated' }
        }
      ];

      const result = await service.performBatchOperations(operations);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results.every(r => r.success)).toBe(true);

      expect(batchOperationHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          operations: expect.arrayContaining([
            expect.objectContaining({ entityId: 'data1-row-0', operationType: 'update' }),
            expect.objectContaining({ entityId: 'data2-row-0', operationType: 'update' })
          ]),
          timestamp: expect.any(Date),
          operationType: 'batch'
        })
      );
    });
  });
});
