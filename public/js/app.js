/* ── STATE ───────────────────────────── */
let data = { trailers: [], panol: [], calidad: [] }
let activeTab = 'trailers'
let activeView = { trailers: 'list', panol: 'list', calidad: 'list' }

/* ── INIT ────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  loadConfig()
  loadAll()
  bindNav()
  bindForm()
  bindFilters()
  document.getElementById('btn-refresh').addEventListener('click', loadAll)
})

async function loadConfig() {
  try {
    const res = await fetch('/api/config')
    const cfg = await res.json()
    if (cfg.company_name) document.title = cfg.company_name + ' — Producción'
  } catch(e) {}
}

/* ── LOAD ────────────────────────────── */
async function loadAll() {
  try {
    const [rt, rp, rc] = await Promise.all([
      fetch('/api/trailers'), fetch('/api/panol'), fetch('/api/calidad')
    ])
    data.trailers = await rt.json()
    data.panol    = await rp.json()
    data.calidad  = await rc.json()
    setStatus(true)
    renderAll()
  } catch(e) {
    setStatus(false)
    toast('No se pudo conectar a Supabase', 'error')
  }
}

function renderAll() {
  renderSummary('trailers')
  renderSummary('panol')
  renderSummary('calidad')
  renderTable('trailers')
  renderTable('panol')
  renderTable('calidad')
  updateHeaderStat()
  if (activeView.trailers === 'gantt') renderGantt('trailers')
  if (activeView.panol    === 'gantt') renderGantt('panol')
  if (activeView.calidad  === 'gantt') renderGantt('calidad')
}

function setStatus(ok) {
  document.getElementById('status-dot').className = 'status-dot ' + (ok ? 'ok' : 'error')
  document.getElementById('status-label').textContent = ok ? 'Supabase conectado' : 'Sin conexión'
}

function updateHeaderStat() {
  const prod = data.trailers.filter(t => t.en_produccion && !t.finalizado).length
  document.getElementById('header-stat-val').textContent = prod
  document.getElementById('header-stat').style.display = 'block'
}

/* ── NAV ─────────────────────────────── */
function bindNav() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'))
      btn.classList.add('active')
      document.getElementById('tab-' + activeTab).classList.add('active')
      // Update button label
      const labels = { trailers: 'Nuevo Trailer', panol: 'Nueva Tarea', calidad: 'Nueva Tarea' }
      document.getElementById('btn-nuevo-label').textContent = labels[activeTab]
    })
  })
}

function switchView(area, view, btn) {
  activeView[area] = view
  btn.closest('.tab-view-btns').querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'))
  btn.classList.add('active')
  document.getElementById(area + '-list').style.display  = view === 'list'  ? 'block' : 'none'
  document.getElementById(area + '-gantt').style.display = view === 'gantt' ? 'block' : 'none'
  if (view === 'gantt') renderGantt(area)
}

/* ── FORM ────────────────────────────── */
function bindForm() {
  document.getElementById('btn-open-form').addEventListener('click', () => {
    if (activeTab === 'trailers') {
      document.getElementById('form-title-trailers').textContent = 'Nuevo Trailer'
      document.getElementById('t-edit-id').value = ''
      clearForm('t')
      document.getElementById('t-inicio').value = hoyCorrecto().toISOString().slice(0,10)
      showModal('trailers')
    } else {
      const label = activeTab === 'panol' ? 'Pañol' : 'Calidad'
      document.getElementById('form-title-area').textContent = `Nueva Tarea — ${label}`
      document.getElementById('a-edit-id').value = ''
      clearForm('a')
      document.getElementById('a-inicio').value = hoyCorrecto().toISOString().slice(0,10)
      showModal('area')
    }
  })

  document.getElementById('btn-save-trailers').addEventListener('click', () => saveRecord('trailers'))
  document.getElementById('btn-save-area').addEventListener('click', () => saveRecord(activeTab))
}

function showModal(type) { document.getElementById('modal-' + type).style.display = 'flex' }
function hideModal(type) {
  document.getElementById('modal-' + type).style.display = 'none'
  clearForm(type === 'trailers' ? 't' : 'a')
}

function clearForm(p) {
  if (p === 't') {
    ['t-nombre','t-modelo','t-chapa','t-inicio','t-fecha'].forEach(id => document.getElementById(id).value = '')
    document.getElementById('t-prio').value = 'normal'
    document.getElementById('t-edit-id').value = ''
  } else {
    ['a-tarea','a-responsable','a-descripcion','a-inicio','a-fecha'].forEach(id => document.getElementById(id).value = '')
    document.getElementById('a-prio').value = 'normal'
    document.getElementById('a-edit-id').value = ''
  }
}

