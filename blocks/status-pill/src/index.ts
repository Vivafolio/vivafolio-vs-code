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
// It expects a default export function returning { element, init, applyEntitySnapshot }
export default function StatusPillFactory(_graphModule?: unknown) {
  const factoryResult = {
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
          // Notify loader/host via provided updateEntity bridge (properties-only). Spec-aligned path.
          if (typeof updateEntity === 'function') {
            updateEntity(properties)
          } else {
            try { console.warn('[StatusPillFactory] updateEntity callback missing; update discarded', { entityId }) } catch {}
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
  /**
   * Host → Block render hook: apply the latest entity snapshot to this custom element.
   *
   * Called by the loader when the Host sends a fresh blockEntitySubgraph-derived state
   * (e.g., after persistence or fan-out). It updates only UI state within the webview
   * by invoking the internal __vf_update render callback installed during init.
   *
   * This does not perform any persistence or I/O; mutations still flow Block → Host
   * via graph.updateEntity (bridged through the loader's updateEntity(properties)).
   */
  applyEntitySnapshot: ({ element, entity, readonly }: { element: HTMLElement; entity: Entity; readonly: boolean }) => {
    const nextStatus = (entity as any).properties?.status
    try { console.log('[StatusPillFactory] applyEntitySnapshot invoked for', entity.entityId, 'status =', nextStatus, 'readonly =', readonly) } catch {}
    // Always apply snapshot to keep UI consistent with host state (test relies on immediate text change)
    ;(element as any).__vf_prevEntity = entity
  // If component instance kept a local optimistic pending status, clear it by
  // mutating the entity object so rebuilt graphs reflect authoritative host value.
  try { (entity as any).properties = { ...(entity as any).properties, status: nextStatus } } catch {}
    const fn = (element as any).__vf_update as ((e: Entity, ro: boolean) => void) | undefined
    fn?.(entity, readonly)
  }
  }
  try { console.log('[StatusPillFactory] returning', factoryResult) } catch {}
  return factoryResult
}

export { init, updateGraph, StatusPillElement }
