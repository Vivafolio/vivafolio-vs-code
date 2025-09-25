import { render } from 'solid-js/web';
import { createSignal } from 'solid-js';
import LineChart from './LineChart';
import './styles.css';

class D3LineChartElement extends HTMLElement {
  private graphSignal = createSignal<any>(null);
  private blockIdSignal = createSignal<string>('');
  private mounted = false;
  
  set graph(value: any) {
    this.graphSignal[1](value);
    // Render when data is first set
    if (!this.mounted && value) {
      this.renderContent();
    }
  }
  get graph() {
    return this.graphSignal[0]();
  }
  
  set blockId(value: string) {
    this.blockIdSignal[1](value);
  }
  get blockId() {
    return this.blockIdSignal[0]();
  }
  
  private renderContent() {
    if (this.mounted) return;
    this.mounted = true;
    const mount = document.createElement('div');
    this.appendChild(mount);
    render(() => (
      <LineChart graph={this.graphSignal[0]} blockId={this.blockIdSignal[0]} />
    ), mount);
  }
  
  connectedCallback() {
    // Don't render here - wait for init to set the graph data
    // which will trigger renderContent via the graph setter
  }
}
customElements.define('bp-d3-line-chart', D3LineChartElement);

// Factory function that returns the custom element definition
const factoryFunction = () => ({
  element: D3LineChartElement,
  init: ({ element, entity }: { element: any; entity: any }) => {
    // Provide the blockEntitySubgraph shape the block expects
    element.graph = { blockEntitySubgraph: { roots: [{ properties: entity?.properties ?? {} }] } }
    element.blockId = element.dataset.blockId || ''
  },
  updateEntity: ({ element, entity }: { element: any; entity: any }) => {
    element.graph = { blockEntitySubgraph: { roots: [{ properties: entity?.properties ?? {} }] } }
  }
});

export default factoryFunction;

// Also expose CommonJS exports for the BlockLoader evaluator which uses a CommonJS wrapper
declare const module: any
if (typeof module !== 'undefined') {
  module.exports = factoryFunction
}