async function saveRecord(area) {
  let body, eid, endpoint

  if (area === 'trailers') {
    const nombre = document.getElementById('t-nombre').value.trim()
    const chapa  = document.getElementById('t-chapa').value.trim()
    const fecha  = document.getElementById('t-fecha').value
    if (!nombre || !chapa || !fecha) { toast('Completá nombre, chapa y fecha', 'error'); return }
    body = { nombre, modelo: document.getElementById('t-modelo').value.trim(),
             chapa, fecha_inicio: document.getElementById('t-inicio').value,
             fecha_fin: fecha, prioridad: document.getElementById('t-prio').value }
    eid = document.getElementById('t-edit-id').value
    endpoint = '/api/trailers'
  } else {
    const tarea = document.getElementById('a-tarea').value.trim()
    const fecha = document.getElementById('a-fecha').value
    if (!tarea || !fecha) { toast('Completá tarea y fecha estimada', 'error'); return }
    body = { tarea, responsable: document.getElementById('a-responsable').value.trim(),
             descripcion: document.getElementById('a-descripcion').value.trim(),
             fecha_inicio: document.getElementById('a-inicio').value,
             fecha_fin: fecha, prioridad: document.getElementById('a-prio').value }
    eid = document.getElementById('a-edit-id').value
    endpoint = '/api/' + area
  }

  try {
    const res = await fetch(eid ? `${endpoint}/${eid}` : endpoint, {
      method: eid ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
    await loadAll()
    hideModal(area === 'trailers' ? 'trailers' : 'area')
    toast(eid ? 'Actualizado' : 'Guardado', 'success')
  } catch(e) { toast('Error: ' + e.message, 'error') }
}

function editRecord(area, id) {
  const item = data[area].find(x => x.id === id)
  if (!item) return

  if (area === 'trailers') {
    document.getElementById('form-title-trailers').textContent = 'Editar Trailer'
    document.getElementById('t-nombre').value  = item.nombre
    document.getElementById('t-modelo').value  = item.modelo || ''
    document.getElementById('t-chapa').value   = item.chapa
    document.getElementById('t-inicio').value  = item.fecha_inicio || ''
    document.getElementById('t-fecha').value   = item.fecha_fin || ''
    document.getElementById('t-prio').value    = item.prioridad || 'normal'
    document.getElementById('t-edit-id').value = id
    showModal('trailers')
  } else {
    const label = area === 'panol' ? 'Pañol' : 'Calidad'
    document.getElementById('form-title-area').textContent = `Editar Tarea — ${label}`
    document.getElementById('a-tarea').value       = item.tarea
    document.getElementById('a-responsable').value = item.responsable || ''
    document.getElementById('a-descripcion').value = item.descripcion || ''
    document.getElementById('a-inicio').value      = item.fecha_inicio || ''
    document.getElementById('a-fecha').value       = item.fecha_fin || ''
    document.getElementById('a-prio').value        = item.prioridad || 'normal'
    document.getElementById('a-edit-id').value     = id
    showModal('area')
  }
}

async function toggleProduccion(area, id) {
  const item = data[area].find(x => x.id === id)
  if (!item || item.finalizado) return
  const newProd = !item.en_produccion
  try {
    await fetch(`/api/${area}/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        en_produccion: newProd,
        fecha_inicio: newProd && !item.fecha_inicio ? hoyCorrecto().toISOString().slice(0,10) : item.fecha_inicio
      })
    })
    await loadAll()
    toast(newProd ? '▶ Iniciado' : 'Pausado', 'success')
  } catch { toast('Error', 'error') }
}

async function toggleDone(area, id) {
  const item = data[area].find(x => x.id === id)
  if (!item) return
  const newDone = !item.finalizado
  try {
    await fetch(`/api/${area}/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ finalizado: newDone, en_produccion: newDone ? true : item.en_produccion })
    })
    await loadAll()
    toast(newDone ? '✓ Finalizado' : 'Desmarcado', 'success')
  } catch { toast('Error', 'error') }
}

async function deleteRecord(area, id) {
  if (!confirm('¿Eliminar este registro?')) return
  try {
    await fetch(`/api/${area}/${id}`, { method: 'DELETE' })
    await loadAll()
    toast('Eliminado', 'success')
  } catch { toast('Error', 'error') }
}

