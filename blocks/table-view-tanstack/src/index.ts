
import { createBlockElement } from "@vivafolio/block-solidjs";
import TableView, { type TableViewProps, type TableViewGraphService } from "./TableViewBlock";
import "./styles.css";

// Create block element with custom GraphService type
const { element: TableViewElement, init, updateGraph } = createBlockElement<TableViewGraphService>(
  TableView,
  {
    name: "Table View",
    version: "0.1.0",
    description: "Generic, virtualized table rendering entities with chip blocks in cells."
  }
);

customElements.define("vivafolio-table-view", TableViewElement);

export { init, updateGraph, TableViewElement };
