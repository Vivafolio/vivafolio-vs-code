# @vivafolio/block-core

Shared, framework-agnostic types, message shapes, and tiny utilities used across Vivafolio block frameworks and blocks.

- Re-exports a stable subset of Block Protocol types to avoid schema drift
- Defines minimal GraphService/Entity/BlockGraph/BlockProps
- Provides light utils (getByPath, setByPath)

Usage:

```ts
import type { Entity, GraphService, BlockProps } from '@vivafolio/block-core'
```
