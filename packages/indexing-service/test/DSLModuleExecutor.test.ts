import * as fs from 'fs/promises';
import * as path from 'path';
import { DSLModuleExecutor } from '../src/DSLModuleExecutor';
import { DSLModule } from '../src/EditingModule';

// Mock fs/promises
jest.mock('fs/promises');

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('DSLModuleExecutor', () => {
  let executor: DSLModuleExecutor;
  let mockDSLModule: DSLModule;
  let testFilePath: string;
  let originalContent: string;

  beforeEach(() => {
    executor = new DSLModuleExecutor();
    testFilePath = '/test/file.rs';

    mockDSLModule = {
      version: '1.0',
      entityId: 'test_table',
      operations: {
        updateEntity: {
          handler: 'tableUpdateHandler',
          params: { headers: ['Name', 'Age', 'City'], originalRows: 2 }
        },
        createEntity: {
          handler: 'tableCreateHandler',
          params: { headers: ['Name', 'Age', 'City'] }
        },
        deleteEntity: {
          handler: 'tableDeleteHandler',
          params: { entityId: 'test_table' }
        }
      },
      source: {
        type: 'vivafolio_data_construct',
        pattern: 'vivafolio_data!("test_table", r#"'
      }
    };

    originalContent = `vivafolio_data!("test_table", r#"
Name,Age,City
Alice,30,New York
Bob,25,London
"#);`;

    mockedFs.readFile.mockResolvedValue(originalContent);
    mockedFs.writeFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('canHandle', () => {
    it('should return true for vivafolio_data_construct with DSL module', () => {
      const metadata = { dslModule: mockDSLModule };
      expect(executor.canHandle('vivafolio_data_construct', metadata)).toBe(true);
    });

    it('should return false without DSL module', () => {
      const metadata = {};
      expect(executor.canHandle('vivafolio_data_construct', metadata)).toBe(false);
    });

    it('should return false for other source types', () => {
      const metadata = { dslModule: mockDSLModule };
      expect(executor.canHandle('csv', metadata)).toBe(false);
    });
  });

  describe('updateEntity', () => {
    it('should update entity properties in the source file', async () => {
      const metadata = {
        dslModule: mockDSLModule,
        sourcePath: testFilePath
      };

      const result = await executor.updateEntity('test_table-row-0', { Name: 'Alice Updated', Age: '31' }, metadata);

      expect(result).toBe(true);
      expect(mockedFs.readFile).toHaveBeenCalledWith(testFilePath, 'utf-8');
      expect(mockedFs.writeFile).toHaveBeenCalledWith(testFilePath, expect.any(String), 'utf-8');

      const writeCall = mockedFs.writeFile.mock.calls[0];
      const updatedContent = writeCall[1];
      expect(updatedContent).toContain('Alice Updated');
      expect(updatedContent).toContain('31');
      expect(updatedContent).toContain('New York'); // Unchanged property
    });

    it('should return false for invalid entity ID format', async () => {
      const metadata = {
        dslModule: mockDSLModule,
        sourcePath: testFilePath
      };

      const result = await executor.updateEntity('invalid-entity-id', { Name: 'Test' }, metadata);

      expect(result).toBe(false);
      expect(mockedFs.writeFile).not.toHaveBeenCalled();
    });

    it('should return false when file read fails', async () => {
      mockedFs.readFile.mockRejectedValue(new Error('File not found'));

      const metadata = {
        dslModule: mockDSLModule,
        sourcePath: testFilePath
      };

      const result = await executor.updateEntity('test_table-row-0', { Name: 'Test' }, metadata);

      expect(result).toBe(false);
    });
  });

  describe('createEntity', () => {
    it('should add new row to the table', async () => {
      const metadata = {
        dslModule: mockDSLModule,
        sourcePath: testFilePath
      };

      const newProperties = { Name: 'Charlie', Age: '28', City: 'Boston' };
      const result = await executor.createEntity('test_table-row-2', newProperties, metadata);

      expect(result).toBe(true);
      expect(mockedFs.writeFile).toHaveBeenCalled();

      const writeCall = mockedFs.writeFile.mock.calls[0];
      const updatedContent = writeCall[1];
      expect(updatedContent).toContain('Charlie');
      expect(updatedContent).toContain('28');
      expect(updatedContent).toContain('Boston');
    });
  });

  describe('deleteEntity', () => {
    it('should remove row from the table', async () => {
      const metadata = {
        dslModule: mockDSLModule,
        sourcePath: testFilePath
      };

      const result = await executor.deleteEntity('test_table-row-0', metadata);

      expect(result).toBe(true);
      expect(mockedFs.writeFile).toHaveBeenCalled();

      const writeCall = mockedFs.writeFile.mock.calls[0];
      const updatedContent = writeCall[1];
      expect(updatedContent).not.toContain('Alice');
      expect(updatedContent).toContain('Bob'); // Other rows should remain
    });
  });
});
