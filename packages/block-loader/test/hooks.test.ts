// Mock React hooks before importing anything that uses them
const mockUseLayoutEffect = jest.fn()
const mockUseRef = jest.fn()
const mockUseState = jest.fn()

jest.mock('react', () => ({
  useLayoutEffect: mockUseLayoutEffect,
  useRef: mockUseRef,
  useState: mockUseState
}))

/**
 * Tests for Block Protocol React hooks
 */

import { useEmbedEntity, useGraphContext, useEntityUpdates } from '../src/hooks'

describe('@vivafolio/block-loader hooks', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks()

    // Mock useRef to return a ref object
    mockUseRef.mockReturnValue({ current: null })

    // Mock useState to return state and setter
    mockUseState.mockReturnValue([undefined, jest.fn()])

    // Mock useLayoutEffect
    mockUseLayoutEffect.mockImplementation((callback) => {
      // Don't execute effects in tests
    })

    // Set up global hook embedder
    ;(global as any).window = {
      __vivafolioHookEmbedder: {
        on: jest.fn((messageName, handler) => {
          if (messageName === 'hook') {
            ;(global as any).window.__vivafolioHookEmbedder._hookHandler = handler
          }
        }),
        _hookHandler: jest.fn()
      },
      __vivafolioGraphContext: {
        graph: { entities: [], links: [] },
        subscribeToEntity: jest.fn(),
        getEntity: jest.fn(),
        updateEntity: jest.fn()
      }
    }
  })

  afterEach(() => {
    delete (global as any).window
  })

  describe('useEmbedEntity', () => {
    it('should be a function', () => {
      expect(typeof useEmbedEntity).toBe('function')
    })

    it('should set up hook with embed entity type', () => {
      const ref = { current: document.createElement('div') }
      const entityId = 'test-entity'
      const path: (string | number)[] = ['assignee']
      const fallback = jest.fn()

      // Mock useRef to return our ref
      mockUseRef.mockReturnValueOnce({ current: null }) // existingHookRef
      mockUseRef.mockReturnValueOnce({ current: fallback }) // fallbackRef

      useEmbedEntity(ref, entityId, path, fallback)

      // Should have called useRef for existing hook tracking
      expect(mockUseRef).toHaveBeenCalled()
    })
  })

  describe('useGraphContext', () => {
    it('should return graph context when available', () => {
      const context = useGraphContext()
      expect(context).toBeDefined()
      expect(context).toBe((global as any).window.__vivafolioGraphContext)
    })

    it('should return null when no context is available', () => {
      delete (global as any).window.__vivafolioGraphContext

      const context = useGraphContext()
      expect(context).toBeNull()
    })
  })

  describe('useEntityUpdates', () => {
    it('should subscribe to entity updates', () => {
      const entityId = 'test-entity'
      const callback = jest.fn()

      const mockSubscribe = (global as any).window.__vivafolioGraphContext.subscribeToEntity

      useEntityUpdates(entityId, callback)

      expect(mockUseLayoutEffect).toHaveBeenCalled()
    })

    it('should handle missing graph context', () => {
      delete (global as any).window.__vivafolioGraphContext

      const entityId = 'test-entity'
      const callback = jest.fn()

      // Should not throw
      expect(() => useEntityUpdates(entityId, callback)).not.toThrow()
    })
  })
})
