import { startStandaloneServer } from './src/standalone-server.ts'

const customScenarios = {
  'test-scenario': {
    id: 'test-scenario',
    title: 'Test Scenario',
    description: 'Custom test scenario',
    createState: () => ({
      graph: {
        entities: [{
          entityId: 'test-entity',
          entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
          properties: {
            'https://blockprotocol.org/@blockprotocol/types/property-type/name/': 'Test Entity',
            customProperty: 'test-value'
          }
        }],
        links: []
      }
    }),
    buildNotifications: (state) => [{
      blockId: 'test-block',
      blockType: 'https://test.com/blocks/test/v1',
      entityId: state.graph.entities[0]?.entityId || 'test-entity',
      displayMode: 'multi-line',
      entityGraph: state.graph,
      supportsHotReload: false,
      initialHeight: 150
    }],
    applyUpdate: ({ state, update }) => {
      const entity = state.graph.entities.find(e => e.entityId === update.entityId)
      if (entity) {
        entity.properties = { ...entity.properties, ...update.properties }
      }
    }
  }
}

const server = await startStandaloneServer({
  port: 3020,
  frameworks: [],
  enableHotReload: false,
  attachSignalHandlers: false,
  scenarios: customScenarios
})

await new Promise(resolve => setTimeout(resolve, 2000))

const response = await fetch('http://localhost:3020/healthz')
const data = await response.json()

if (!data.scenarios.includes('test-scenario')) {
  console.error('Custom scenario not found in health check', data)
  await server.close()
  process.exit(2)
}

await server.close()
console.log('Custom scenario test passed')
process.exit(0)
