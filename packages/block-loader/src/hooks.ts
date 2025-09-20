/**
 * Block Protocol React Hooks for Vivafolio
 *
 * This module provides React hooks that implement the Block Protocol hook mechanism,
 * enabling parent blocks to embed child blocks dynamically.
 */

import { RefObject, useLayoutEffect, useRef, useState } from 'react'
import { EntityId } from '@blockprotocol/graph'
import { HookData, HookResponse } from './types'

// Hook embedder interface
interface HookEmbedder {
  on(messageName: string, handler: Function): void
}

/**
 * Hook for embedding child blocks within parent blocks
 *
 * This implements the Block Protocol hook mechanism for nested block composition.
 * Parent blocks can use this hook to request that child blocks be rendered for specific entities.
 */
export const useHook = <T extends HTMLElement>(
  ref: RefObject<T | null | void>,
  type: string,
  entityId: EntityId,
  path: (string | number)[],
  fallback: (node: T) => void | (() => void),
) => {
  /**
   * React can't catch async errors to handle them within ErrorBoundary's, etc,
   * but if you throw it inside the callback for a setState function, it can.
   */
  const [, catchError] = useState()

  /**
   * The fallback may change in between the hook message being sent, and the
   * not implemented error being received. This allows to ensure we call the
   * latest fallback, with no chance of calling a stale closure
   */
  const fallbackRef = useRef(fallback)
  useLayoutEffect(() => {
    fallbackRef.current = fallback
  })

  const existingHookRef = useRef<null | {
    id: string | null
    cancel: () => void
    teardown: (() => Promise<void>) | null
    params: {
      type: string
      entityId: EntityId
      path: (string | number)[]
      node: T
    }
  }>(null)

  /**
   * We can't use the normal effect teardown to trigger the hook teardown, as
   * in order to detect changes to the node underlying the ref, we run our main
   * effect on every render. Therefore, we create a "mount" effect and trigger
   * the teardown in the mount effect teardown.
   */
  useLayoutEffect(() => {
    return () => {
      existingHookRef.current?.teardown?.().catch((err) => {
        catchError(() => {
          throw err
        })
      })
    }
  }, [])

  useLayoutEffect(() => {
    const existingHook = existingHookRef.current?.params
    const node = ref.current

    /**
     * We cannot use the dependency array for the effect, as refs aren't updated
     * during render, so the value passed into the dependency array for the ref
     * won't have updated and therefore updates to the underlying node wouldn't
     * trigger this effect, and embedding applications wouldn't be notified.
     *
     * Instead, we run the effect on every render and do our own change
     * detection.
     */
    if (
      existingHook &&
      existingHook.node === node &&
      existingHook.entityId === entityId &&
      JSON.stringify(existingHook.path) === JSON.stringify(path) &&
      existingHook.type === type
    ) {
      return
    }

    const existingHookId = existingHookRef.current?.id

    existingHookRef.current?.cancel()

    if (node) {
      const controller = new AbortController()

      const hook = {
        id: existingHookId ?? null,
        params: {
          type,
          entityId,
          path,
          node,
        },
        cancel() {
          controller.abort()
        },
        async teardown() {
          if (controller.signal.aborted) {
            return
          }

          controller.abort()

          const hookId = hook.id

          if (hookId) {
            try {
              hook.id = null
              if (existingHookRef.current === hook) {
                existingHookRef.current = null
              }

              // Get the hook embedder from the global scope
              const hookEmbedder = (window as any).__vivafolioHookEmbedder as HookEmbedder
              if (hookEmbedder && (hookEmbedder as any)._hookHandler) {
                await (hookEmbedder as any)._hookHandler({
                  data: {
                    hookId,
                    entityId,
                    path,
                    type,
                    node: null,
                  }
                })
              }
            } catch (err) {
              catchError(() => {
                throw err
              })
            }
          }
        },
      }

      existingHookRef.current = hook

      // Send the hook message
      const sendHookMessage = async () => {
        try {
          const hookEmbedder = (window as any).__vivafolioHookEmbedder as HookEmbedder
          if (!hookEmbedder || !(hookEmbedder as any)._hookHandler) {
            // No hook embedder available, use fallback
            const teardown = fallbackRef.current(node)
            hook.teardown = async () => {
              controller.abort()
              teardown?.()
            }
            return
          }

          const response = await (hookEmbedder as any)._hookHandler({
            data: {
              hookId: hook.id,
              entityId,
              node,
              type,
              path,
            }
          })

          if (!controller.signal.aborted) {
            if (response.errors) {
              const firstError = response.errors[0]
              if (firstError?.code === "NOT_IMPLEMENTED") {
                const teardown = fallbackRef.current(node)
                hook.teardown = async () => {
                  controller.abort()
                  teardown?.()
                }
              } else if (firstError?.code === "NOT_FOUND") {
                const errMsg = `Hook with id ${hook.id} was not found by embedding application`
                if (node === null) {
                  // don't throw if the request was for hook deletion – the embedding app can't find the hook, things can continue
                  console.warn(`${errMsg} – no hook to remove`)
                } else {
                  throw new Error(errMsg)
                }
              } else {
                console.error(response.errors)
                throw new Error("Unknown error in hook")
              }
            } else if (response.data) {
              hook.id = response.data.hookId
            }
          }
        } catch (err) {
          catchError(() => {
            throw err
          })
        }
      }

      sendHookMessage()
    } else {
      existingHookRef.current = null
    }
  })
}

/**
 * Hook for creating embeddable entity references
 *
 * This is a convenience hook that wraps useHook with the vivafolio:embed:entity type,
 * specifically for embedding child blocks that represent entities.
 */
export const useEmbedEntity = <T extends HTMLElement>(
  ref: RefObject<T | null | void>,
  entityId: EntityId,
  path: (string | number)[],
  fallback: (node: T) => void | (() => void),
) => {
  return useHook(ref, 'vivafolio:embed:entity', entityId, path, fallback)
}

/**
 * Hook for accessing the current graph context
 *
 * This provides access to the shared entity graph that parent and child blocks can use
 * to communicate and coordinate state.
 */
export const useGraphContext = () => {
  // Get the current graph from the global block context
  const graphContext = (window as any).__vivafolioGraphContext

  if (!graphContext) {
    console.warn('useGraphContext: No graph context available. Make sure this component is rendered within a block.')
    return null
  }

  return graphContext
}

/**
 * Hook for subscribing to entity updates
 *
 * This allows blocks to react to changes in specific entities within the shared graph.
 */
export const useEntityUpdates = (entityId: EntityId, callback: (entity: any) => void) => {
  useLayoutEffect(() => {
    const graphContext = (window as any).__vivafolioGraphContext

    if (!graphContext) {
      console.warn('useEntityUpdates: No graph context available')
      return
    }

    const unsubscribe = graphContext.subscribeToEntity(entityId, callback)

    return unsubscribe
  }, [entityId, callback])
}
