#!/usr/bin/env tsx

import fs from 'fs/promises'
import path from 'path'
import { existsSync } from 'fs'

const FRAMEWORKS = ['solidjs', 'vue', 'svelte', 'lit', 'angular'] as const
type Framework = typeof FRAMEWORKS[number]

interface ScaffoldOptions {
  framework: Framework
  name: string
  description?: string
  type?: 'inline' | 'multi-line'
}

function generateSolidJSBlock(name: string, description: string, type: 'inline' | 'multi-line'): string {
  const className = name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  const titleCase = name.replace(/\b\w/g, l => l.toUpperCase())

  return `import { createBlock, BlockContainer, BlockField, BlockInput, BlockButton, useEntity } from '../src/index'

// ${titleCase} Block - ${description}
const ${titleCase}Block = createBlock((props) => {
  const entity = useEntity(props.graph)

  const handleUpdate = (value: string) => {
    // In a real implementation, this would call the Block Protocol updateEntity method
    console.log('${titleCase}Block: Value changed to', value)
  }

  return (
    <BlockContainer className="${className}-block">
      <h3>${titleCase} Block (SolidJS)</h3>

      <BlockField label="Value">
        <BlockInput
          value={entity()?.properties?.value as string || ''}
          onChange={handleUpdate}
          placeholder="Enter ${name.toLowerCase()}..."
        />
      </BlockField>

      <BlockButton onClick={() => handleUpdate('')}>
        Clear
      </BlockButton>

      <div class="${className}-info">
        <small>Entity ID: {entity()?.entityId}</small>
      </div>
    </BlockContainer>
  )
}, {
  name: '${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}',
  version: '0.1.0',
  description: '${description}'
})

export default ${titleCase}Block
`
}

function generateVueBlock(name: string, description: string, type: 'inline' | 'multi-line'): string {
  const className = name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  const titleCase = name.replace(/\b\w/g, l => l.toUpperCase())

  return `<template>
  <BlockContainer :class="'${className}-block'">
    <h3>${titleCase} Block (Vue.js)</h3>

    <BlockField label="Value">
      <BlockInput
        :value="entity?.properties?.value || ''"
        @change="handleUpdate"
        placeholder="Enter ${name.toLowerCase()}..."
      />
    </BlockField>

    <BlockButton @click="handleUpdate('')">
      Clear
    </BlockButton>

    <div :class="'${className}-info'">
      <small>Entity ID: {{ entity?.entityId }}</small>
    </div>
  </BlockContainer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { BlockContainer, BlockField, BlockInput, BlockButton, useEntity } from '../src/index'

// Props
interface Props {
  graph: any // Block Protocol Graph service
}

const props = defineProps<Props>()

// ${titleCase} Block - ${description}
const entity = useEntity(props.graph)

const handleUpdate = (value: string) => {
  // In a real implementation, this would call the Block Protocol updateEntity method
  console.log('${titleCase}Block: Value changed to', value)
}
</script>

<style scoped>
.${className}-block {
  padding: 1rem;
}
</style>
`
}

function generateSvelteBlock(name: string, description: string, type: 'inline' | 'multi-line'): string {
  const className = name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  const titleCase = name.replace(/\b\w/g, l => l.toUpperCase())

  return `<script lang="ts">
  import { BlockContainer, BlockField, BlockInput, BlockButton, useEntity } from '../src/index'

  // Props
  export let graph: any // Block Protocol Graph service

  // ${titleCase} Block - ${description}
  $: entity = useEntity(graph)

  const handleUpdate = (value: string) => {
    // In a real implementation, this would call the Block Protocol updateEntity method
    console.log('${titleCase}Block: Value changed to', value)
  }
</script>

<BlockContainer class="${className}-block">
  <h3>${titleCase} Block (Svelte)</h3>

  <BlockField label="Value">
    <BlockInput
      value={entity?.properties?.value || ''}
      on:change={(e) => handleUpdate(e.detail)}
      placeholder="Enter ${name.toLowerCase()}..."
    />
  </BlockField>

  <BlockButton on:click={() => handleUpdate('')}>
    Clear
  </BlockButton>

  <div class="${className}-info">
    <small>Entity ID: {entity?.entityId}</small>
  </div>
</BlockContainer>

<style>
.${className}-block {
  padding: 1rem;
}
</style>
`
}

