import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { IndexingService, IndexingServiceConfig } from '../src/IndexingService'

describe('tasks.csv integration', () => {
  const repoRoot = path.resolve(__dirname, '../../../')
  const sourceCsv = path.resolve(repoRoot, 'apps/blockprotocol-poc/data/tasks.csv')
  const csvCopyPrefix = path.join(os.tmpdir(), 'vivafolio-tasks-csv-')

  let tempDir: string
  let tempCsvPath: string
  let service: IndexingService

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(csvCopyPrefix)
    tempCsvPath = path.join(tempDir, 'tasks.csv')
    await fs.copyFile(sourceCsv, tempCsvPath)

    const config: IndexingServiceConfig = {
      watchPaths: [tempDir],
      supportedExtensions: ['csv'],
      excludePatterns: []
    }

    service = new IndexingService(config)

    const processCSVFile = (service as any).processCSVFile.bind(service)
    await processCSVFile(tempCsvPath)
  })

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('indexes rows, logs entities, updates a status, and persists CSV changes', async () => {
    const entities = service.getAllEntities()
    console.log('[tasks.csv] indexed entities:', entities)
    expect(entities).toHaveLength(10)

    const targetEntityId = 'tasks-row-5' // line 6 in the source CSV (1 header + 5 data rows)
    const updateResult = await service.updateEntity(targetEntityId, { status: 'blocked' })

    expect(updateResult).toBe(true)

    const updatedCsv = await fs.readFile(tempCsvPath, 'utf-8')
    const lines = updatedCsv.trim().split('\n')

    expect(lines[6]).toContain('Marketing brief')
    expect(lines[6].toLowerCase()).toContain('blocked')
  })
})
