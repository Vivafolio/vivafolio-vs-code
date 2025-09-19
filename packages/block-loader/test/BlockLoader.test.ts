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
  })
})