function generateLitBlock(name: string, description: string, type: 'inline' | 'multi-line'): string {
  const className = name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  const titleCase = name.replace(/\b\w/g, l => l.toUpperCase())

  return `import { LitElement, html, css } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { BlockContainer, BlockField, BlockInput, BlockButton, useEntity } from '../src/index'

// ${titleCase} Block - ${description}
@customElement('${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}')
export class ${titleCase}Block extends LitElement {
  @property({ type: Object }) graph: any // Block Protocol Graph service

  private entity = useEntity(this.graph)

  static styles = css\`
    :host {
      display: block;
      padding: 1rem;
    }

    .${className}-block {
      padding: 1rem;
    }
  \`

  private handleUpdate(value: string) {
    // In a real implementation, this would call the Block Protocol updateEntity method
    console.log('${titleCase}Block: Value changed to', value)
  }

  render() {
    return html\`
      <BlockContainer class="${className}-block">
        <h3>${titleCase} Block (Lit)</h3>

        <BlockField label="Value">
          <BlockInput
            .value=\${this.entity?.properties?.value || ''}
            @change=\${(e: any) => this.handleUpdate(e.detail)}
            placeholder="Enter ${name.toLowerCase()}..."
          />
        </BlockField>

        <BlockButton @click=\${() => this.handleUpdate('')}>
          Clear
        </BlockButton>

        <div class="${className}-info">
          <small>Entity ID: \${this.entity?.entityId}</small>
        </div>
      </BlockContainer>
    \`
  }
}
`
}

function generateAngularBlock(name: string, description: string, type: 'inline' | 'multi-line'): string {
  const className = name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  const titleCase = name.replace(/\b\w/g, l => l.toUpperCase())
  const componentName = `${titleCase}BlockComponent`

  return `import { Component, Input } from '@angular/core'
import { BlockContainer, BlockField, BlockInput, BlockButton, useEntity } from '../src/index'

// ${titleCase} Block - ${description}
@Component({
  selector: '${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-block',
  template: \`
    <BlockContainer [class]="'${className}-block'">
      <h3>${titleCase} Block (Angular)</h3>

      <BlockField label="Value">
        <BlockInput
          [value]="entity?.properties?.value || ''"
          (change)="handleUpdate($event)"
          placeholder="Enter ${name.toLowerCase()}..."
        />
      </BlockField>

      <BlockButton (click)="handleUpdate('')">
        Clear
      </BlockButton>

      <div [class]="'${className}-info'">
        <small>Entity ID: {{ entity?.entityId }}</small>
      </div>
    </BlockContainer>
  \`,
  styles: [\`
    .${className}-block {
      padding: 1rem;
    }
  \`]
})
export class ${componentName} {
  @Input() graph: any // Block Protocol Graph service

  entity = useEntity(this.graph)

  handleUpdate(value: string) {
    // In a real implementation, this would call the Block Protocol updateEntity method
    console.log('${titleCase}Block: Value changed to', value)
  }
}
`
}

function generateBlockMetadata(name: string, description: string): string {
  return JSON.stringify({
    name: name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
    version: '0.1.0',
    description,
    author: 'Vivafolio',
    license: 'MIT',
    blockType: {
      entryPoint: 'main.js',
      type: 'function'
    },
    protocol: '0.3'
  }, null, 2)
}

