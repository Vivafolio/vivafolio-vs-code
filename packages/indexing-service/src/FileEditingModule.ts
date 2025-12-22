import * as fs from 'fs/promises';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { EditingModule } from './EditingModule';

type CsvRow = Record<string, string>;

interface CsvTable {
  headers: string[];
  rows: CsvRow[];
}

function normalizeHeader(header: string): string {
  return header.trim();
}

function detectEntityIdColumn(headers: string[]): string | undefined {
  return headers.find((header) => header.trim().toLowerCase() === 'entity_id');
}

async function readCsvTable(filePath: string): Promise<CsvTable | null> {
  const content = await fs.readFile(filePath, 'utf-8');
  let headerRow: string[] = [];

  const rows = parse(content, {
    columns: (headers: string[]) => {
      headerRow = headers.map(normalizeHeader);
      return headerRow;
    },
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true
  }) as CsvRow[];

  if (!headerRow.length) {
    console.error('CSVEditingModule: Invalid CSV format - no headers');
    return null;
  }

  return {
    headers: headerRow,
    rows
  };
}

async function writeCsvTable(filePath: string, table: CsvTable): Promise<void> {
  const columns = table.headers.map((header) => ({ key: header, header }));
  const output = stringify(table.rows, {
    header: true,
    columns
  });
  await fs.writeFile(filePath, output, 'utf-8');
}

// Locate the row for a given entity by preferring an entity_id column and falling back to legacy row suffixes.
function findRowIndexForEntity(entityId: string, headers: string[], rows: CsvRow[]): number {
  const entityIdColumn = detectEntityIdColumn(headers);
  if (entityIdColumn) {
    const indexByColumn = rows.findIndex((row) => (row[entityIdColumn] ?? '') === entityId);
    if (indexByColumn !== -1) {
      return indexByColumn;
    }
  }

  const rowMatch = entityId.match(/-row-(\d+)$/);
  if (rowMatch) {
    const rowIndex = parseInt(rowMatch[1], 10);
    if (!Number.isNaN(rowIndex) && rowIndex >= 0 && rowIndex < rows.length) {
      return rowIndex;
    }
  }

  return -1;
}

// Backfill the entity_id column so future lookups remain stable even if the input lacked the field.
function ensureEntityIdValue(row: CsvRow, entityId: string, headers: string[]): void {
  const entityIdColumn = detectEntityIdColumn(headers);
  if (entityIdColumn && (!row[entityIdColumn] || row[entityIdColumn].length === 0)) {
    row[entityIdColumn] = entityId;
  }
}

export class CSVEditingModule implements EditingModule {
  canHandle(sourceType: string, metadata: any): boolean {
    return sourceType === 'csv' || (metadata?.sourcePath && metadata.sourcePath.endsWith('.csv'));
  }

  async updateEntity(entityId: string, properties: Record<string, any>, metadata: any): Promise<boolean> {
    const filePath = metadata.sourcePath;
    if (!filePath) {
      console.error('CSVEditingModule: Missing source path');
      return false;
    }

    try {
      const table = await readCsvTable(filePath);
      if (!table) {
        return false;
      }

      const rowIndex = findRowIndexForEntity(entityId, table.headers, table.rows);
      if (rowIndex === -1) {
        console.error(`CSVEditingModule: Unable to locate entity ${entityId} in ${filePath}`);
        return false;
      }

      const currentRow = table.rows[rowIndex];
      const nextRow: CsvRow = { ...currentRow };

      table.headers.forEach((header) => {
        const fallback = currentRow?.[header] ?? '';
        nextRow[header] = this.resolvePropertyValue(header, properties, fallback);
      });

      ensureEntityIdValue(nextRow, entityId, table.headers);
      table.rows[rowIndex] = nextRow;

      await writeCsvTable(filePath, table);
      console.log(`CSVEditingModule: Updated entity ${entityId} in ${filePath}`);
      return true;
    } catch (error) {
      console.error(`CSVEditingModule: Failed to update entity ${entityId}:`, error);
      return false;
    }
  }

