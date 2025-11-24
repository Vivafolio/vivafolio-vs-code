import type { Component, Accessor } from 'solid-js'
import { createSignal, Show, onCleanup, onMount } from 'solid-js'
import type { BlockProps, Entity, GraphService } from '@vivafolio/block-solidjs'

export type StatusOption = 'todo' | 'in-progress' | 'done' | 'blocked' | 'review'

const STATUS: Record<StatusOption, { label: string; color: string; bg: string }> = {
  'todo': { label: 'To Do', color: '#6b7280', bg: '#f3f4f6' },
  'in-progress': { label: 'In Progress', color: '#f59e0b', bg: '#fef3c7' },
  'done': { label: 'Done', color: '#10b981', bg: '#d1fae5' },
  'blocked': { label: 'Blocked', color: '#ef4444', bg: '#fee2e2' },
  'review': { label: 'Review', color: '#8b5cf6', bg: '#e9d5ff' },
}

export type StatusPillGraphService = Omit<GraphService, 'blockEntity' | 'readonly'> & {
  blockEntity: Accessor<Entity>
  readonly: Accessor<boolean>
  updateEntity?: (args: { entityId: string; properties: Record<string, unknown> }) => Promise<void>
}

export interface StatusPillProps extends BlockProps<StatusPillGraphService> {}

const StatusPill: Component<StatusPillProps> = (props) => {
  const entity = () => props.graph.blockEntity()
  const readonly = () => props.graph.readonly()
  const [open, setOpen] = createSignal(false)
  // Optimistic UI: prefer locally chosen status until next server notification arrives
  const [pending, setPending] = createSignal<StatusOption | undefined>(undefined)
  const status = () => (pending() ?? ((entity().properties?.['status'] as StatusOption) || 'in-progress'))

  const cfg = () => STATUS[status()] ?? STATUS['in-progress']

  function outside(e: MouseEvent) {
    const host = (e.target as HTMLElement)
    if (!host.closest('.vf-status-pill')) setOpen(false)
  }

  onMount(() => document.addEventListener('click', outside))
  onCleanup(() => document.removeEventListener('click', outside))

  const commit = async (next: StatusOption) => {
    const id = entity().metadata?.recordId?.entityId ?? entity().entityId
  try { console.log('[StatusPill] commit called with', next, 'for entity', id) } catch {}
  // Optimistic update first
  setPending(next)
  await props.graph.updateEntity?.({ entityId: id, properties: { ...(entity().properties || {}), status: next } })
  try { console.log('[StatusPill] updateEntity invoked for', id, 'next status =', next) } catch {}
    setOpen(false)
  }

  return (
    <div class="status-pill-block vf-status-pill" style={{
      display: 'inline-flex', 'align-items': 'center', padding: '4px 8px', 'border-radius': '12px',
      background: cfg().bg, border: `1px solid ${cfg().color}20`, color: cfg().color, position: 'relative',
      cursor: readonly() ? 'default' : 'pointer'
    }} onClick={() => !readonly() && setOpen(!open())}>
      <div style={{ width: '6px', height: '6px', 'border-radius': '50%', background: cfg().color, 'margin-right': '6px' }} />
      <span>{cfg().label}</span>
      <Show when={!readonly()}>
        <span style={{ 'font-size': '10px', 'margin-left': '4px', opacity: 0.6 }}>▼</span>
        <Show when={open()}>
          <div class="vf-status-menu" role="menu" style={{ position: 'absolute', top: '100%', left: 0, background: 'white', border: '1px solid #e5e7eb', 'border-radius': '8px', 'box-shadow': '0 4px 6px -1px rgba(0,0,0,0.1)', 'z-index': 1000, 'min-width': '140px', 'margin-top': '4px' }}>
            {(Object.keys(STATUS) as StatusOption[]).map((key) => (
              <div
                role="menuitem"
                tabindex={0}
                style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', 'align-items': 'center', 'font-size': '12px' }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f9fafb')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); void commit(key) }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); void commit(key) }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); void commit(key) } }}
              >
                <div style={{ width: '6px', height: '6px', 'border-radius': '50%', background: STATUS[key].color, 'margin-right': '8px' }} />
                <span>{STATUS[key].label}</span>
              </div>
            ))}
          </div>
        </Show>
      </Show>
    </div>
  )
}

export default StatusPill