async function scaffoldBlock(options: ScaffoldOptions) {
  const { framework, name, description = `${name} block`, type = 'multi-line' } = options

  const rootDir = path.resolve(process.cwd(), '..')
  const frameworkDir = path.join(rootDir, 'libs/block-frameworks', framework)
  const examplesDir = path.join(frameworkDir, 'examples')

  if (!existsSync(examplesDir)) {
    console.error(`Framework ${framework} not found at ${examplesDir}`)
    process.exit(1)
  }

  // Generate the appropriate file extension and content
  let fileName: string
  let fileContent: string

  switch (framework) {
    case 'solidjs':
      fileName = `${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.tsx`
      fileContent = generateSolidJSBlock(name, description, type)
      break
    case 'vue':
      fileName = `${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.vue`
      fileContent = generateVueBlock(name, description, type)
      break
    case 'svelte':
      fileName = `${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.svelte`
      fileContent = generateSvelteBlock(name, description, type)
      break
    case 'lit':
      fileName = `${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.ts`
      fileContent = generateLitBlock(name, description, type)
      break
    case 'angular':
      fileName = `${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.component.ts`
      fileContent = generateAngularBlock(name, description, type)
      break
    default:
      throw new Error(`Unsupported framework: ${framework}`)
  }

  const blockPath = path.join(examplesDir, fileName)
  const metadataPath = path.join(examplesDir, 'block-metadata.json')

  // Write the block file
  await fs.writeFile(blockPath, fileContent, 'utf8')
  console.log(`✓ Created ${framework} block: ${blockPath}`)

  // Write or update metadata
  if (!existsSync(metadataPath)) {
    await fs.writeFile(metadataPath, generateBlockMetadata(name, description), 'utf8')
    console.log(`✓ Created block metadata: ${metadataPath}`)
  } else {
    console.log(`ℹ Block metadata already exists: ${metadataPath}`)
  }

  console.log(`\n🎉 Successfully scaffolded ${framework} block: ${name}`)
  console.log(`\nNext steps:`)
  console.log(`1. Run: npm run dev:frameworks`)
  console.log(`2. Navigate to: /?scenario=framework-compilation-demo`)
  console.log(`3. Your block should appear in the framework compilation demo!`)
}

function printUsage() {
  console.log(`
🎯 Vivafolio Block Protocol - Block Scaffolding Tool

Usage: scaffold-block [options]

Options:
  --framework, -f    Framework to use (${FRAMEWORKS.join('|')})
  --name, -n         Block name (required)
  --description, -d  Block description (optional)
  --type, -t         Block type (inline|multi-line, default: multi-line)
  --help, -h         Show this help

Examples:
  scaffold-block --framework solidjs --name "My Task" --description "A task management block"
  scaffold-block -f vue -n "Status Badge" -d "Shows status with colors" -t inline
  scaffold-block -f svelte -n "Data Table"
`)
}

function parseArgs() {
  const args = process.argv.slice(2)
  const options: Partial<ScaffoldOptions> = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const nextArg = args[i + 1]

    switch (arg) {
      case '--framework':
      case '-f':
        if (!FRAMEWORKS.includes(nextArg as Framework)) {
          console.error(`Invalid framework: ${nextArg}. Must be one of: ${FRAMEWORKS.join(', ')}`)
          process.exit(1)
        }
        options.framework = nextArg as Framework
        i++
        break
      case '--name':
      case '-n':
        options.name = nextArg
        i++
        break
      case '--description':
      case '-d':
        options.description = nextArg
        i++
        break
      case '--type':
      case '-t':
        if (nextArg !== 'inline' && nextArg !== 'multi-line') {
          console.error(`Invalid type: ${nextArg}. Must be 'inline' or 'multi-line'`)
          process.exit(1)
        }
        options.type = nextArg as 'inline' | 'multi-line'
        i++
        break
      case '--help':
      case '-h':
        printUsage()
        process.exit(0)
      default:
        console.error(`Unknown option: ${arg}`)
        printUsage()
        process.exit(1)
    }
  }

  if (!options.framework || !options.name) {
    console.error('Error: --framework and --name are required')
    printUsage()
    process.exit(1)
  }

  return options as ScaffoldOptions
}

// Main execution
if (require.main === module) {
  try {
    const options = parseArgs()
    scaffoldBlock(options)
  } catch (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }
}

export { scaffoldBlock, ScaffoldOptions }
