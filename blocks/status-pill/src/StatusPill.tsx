import type { Component, Accessor } from 'solid-js'
import { createEffect, createMemo, createSignal, Show, onCleanup, onMount } from 'solid-js'
import type { BlockProps, Entity, GraphService } from '@vivafolio/block-solidjs'

interface RawStatusOption {
  value?: string
  label?: string
  color?: string
}

interface NormalizedStatusOption {
  value: string
  label: string
  color: string
  background: string
}

const DEFAULT_STATUS_COLOR = '#6b7280'
const DEFAULT_STATUS_BACKGROUND = '#f3f4f6'

const FALLBACK_STATUS_SOURCE: RawStatusOption[] = [
  { value: 'to_do', label: 'To Do', color: '#6b7280' },
  { value: 'in_progress', label: 'In Progress', color: '#f59e0b' },
  { value: 'blocked', label: 'Blocked', color: '#ef4444' },
  { value: 'review', label: 'Review', color: '#8b5cf6' },
  { value: 'done', label: 'Done', color: '#10b981' }
]

function normalizeStatusOptions(source: RawStatusOption[]): NormalizedStatusOption[] {
  return source
    .map((option) => normalizeStatusOption(option))
    .filter((option): option is NormalizedStatusOption => Boolean(option))
}

const FALLBACK_STATUS_OPTIONS: NormalizedStatusOption[] = normalizeStatusOptions(FALLBACK_STATUS_SOURCE)

const FALLBACK_STATUS = FALLBACK_STATUS_OPTIONS[0] ?? {
  value: 'status',
  label: 'Status',
  color: DEFAULT_STATUS_COLOR,
  background: DEFAULT_STATUS_BACKGROUND
}

function readStatusOptions(props?: Record<string, unknown>): RawStatusOption[] | undefined {
  if (!props) {
    return undefined
  }
  const raw = props['availableStatuses']
  return Array.isArray(raw) ? raw as RawStatusOption[] : undefined
}

function normalizeStatusOption(option?: RawStatusOption): NormalizedStatusOption | undefined {
  if (!option || typeof option !== 'object') {
    return undefined
  }
  const { value, label } = option
  if (typeof value !== 'string' || typeof label !== 'string') {
    return undefined
  }
  const color = typeof option.color === 'string' ? option.color : DEFAULT_STATUS_COLOR
  return {
    value,
    label,
    color,
    background: buildStatusBackground(color)
  }
}

