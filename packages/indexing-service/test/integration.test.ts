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

describe('IndexingService Integration', () => {
  let service: IndexingService;
  let tempDir: string;

  beforeEach(() => {
    tempDir = '/tmp/vivafolio-test';

    const config: IndexingServiceConfig = {
      watchPaths: [tempDir],
      supportedExtensions: ['csv', 'md', 'rs'],
      excludePatterns: ['**/node_modules/**']
    };

    service = new IndexingService(config);
    jest.clearAllMocks();
  });

  describe('End-to-End Vivafolio Data Editing Workflow', () => {
    it('should handle complete vivafolio_data editing workflow', async () => {
      // Mock file content with vivafolio_data construct
      const sourceContent = `// Test file with vivafolio_data construct
use std::collections::HashMap;

vivafolio_data!("user_profiles", r#"
Name,Age,Department,Role
Alice Johnson,28,Engineering,Senior Developer
Bob Smith,32,Design,Lead Designer
Charlie Brown,25,Engineering,Junior Developer
"#);

// Regular Rust code continues...
fn main() {
    println!("Hello from Vivafolio!");
}`;

      const sourcePath = `${tempDir}/users.rs`;
      mockedFs.readFile.mockResolvedValue(sourceContent);
      mockedFg.mockResolvedValue([sourcePath]);

      // Mock file scanning
      const scanFiles = (service as any).scanFiles.bind(service);
      await scanFiles();

      // Verify entities were extracted
      let entities = service.getAllEntities();
      expect(entities).toHaveLength(3);

      expect(entities[0]).toMatchObject({
        entityId: 'user_profiles-row-0',
        sourceType: 'vivafolio_data_construct',
        properties: {
          Name: 'Alice Johnson',
          Age: '28',
          Department: 'Engineering',
          Role: 'Senior Developer'
        }
      });

      expect(entities[0].dslModule).toBeDefined();

      // Test updating an entity
      const updateResult = await service.updateEntity('user_profiles-row-0', {
        Name: 'Alice Johnson (Updated)',
        Age: '29'
      });

      expect(updateResult).toBe(true);
      expect(mockedFs.writeFile).toHaveBeenCalled();

      const writeCall = mockedFs.writeFile.mock.calls[0];
      const updatedContent = writeCall[1];

      // Verify the content was updated correctly
      expect(updatedContent).toContain('Alice Johnson (Updated)');
      expect(updatedContent).toContain('29');
      expect(updatedContent).toContain('Engineering'); // Unchanged
      expect(updatedContent).toContain('Senior Developer'); // Unchanged

      // Test creating a new entity
      const createResult = await service.createEntity('user_profiles-row-3', {
        Name: 'Diana Wilson',
        Age: '30',
        Department: 'Marketing',
        Role: 'Marketing Manager'
      }, {
        sourceType: 'vivafolio_data_construct',
        dslModule: entities[0].dslModule,
        sourcePath: sourcePath
      });

      expect(createResult).toBe(true);

      // Verify new entity was added to our metadata
      entities = service.getAllEntities();
      expect(entities).toHaveLength(4);

      const newEntity = entities.find(e => e.entityId === 'user_profiles-row-3');
      expect(newEntity).toMatchObject({
        entityId: 'user_profiles-row-3',
        properties: {
          Name: 'Diana Wilson',
          Age: '30',
          Department: 'Marketing',
          Role: 'Marketing Manager'
        }
      });
    });

    it('should handle CSV file editing workflow', async () => {
      // Mock CSV file content
      const csvContent = `Product,Price,Stock,Category
Laptop,999.99,15,Electronics
Mouse,25.99,50,Accessories
Keyboard,79.99,30,Accessories`;

      const csvPath = `${tempDir}/products.csv`;
      mockedFs.readFile.mockResolvedValue(csvContent);
      mockedFg.mockResolvedValue([csvPath]);

      // Mock file scanning
      const scanFiles = (service as any).scanFiles.bind(service);
      await scanFiles();

      // Verify entities were extracted
      let entities = service.getAllEntities();
      expect(entities).toHaveLength(3);

      expect(entities[0]).toMatchObject({
        entityId: 'products-row-0',
        sourceType: 'csv',
        properties: {
          Product: 'Laptop',
          Price: '999.99',
          Stock: '15',
          Category: 'Electronics'
        }
      });

      // Test updating CSV entity
      const updateResult = await service.updateEntity('products-row-0', {
        Price: '899.99',
        Stock: '12'
      });

      expect(updateResult).toBe(true);
      expect(mockedFs.writeFile).toHaveBeenCalled();

      const writeCall = mockedFs.writeFile.mock.calls[0];
      const updatedContent = writeCall[1];

      // Verify CSV was updated correctly
      expect(updatedContent).toContain('899.99');
      expect(updatedContent).toContain('12');
      expect(updatedContent).toContain('Laptop'); // Unchanged
      expect(updatedContent).toContain('Electronics'); // Unchanged
    });

    it('should handle Markdown file editing workflow', async () => {
      // Mock Markdown file with frontmatter
      const mdContent = `---
title: Project Documentation
author: Alice Johnson
status: draft
tags: [documentation, project]
---

# Project Documentation

This is the main project documentation.

## Overview

Project overview here...

## Features

- Feature 1
- Feature 2
- Feature 3
`;

      const mdPath = `${tempDir}/README.md`;
      mockedFs.readFile.mockResolvedValue(mdContent);
      mockedFg.mockResolvedValue([mdPath]);

      // Mock file scanning
      const scanFiles = (service as any).scanFiles.bind(service);
      await scanFiles();

      // Verify entity was extracted
      let entities = service.getAllEntities();
      expect(entities).toHaveLength(1);

      expect(entities[0]).toMatchObject({
        entityId: 'README',
        sourceType: 'markdown',
        properties: {
          title: 'Project Documentation',
          author: 'Alice Johnson',
          status: 'draft',
          tags: ['documentation', 'project']
        }
      });

      // Test updating Markdown entity
      const updateResult = await service.updateEntity('README', {
        status: 'published',
        author: 'Alice Johnson (Updated)'
      });

      expect(updateResult).toBe(true);
      expect(mockedFs.writeFile).toHaveBeenCalled();

      const writeCall = mockedFs.writeFile.mock.calls[0];
      const updatedContent = writeCall[1];

      // Verify frontmatter was updated correctly
      expect(updatedContent).toContain('status: published');
      expect(updatedContent).toContain('author: Alice Johnson (Updated)');
      expect(updatedContent).toContain('title: Project Documentation'); // Unchanged
    });
  });

  describe('Event System Integration', () => {
    it('should emit events during editing operations', async () => {
      // Mock source file
      const sourceContent = `vivafolio_data!("test_data", r#"
Name,Value
Test,123
"#);`;

      const sourcePath = `${tempDir}/test.rs`;
      mockedFs.readFile.mockResolvedValue(sourceContent);
      mockedFg.mockResolvedValue([sourcePath]);

      // Set up event listeners
      const entityUpdatedHandler = jest.fn();
      const entityCreatedHandler = jest.fn();
      const entityDeletedHandler = jest.fn();

      service.on('entity-updated', entityUpdatedHandler);
      service.on('entity-created', entityCreatedHandler);
      service.on('entity-deleted', entityDeletedHandler);

      // Process file
      const scanFiles = (service as any).scanFiles.bind(service);
      await scanFiles();

      // Update entity
      await service.updateEntity('test_data-row-0', { Name: 'Updated Test' });

      expect(entityUpdatedHandler).toHaveBeenCalledWith('test_data-row-0', expect.objectContaining({
        Name: 'Updated Test'
      }));

      // Create entity
      await service.createEntity('test_data-row-1', { Name: 'New Item', Value: '456' }, {
        sourceType: 'vivafolio_data_construct',
        dslModule: service.getAllEntities()[0].dslModule,
        sourcePath: sourcePath
      });

      expect(entityCreatedHandler).toHaveBeenCalledWith('test_data-row-1', expect.objectContaining({
        Name: 'New Item',
        Value: '456'
      }));

      // Delete entity
      await service.deleteEntity('test_data-row-0');

      expect(entityDeletedHandler).toHaveBeenCalledWith('test_data-row-0');
    });
  });
});