  async createEntity(entityId: string, properties: Record<string, any>, metadata: any): Promise<boolean> {
    const filePath = metadata.sourcePath;
    if (!filePath) {
      console.error('CSVEditingModule: Missing source path');
      return false;
    }

    try {
      const table = await readCsvTable(filePath);
      if (!table) {
        return false;
      }

      const newRow: CsvRow = {};
      table.headers.forEach((header) => {
        newRow[header] = this.resolvePropertyValue(header, properties, '');
      });
      ensureEntityIdValue(newRow, entityId, table.headers);
      table.rows.push(newRow);

      await writeCsvTable(filePath, table);
      console.log(`CSVEditingModule: Created entity ${entityId} in ${filePath}`);
      return true;
    } catch (error) {
      console.error(`CSVEditingModule: Failed to create entity ${entityId}:`, error);
      return false;
    }
  }

  async deleteEntity(entityId: string, metadata: any): Promise<boolean> {
    const filePath = metadata.sourcePath;
    if (!filePath) {
      console.error('CSVEditingModule: Missing source path');
      return false;
    }

    try {
      const table = await readCsvTable(filePath);
      if (!table) {
        return false;
      }

      if (!table.rows.length) {
        console.error('CSVEditingModule: No data rows to delete');
        return false;
      }

      const rowIndex = findRowIndexForEntity(entityId, table.headers, table.rows);
      if (rowIndex === -1) {
        console.error(`CSVEditingModule: Unable to locate entity ${entityId} for deletion`);
        return false;
      }

      table.rows.splice(rowIndex, 1);
      await writeCsvTable(filePath, table);
      console.log(`CSVEditingModule: Deleted entity ${entityId} in ${filePath}`);
      return true;
    } catch (error) {
      console.error(`CSVEditingModule: Failed to delete entity ${entityId}:`, error);
      return false;
    }
  }

  private resolvePropertyValue(header: string, properties: Record<string, any>, fallback: string): string {
    if (Object.prototype.hasOwnProperty.call(properties, header)) {
      const value = properties[header];
      return value !== undefined && value !== null ? String(value) : fallback;
    }
    const normalized = header.trim().toLowerCase().replace(/\s+/g, '_');
    if (Object.prototype.hasOwnProperty.call(properties, normalized)) {
      const value = properties[normalized];
      return value !== undefined && value !== null ? String(value) : fallback;
    }
    return fallback;
  }
}

export class MarkdownEditingModule implements EditingModule {
  canHandle(sourceType: string, metadata: any): boolean {
    return sourceType === 'markdown' || (metadata?.sourcePath && metadata.sourcePath.endsWith('.md'));
  }

  async updateEntity(entityId: string, properties: Record<string, any>, metadata: any): Promise<boolean> {
    const filePath = metadata.sourcePath;
    if (!filePath) {
      console.error('MarkdownEditingModule: Missing source path');
      return false;
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // For Markdown files with frontmatter, we need to update the YAML frontmatter
      // This is a simplified implementation - a full implementation would need proper YAML parsing
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

      if (!frontmatterMatch) {
        console.error('MarkdownEditingModule: No frontmatter found');
        return false;
      }

      const frontmatter = frontmatterMatch[1];
      const body = frontmatterMatch[2];

      // Simple key-value replacement in frontmatter
      let updatedFrontmatter = frontmatter;
      for (const [key, value] of Object.entries(properties)) {
        const regex = new RegExp(`^${key}:.*$`, 'm');
        updatedFrontmatter = updatedFrontmatter.replace(regex, `${key}: ${value}`);
      }

      const updatedContent = `---\n${updatedFrontmatter}\n---\n${body}`;
      await fs.writeFile(filePath, updatedContent, 'utf-8');

      console.log(`MarkdownEditingModule: Updated entity ${entityId} in ${filePath}`);
      return true;
    } catch (error) {
      console.error(`MarkdownEditingModule: Failed to update entity ${entityId}:`, error);
      return false;
    }
  }

