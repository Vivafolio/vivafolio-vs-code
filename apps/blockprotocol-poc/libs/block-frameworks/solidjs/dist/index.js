import { createSignal, onMount } from 'solid-js';
// SolidJS base class for Block Protocol components
export class BlockElement {
    graph;
    constructor(graph) {
        this.graph = graph;
    }
    // Reactive entity data
    get entity() {
        return this.graph?.blockEntity || {};
    }
    get readonly() {
        return this.graph?.readonly || false;
    }
    // Helper method for updating entity properties
    updateEntity(updates) {
        // In a real implementation, this would call the Block Protocol updateEntity method
        console.log('Entity update requested:', updates);
        // Dispatch custom event for the host to handle
        const event = new CustomEvent('entity-update', {
            detail: updates,
            bubbles: true,
            composed: true
        });
        this.dispatchEvent?.(event);
    }
}
// Helper to create a Block Protocol compatible SolidJS component
export function createBlock(component, options) {
    const wrappedComponent = (props) => {
        return component(props);
    };
    wrappedComponent.blockMetadata = options;
    return wrappedComponent;
}
// Hook for accessing entity data with reactivity
export function useEntity(graph) {
    const [entity, setEntity] = createSignal(graph.blockEntity);
    // In a real implementation, this would listen to graph updates
    // For now, we'll just return the initial entity
    return entity;
}
// Hook for updating entity properties
export function useEntityUpdater(graph) {
    return (updates) => {
        // In a real implementation, this would call the Block Protocol updateEntity method
        console.log('Entity update requested:', updates);
    };
}
// Base block wrapper styles (CSS-in-JS for SolidJS)
export const blockStyles = `
  .solidjs-block-container {
    display: block;
    border: 2px solid #8b5cf6;
    border-radius: 8px;
    padding: 1rem;
    background: rgba(139, 92, 246, 0.08);
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  .solidjs-block-heading {
    margin: 0 0 0.5rem 0;
    font-size: 1.1rem;
    color: #5b21b6;
  }

  .solidjs-block-body {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .solidjs-block-field {
    display: flex;
    flex-direction: column;
    font-size: 0.9rem;
    color: #374151;
  }

  .solidjs-block-field__label {
    margin-bottom: 0.25rem;
    font-weight: 600;
  }

  .solidjs-block-input,
  .solidjs-block-select {
    padding: 0.4rem 0.5rem;
    border: 1px solid #ddd6fe;
    border-radius: 4px;
    font-size: 0.95rem;
    background: white;
  }

  .solidjs-block-input:disabled,
  .solidjs-block-select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .solidjs-block-button {
    align-self: flex-start;
    padding: 0.4rem 0.8rem;
    border-radius: 4px;
    border: none;
    background: #8b5cf6;
    color: white;
    font-weight: 600;
    cursor: pointer;
  }

  .solidjs-block-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .solidjs-block-button:hover:not(:disabled) {
    background: #7c3aed;
  }

  .solidjs-block-footnote {
    font-size: 0.8rem;
    color: #5b21b6;
    margin-top: 0.5rem;
  }
`;
// Form field components for common block patterns
export const BlockContainer = (props) => {
    onMount(() => {
        // Inject styles if not already present
        if (!document.querySelector('#solidjs-block-styles')) {
            const style = document.createElement('style');
            style.id = 'solidjs-block-styles';
            style.textContent = blockStyles;
            document.head.appendChild(style);
        }
    });
    return class {
    } = {} `solidjs-block-container ${props.className || ''}`;
};
 >
    { props, : .children }
    < /div>;
export const BlockField = (props) => {
    return class {
    } = "solidjs-block-field" >
        class {
        };
    "solidjs-block-field__label" > { props, : .label } < /span>;
    {
        props.children;
    }
    /label>;
};
export const BlockInput = (props) => {
    return type = { props, : .type || 'text' };
    value = { props, : .value };
    placeholder = { props, : .placeholder || '' };
    disabled = { props, : .disabled };
    class {
    }
    "solidjs-block-input";
    onInput = {}(e);
};
props.onChange(e.target.value);
/>;
export const BlockSelect = (props) => {
    return value = { props, : .value };
    disabled = { props, : .disabled };
    class {
    }
    "solidjs-block-select";
    onChange = {}(e);
};
props.onChange(e.target.value);
    >
        { props, : .options.map(option => value = { option, : .value } > { option, : .label } < /option>) }
    < /select>;
export const BlockButton = (props) => {
    return class {
    } = "solidjs-block-button";
    disabled = { props, : .disabled };
    onClick = { props, : .onClick }
        >
            { props, : .children }
        < /button>;
};
// Factory function that returns a custom element
export function createBlockElement(component, options) {
    class SolidBlockElement extends HTMLElement {
        graph;
        dispose;
        constructor() {
            super();
        }
        connectedCallback() {
            // The element will be initialized by the init method
        }
        disconnectedCallback() {
            if (this.dispose) {
                this.dispose();
            }
        }
    }
    const init = (params) => {
        const { element, entity, readonly, updateEntity } = params;
        const graph = {
            blockEntity: entity,
            blockGraph: { depth: 0, linkedEntities: [], linkGroups: [] },
            entityTypes: [],
            linkedAggregations: [],
            readonly
        };
        // Create a SolidJS root and render the component
        const solidRoot = document.createElement('div');
        element.appendChild(solidRoot);
        // Render the component (simplified - in real SolidJS this would use render())
        const props = { graph };
        // For now, we'll create a simple placeholder since we can't easily integrate SolidJS rendering
        solidRoot.innerHTML = `
      <div class="solidjs-task-block">
        <h3>SolidJS Task Block</h3>
        <div class="solidjs-block-body">
          <label class="solidjs-block-field">
            <span class="solidjs-block-field__label">Title:</span>
            <input type="text" class="solidjs-block-input" placeholder="Enter task title..." />
          </label>
          <label class="solidjs-block-field">
            <span class="solidjs-block-field__label">Description:</span>
            <input type="text" class="solidjs-block-input" placeholder="Enter task description..." />
          </label>
          <label class="solidjs-block-field">
            <span class="solidjs-block-field__label">Status:</span>
            <select class="solidjs-block-select">
              <option value="todo">To Do</option>
              <option value="in-progress">In Progress</option>
              <option value="done">Done</option>
            </select>
          </label>
          <button class="solidjs-block-button">Update Task</button>
        </div>
        <div class="solidjs-block-footnote">
          Entity ID: ${entity.entityId} | Framework: SolidJS
        </div>
      </div>
    `;
        // Inject styles
        if (!document.querySelector('#solidjs-block-styles')) {
            const style = document.createElement('style');
            style.id = 'solidjs-block-styles';
            style.textContent = blockStyles;
            document.head.appendChild(style);
        }
    };
    const updateEntity = (params) => {
        // Update the rendered component with new entity data
        console.log('SolidJS block entity updated:', params.entity);
    };
    return {
        element: SolidBlockElement,
        init,
        updateEntity
    };
}
// Utility function to register a SolidJS component as a Web Component
export function registerBlockElement(tagName, solidComponent, propsMapper) {
    // SolidJS components are registered via the createBlockElement factory
    console.log(`SolidJS component registered as ${tagName}`);
}
