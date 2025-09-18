import { createSignal } from 'solid-js';
// Helper to create a Block Protocol compatible SolidJS component
export function createBlock(component, options) {
    return (props) => {
        return component(props);
    };
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
// Utility function to register a SolidJS component as a Web Component
export function registerBlockElement(tagName, solidComponent, propsMapper) {
    if (customElements.get(tagName)) {
        return;
    }
    class SolidBlockElement extends HTMLElement {
        root;
        dispose;
        constructor() {
            super();
            this.root = this.attachShadow({ mode: 'open' });
        }
        connectedCallback() {
            const props = propsMapper ? propsMapper(this) : {};
            // In a real implementation, this would render the SolidJS component
            // For now, we'll create a placeholder
            this.root.innerHTML = `
        <div class="solid-block-placeholder">
          <h3>${tagName}</h3>
          <p>SolidJS Block Component</p>
          <pre>${JSON.stringify(props, null, 2)}</pre>
        </div>
      `;
        }
        disconnectedCallback() {
            if (this.dispose) {
                this.dispose();
            }
        }
    }
    customElements.define(tagName, SolidBlockElement);
}
