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
      const sourceContent = `vivafolio_data!("tasks", r#"
Task,Assignee,Status
Write code,Alice,Done
Test code,Bob,In Progress
"#);`;

      mockedFs.readFile.mockResolvedValue(sourceContent);

      // Access private method for testing
      const processSourceFile = (service as any).processSourceFile.bind(service);
      await processSourceFile('/test/tasks.rs');

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

  describe('event system', () => {
    it('should emit events when entities change', async () => {
      const csvContent = `Name,Age,City
Alice,30,New York`;

      mockedFs.readFile.mockResolvedValue(csvContent);

      // Process the file to create entities
      const processCSVFile = (service as any).processCSVFile.bind(service);
      await processCSVFile('/test/data.csv');

      const entityUpdatedHandler = jest.fn();
      service.on('entity-updated', entityUpdatedHandler);

      await service.updateEntity('data-row-0', { Name: 'Alice Updated' });

      expect(entityUpdatedHandler).toHaveBeenCalledWith('data-row-0', expect.objectContaining({ Name: 'Alice Updated' }));
    });
  });
});
