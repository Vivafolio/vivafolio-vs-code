// Standalone SolidJS Block Protocol implementation
import { createSignal, createElement, Fragment } from 'solid-js'

// Block Protocol types (standalone)
interface Entity {
  entityId: string
  entityTypeId: string
  properties: Record<string, unknown>
}

interface BlockGraph {
  depth: number
  linkedEntities: Entity[]
  linkGroups: Array<Record<string, unknown>>
}

interface GraphService {
  blockEntity: Entity
  blockGraph: BlockGraph
  entityTypes: Array<Record<string, unknown>>
  linkedAggregations: Array<Record<string, unknown>>
  readonly: boolean
  updateEntity?(updates: Partial<Entity['properties']>): void
}

interface BlockProps {
  graph: GraphService
}

// SolidJS Block Protocol helper (standalone)
function createBlockElement(
  component: (props: BlockProps) => any,
  options: {
    name: string
    version?: string
    description?: string
  }
) {
  return {
    component,
    metadata: options
  }
}

// Simple components (standalone)
const BlockContainer = (props: { children: any }) => (
  <div style={{
    "border": "2px solid #8b5cf6",
    "border-radius": "8px",
    "padding": "1rem",
    "background": "rgba(139, 92, 246, 0.08)",
    "font-family": "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  }}>
    {props.children}
  </div>
)

const BlockField = (props: { label: string, children: any }) => (
  <label style={{
    "display": "flex",
    "flex-direction": "column",
    "margin-bottom": "0.5rem"
  }}>
    <span style={{
      "margin-bottom": "0.25rem",
      "font-weight": "600",
      "color": "#374151"
    }}>
      {props.label}
    </span>
    {props.children}
  </label>
)

const BlockInput = (props: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) => (
  <input
    type="text"
    value={props.value}
    placeholder={props.placeholder || ''}
    onInput={(e) => props.onChange((e.target as HTMLInputElement).value)}
    style={{
      "padding": "0.4rem 0.5rem",
      "border": "1px solid #ddd6fe",
      "border-radius": "4px",
      "font-size": "0.95rem",
      "background": "white"
    }}
  />
)

const BlockButton = (props: { onClick: () => void, children: any }) => (
  <button
    onClick={props.onClick}
    style={{
      "align-self": "flex-start",
      "padding": "0.4rem 0.8rem",
      "border-radius": "4px",
      "border": "none",
      "background": "#8b5cf6",
      "color": "white",
      "font-weight": "600",
      "cursor": "pointer"
    }}
  >
    {props.children}
  </button>
)

// Example task block using standalone SolidJS implementation
const TaskBlock = createBlockElement((props) => {
  const [title, setTitle] = createSignal('')
  const [description, setDescription] = createSignal('')
  const [status, setStatus] = createSignal('todo')

  const updateTask = () => {
    if (props.graph?.updateEntity) {
      props.graph.updateEntity({
        title: title(),
        description: description(),
        status: status()
      })
    }
  }

  return (
    <BlockContainer>
      <h3 style={{ "margin": "0 0 0.5rem 0", "font-size": "1.1rem", "color": "#5b21b6" }}>
        SolidJS Task Block
      </h3>
      <BlockField label="Title">
        <BlockInput
          value={title()}
          onChange={setTitle}
          placeholder="Enter task title..."
        />
      </BlockField>
      <BlockField label="Description">
        <BlockInput
          value={description()}
          onChange={setDescription}
          placeholder="Enter task description..."
        />
      </BlockField>
      <BlockField label="Status">
        <select
          value={status()}
          onChange={(e) => setStatus((e.target as HTMLSelectElement).value)}
          style={{
            "padding": "0.4rem 0.5rem",
            "border": "1px solid #ddd6fe",
            "border-radius": "4px",
            "font-size": "0.95rem",
            "background": "white"
          }}
        >
          <option value="todo">To Do</option>
          <option value="in-progress">In Progress</option>
          <option value="done">Done</option>
        </select>
      </BlockField>
      <BlockButton onClick={updateTask}>
        Update Task
      </BlockButton>
      <div style={{ "font-size": "0.8rem", "color": "#5b21b6", "margin-top": "0.5rem" }}>
        Entity ID: {props.graph?.blockEntity?.entityId || 'N/A'} | Framework: SolidJS
      </div>
    </BlockContainer>
  )
}, {
  name: 'solidjs-task-block',
  version: '0.1.0',
  description: 'A task management block built with SolidJS'
})

export default TaskBlock
