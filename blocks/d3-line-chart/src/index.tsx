import { render } from 'solid-js/web';
import { createSignal, createEffect } from 'solid-js';
import { createSolidBlock, type BlockProps } from '../../../packages/block-frameworks/solidjs/src/index';
import LineChart from './LineChart';
import './styles.css';

// Create the block component using the framework
const D3LineChartBlock = createSolidBlock(
  (props: BlockProps) => {
    // Create signals from graph data for reactivity
    const [graph, setGraph] = createSignal(props.graph);
    const [blockId, setBlockId] = createSignal(props.graph?.blockEntity?.entityId || '');
    
    // Update signals when props change
    createEffect(() => {
      if (props.graph) {
        setGraph(props.graph);
        setBlockId(props.graph?.blockEntity?.entityId || '');
      }
    });
    
    return (
      <LineChart 
        graph={graph} 
        blockId={blockId} 
      />
    );
  },
  {
    name: 'D3 Line Chart',
    version: '0.2.0',
    description: 'Interactive line chart block powered by D3.js'
  }
);

// Create Web Component wrapper for Block Protocol compatibility
class D3LineChartElement extends HTMLElement {
  private graphSignal = createSignal<any>(null);
  private dispose?: () => void;
  private mounted = false;
  
  set graph(value: any) {
    this.graphSignal[1](value);
    if (!this.mounted && value) {
      this.renderContent();
    }
  }
  
  get graph() {
    return this.graphSignal[0]();
  }
  
  private renderContent() {
    if (this.mounted) return;
    this.mounted = true;
    
    const mount = document.createElement('div');
    this.appendChild(mount);
    
    this.dispose = render(() => (
      <D3LineChartBlock graph={this.graphSignal[0]()} />
    ), mount);
  }
  
  connectedCallback() {
    // Rendering happens when graph data is set
  }
  
  disconnectedCallback() {
    if (this.dispose) {
      this.dispose();
    }
  }
}

customElements.define('bp-d3-line-chart', D3LineChartElement);

// Factory function for Block Protocol
const factoryFunction = () => ({
  element: D3LineChartElement,
  init: ({ element, entity }: { element: any; entity: any }) => {
    element.graph = { 
      blockEntitySubgraph: {
        roots: [{
          entityId: entity?.entityId || '',
          entityTypeId: 'https://vivafolio.org/blocks/d3-line-chart',
          properties: entity?.properties ?? {}
        }],
        vertices: {},
        edges: {},
        depths: {}
      }
    };
  },
  // Host → Block render hook: apply a fresh snapshot from the host
  applyEntitySnapshot: ({ element, entity }: { element: any; entity: any }) => {
    element.graph = { 
      blockEntitySubgraph: {
        roots: [{
          entityId: entity?.entityId || '',
          entityTypeId: 'https://vivafolio.org/blocks/d3-line-chart',
          properties: entity?.properties ?? {}
        }],
        vertices: {},
        edges: {},
        depths: {}
      }
    };
  }
});

export default factoryFunction;

// CommonJS compatibility
declare const module: any;
if (typeof module !== 'undefined') {
  module.exports = factoryFunction;
}
