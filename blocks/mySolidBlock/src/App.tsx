import type { Component, JSX } from 'solid-js'
import { createSignal, onCleanup } from 'solid-js'

// Minimal Block Protocol-like props contract for demo purposes
export interface MySolidBlockProps {
  entity?: { metadata?: { recordId?: { entityId?: string } }, properties?: Record<string, unknown> }
  readonly?: boolean
  updateEntity?: (args: { entityId?: string; properties: Record<string, unknown> }) => void
}

const names = ['Alice', 'Bob', 'Carol', 'Dave', 'Erin', 'Frank']
const randomName = () => names[Math.floor(Math.random() * names.length)]

export const App: Component<MySolidBlockProps> = (props) => {
  const [title, setTitle] = createSignal<string>(
    (props.entity?.properties?.['https://blockprotocol.org/@blockprotocol/types/property-type/name/'] as string) || 'World'
  )

  const entityId = props.entity?.metadata?.recordId?.entityId

  const onClick = () => {
    const newName = randomName()
    setTitle(newName)
    props.updateEntity?.({ entityId, properties: { 'https://blockprotocol.org/@blockprotocol/types/property-type/name/': newName } })
  }

  // Example cleanup hook in Solid
  onCleanup(() => {
    // cleanup resources if any
  })

  const containerStyle: JSX.CSSProperties = { padding: '12px', display: 'grid', 'row-gap': '8px' }
  const pStyle: JSX.CSSProperties = { margin: 0, 'font-size': '0.9rem', color: '#888' }
  return (
    <div style={containerStyle}>
      <h1 style={{ margin: 0 }}>Hello, {title()}</h1>
      <p style={pStyle}>
        {entityId ? `Entity ID: ${entityId}` : 'No entity bound'}
      </p>
      <button onClick={onClick} disabled={props.readonly}>
        Update Name
      </button>
    </div>
  )
}

export default App
