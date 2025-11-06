import { createBlockElement } from '@vivafolio/block-solidjs'
import StatusPill, { type StatusPillGraphService } from './StatusPill'
import type { Entity, GraphService } from '@vivafolio/block-solidjs'
import './styles.css'

const { element: StatusPillElement, init, updateGraph } = createBlockElement<StatusPillGraphService>(
  StatusPill,
  { name: 'Status Pill', version: '0.1.0', description: 'A status indicator pill Web Component.' }
)

if (!customElements.get('vivafolio-status-pill')) {
  customElements.define('vivafolio-status-pill', StatusPillElement)
}

// Adapter factory for VivafolioBlockLoader (custom-element mode)
// It expects a default export function returning { element, init, updateEntity }
export default function StatusPillFactory(_graphModule?: unknown) {
  return {
    element: StatusPillElement,
  init: ({ element, entity, readonly, updateEntity }: {
      element: HTMLElement
      entity: Entity
      readonly: boolean
      updateEntity?: (properties: Record<string, unknown>) => void
    }) => {
      const graph: StatusPillGraphService = {
        blockEntity: entity,
        blockGraph: { depth: 1, linkedEntities: [entity], linkGroups: [] },
        entityTypes: [],
        linkedAggregations: [],
        readonly,
        // Bridge BlockLoader's property-only updater to our graph.updateEntity signature
        updateEntity: async ({ entityId, properties }) => {
          try { console.log('[StatusPillFactory] graph.updateEntity bridge called for', entityId, properties) } catch {}
          // Primary path: notify loader/host via provided updateEntity bridge (properties-only)
          if (typeof updateEntity === 'function') {
            updateEntity(properties)
          } else {
            try { console.warn('[StatusPillFactory] updateEntity not provided by loader; attempting window bridge', { entityId }) } catch {}
          }
          // Narrow fallback: also post a spec-style window message so hosts that listen for
          // updateEntity can handle it (used by the POC client for non-factory/iframe cases)
          try {
            const blockId = (element as HTMLElement)?.dataset?.blockId
            if (blockId) {
              window.postMessage({ type: 'updateEntity', blockId, data: { entityId, properties } }, '*')
            }
          } catch {}
        }
      }

      const cleanup = init({ element, graph })

      // Save update hook on the element so updateEntity calls can re-render with new graph
      ;(element as any).__vf_update = (nextEntity: Entity, ro: boolean) => {
        const nextGraph: StatusPillGraphService = { ...graph, blockEntity: nextEntity, readonly: ro }
        updateGraph({ element, graph: nextGraph })
      }

      return cleanup
    },
    updateEntity: ({ element, entity, readonly }: { element: HTMLElement; entity: Entity; readonly: boolean }) => {
      const fn = (element as any).__vf_update as ((e: Entity, ro: boolean) => void) | undefined
      fn?.(entity, readonly)
    }
  }
}

export { init, updateGraph, StatusPillElement }
