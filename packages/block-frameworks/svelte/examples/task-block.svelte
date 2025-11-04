<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { createBlock, useEntity, useEntityUpdater } from '../../src/index'

  // Props from Block Protocol
  export let graph: {
    blockEntity: {
      entityId: string
      properties: Record<string, unknown>
    }
    readonly: boolean
  }

  const dispatch = createEventDispatcher()

  // Reactive entity data
  const entity = useEntity(graph)
  const updateEntity = useEntityUpdater(graph)

  // Local reactive state
  let title = $entity?.properties?.title as string || ''
  let description = $entity?.properties?.description as string || ''
  let status = $entity?.properties?.status as string || 'todo'

  // Status options
  const statusOptions = [
    { value: 'todo', label: 'To Do' },
    { value: 'in-progress', label: 'In Progress' },
    { value: 'done', label: 'Done' }
  ]

  // Update entity when local values change
  function handleUpdate() {
    updateEntity({
      title,
      description,
      status,
      lastUpdated: new Date().toISOString()
    })
  }

  // React to entity changes
  $: if ($entity?.properties?.title !== title) {
    title = $entity?.properties?.title as string || ''
  }
  $: if ($entity?.properties?.description !== description) {
    description = $entity?.properties?.description as string || ''
  }
  $: if ($entity?.properties?.status !== status) {
    status = $entity?.properties?.status as string || 'todo'
  }
</script>

<div class="task-block">
  <h3>Task Block (Svelte)</h3>

  <label class="block-field">
    <span class="block-field__label">Title:</span>
    <input
      type="text"
      bind:value={title}
      placeholder="Enter task title..."
      class="block-input"
      disabled={graph.readonly}
    />
  </label>

  <label class="block-field">
    <span class="block-field__label">Description:</span>
    <input
      type="text"
      bind:value={description}
      placeholder="Enter task description..."
      class="block-input"
      disabled={graph.readonly}
    />
  </label>

  <label class="block-field">
    <span class="block-field__label">Status:</span>
    <select
      bind:value={status}
      class="block-select"
      disabled={graph.readonly}
    >
      {#each statusOptions as option}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  </label>

  <button
    class="block-button block-button--primary"
    disabled={graph.readonly}
    on:click={handleUpdate}
  >
    Update Task
  </button>

  <div class="task-info">
    <small>Entity ID: {$entity?.entityId || 'none'}</small>
  </div>
</div>

<style>
  .task-block {
    background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
    color: white;
    padding: 1.5rem;
    border-radius: 12px;
  }

  .block-field {
    display: flex;
    flex-direction: column;
    margin-bottom: 1rem;
  }

  .block-field__label {
    margin-bottom: 0.5rem;
    font-weight: 600;
  }

  .block-input,
  .block-select {
    padding: 0.5rem;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }

  .block-input::placeholder {
    color: rgba(255, 255, 255, 0.6);
  }

  .block-button {
    align-self: flex-start;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.2);
    color: white;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .block-button:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.3);
  }

  .block-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .task-info {
    margin-top: 1rem;
    opacity: 0.8;
  }
</style>