/* ── FILTERS ─────────────────────────── */
function bindFilters() {
  document.getElementById('search-input').addEventListener('input', renderAll)
  document.getElementById('filter-status').addEventListener('change', renderAll)
}

/* ── HELPERS ─────────────────────────── */
function parseDate(str) {
  if (!str) return null
  const [y, m, d] = str.slice(0,10).split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0)
}

function hoyCorrecto() {
  const str = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0)
}

function calcProgress(item) {
  if (item.finalizado) return 100
  if (!item.en_produccion || !item.fecha_inicio || !item.fecha_fin) return 0
  const start = parseDate(item.fecha_inicio)
  const end   = parseDate(item.fecha_fin)
  const now   = hoyCorrecto()
  const total = end - start
  if (total <= 0) return now >= end ? 100 : 0
  return Math.min(100, Math.max(0, Math.round(((now - start) / total) * 100)))
}

function getStatus(item) {
  if (item.finalizado) return 'done'
  if (!item.en_produccion) return 'pending'
  return hoyCorrecto() > parseDate(item.fecha_fin) ? 'overdue' : 'in-prod'
}

const STATUS_LABEL = { done: 'Completado', pending: 'Pendiente', 'in-prod': 'En Producción', overdue: 'Vencido' }
const BADGE_CLASS  = { done: 'badge-done', pending: 'badge-pending', 'in-prod': 'badge-prod', overdue: 'badge-overdue' }
const BAR_COLOR    = { done: '#00a86b', 'in-prod': '#1e4db7', overdue: '#ef4444', pending: '#f59e0b' }

function fmtDate(d) {
  if (!d) return '—'
  const [y,m,day] = d.slice(0,10).split('-')
  return `${day}/${m}/${y}`
}

function getFiltered(area) {
  const q      = document.getElementById('search-input').value.toLowerCase()
  const stFilt = document.getElementById('filter-status').value
  return data[area].filter(item => {
    const searchStr = area === 'trailers'
      ? `${item.nombre} ${item.chapa} ${item.modelo || ''}`.toLowerCase()
      : `${item.tarea} ${item.responsable || ''} ${item.descripcion || ''}`.toLowerCase()
    return (!q || searchStr.includes(q)) && (!stFilt || getStatus(item) === stFilt)
  })
}

/* ── SUMMARY CARDS ───────────────────── */
function renderSummary(area) {
  const items = data[area]
  const tot  = items.length
  const prod = items.filter(i => i.en_produccion && !i.finalizado).length
  const done = items.filter(i => i.finalizado).length
  const over = items.filter(i => getStatus(i) === 'overdue').length

  const ids = ['trailers','panol','calidad'].includes(area)
  const html = `
    <div class="scard c-total"><div class="scard-label">Total</div><div class="scard-val blue">${tot}</div></div>
    <div class="scard c-prod"><div class="scard-label">En producción</div><div class="scard-val green">${prod}</div></div>
    <div class="scard c-done"><div class="scard-label">Finalizados</div><div class="scard-val teal">${done}</div></div>
    <div class="scard c-overdue"><div class="scard-label">Vencidos</div><div class="scard-val red">${over}</div></div>`

  document.getElementById(area + '-summary').innerHTML = html
  const ganttSummary = document.getElementById(area + '-gantt-summary')
  if (ganttSummary) ganttSummary.innerHTML = html
}

