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

      // Create a VivafolioBlock notification as would come from LSP
      const notification = {
        entityId: 'user_profiles',
        sourcePath: `${tempDir}/users.rs`,
        tableData: {
          headers: ['Name', 'Age', 'Department', 'Role'],
          rows: [
            ['Alice Johnson', '28', 'Engineering', 'Senior Developer'],
            ['Bob Smith', '32', 'Design', 'Lead Designer'],
            ['Charlie Brown', '25', 'Engineering', 'Junior Developer']
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

      // Mock file system reads for DSL operations
      const userProfilesSourceContent = `vivafolio_data!("user_profiles", r#"
Name,Age,Department,Role
Alice Johnson,28,Engineering,Senior Developer
Bob Smith,32,Design,Lead Designer
Charlie Brown,25,Engineering,Junior Developer
"#);`;

      mockedFs.readFile.mockResolvedValue(userProfilesSourceContent);

      // Process the VivafolioBlock notification
      await service.handleVivafolioBlockNotification(notification);

      // Verify entities were extracted
      let entities = service.getAllEntities();
      expect(entities).toHaveLength(3);

      expect(entities[0]).toMatchObject({
        entityId: 'user_profiles-row-0',
        sourceType: 'vivafolio_data_construct',
        properties: {
          name: 'Alice Johnson',
          age: '28',
          department: 'Engineering',
          role: 'Senior Developer'
        }
      });

      const registeredModule = service.getDslModuleForEntityType(entities[0].entityTypeId);
      expect(registeredModule).toBeDefined();
      if (!registeredModule) {
        throw new Error('Expected DSL module to be registered for user_profiles');
      }

      // Test updating an entity
      const updateResult = await service.updateEntity('user_profiles-row-0', {
        name: 'Alice Johnson (Updated)',
        age: '29'
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
        name: 'Diana Wilson',
        age: '30',
        department: 'Marketing',
        role: 'Marketing Manager'
      }, {
        sourceType: 'vivafolio_data_construct',
        dslModule: registeredModule,
        sourcePath: notification.sourcePath
      });

      expect(createResult).toBe(true);

      // Verify new entity was added to our metadata
      entities = service.getAllEntities();
      expect(entities).toHaveLength(4);

      const newEntity = entities.find(e => e.entityId === 'user_profiles-row-3');
      expect(newEntity).toMatchObject({
        entityId: 'user_profiles-row-3',
        properties: {
          name: 'Diana Wilson',
          age: '30',
          department: 'Marketing',
          role: 'Marketing Manager'
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
          product: 'Laptop',
          price: '999.99',
          stock: '15',
          category: 'Electronics'
        }
      });

      // Test updating CSV entity
      const updateResult = await service.updateEntity('products-row-0', {
        price: '899.99',
        stock: '12'
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
      // Create VivafolioBlock notification
      const notification = {
        entityId: 'test_data',
        sourcePath: `${tempDir}/test.rs`,
        tableData: {
          headers: ['Name', 'Value'],
          rows: [
            ['Test', '123']
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

      // Set up event listeners
      const entityUpdatedHandler = jest.fn();
      const entityCreatedHandler = jest.fn();
      const entityDeletedHandler = jest.fn();

      service.on('entity-updated', entityUpdatedHandler);
      service.on('entity-created', entityCreatedHandler);
      service.on('entity-deleted', entityDeletedHandler);

      // Mock file system reads for DSL operations
      const testDataSourceContent = `vivafolio_data!("test_data", r#"
Name,Value
Test,123
"#);`;

      mockedFs.readFile.mockResolvedValue(testDataSourceContent);

      // Process the VivafolioBlock notification
      await service.handleVivafolioBlockNotification(notification);

      // Update entity
      await service.updateEntity('test_data-row-0', { name: 'Updated Test' });

      expect(entityUpdatedHandler).toHaveBeenCalledWith(expect.objectContaining({
        entityId: 'test_data-row-0',
        properties: expect.objectContaining({
          name: 'Updated Test'
        }),
        operationType: 'update'
      }));

      // Create entity
      const existingEntities = service.getAllEntities();
      const existingModule = service.getDslModuleForEntityType(existingEntities[0].entityTypeId);
      expect(existingModule).toBeDefined();
      if (!existingModule) {
        throw new Error('Expected DSL module to exist for test_data');
      }

      await service.createEntity('test_data-row-1', { name: 'New Item', value: '456' }, {
        sourceType: 'vivafolio_data_construct',
        dslModule: existingModule,
        sourcePath: notification.sourcePath
      });

      expect(entityCreatedHandler).toHaveBeenCalledWith(expect.objectContaining({
        entityId: 'test_data-row-1',
        properties: expect.objectContaining({
          name: 'New Item',
          value: '456'
        }),
        operationType: 'create'
      }));

      // Delete entity
      await service.deleteEntity('test_data-row-0');

      expect(entityDeletedHandler).toHaveBeenCalledWith(expect.objectContaining({
        entityId: 'test_data-row-0',
        operationType: 'delete'
      }));
    });
  });
});
