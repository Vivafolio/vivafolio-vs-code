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
          if (typeof updateEntity === 'function') {
            // Notify loader/host; client will forward to server via onBlockUpdate
            updateEntity(properties)
          } else {
            // No update path available; log and no-op
            try { console.warn('[StatusPillFactory] updateEntity not provided by loader; dropping update', { entityId, properties }) } catch {}
          }
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