/* ── TABLE RENDER ────────────────────── */
function renderTable(area) {
  const rows   = getFiltered(area)
  const tbody  = document.getElementById(area + '-tbody')
  const empty  = document.getElementById(area + '-empty')
  const table  = document.getElementById(area + '-table')

  if (!rows.length) { table.style.display = 'none'; empty.style.display = 'block'; return }
  table.style.display = ''; empty.style.display = 'none'

  tbody.innerHTML = rows.map(item => {
    const st  = getStatus(item)
    const pct = calcProgress(item)
    const prioHtml = item.prioridad !== 'normal'
      ? `<div class="t-prio" style="color:${item.prioridad==='urgente'?'#dc2626':'#d97706'}">${item.prioridad==='urgente'?'⚡ Urgente':'↑ Alta'}</div>`
      : ''

    const btnPlay = !item.finalizado ? `
      <button class="action-btn play ${item.en_produccion?'active':''}"
        onclick="toggleProduccion('${area}',${item.id})"
        title="${item.en_produccion?'Pausar':'Iniciar producción'}">
        <i class="ti ti-${item.en_produccion?'player-pause':'player-play'}"></i>
      </button>` : ''

    const btnCheck = `
      <button class="action-btn check ${item.finalizado?'active':''}"
        onclick="toggleDone('${area}',${item.id})"
        title="${item.finalizado?'Desmarcar':'Finalizar'}">
        <i class="ti ti-check"></i>
      </button>`

    if (area === 'trailers') {
      return `<tr class="row-${st}">
        <td data-label="Chapa"><span class="chapa">${item.chapa}</span></td>
        <td data-label="Trailer"><div class="t-name">${item.nombre}</div>${prioHtml}</td>
        <td data-label="Modelo" style="color:var(--text-sec)">${item.modelo||'—'}</td>
        <td data-label="Inicio" style="color:var(--text-sec)">${fmtDate(item.fecha_inicio)}</td>
        <td data-label="Fin est." style="font-weight:600">${fmtDate(item.fecha_fin)}</td>
        <td data-label="Avance" class="progress-cell">
          <div class="progress-bg"><div class="progress-fill" style="width:${pct}%;background:${BAR_COLOR[st]}"></div></div>
          <div class="progress-pct">${pct}%</div>
        </td>
        <td data-label="Estado"><span class="badge ${BADGE_CLASS[st]}">${STATUS_LABEL[st]}</span></td>
        <td data-label="Acciones"><div class="row-actions">
          ${btnPlay}${btnCheck}
          <button class="action-btn edit" onclick="editRecord('trailers',${item.id})" title="Editar"><i class="ti ti-pencil"></i></button>
          <button class="action-btn del"  onclick="deleteRecord('trailers',${item.id})" title="Eliminar"><i class="ti ti-trash"></i></button>
        </div></td>
      </tr>`
    } else {
      return `<tr class="row-${st}">
        <td data-label="Tarea"><div class="t-name">${item.tarea}</div>${prioHtml}</td>
        <td data-label="Responsable" style="color:var(--text-sec)">${item.responsable||'—'}</td>
        <td data-label="Descripción" style="color:var(--text-sec);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${item.descripcion||''}">${item.descripcion||'—'}</td>
        <td data-label="Inicio" style="color:var(--text-sec)">${fmtDate(item.fecha_inicio)}</td>
        <td data-label="Fin est." style="font-weight:600">${fmtDate(item.fecha_fin)}</td>
        <td data-label="Avance" class="progress-cell">
          <div class="progress-bg"><div class="progress-fill" style="width:${pct}%;background:${BAR_COLOR[st]}"></div></div>
          <div class="progress-pct">${pct}%</div>
        </td>
        <td data-label="Estado"><span class="badge ${BADGE_CLASS[st]}">${STATUS_LABEL[st]}</span></td>
        <td data-label="Acciones"><div class="row-actions">
          ${btnPlay}${btnCheck}
          <button class="action-btn edit" onclick="editRecord('${area}',${item.id})" title="Editar"><i class="ti ti-pencil"></i></button>
          <button class="action-btn del"  onclick="deleteRecord('${area}',${item.id})" title="Eliminar"><i class="ti ti-trash"></i></button>
        </div></td>
      </tr>`
    }
  }).join('')
}

