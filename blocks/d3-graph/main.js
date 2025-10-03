/* global window, document */
// Line Graph Block (no network). The loader evals this file and calls the default export.
// It reads hydrated data from the Host-provided graph/config only.

module.exports = function D3LineGraphBlock({ graph }) {
  const container = document.createElement('div')
  container.className = 'd3-line-graph-block'
  container.style.cssText = `
    width: 50%;
    min-width: 420px;
    background: #ffffff;
    color: #111827;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `

  const titleEl = document.createElement('div')
  titleEl.style.cssText = 'font-weight:600; margin-bottom:6px;'
  container.appendChild(titleEl)

  const status = document.createElement('div')
  status.style.cssText = 'font-size:12px; color:#6b7280; margin-bottom:6px;'
  container.appendChild(status)

  const chartHost = document.createElement('div')
  chartHost.style.cssText = 'width: 100%; height: 420px; position: relative;'
  container.appendChild(chartHost)

  // Helpers
  try {
    window.addEventListener('message', (ev) => {
      const data = ev && ev.data
      if (data && data.type === 'graph:init' && data.graph && (!window.__vivafolioGraphContext || !window.__vivafolioGraphContext.graph)) {
        try {
          window.__vivafolioGraphContext = { graph: data.graph }
          console.debug('[d3-block] graph:init received; set global graph context with', Array.isArray(data.graph?.entities) ? data.graph.entities.length : null, 'entities')
        } catch (_) {}
      }
    })
  } catch (_) {}
  function entitiesFromGraph() {
    const globalGraph = (window && (window.__vivafolioGraphContext || (window.parent && window.parent.__vivafolioGraphContext)) && (window.__vivafolioGraphContext || (window.parent && window.parent.__vivafolioGraphContext)).graph) || null
    const sources = [
      globalGraph && globalGraph.entities,
      graph && graph.blockGraph && graph.blockGraph.linkedEntities,
      graph && graph.entities
    ]
    // Diagnostics
    try {
      console.debug('[d3-block] entitiesFromGraph counts:', {
        global: Array.isArray(sources[0]) ? sources[0].length : null,
        blockGraph: Array.isArray(sources[1]) ? sources[1].length : null,
        direct: Array.isArray(sources[2]) ? sources[2].length : null
      })
    } catch (_) {}
    for (const src of sources) {
      if (Array.isArray(src) && src.length > 0) return src
    }
    // Fallback: if any source is an empty array, prefer that structure; else return []
    for (const src of sources) {
      if (Array.isArray(src)) return src
    }
    return []
  }

  function pickConfigEntity(entities) {
    return entities.find((e) => {
      const p = e && e.properties
      return p && typeof p.mapping === 'object'
    }) || null
  }

  function pathGet(obj, path) {
    if (!obj || !path) return undefined
    const parts = String(path).split('.')
    let cur = obj
    for (const k of parts) {
      if (cur && Object.prototype.hasOwnProperty.call(cur, k)) cur = cur[k]
      else return undefined
    }
    return cur
  }

  function getAny(obj, keys) {
    for (const k of keys) {
      const v = pathGet(obj, k)
      if (v != null && v !== '') return v
    }
    return undefined
  }

  function getConfigAndRows() {
    const entities = entitiesFromGraph()
    if (!Array.isArray(entities) || !entities.length) return { config: null, rows: [] }

    const config = pickConfigEntity(entities) || null
    const p = (config && config.properties) || {}
    try { console.debug('[d3-block] config found:', !!config, 'mapping:', p && p.mapping) } catch (_) {}

    // 1) Inline materialized data
    if (Array.isArray(p.data)) return { config, rows: p.data }

    // 2) Linked dataset with properties.rows
    const dsId = p.datasetEntityId
    if (dsId) {
      const dataset = entities.find((e) => e && e.entityId === dsId)
      const rows = (dataset && Array.isArray(dataset.properties && dataset.properties.rows))
        ? dataset.properties.rows
        : []
      try { console.debug('[d3-block] dataset rows length:', Array.isArray(rows) ? rows.length : null) } catch (_) {}
      return { config, rows }
    }

    // 3) Dataset-only fallback: use any entity that looks like a dataset with rows
    const datasetLike = entities.find((e) => e && e.properties && Array.isArray(e.properties.rows))
    if (datasetLike) {
      try { console.debug('[d3-block] dataset-like entity used, rows:', datasetLike.properties.rows.length) } catch (_) {}
      return { config, rows: datasetLike.properties.rows }
    }

    // 4) Last resort: treat other entities as candidate rows (no network)
    const rows = entities.map((e) => e && e.properties).filter(Boolean)
    return { config, rows }
  }

  function toSeries(rows, mapping) {
    const xKey = mapping && mapping.x
    const yKey = mapping && mapping.y
    const sKey = mapping && mapping.series
    if (!xKey || !yKey) return []

    // Common alternates seen in CSV/IndexingService
    const xAlts = [xKey, 'TIME_PERIOD', 'Time', 'year', 'Year']
    const yAlts = [yKey, 'OBS_VALUE', 'Observation value', 'value', 'Value']
    const sAlts = [sKey, 'geo', 'STRUCTURE_NAME', 'country', 'series', 'Series']

    const groups = new Map()
    for (const r of rows) {
      const xvRaw = getAny(r, xAlts.filter(Boolean))
      const yvRaw = getAny(r, yAlts.filter(Boolean))
      const sRaw = getAny(r, sAlts.filter(Boolean))
      const xv = typeof xvRaw === 'string' ? Number(xvRaw) : xvRaw
      const yv = typeof yvRaw === 'string' ? Number(yvRaw) : yvRaw
      const key = sRaw != null ? String(sRaw) : 'Series'
      if (!Number.isFinite(xv) || !Number.isFinite(yv)) continue
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push({ x: xv, y: yv })
    }
    for (const arr of groups.values()) arr.sort((a, b) => a.x - b.x)
    return Array.from(groups.values())
  }

  function renderSimpleLineChart(host, series) {
    host.innerHTML = ''
    const width = host.clientWidth || 700
    const height = host.clientHeight || 420
    const margin = { top: 10, right: 16, bottom: 28, left: 44 }
    const innerW = width - margin.left - margin.right
    const innerH = height - margin.top - margin.bottom

    const svgNS = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(svgNS, 'svg')
    svg.setAttribute('width', String(width))
    svg.setAttribute('height', String(height))
    const g = document.createElementNS(svgNS, 'g')
    g.setAttribute('transform', `translate(${margin.left},${margin.top})`)
    svg.appendChild(g)

    const all = series.flat()
    if (!all.length) { host.appendChild(svg); return }
    const xs = all.map(d => d.x)
    const ys = all.map(d => d.y)
    const xMin = Math.min(...xs), xMax = Math.max(...xs)
    const yMin = Math.min(...ys), yMax = Math.max(...ys)
    const xScale = (x) => innerW * (x - xMin) / Math.max(1e-9, (xMax - xMin || 1))
    const yScale = (y) => innerH - innerH * (y - yMin) / Math.max(1e-9, (yMax - yMin || 1))

    // axes
    const xTicks = 6, yTicks = 6
    for (let i = 0; i <= xTicks; i++) {
      const xi = xMin + (i * (xMax - xMin)) / xTicks
      const xpx = xScale(xi)
      const tick = document.createElementNS(svgNS, 'line')
      tick.setAttribute('x1', String(xpx))
      tick.setAttribute('y1', String(innerH))
      tick.setAttribute('x2', String(xpx))
      tick.setAttribute('y2', String(innerH + 6))
      tick.setAttribute('stroke', '#9ca3af')
      g.appendChild(tick)
      const lbl = document.createElementNS(svgNS, 'text')
      lbl.setAttribute('x', String(xpx))
      lbl.setAttribute('y', String(innerH + 18))
      lbl.setAttribute('text-anchor', 'middle')
      lbl.setAttribute('font-size', '10')
      lbl.setAttribute('fill', '#374151')
      lbl.textContent = Number.isFinite(xi) ? String(Math.round(xi)) : ''
      g.appendChild(lbl)
    }
    for (let i = 0; i <= yTicks; i++) {
      const yi = yMin + (i * (yMax - yMin)) / yTicks
      const ypx = yScale(yi)
      const grid = document.createElementNS(svgNS, 'line')
      grid.setAttribute('x1', '0')
      grid.setAttribute('y1', String(ypx))
      grid.setAttribute('x2', String(innerW))
      grid.setAttribute('y2', String(ypx))
      grid.setAttribute('stroke', i === 0 ? '#9ca3af' : '#e5e7eb')
      g.appendChild(grid)
      const lbl = document.createElementNS(svgNS, 'text')
      lbl.setAttribute('x', String(-6))
      lbl.setAttribute('y', String(ypx + 3))
      lbl.setAttribute('text-anchor', 'end')
      lbl.setAttribute('font-size', '10')
      lbl.setAttribute('fill', '#374151')
      lbl.textContent = Number.isFinite(yi) ? String(Math.round(yi)) : ''
      g.appendChild(lbl)
    }

    const colors = ['#3366CC', '#DC3912', '#FF9900', '#109618', '#990099', '#0099C6', '#DD4477', '#66AA00', '#B82E2E', '#316395']
    series.forEach((arr, i) => {
      const path = document.createElementNS(svgNS, 'path')
      const d = arr.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${xScale(p.x)},${yScale(p.y)}`).join(' ')
      path.setAttribute('d', d)
      path.setAttribute('fill', 'none')
      path.setAttribute('stroke', colors[i % colors.length])
      path.setAttribute('stroke-width', '2')
      g.appendChild(path)
    })

    host.appendChild(svg)
  }

  // Execute with a short retry loop if data isn't ready yet
  let attempts = 0
  const maxAttempts = 10
  const tick = () => {
    attempts += 1
    try {
      const { config, rows } = getConfigAndRows()
      try {
        console.log('[d3-block] rows length:', Array.isArray(rows) ? rows.length : null,
          'sample keys:', rows && rows[0] ? Object.keys(rows[0]).slice(0, 6) : [])
        console.log('[d3-block] mapping:', (config && config.properties && config.properties.mapping) || { x: 'TIME_PERIOD', y: 'OBS_VALUE', series: 'geo' })
      } catch (_) {}
      const mapping = (config && config.properties && config.properties.mapping) || { x: 'TIME_PERIOD', y: 'OBS_VALUE', series: 'geo' }
      const series = toSeries(rows, mapping)

      titleEl.textContent = (config && config.properties && config.properties.title) || 'Line Chart'
      if (!series.length) {
        status.textContent = attempts < maxAttempts
          ? 'Loading data…'
          : 'No data found in entity graph. Host must hydrate config.data or dataset.rows.'
        if (attempts < maxAttempts) setTimeout(tick, 150)
        return
      }

      chartHost.innerHTML = ''
      renderSimpleLineChart(chartHost, series)
      status.textContent = `Series: ${series.length}, Points: ${series.reduce((n, s) => n + s.length, 0)}`
    } catch (err) {
      const pre = document.createElement('pre')
      pre.style.color = 'crimson'
      pre.textContent = String((err && err.stack) || err)
      container.appendChild(pre)
    }
  }
  tick()

  return container
}
