/**
 * Basic tests for @vivafolio/block-loader
 */

import { VivafolioBlockLoader, DEFAULT_ALLOWED_DEPENDENCIES, VivafolioBlockNotification } from '../src'

describe('@vivafolio/block-loader', () => {
  describe('DEFAULT_ALLOWED_DEPENDENCIES', () => {
    it('should include required Block Protocol dependencies', () => {
      expect(DEFAULT_ALLOWED_DEPENDENCIES.has('react')).toBe(true)
      expect(DEFAULT_ALLOWED_DEPENDENCIES.has('@blockprotocol/graph')).toBe(true)
      expect(DEFAULT_ALLOWED_DEPENDENCIES.has('react-dom')).toBe(true)
    })

    it('should not include arbitrary dependencies', () => {
      expect(DEFAULT_ALLOWED_DEPENDENCIES.has('lodash')).toBe(false)
      expect(DEFAULT_ALLOWED_DEPENDENCIES.has('express')).toBe(false)
      expect(DEFAULT_ALLOWED_DEPENDENCIES.has('dangerous-module')).toBe(false)
    })
  })

  describe('VivafolioBlockLoader', () => {
    // Mock notification for testing
    const mockNotification: VivafolioBlockNotification = {
      blockId: 'test-block',
      blockType: 'test-type',
      displayMode: 'multi-line',
      sourceUri: 'file:///test',
      range: {
        start: { line: 1, character: 0 },
        end: { line: 5, character: 0 }
      },
      entityId: 'test-entity',
      resources: [],
      entityGraph: {
        entities: [{
          entityId: 'test-entity',
          properties: { title: 'Test' }
        }],
        links: []
      }
    }

    it('should create a loader instance', () => {
      const loader = new VivafolioBlockLoader(mockNotification)
      expect(loader).toBeDefined()
      expect(typeof loader.loadBlock).toBe('function')
      expect(typeof loader.updateBlock).toBe('function')
      expect(typeof loader.destroy).toBe('function')
      expect(typeof loader.getDiagnostics).toBe('function')
    })

    it('should support custom options', () => {
      const customDeps = new Set(['react', 'custom-dep'])
      const loader = new VivafolioBlockLoader(mockNotification, {
        allowedDependencies: customDeps,
        enableIntegrityChecking: false,
        enableDiagnostics: false
      })
      expect(loader).toBeDefined()
    })

    it('should return null diagnostics initially', () => {
      const loader = new VivafolioBlockLoader(mockNotification)
      expect(loader.getDiagnostics()).toBeNull()
    })

    it('should handle destroy without error', () => {
      const loader = new VivafolioBlockLoader(mockNotification)
      expect(() => loader.destroy()).not.toThrow()
    })

    it('should provide mini-host interface', () => {
      const loader = new VivafolioBlockLoader(mockNotification)
      const miniHost = loader.getMiniHost()
      expect(miniHost).toBeDefined()
      expect(typeof miniHost.handleHookMessage).toBe('function')
      expect(typeof miniHost.mountNestedBlock).toBe('function')
      expect(typeof miniHost.unmountNestedBlock).toBe('function')
    })

    it('should handle hook messages via mini-host', async () => {
      const loader = new VivafolioBlockLoader(mockNotification)
      const miniHost = loader.getMiniHost()

      // Test vivafolio:embed:entity hook - should attempt to mount but fail due to missing resources
      const hookData = {
        node: document.createElement('div'),
        type: 'vivafolio:embed:entity',
        path: [],
        hookId: null,
        entityId: 'test-entity'
      }

      // This will attempt to load a block but fail due to missing resources
      // The important thing is that it doesn't throw and returns a response
      try {
        const response = await miniHost.handleHookMessage(hookData)
        expect(response).toBeDefined()
        expect(response!.hookId).toBeDefined()
      } catch (error) {
        // Expected to fail due to missing block resources
        expect((error as Error).message).toContain('HTML resource missing')
      }
    })

    it('should return null for unsupported hook types', async () => {
      const loader = new VivafolioBlockLoader(mockNotification)
      const miniHost = loader.getMiniHost()

      const hookData = {
        node: document.createElement('div'),
        type: 'unsupported:hook:type',
        path: [],
        hookId: null,
        entityId: 'test-entity'
      }

      const response = await miniHost.handleHookMessage(hookData)
      expect(response).toBeNull()
    })

    it('should handle hook teardown (null node)', async () => {
      const loader = new VivafolioBlockLoader(mockNotification)
      const miniHost = loader.getMiniHost()

      const hookData = {
        node: null,
        type: 'vivafolio:embed:entity',
        path: [],
        hookId: 'test-hook-id',
        entityId: 'test-entity'
      }

      const response = await miniHost.handleHookMessage(hookData)
      expect(response).toBeDefined()
      expect(response!.hookId).toBe('teardown')
    })

    it('should throw error for unknown entity in hook', async () => {
      const loader = new VivafolioBlockLoader(mockNotification)
      const miniHost = loader.getMiniHost()

      const hookData = {
        node: document.createElement('div'),
        type: 'vivafolio:embed:entity',
        path: [],
        hookId: null,
        entityId: 'unknown-entity'
      }

      await expect(miniHost.handleHookMessage(hookData)).rejects.toThrow('Entity not found: unknown-entity')
    })

    it('should unmount nested blocks', () => {
      const loader = new VivafolioBlockLoader(mockNotification)
      const miniHost = loader.getMiniHost()

      // Should not throw even if entity doesn't exist
      expect(() => miniHost.unmountNestedBlock('nonexistent')).not.toThrow()
    })
  })

  describe('Hook Integration', () => {
    const mockNotification: VivafolioBlockNotification = {
      blockId: 'parent-block',
      blockType: 'test-parent',
      displayMode: 'multi-line',
      sourceUri: 'file:///test',
      range: {
        start: { line: 1, character: 0 },
        end: { line: 5, character: 0 }
      },
      entityId: 'parent-entity',
      resources: [],
      entityGraph: {
        entities: [
          {
            entityId: 'parent-entity',
            properties: { title: 'Parent' }
          },
          {
            entityId: 'child-entity',
            properties: { name: 'Child', email: 'child@example.com' }
          }
        ],
        links: []
      }
    }

    it('should set up hook embedder on container', async () => {
      const loader = new VivafolioBlockLoader(mockNotification)
      const container = document.createElement('div')

      // Mock the block loading to avoid resource requirements
      loader.loadBlock = jest.fn().mockResolvedValue(container)

      // Manually trigger hook interception setup (this happens in setupGraphEmbedder)
      ;(loader as any).setupHookInterception(container)

      expect((container as any)._hookEmbedder).toBeDefined()
      expect((container as any)._graphContext).toBeDefined()
      expect((window as any).__vivafolioHookEmbedder).toBeDefined()
      expect((window as any).__vivafolioGraphContext).toBeDefined()
    })

    it('should provide graph context methods', async () => {
      const loader = new VivafolioBlockLoader(mockNotification)
      const container = document.createElement('div')

      // Manually trigger hook interception setup
      ;(loader as any).setupHookInterception(container)

      const graphContext = (container as any)._graphContext
      expect(graphContext).toBeDefined()
      expect(typeof graphContext.subscribeToEntity).toBe('function')
      expect(typeof graphContext.getEntity).toBe('function')
      expect(typeof graphContext.updateEntity).toBe('function')
      expect(graphContext.graph).toBe(mockNotification.entityGraph)
    })

    it('should allow subscribing to entity updates', async () => {
      const loader = new VivafolioBlockLoader(mockNotification)
      const container = document.createElement('div')

      // Manually trigger hook interception setup
      ;(loader as any).setupHookInterception(container)

      const graphContext = (container as any)._graphContext
      const callback = jest.fn()
      const unsubscribe = graphContext.subscribeToEntity('child-entity', callback)

      expect(typeof unsubscribe).toBe('function')

      // Cleanup
      unsubscribe()
    })

    it('should retrieve entities by ID', async () => {
      const loader = new VivafolioBlockLoader(mockNotification)
      const container = document.createElement('div')

      // Manually trigger hook interception setup
      ;(loader as any).setupHookInterception(container)

      const graphContext = (container as any)._graphContext
      const entity = graphContext.getEntity('child-entity')

      expect(entity).toBeDefined()
      expect(entity!.entityId).toBe('child-entity')
      expect(entity!.properties.name).toBe('Child')
    })

    it('should return undefined for non-existent entities', async () => {
      const loader = new VivafolioBlockLoader(mockNotification)
      const container = document.createElement('div')

      // Manually trigger hook interception setup
      ;(loader as any).setupHookInterception(container)

      const graphContext = (container as any)._graphContext
      const entity = graphContext.getEntity('nonexistent')

      expect(entity).toBeUndefined()
    })
  })
})
