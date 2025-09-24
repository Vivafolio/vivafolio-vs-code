/* global window, document */
// D3 Line Graph Block (UMD style). The POC BlockLoader evals this file and calls the default export
// Function signature aligns with existing examples: either ({ graph }) or ({ entity, readonly, updateEntity })

module.exports = function D3LineGraphBlock({ graph }) {
  const container = document.createElement('div')
  container.className = 'd3-line-graph-block'
  container.style.cssText = `
    width: 50%;
    min-width: 420px;
    background: #ffffff;
    color: #111827; /* enforce dark text */
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `

  const header = document.createElement('div')
  header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; margin-bottom: 8px;'
  header.innerHTML = `
    <div>
      <strong>D3 Line Graph</strong>
      <br> <br>
      <div style="font-size:12px; color:#6b7280">GDP per capita (Chain linked volumes 2020, euro per capita)</div>
    </div>
    <div style="font-size:12px; color:#6b7280">Source: Eurostat SDG_08_10</div>
  `
  container.appendChild(header)

  const controls = document.createElement('div')
  controls.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px; margin-bottom: 8px;'
  container.appendChild(controls)

  const chartHost = document.createElement('div')
  chartHost.style.cssText = 'width: 100%; height: 420px; position: relative;'
  container.appendChild(chartHost)

  // Load D3 from CDN if not already present
  function ensureD3() {
    return new Promise((resolve, reject) => {
      if (window.d3) return resolve(window.d3)
      const s = document.createElement('script')
      s.src = 'https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js'
      s.onload = () => resolve(window.d3)
      s.onerror = reject
      document.head.appendChild(s)
    })
  }

  // Fetch CSV from the POC server static route for this block
  const CSV_PATH = '/external/d3-line-graph/sdg_08_10_page_linear_2_0.csv'

  function normalizeRows(rawRows) {
    return rawRows
      .map(r => {
        const year = parseInt(r.TIME_PERIOD || r.Time, 10)
        const geo = (r.geo || '').trim()
        const country = (r['Geopolitical entity (reporting)'] || r.STRUCTURE_NAME || geo || '').trim()
        const valStr = (r.OBS_VALUE || '').trim()
        const value = valStr ? parseFloat(valStr) : null
        return { geo, country: country || geo, year, value: Number.isFinite(value) ? value : null, unit: r.unit, indicator: r.na_item }
      })
      .filter(r => r.geo && r.year)
  }

  function buildUI(d3, allRows) {
    // Group by country code
    const byCountry = new Map()
    for (const r of allRows) {
      if (!r.geo) continue
      if (!byCountry.has(r.geo)) byCountry.set(r.geo, [])
      byCountry.get(r.geo).push(r)
    }
    // Sort series by last value desc
    const series = Array.from(byCountry.entries()).map(([geo, rows]) => ({
      geo,
      name: rows[0]?.country || geo,
      values: rows.filter(r => r.value != null).sort((a, b) => a.year - b.year)
    }))
    .filter(s => s.values.length)
    .sort((a, b) => (b.values[b.values.length - 1]?.value ?? 0) - (a.values[a.values.length - 1]?.value ?? 0))

    // Build multi-select (checkboxes)
    controls.innerHTML = ''
    const defaultPick = new Set(series.slice(0, 5).map(s => s.geo))
    const selected = new Set(defaultPick)

    for (const s of series) {
      const label = document.createElement('label')
      label.style.cssText = 'display:inline-flex; align-items:center; gap:6px; font-size:12px; color:#374151;'
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.value = s.geo
      cb.checked = selected.has(s.geo)
      cb.addEventListener('change', () => {
        if (cb.checked) selected.add(s.geo)
        else selected.delete(s.geo)
        renderChart(d3, series.filter(x => selected.has(x.geo)))
      })
      const name = document.createElement('span')
      name.textContent = s.name + ` (${s.geo})`
      label.appendChild(cb)
      label.appendChild(name)
      controls.appendChild(label)
    }

  const rerender = () => renderChart(d3, series.filter(x => selected.has(x.geo)))
  window.addEventListener('resize', rerender)
  renderChart(d3, series.filter(x => selected.has(x.geo)))
  }

  function renderChart(d3, series) {
    chartHost.innerHTML = ''
  const margin = { top: 10, right: 140, bottom: 28, left: 44 } // allocate space for vertical legend
  const width = chartHost.clientWidth || 600
    const height = chartHost.clientHeight || 420
    const innerW = width - margin.left - margin.right
    const innerH = height - margin.top - margin.bottom

    const svg = d3.select(chartHost)
      .append('svg')
      .attr('width', width)
      .attr('height', height)

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const allX = d3.extent(series.flatMap(s => s.values.map(v => v.year)))
    const allY = d3.extent(series.flatMap(s => s.values.map(v => v.value)))
    const x = d3.scaleLinear().domain(allX).range([0, innerW])
    const y = d3.scaleLinear().domain([Math.max(0, allY[0] ?? 0), allY[1] ?? 1]).nice().range([innerH, 0])

  const totalYears = (allX[1] ?? 0) - (allX[0] ?? 0)
  const approxTicks = Math.max(3, Math.min(8, Math.floor(totalYears / 3)))
  const xAxis = d3.axisBottom(x).ticks(approxTicks).tickFormat(d3.format('d'))
  const yAxis = d3.axisLeft(y).ticks(6)
  const gx = g.append('g').attr('transform', `translate(0,${innerH})`).call(xAxis)
  const gy = g.append('g').call(yAxis)
  // Force axis label colors (overrides any global white styling)
  gx.selectAll('text').attr('fill', '#111827')
  gy.selectAll('text').attr('fill', '#111827')
  gx.selectAll('line').attr('stroke', '#d1d5db')
  gy.selectAll('line').attr('stroke', '#d1d5db')
  gx.selectAll('path').attr('stroke', '#9ca3af')
  gy.selectAll('path').attr('stroke', '#9ca3af')

    const color = d3.scaleOrdinal(d3.schemeTableau10).domain(series.map(s => s.geo))
    const line = d3.line().x(d => x(d.year)).y(d => y(d.value))

    const group = g.append('g').attr('fill', 'none').attr('stroke-width', 2)
    for (const s of series) {
      group.append('path')
        .datum(s.values)
        .attr('stroke', color(s.geo))
        .attr('d', line)
        .append('title')
        .text(`${s.name} (${s.geo})`)
    }

    // Vertical legend on right
    const legendGroup = g.append('g').attr('class', 'legend').attr('transform', `translate(${innerW + 16},0)`)
    const entries = series.map(s => s.geo)
    const entryH = 16
    legendGroup.append('rect')
      .attr('x', -8)
      .attr('y', -8)
      .attr('width', 120)
      .attr('height', entries.length * entryH + 16)
      .attr('fill', '#f9fafb')
      .attr('stroke', '#e5e7eb')
      .attr('rx', 4)
    entries.forEach((geo, i) => {
      const s = series.find(x => x.geo === geo)
      const row = legendGroup.append('g').attr('transform', `translate(0,${i * entryH})`)
      row.append('rect').attr('width', 12).attr('height', 12).attr('y', -2).attr('fill', color(geo))
      row.append('text')
        .attr('x', 18)
        .attr('y', 8)
        .attr('font-size', 11)
        .attr('fill', '#111827')
        .text(geo)
        .append('title').text(`${s?.name || geo}`)
    })
  }

  ;(async () => {
    try {
  const d3 = await ensureD3()
  const raw = await d3.csv(CSV_PATH)
  const rows = normalizeRows(raw)
  buildUI(d3, rows)
    } catch (err) {
      const pre = document.createElement('pre')
      pre.style.color = 'crimson'
      pre.textContent = String(err?.stack || err)
      container.appendChild(pre)
    }
  })()

  return container
}