  async createEntity(entityId: string, properties: Record<string, any>, metadata: any): Promise<boolean> {
    // For Markdown, creating an entity might mean creating a new file
    // This is a simplified implementation
    const filePath = metadata.sourcePath;
    if (!filePath) {
      console.error('MarkdownEditingModule: Missing source path');
      return false;
    }

    try {
      // Generate frontmatter from properties
      const frontmatter = Object.entries(properties)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');

      const content = `---\n${frontmatter}\n---\n\n# New Document\n\nContent goes here...\n`;

      await fs.writeFile(filePath, content, 'utf-8');
      console.log(`MarkdownEditingModule: Created entity ${entityId} in ${filePath}`);
      return true;
    } catch (error) {
      console.error(`MarkdownEditingModule: Failed to create entity ${entityId}:`, error);
      return false;
    }
  }

  async deleteEntity(entityId: string, metadata: any): Promise<boolean> {
    // For Markdown, deleting an entity might mean deleting the file
    const filePath = metadata.sourcePath;
    if (!filePath) {
      console.error('MarkdownEditingModule: Missing source path');
      return false;
    }

    try {
      await fs.unlink(filePath);
      console.log(`MarkdownEditingModule: Deleted entity ${entityId} from ${filePath}`);
      return true;
    } catch (error) {
      console.error(`MarkdownEditingModule: Failed to delete entity ${entityId}:`, error);
      return false;
    }
  }
}

export class JSONEditingModule implements EditingModule {
  canHandle(sourceType: string, metadata: any): boolean {
    return sourceType === 'json' || (metadata?.sourcePath && metadata.sourcePath.endsWith('.json'));
  }

  async updateEntity(entityId: string, properties: Record<string, any>, metadata: any): Promise<boolean> {
    const filePath = metadata.sourcePath;
    if (!filePath) {
      console.error('JSONEditingModule: Missing source path');
      return false;
    }

    try {
      const current = await this.readJsonFile(filePath);
      const next = { ...current, ...properties };
      await this.writeJsonFile(filePath, next);
      console.log(`JSONEditingModule: Updated entity ${entityId} in ${filePath}`);
      return true;
    } catch (error) {
      console.error(`JSONEditingModule: Failed to update entity ${entityId}:`, error);
      return false;
    }
  }

  async createEntity(entityId: string, properties: Record<string, any>, metadata: any): Promise<boolean> {
    const filePath = metadata.sourcePath;
    if (!filePath) {
      console.error('JSONEditingModule: Missing source path');
      return false;
    }

    try {
      await this.writeJsonFile(filePath, properties);
      console.log(`JSONEditingModule: Created entity ${entityId} at ${filePath}`);
      return true;
    } catch (error) {
      console.error(`JSONEditingModule: Failed to create entity ${entityId}:`, error);
      return false;
    }
  }

  async deleteEntity(entityId: string, metadata: any): Promise<boolean> {
    const filePath = metadata.sourcePath;
    if (!filePath) {
      console.error('JSONEditingModule: Missing source path');
      return false;
    }

    try {
      await fs.unlink(filePath);
      console.log(`JSONEditingModule: Deleted entity ${entityId} from ${filePath}`);
      return true;
    } catch (error) {
      console.error(`JSONEditingModule: Failed to delete entity ${entityId}:`, error);
      return false;
    }
  }

  private async readJsonFile(filePath: string): Promise<Record<string, any>> {
    const content = await fs.readFile(filePath, 'utf-8');
    try {
      const parsed = JSON.parse(content);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch (error) {
      console.error(`JSONEditingModule: Failed to parse ${filePath}:`, error);
      return {};
    }
  }

  private async writeJsonFile(filePath: string, data: Record<string, any>): Promise<void> {
    const serialized = `${JSON.stringify(data, null, 2)}\n`;
    await fs.writeFile(filePath, serialized, 'utf-8');
  }
}