function buildStatusBackground(color: string): string {
  const rgb = parseHexColor(color)
  if (!rgb) {
    return DEFAULT_STATUS_BACKGROUND
  }
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`
}

function parseHexColor(color: string): { r: number; g: number; b: number } | undefined {
  const trimmed = color.trim()
  const match = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!match) {
    return undefined
  }
  let hex = match[1]
  if (hex.length === 3) {
    hex = hex.split('').map((char) => `${char}${char}`).join('')
  }
  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return undefined
  }
  return { r, g, b }
}

export type StatusPillGraphService = Omit<GraphService, 'blockEntity' | 'readonly'> & {
  blockEntity: Accessor<Entity>
  readonly: Accessor<boolean>
  updateEntity?: (args: { entityId: string; properties: Record<string, unknown> }) => Promise<void>
}

export interface StatusPillProps extends BlockProps<StatusPillGraphService> { }

const StatusPill: Component<StatusPillProps> = (props) => {
  const entity = () => props.graph.blockEntity()
  const readonly = () => props.graph.readonly()
  const [open, setOpen] = createSignal(false)
  // Optimistic UI: prefer locally chosen status until next server notification arrives
  const [pending, setPending] = createSignal<string | undefined>(undefined)

  createEffect(() => {
    const optimistic = pending()
    if (!optimistic) {
      return
    }
    const current = entity().properties?.['status']
    if (typeof current === 'string' && current === optimistic) {
      setPending(undefined)
    }
  })

  const linkedEntities = () => (props.graph.blockGraph?.linkedEntities ?? []) as Entity[]

  const statusConfigEntity = createMemo<Entity | undefined>(() => {
    const blockEntity = entity()
    const targetId = typeof blockEntity.properties?.['statusOptionsEntityId'] === 'string'
      ? blockEntity.properties?.['statusOptionsEntityId'] as string
      : undefined
    const candidates = linkedEntities()
    if (targetId) {
      const matched = candidates.find((candidate) => candidate.entityId === targetId)
      if (matched) {
        return matched
      }
    }
    return candidates.find((candidate) => {
      if (candidate.entityId === blockEntity.entityId) {
        return false
      }
      const props = candidate.properties as Record<string, unknown> | undefined
      return Array.isArray(props?.['availableStatuses'])
    })
  })

  // Normalize dynamic status metadata while preserving a static fallback for safety
  const statusOptions = createMemo<NormalizedStatusOption[]>(() => {
    const fromConfig = readStatusOptions(statusConfigEntity()?.properties as Record<string, unknown> | undefined)
    const fallbackEntity = readStatusOptions(entity().properties as Record<string, unknown> | undefined)
    const source = fromConfig ?? fallbackEntity ?? FALLBACK_STATUS_SOURCE
    const normalized = normalizeStatusOptions(source)
    return normalized.length ? normalized : FALLBACK_STATUS_OPTIONS
  })

  // Prefer optimistic status while waiting for the server, then fall back to persisted value
  const status = () => {
    const optimistic = pending()
    if (optimistic) {
      return optimistic
    }

    const options = statusOptions()
    const current = entity().properties?.['status']
    if (typeof current === 'string' && current.length > 0) {
      const matched = options.find((option) => option.value === current)
      if (matched) {
        return matched.value
      }
    }
    return options[0]?.value ?? FALLBACK_STATUS.value
  }

  // Final visual configuration: lookup the matching option or synthesize one from label/color hints
  const cfg = () => {
    const current = status()
    return statusOptions().find((option) => option.value === current) ?? FALLBACK_STATUS
  }

  function outside(e: MouseEvent) {
    const host = (e.target as HTMLElement)
    if (!host.closest('.vf-status-pill')) setOpen(false)
  }

  onMount(() => document.addEventListener('click', outside))
  onCleanup(() => document.removeEventListener('click', outside))

  const commit = async (next: string) => {
    if (!next || next === status()) {
      setOpen(false)
      return
    }
    const currentEntity = entity() as Entity & { metadata?: { recordId?: { entityId?: string } } }
    const id = currentEntity.metadata?.recordId?.entityId ?? currentEntity.entityId
    setPending(next)
    if (!props.graph.updateEntity) {
      setPending(undefined)
      setOpen(false)
      return
    }
    try {
      await props.graph.updateEntity({ entityId: id, properties: { status: next } })
    } catch {
      setPending(undefined)
    } finally {
      setOpen(false)
    }
  }

  return (
    <div class="status-pill-block vf-status-pill" style={{
      display: 'inline-flex', 'align-items': 'center', padding: '4px 8px', 'border-radius': '12px',
      background: cfg().background, border: `1px solid ${cfg().color}20`, color: cfg().color, position: 'relative',
      cursor: readonly() ? 'default' : 'pointer'
    }} onClick={() => !readonly() && setOpen(!open())}>
      <div style={{ width: '6px', height: '6px', 'border-radius': '50%', background: cfg().color, 'margin-right': '6px' }} />
      <span>{cfg().label}</span>
      <Show when={!readonly()}>
        <span style={{ 'font-size': '10px', 'margin-left': '4px', opacity: 0.6 }}>▼</span>
        <Show when={open()}>
          <div class="vf-status-menu" role="menu" style={{ position: 'absolute', top: '100%', left: 0, background: 'white', border: '1px solid #e5e7eb', 'border-radius': '8px', 'box-shadow': '0 4px 6px -1px rgba(0,0,0,0.1)', 'z-index': 1000, 'min-width': '140px', 'margin-top': '4px' }}>
            {statusOptions().map((option) => (
              <div
                role="menuitem"
                tabindex={0}
                style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', 'align-items': 'center', 'font-size': '12px' }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f9fafb')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); void commit(option.value) }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); void commit(option.value) } }}
              >
                <div style={{ width: '6px', height: '6px', 'border-radius': '50%', background: option.color, 'margin-right': '8px' }} />
                <span>{option.label}</span>
              </div>
            ))}
          </div>
        </Show>
      </Show>
    </div>
  )
}

export default StatusPill
