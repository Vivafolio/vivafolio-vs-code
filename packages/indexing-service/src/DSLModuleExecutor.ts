import * as fs from 'fs/promises';
import * as path from 'path';
import { EditingModule, DSLModule, EditResult, EditContext } from './EditingModule';

export class DSLModuleExecutor implements EditingModule {
  canHandle(sourceType: string, metadata: any): boolean {
    return sourceType === 'vivafolio_data_construct' && !!metadata?.dslModule;
  }

  async updateEntity(entityId: string, properties: Record<string, any>, metadata: any): Promise<boolean> {
    const dslModule = metadata.dslModule as DSLModule;
    const sourcePath = metadata.sourcePath;

    if (!dslModule || !sourcePath) {
      console.error('DSLModuleExecutor: Missing DSL module or source path');
      return false;
    }

    try {
      // Read the current file content
      const content = await fs.readFile(sourcePath, 'utf-8');

      // For vivafolio_data!() constructs, we need to update the table data
      const updatedContent = this.updateTableDataInContent(content, entityId, properties, dslModule);

      if (updatedContent !== content) {
        await fs.writeFile(sourcePath, updatedContent, 'utf-8');
        console.log(`DSLModuleExecutor: Updated entity ${entityId} in ${sourcePath}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`DSLModuleExecutor: Failed to update entity ${entityId}:`, error);
      return false;
    }
  }

  async createEntity(entityId: string, properties: Record<string, any>, metadata: any): Promise<boolean> {
    const dslModule = metadata.dslModule as DSLModule;
    const sourcePath = metadata.sourcePath;

    if (!dslModule || !sourcePath) {
      console.error('DSLModuleExecutor: Missing DSL module or source path');
      return false;
    }

    try {
      const content = await fs.readFile(sourcePath, 'utf-8');
      const updatedContent = this.addRowToTableData(content, properties, dslModule);

      if (updatedContent !== content) {
        await fs.writeFile(sourcePath, updatedContent, 'utf-8');
        console.log(`DSLModuleExecutor: Created entity ${entityId} in ${sourcePath}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`DSLModuleExecutor: Failed to create entity ${entityId}:`, error);
      return false;
    }
  }

  async deleteEntity(entityId: string, metadata: any): Promise<boolean> {
    const dslModule = metadata.dslModule as DSLModule;
    const sourcePath = metadata.sourcePath;

    if (!dslModule || !sourcePath) {
      console.error('DSLModuleExecutor: Missing DSL module or source path');
      return false;
    }

    try {
      const content = await fs.readFile(sourcePath, 'utf-8');
      const updatedContent = this.removeRowFromTableData(content, entityId, dslModule);

      if (updatedContent !== content) {
        await fs.writeFile(sourcePath, updatedContent, 'utf-8');
        console.log(`DSLModuleExecutor: Deleted entity ${entityId} in ${sourcePath}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`DSLModuleExecutor: Failed to delete entity ${entityId}:`, error);
      return false;
    }
  }

  private updateTableDataInContent(content: string, entityId: string, properties: Record<string, any>, dslModule: DSLModule): string {
    // Find the vivafolio_data!() construct
    const pattern = new RegExp(`vivafolio_data!\\(\\s*["']${dslModule.entityId}["']\\s*,\\s*r#"([\\s\\S]*?)"#\\s*\\)`, 'g');
    const match = pattern.exec(content);

    if (!match) {
      console.error(`DSLModuleExecutor: Could not find vivafolio_data!() construct for ${dslModule.entityId}`);
      return content;
    }

    const tableText = match[1];
    const lines = tableText.trim().split('\n');

    if (lines.length < 2) {
      console.error('DSLModuleExecutor: Invalid table format');
      return content;
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

    // Find the row to update based on entityId (format: entityId-row-N)
    const rowMatch = entityId.match(new RegExp(`${dslModule.entityId}-row-(\\d+)`));
    if (!rowMatch) {
      console.error(`DSLModuleExecutor: Invalid entity ID format: ${entityId}`);
      return content;
    }

    const rowIndex = parseInt(rowMatch[1], 10);
    const dataRowIndex = rowIndex + 1; // +1 because first line is headers

    if (dataRowIndex >= lines.length) {
      console.error(`DSLModuleExecutor: Row index ${rowIndex} out of bounds`);
      return content;
    }

      // Get current row data
      const currentRow = lines[dataRowIndex];
      const cells = currentRow.split(',').map(c => c.trim().replace(/"/g, ''));

      // Update the row with new properties, preserving existing values
      const updatedRow = headers.map(header => {
        const value = properties[header];
        return value !== undefined ? `"${value}"` : `"${cells[headers.indexOf(header)] || ''}"`;
      }).join(', ');

    lines[dataRowIndex] = updatedRow;
    const updatedTableText = lines.join('\n');
    const updatedContent = content.replace(match[0], `vivafolio_data!("${dslModule.entityId}", r#"\n${updatedTableText}\n"#)`);

    return updatedContent;
  }

  private addRowToTableData(content: string, properties: Record<string, any>, dslModule: DSLModule): string {
    // Find the vivafolio_data!() construct
    const pattern = new RegExp(`vivafolio_data!\\(\\s*["']${dslModule.entityId}["']\\s*,\\s*r#"([\\s\\S]*?)"#\\s*\\)`, 'g');
    const match = pattern.exec(content);

    if (!match) {
      console.error(`DSLModuleExecutor: Could not find vivafolio_data!() construct for ${dslModule.entityId}`);
      return content;
    }

    const tableText = match[1];
    const lines = tableText.trim().split('\n');

    if (lines.length < 1) {
      console.error('DSLModuleExecutor: Invalid table format - no headers');
      return content;
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

    // Create new row from properties
    const newRow = headers.map(header => {
      const value = properties[header];
      return value !== undefined ? `"${value}"` : '""';
    }).join(', ');

    lines.push(newRow);
    const updatedTableText = lines.join('\n');
    const updatedContent = content.replace(match[0], `vivafolio_data!("${dslModule.entityId}", r#"\n${updatedTableText}\n"#)`);

    return updatedContent;
  }

  private removeRowFromTableData(content: string, entityId: string, dslModule: DSLModule): string {
    // Find the vivafolio_data!() construct
    const pattern = new RegExp(`vivafolio_data!\\(\\s*["']${dslModule.entityId}["']\\s*,\\s*r#"([\\s\\S]*?)"#\\s*\\)`, 'g');
    const match = pattern.exec(content);

    if (!match) {
      console.error(`DSLModuleExecutor: Could not find vivafolio_data!() construct for ${dslModule.entityId}`);
      return content;
    }

    const tableText = match[1];
    const lines = tableText.trim().split('\n');

    if (lines.length < 2) {
      console.error('DSLModuleExecutor: No data rows to delete');
      return content;
    }

    // Find the row to delete based on entityId (format: entityId-row-N)
    const rowMatch = entityId.match(new RegExp(`${dslModule.entityId}-row-(\\d+)`));
    if (!rowMatch) {
      console.error(`DSLModuleExecutor: Invalid entity ID format: ${entityId}`);
      return content;
    }

    const rowIndex = parseInt(rowMatch[1], 10);
    const dataRowIndex = rowIndex + 1; // +1 because first line is headers

    if (dataRowIndex >= lines.length) {
      console.error(`DSLModuleExecutor: Row index ${rowIndex} out of bounds`);
      return content;
    }

    // Remove the row
    lines.splice(dataRowIndex, 1);
    const updatedTableText = lines.join('\n');
    const updatedContent = content.replace(match[0], `vivafolio_data!("${dslModule.entityId}", r#"\n${updatedTableText}\n"#)`);

    return updatedContent;
  }
}
