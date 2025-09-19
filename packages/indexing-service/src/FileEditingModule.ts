import * as fs from 'fs/promises';
import * as path from 'path';
import { EditingModule, EditResult, EditContext } from './EditingModule';

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
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      if (lines.length < 2) {
        console.error('CSVEditingModule: Invalid CSV format');
        return false;
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

      // For CSV files, entityId format is typically filePath-row-N
      const rowMatch = entityId.match(/-row-(\d+)$/);
      if (!rowMatch) {
        console.error(`CSVEditingModule: Invalid entity ID format: ${entityId}`);
        return false;
      }

      const rowIndex = parseInt(rowMatch[1], 10);
      const dataRowIndex = rowIndex + 1; // +1 because first line is headers

      if (dataRowIndex >= lines.length) {
        console.error(`CSVEditingModule: Row index ${rowIndex} out of bounds`);
        return false;
      }

      // Get current row data
      const currentRow = lines[dataRowIndex];
      const currentCells = currentRow.split(',').map(c => c.trim().replace(/"/g, ''));

      // Update the row, preserving existing values
      const updatedRow = headers.map((header, index) => {
        const value = properties[header];
        return value !== undefined ? `"${value}"` : `"${currentCells[index] || ''}"`;
      }).join(',');

      lines[dataRowIndex] = updatedRow;
      const updatedContent = lines.join('\n');

      await fs.writeFile(filePath, updatedContent, 'utf-8');
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
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      if (lines.length < 1) {
        console.error('CSVEditingModule: Invalid CSV format - no headers');
        return false;
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

      // Create new row
      const newRow = headers.map(header => {
        const value = properties[header];
        return value !== undefined ? `"${value}"` : '""';
      }).join(',');

      lines.push(newRow);
      const updatedContent = lines.join('\n');

      await fs.writeFile(filePath, updatedContent, 'utf-8');
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
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      if (lines.length < 2) {
        console.error('CSVEditingModule: No data rows to delete');
        return false;
      }

      // For CSV files, entityId format is typically filePath-row-N
      const rowMatch = entityId.match(/-row-(\d+)$/);
      if (!rowMatch) {
        console.error(`CSVEditingModule: Invalid entity ID format: ${entityId}`);
        return false;
      }

      const rowIndex = parseInt(rowMatch[1], 10);
      const dataRowIndex = rowIndex + 1; // +1 because first line is headers

      if (dataRowIndex >= lines.length) {
        console.error(`CSVEditingModule: Row index ${rowIndex} out of bounds`);
        return false;
      }

      // Remove the row
      lines.splice(dataRowIndex, 1);
      const updatedContent = lines.join('\n');

      await fs.writeFile(filePath, updatedContent, 'utf-8');
      console.log(`CSVEditingModule: Deleted entity ${entityId} in ${filePath}`);
      return true;
    } catch (error) {
      console.error(`CSVEditingModule: Failed to delete entity ${entityId}:`, error);
      return false;
    }
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