/* ── GANTT ───────────────────────────── */
function renderGantt(area) {
  const ganttEl = document.getElementById('gantt-' + area)
  const items   = data[area]

  if (!items.length) {
    ganttEl.innerHTML = `<div class="empty-state"><i class="ti ti-chart-gantt"></i><p>Agregá registros para ver la línea del tiempo</p></div>`
    return
  }

  const now = hoyCorrecto()
  const allDates = items.flatMap(i => [
    i.fecha_inicio ? parseDate(i.fecha_inicio) : now,
    i.fecha_fin    ? parseDate(i.fecha_fin)    : now
  ])
  let minD = new Date(Math.min(...allDates.map(d => d.getTime())))
  let maxD = new Date(Math.max(...allDates.map(d => d.getTime())))
  minD.setDate(minD.getDate() - 4)
  maxD.setDate(maxD.getDate() + 7)

  const span = maxD.getTime() - minD.getTime()

  // Columnas en viernes
  const cols = []
  const firstFriday = new Date(minD)
  const dow = firstFriday.getDay()
  firstFriday.setDate(firstFriday.getDate() + (dow <= 5 ? 5 - dow : 6))
  for (let d = new Date(firstFriday); d <= maxD; d.setDate(d.getDate() + 7)) {
    cols.push(new Date(d))
  }

  const pct = d => Math.max(0, Math.min(100, ((d.getTime() - minD.getTime()) / span) * 100))
  const todayPct = pct(now)

  const header = `<div class="gantt-header">
    <div class="gantt-label-col"></div>
    <div class="gantt-timeline" style="position:relative;min-height:20px">
      ${cols.map(d => {
        const isT = Math.abs(d.getTime() - now.getTime()) < 86400000 * 3
        return `<div class="gantt-col-abs ${isT?'today-col':''}" style="left:${pct(d)}%"><span>${d.getDate()}/${d.getMonth()+1}</span></div>`
      }).join('')}
    </div>
  </div>`

  const sorted = [...items].sort((a, b) => {
    const da = a.fecha_inicio ? parseDate(a.fecha_inicio) : new Date('9999-01-01')
    const db = b.fecha_inicio ? parseDate(b.fecha_inicio) : new Date('9999-01-01')
    return da - db
  })

  const rowsHtml = sorted.map(item => {
    const st    = getStatus(item)
    const prog  = calcProgress(item)
    const startD = item.fecha_inicio ? parseDate(item.fecha_inicio) : now
    const endD   = item.fecha_fin    ? parseDate(item.fecha_fin)    : now
    const left   = pct(startD)
    const width  = Math.max(4, pct(endD) - left)
    const label  = STATUS_LABEL[st] + (st !== 'pending' ? ` · ${prog}%` : '')
    const innerW = (st === 'done' || st === 'overdue') ? 100 : prog
    const name   = area === 'trailers' ? item.nombre : item.tarea
    const sub    = area === 'trailers'
      ? `${item.chapa}${item.modelo ? ' · ' + item.modelo : ''}`
      : `${item.responsable || '—'}`

    const tooltipLines = area === 'trailers'
      ? [name, item.modelo ? `Modelo: ${item.modelo}` : null, `Chapa: ${item.chapa}`,
         item.fecha_inicio ? `Inicio: ${fmtDate(item.fecha_inicio)}` : null,
         `Fin estimado: ${fmtDate(item.fecha_fin)}`, `Estado: ${STATUS_LABEL[st]}`,
         st !== 'pending' ? `Avance: ${prog}%` : null]
      : [name, item.responsable ? `Responsable: ${item.responsable}` : null,
         item.descripcion ? `Desc: ${item.descripcion}` : null,
         item.fecha_inicio ? `Inicio: ${fmtDate(item.fecha_inicio)}` : null,
         `Fin estimado: ${fmtDate(item.fecha_fin)}`, `Estado: ${STATUS_LABEL[st]}`,
         st !== 'pending' ? `Avance: ${prog}%` : null]
    const tooltip = tooltipLines.filter(Boolean).join('\n')

    return `<div class="gantt-row">
      <div class="gantt-row-info">
        <div class="gr-name">${name}</div>
        <div class="gr-chapa">${sub}</div>
      </div>
      <div class="gantt-bar-area">
        ${todayPct >= 0 && todayPct <= 100 ? `
          <div class="today-line" style="left:${todayPct}%"></div>
          <div class="today-pip"  style="left:${todayPct}%"></div>` : ''}
        <div class="gantt-bar ${st}" style="left:${left}%;width:${width}%"
          onmouseenter="showTooltip(event,\`${tooltip.replace(/`/g,"'")}\`)"
          onmouseleave="hideTooltip()">
          <div class="gantt-bar-fill" style="width:${innerW}%"></div>
          <span>${label}</span>
        </div>
        <div class="gantt-end-label" style="left:${left+width}%">${fmtDate(item.fecha_fin)}</div>
      </div>
    </div>`
  }).join('')

  ganttEl.innerHTML = header + rowsHtml
}

/* ── TOOLTIP ─────────────────────────── */
function showTooltip(e, text) {
  let tip = document.getElementById('gantt-tooltip')
  if (!tip) { tip = document.createElement('div'); tip.id = 'gantt-tooltip'; document.body.appendChild(tip) }
  tip.innerHTML = text.split('\n').map((l,i) => i===0 ? `<strong>${l}</strong>` : `<span>${l}</span>`).join('')
  tip.style.display = 'flex'
  tip.style.left = Math.min(e.clientX + 14, window.innerWidth - 220) + 'px'
  tip.style.top  = Math.max(e.clientY - 10, 8) + 'px'
}

function hideTooltip() {
  const tip = document.getElementById('gantt-tooltip')
  if (tip) tip.style.display = 'none'
}

/* ── TOAST ───────────────────────────── */
function toast(msg, type = '') {
  const el = document.getElementById('toast')
  el.textContent = msg
  el.className = 'toast show ' + type
  setTimeout(() => { el.className = 'toast' }, 3200)
}