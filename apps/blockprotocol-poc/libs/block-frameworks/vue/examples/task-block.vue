<template>
  <BlockContainer class="task-block">
    <h3>Task Block (Vue)</h3>

    <BlockField label="Title">
      <BlockInput
        v-model="localTitle"
        placeholder="Enter task title..."
      />
    </BlockField>

    <BlockField label="Description">
      <BlockInput
        v-model="localDescription"
        placeholder="Enter task description..."
      />
    </BlockField>

    <BlockField label="Status">
      <BlockSelect
        v-model="localStatus"
        :options="statusOptions"
      />
    </BlockField>

    <BlockButton @click="handleUpdate">
      Update Task
    </BlockButton>

    <div class="task-info">
      <small>Entity ID: {{ entity?.entityId || 'none' }}</small>
    </div>
  </BlockContainer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { createBlock, BlockContainer, BlockField, BlockInput, BlockSelect, BlockButton, useEntity, useEntityUpdater } from '../../src/index'

// Props from Block Protocol
interface Props {
  graph: {
    blockEntity: {
      entityId: string
      properties: Record<string, unknown>
    }
    readonly: boolean
  }
}

const props = defineProps<Props>()

// Reactive data
const entity = useEntity(props.graph)
const updateEntity = useEntityUpdater(props.graph)

const localTitle = ref(entity.value?.properties?.title as string || '')
const localDescription = ref(entity.value?.properties?.description as string || '')
const localStatus = ref(entity.value?.properties?.status as string || 'todo')

// Status options
const statusOptions = [
  { value: 'todo', label: 'To Do' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'done', label: 'Done' }
]

// Update entity when local values change
const handleUpdate = () => {
  updateEntity({
    title: localTitle.value,
    description: localDescription.value,
    status: localStatus.value,
    lastUpdated: new Date().toISOString()
  })
}

// Watch for entity changes from Block Protocol
watch(() => entity.value?.properties?.title, (newTitle) => {
  if (newTitle !== localTitle.value) {
    localTitle.value = newTitle as string || ''
  }
})

watch(() => entity.value?.properties?.description, (newDescription) => {
  if (newDescription !== localDescription.value) {
    localDescription.value = newDescription as string || ''
  }
})

watch(() => entity.value?.properties?.status, (newStatus) => {
  if (newStatus !== localStatus.value) {
    localStatus.value = newStatus as string || 'todo'
  }
})
</script>

<style scoped>
.task-block {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 1.5rem;
  border-radius: 12px;
}

.task-info {
  margin-top: 1rem;
  opacity: 0.8;
}
</style>
