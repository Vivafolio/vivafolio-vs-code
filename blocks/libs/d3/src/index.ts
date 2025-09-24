import * as d3 from 'd3';
import type { Entity, Subgraph } from '@blockprotocol/graph';

/**
 * D3.js integration utilities for Vivafolio Block Protocol blocks
 * Provides helper functions for creating data visualizations with Block Protocol entities
 */

// Define local types to avoid dependency issues and simplify usage
export interface SimpleEntity {
  entityId: string;
  entityTypeId: string;
  properties: Record<string, unknown>;
}

export interface SimpleBlockGraph {
  depth: number;
  linkedEntities: SimpleEntity[];
  linkGroups: Array<Record<string, unknown>>;
}

export interface D3BlockProps {
  graph: SimpleBlockGraph;
  readonly?: boolean;
  updateEntity?: (entity: SimpleEntity) => void;
}

export interface ChartConfig {
  width: number;
  height: number;
  margin: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

export interface DataPoint {
  value: number;
  label: string;
  entity: SimpleEntity;
}

export interface PieDataPoint {
  value: number;
  label: string;
}

export interface LineDataPoint {
  x: number;
  y: number;
  label?: string;
}

/**
 * Convert Block Protocol Entity to SimpleEntity
 */
function convertEntity(entity: Entity): SimpleEntity {
  return {
    entityId: entity.metadata.recordId.entityId,
    entityTypeId: entity.metadata.entityTypeId,
    properties: (entity.properties as Record<string, unknown>) || {}
  };
}

/**
 * Extract data from Block Protocol entities for D3 visualization
 * @param entities Array of entities to extract data from
 * @param valueKey Property key to use for values
 * @param labelKey Property key to use for labels
 * @returns Array of data points suitable for D3
 */
export function extractDataFromEntities(
  entities: Entity[],
  valueKey: string,
  labelKey?: string
): DataPoint[] {
  return entities
    .filter(entity => entity.properties && typeof entity.properties === 'object')
    .map(entity => {
      const simpleEntity = convertEntity(entity);
      const props = simpleEntity.properties as Record<string, any>;
      return {
        value: Number(props[valueKey]) || 0,
        label: labelKey ? String(props[labelKey] || simpleEntity.entityId) : simpleEntity.entityId,
        entity: simpleEntity
      };
    })
    .filter(d => !isNaN(d.value));
}

/**
 * Create a basic bar chart using D3
 * @param container DOM element to render the chart in
 * @param data Data points for the chart
 * @param config Chart configuration
 */
export function createBarChart(
  container: HTMLElement,
  data: PieDataPoint[],
  config: ChartConfig
): void {
  // Clear existing content
  d3.select(container).selectAll('*').remove();

  const { width, height, margin } = config;
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Create SVG
  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('style', 'max-width: 100%; height: auto;');

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // Scales
  const x = d3.scaleBand()
    .domain(data.map((d: PieDataPoint) => d.label))
    .range([0, innerWidth])
    .padding(0.1);

  const y = d3.scaleLinear()
    .domain([0, d3.max(data, (d: PieDataPoint) => d.value) || 0])
    .nice()
    .range([innerHeight, 0]);

  // Bars
  g.selectAll('.bar')
    .data(data)
    .enter()
    .append('rect')
    .attr('class', 'bar')
    .attr('x', (d: PieDataPoint) => x(d.label) || 0)
    .attr('y', (d: PieDataPoint) => y(d.value))
    .attr('width', x.bandwidth())
    .attr('height', (d: PieDataPoint) => innerHeight - y(d.value))
    .attr('fill', '#6048E5')
    .attr('rx', 4);

  // Axes
  g.append('g')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x))
    .selectAll('text')
    .attr('transform', 'rotate(-45)')
    .style('text-anchor', 'end');

  g.append('g')
    .call(d3.axisLeft(y));
}

/**
 * Create a basic pie chart using D3
 * @param container DOM element to render the chart in
 * @param data Data points for the chart
 * @param config Chart configuration
 */
export function createPieChart(
  container: HTMLElement,
  data: PieDataPoint[],
  config: ChartConfig
): void {
  // Clear existing content
  d3.select(container).selectAll('*').remove();

  const { width, height } = config;
  const radius = Math.min(width, height) / 2 - 40;

  // Create SVG
  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('style', 'max-width: 100%; height: auto;')
    .append('g')
    .attr('transform', `translate(${width / 2},${height / 2})`);

  // Color scale
  const color = d3.scaleOrdinal()
    .domain(data.map((d: PieDataPoint) => d.label))
    .range(d3.schemeCategory10);

  // Pie generator
  const pie = d3.pie<PieDataPoint>()
    .value((d: PieDataPoint) => d.value)
    .sort(null);

  // Arc generator
  const arc = d3.arc<d3.PieArcDatum<PieDataPoint>>()
    .innerRadius(0)
    .outerRadius(radius);

  // Slices
  const slices = svg.selectAll('.slice')
    .data(pie(data))
    .enter()
    .append('g')
    .attr('class', 'slice');

  slices.append('path')
    .attr('d', arc)
    .attr('fill', (d: d3.PieArcDatum<PieDataPoint>) => color(d.data.label) as string)
    .attr('stroke', 'white')
    .style('stroke-width', '2px');

  // Labels
  slices.append('text')
    .text((d: d3.PieArcDatum<PieDataPoint>) => d.data.label)
    .attr('transform', (d: d3.PieArcDatum<PieDataPoint>) => `translate(${arc.centroid(d)})`)
    .style('text-anchor', 'middle')
    .style('font-size', '12px')
    .style('fill', 'white')
    .style('font-weight', 'bold');
}

/**
 * Create a line chart using D3
 * @param container DOM element to render the chart in
 * @param data Array of data series for the chart
 * @param config Chart configuration
 */
export function createLineChart(
  container: HTMLElement,
  data: LineDataPoint[][],
  config: ChartConfig
): void {
  // Clear existing content
  d3.select(container).selectAll('*').remove();

  const { width, height, margin } = config;
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Create SVG
  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('style', 'max-width: 100%; height: auto;');

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // Scales
  const xExtent = d3.extent(data.flat(), (d: LineDataPoint) => d.x) as [number, number];
  const yExtent = d3.extent(data.flat(), (d: LineDataPoint) => d.y) as [number, number];

  const x = d3.scaleLinear()
    .domain(xExtent)
    .range([0, innerWidth]);

  const y = d3.scaleLinear()
    .domain(yExtent)
    .nice()
    .range([innerHeight, 0]);

  // Line generator
  const line = d3.line<LineDataPoint>()
    .x((d: LineDataPoint) => x(d.x))
    .y((d: LineDataPoint) => y(d.y))
    .curve(d3.curveMonotoneX);

  // Color scale for multiple lines
  const color = d3.scaleOrdinal(d3.schemeCategory10);

  // Lines
  data.forEach((series, i) => {
    g.append('path')
      .datum(series)
      .attr('fill', 'none')
      .attr('stroke', color(i.toString()) as string)
      .attr('stroke-width', 2)
      .attr('d', line);
  });

  // Axes
  g.append('g')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x));

  g.append('g')
    .call(d3.axisLeft(y));
}

/**
 * Utility function to create a responsive container for D3 charts
 * @param parent Parent element to append the container to
 * @param config Chart configuration
 * @returns The created container element
 */
export function createChartContainer(
  parent: HTMLElement,
  config: ChartConfig
): HTMLElement {
  const container = document.createElement('div');
  container.style.width = '100%';
  container.style.height = 'auto';
  container.style.position = 'relative';

  // Add responsive wrapper
  const wrapper = document.createElement('div');
  wrapper.style.width = '100%';
  wrapper.style.maxWidth = `${config.width}px`;
  wrapper.style.margin = '0 auto';
  wrapper.appendChild(container);

  parent.appendChild(wrapper);
  return container;
}

// Re-export d3 for convenience
export { d3 };
