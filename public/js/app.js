let trailers = []

document.addEventListener('DOMContentLoaded', () => {
  loadConfig()
  loadTrailers()
  bindNav()
  bindForm()
  bindFilters()
})

async function loadConfig() {
  try {
    const res = await fetch('/api/config')
    const cfg = await res.json()
    if (cfg.company_name) document.title = cfg.company_name + ' — Producción Trailers'
  } catch(e) {}
}

/* ── NAV ─────────────────────────────── */
function bindNav() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'))
      btn.classList.add('active')
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active')
      if (btn.dataset.tab === 'tablero') renderTimeline()
    })
  })
}

/* ── LOAD ────────────────────────────── */
async function loadTrailers() {
  try {
    const res = await fetch('/api/trailers')
    if (!res.ok) throw new Error()
    trailers = await res.json()
    setStatus(true)
    renderTable()
    updateHeaderStat()
  } catch(e) {
    setStatus(false)
    toast('No se pudo conectar a Supabase', 'error')
  }
}

function setStatus(ok) {
  document.getElementById('status-dot').className = 'status-dot ' + (ok ? 'ok' : 'error')
  document.getElementById('status-label').textContent = ok ? 'Supabase conectado' : 'Sin conexión'
}

function updateHeaderStat() {
  const prod = trailers.filter(t => t.en_produccion && !t.finalizado).length
  const el = document.getElementById('header-stat')
  document.getElementById('header-stat-val').textContent = prod
  el.style.display = 'block'
}

/* ── FORM ────────────────────────────── */
function bindForm() {
  document.getElementById('btn-open-form').addEventListener('click', () => {
    document.getElementById('form-title').textContent = 'Nuevo Trailer'
    document.getElementById('f-edit-id').value = ''
    clearForm()
    document.getElementById('f-inicio').value = new Date().toISOString().slice(0,10)
    showModal()
  })
  document.getElementById('btn-close-form').addEventListener('click', hideModal)
  document.getElementById('btn-cancel-form').addEventListener('click', hideModal)
  document.getElementById('btn-save-form').addEventListener('click', saveTrailer)
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) hideModal()
  })
}

function showModal() { document.getElementById('modal-overlay').style.display = 'flex' }
function hideModal()  { document.getElementById('modal-overlay').style.display = 'none'; clearForm() }

function clearForm() {
  ['f-nombre','f-modelo','f-chapa','f-inicio','f-fecha'].forEach(id => document.getElementById(id).value = '')
  document.getElementById('f-prio').value = 'normal'
  document.getElementById('f-edit-id').value = ''
}

async function saveTrailer() {
  const nombre = document.getElementById('f-nombre').value.trim()
  const modelo = document.getElementById('f-modelo').value.trim()
  const chapa  = document.getElementById('f-chapa').value.trim()
  const inicio = document.getElementById('f-inicio').value
  const fecha  = document.getElementById('f-fecha').value
  const prio   = document.getElementById('f-prio').value
  const eid    = document.getElementById('f-edit-id').value

  if (!nombre || !chapa || !fecha) { toast('Completá nombre, chapa y fecha estimada', 'error'); return }

  const body = { nombre, modelo, chapa, fecha_inicio: inicio, fecha_fin: fecha, prioridad: prio }
  try {
    const res = await fetch(eid ? `/api/trailers/${eid}` : '/api/trailers', {
      method: eid ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
    await loadTrailers()
    hideModal()
    toast(eid ? 'Trailer actualizado' : 'Trailer agregado', 'success')
  } catch(e) { toast('Error: ' + e.message, 'error') }
}

function editTrailer(id) {
  const t = trailers.find(x => x.id === id)
  if (!t) return
  document.getElementById('form-title').textContent = 'Editar Trailer'
  document.getElementById('f-nombre').value  = t.nombre
  document.getElementById('f-modelo').value  = t.modelo || ''
  document.getElementById('f-chapa').value   = t.chapa
  document.getElementById('f-inicio').value  = t.fecha_inicio || ''
  document.getElementById('f-fecha').value   = t.fecha_fin || ''
  document.getElementById('f-prio').value    = t.prioridad || 'normal'
  document.getElementById('f-edit-id').value = id
  showModal()
}

/* ── ACCIONES DE ESTADO ──────────────── */

// Iniciar producción (Pendiente → En Producción)
async function toggleProduccion(id) {
  const t = trailers.find(x => x.id === id)
  if (!t || t.finalizado) return
  const newProd = !t.en_produccion
  try {
    const res = await fetch(`/api/trailers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        en_produccion: newProd,
        fecha_inicio: newProd && !t.fecha_inicio
          ? new Date().toISOString().slice(0,10)
          : t.fecha_inicio
      })
    })
    if (!res.ok) throw new Error()
    await loadTrailers()
    toast(newProd ? '▶ Producción iniciada' : 'Producción pausada', 'success')
  } catch { toast('Error al actualizar', 'error') }
}

// Finalizar (En Producción → Finalizado)
async function toggleDone(id) {
  const t = trailers.find(x => x.id === id)
  if (!t) return
  const newDone = !t.finalizado
  try {
    const res = await fetch(`/api/trailers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        finalizado: newDone,
        en_produccion: newDone ? true : t.en_produccion
      })
    })
    if (!res.ok) throw new Error()
    await loadTrailers()
    toast(newDone ? '✓ Marcado como finalizado' : 'Desmarcado', 'success')
  } catch { toast('Error al actualizar', 'error') }
}

async function deleteTrailer(id) {
  if (!confirm('¿Eliminar este trailer?')) return
  try {
    const res = await fetch(`/api/trailers/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error()
    await loadTrailers()
    toast('Trailer eliminado', 'success')
  } catch { toast('Error al eliminar', 'error') }
}

/* ── TABLE ───────────────────────────── */
function bindFilters() {
  document.getElementById('search-input').addEventListener('input', renderTable)
  document.getElementById('filter-status').addEventListener('change', renderTable)
}

function calcProgress(t) {
  if (t.finalizado) return 100
  if (!t.en_produccion || !t.fecha_inicio || !t.fecha_fin) return 0
  const start = new Date(t.fecha_inicio), end = new Date(t.fecha_fin)
  const now = new Date(); now.setHours(0,0,0,0)
  const total = end - start
  if (total <= 0) return now >= end ? 100 : 0
  return Math.min(100, Math.max(0, Math.round(((now - start) / total) * 100)))
}

function getStatus(t) {
  if (t.finalizado) return 'done'
  if (!t.en_produccion) return 'pending'
  const now = new Date(); now.setHours(0,0,0,0)
  return now > new Date(t.fecha_fin) ? 'overdue' : 'in-prod'
}

const STATUS_LABEL = { done: 'Completado', pending: 'Pendiente', 'in-prod': 'En Producción', overdue: 'Vencido' }
const BADGE_CLASS  = { done: 'badge-done', pending: 'badge-pending', 'in-prod': 'badge-prod', overdue: 'badge-overdue' }
const BAR_COLOR    = { done: '#00a86b', 'in-prod': '#1e4db7', overdue: '#ef4444', pending: '#f59e0b' }

function fmtDate(d) {
  if (!d) return '—'
  const [y,m,day] = d.slice(0,10).split('-')
  return `${day}/${m}/${y}`
}

function renderTable() {
  const q      = document.getElementById('search-input').value.toLowerCase()
  const stFilt = document.getElementById('filter-status').value
  const tbody  = document.getElementById('trailers-tbody')
  const empty  = document.getElementById('table-empty')
  const table  = document.getElementById('trailers-table')

  const rows = trailers.filter(t => {
    const matchQ  = !q || t.nombre.toLowerCase().includes(q) || t.chapa.toLowerCase().includes(q)
    const matchSt = !stFilt || getStatus(t) === stFilt
    return matchQ && matchSt
  })

  if (!rows.length) { table.style.display = 'none'; empty.style.display = 'block'; return }
  table.style.display = ''; empty.style.display = 'none'

  tbody.innerHTML = rows.map(t => {
    const st  = getStatus(t)
    const pct = calcProgress(t)
    const prioHtml = t.prioridad !== 'normal'
      ? `<div class="t-prio" style="color:${t.prioridad==='urgente'?'#dc2626':'#d97706'}">${t.prioridad==='urgente'?'⚡ Urgente':'↑ Alta'}</div>`
      : ''

    // Botón PLAY — solo visible si está pendiente o en producción (no finalizado)
    const btnPlay = !t.finalizado ? `
      <button
        class="action-btn play ${t.en_produccion ? 'active' : ''}"
        onclick="toggleProduccion(${t.id})"
        title="${t.en_produccion ? 'Pausar producción' : 'Iniciar producción'}"
      >
        <i class="ti ti-${t.en_produccion ? 'player-pause' : 'player-play'}"></i>
      </button>` : ''

    // Botón CHECK — finalizar (siempre visible)
    const btnCheck = `
      <button
        class="action-btn check ${t.finalizado ? 'active' : ''}"
        onclick="toggleDone(${t.id})"
        title="${t.finalizado ? 'Desmarcar como finalizado' : 'Marcar como finalizado'}"
      >
        <i class="ti ti-check"></i>
      </button>`

    return `<tr class="row-${st}">
      <td><span class="chapa">${t.chapa}</span></td>
      <td><div class="t-name">${t.nombre}</div>${prioHtml}</td>
      <td style="color:var(--text-sec)">${t.modelo || '—'}</td>
      <td style="color:var(--text-sec)">${fmtDate(t.fecha_inicio)}</td>
      <td style="font-weight:600">${fmtDate(t.fecha_fin)}</td>
      <td class="progress-cell">
        <div class="progress-bg"><div class="progress-fill" style="width:${pct}%;background:${BAR_COLOR[st]}"></div></div>
        <div class="progress-pct">${pct}%</div>
      </td>
      <td><span class="badge ${BADGE_CLASS[st]}">${STATUS_LABEL[st]}</span></td>
      <td>
        <div class="row-actions">
          ${btnPlay}
          ${btnCheck}
          <button class="action-btn edit" onclick="editTrailer(${t.id})" title="Editar">
            <i class="ti ti-pencil"></i>
          </button>
          <button class="action-btn del" onclick="deleteTrailer(${t.id})" title="Eliminar">
            <i class="ti ti-trash"></i>
          </button>
        </div>
      </td>
    </tr>`
  }).join('')
}

/* ── GANTT ───────────────────────────── */
function renderTimeline() {
  const gantt = document.getElementById('gantt')
  const cards = document.getElementById('summary-cards')

  const tot  = trailers.length
  const prod = trailers.filter(t => t.en_produccion && !t.finalizado).length
  const done = trailers.filter(t => t.finalizado).length
  const over = trailers.filter(t => getStatus(t) === 'overdue').length

  cards.innerHTML = `
    <div class="scard c-total"><div class="scard-label">Total registrados</div><div class="scard-val blue">${tot}</div></div>
    <div class="scard c-prod"><div class="scard-label">En producción</div><div class="scard-val green">${prod}</div></div>
    <div class="scard c-done"><div class="scard-label">Finalizados</div><div class="scard-val teal">${done}</div></div>
    <div class="scard c-overdue"><div class="scard-label">Vencidos</div><div class="scard-val red">${over}</div></div>`

  if (!trailers.length) {
    gantt.innerHTML = `<div class="empty-state"><i class="ti ti-chart-gantt"></i><p>Agregá trailers para ver la línea del tiempo</p></div>`
    return
  }

  const now = new Date(); now.setHours(0,0,0,0)
  const allDates = trailers.flatMap(t => [
    t.fecha_inicio ? new Date(t.fecha_inicio) : now,
    t.fecha_fin    ? new Date(t.fecha_fin)    : now
  ])
  let minD = new Date(Math.min(...allDates.map(d => d.getTime())))
  let maxD = new Date(Math.max(...allDates.map(d => d.getTime())))
  minD.setDate(minD.getDate() - 4)
  maxD.setDate(maxD.getDate() + 7)

  const span = maxD - minD
  const COLS = Math.min(Math.round(span / 86400000), 26)
  const step = Math.max(1, Math.floor(span / 86400000 / COLS))
  const cols = []
  for (let i = 0; i <= COLS; i++) {
    const d = new Date(minD); d.setDate(d.getDate() + i * step); cols.push(d)
  }

  const pct = d => Math.max(0, Math.min(100, ((d - minD) / span) * 100))
  const todayPct = pct(now)

  const header = `<div class="gantt-header">
    <div class="gantt-label-col"></div>
    <div class="gantt-timeline">
      ${cols.map(d => {
        const isT = Math.abs(d - now) < 86400000 * step * 0.5
        return `<div class="gantt-col ${isT?'today-col':''}"><span>${d.getDate()}/${d.getMonth()+1}</span></div>`
      }).join('')}
    </div>
  </div>`

  const rowsHtml = trailers.map(t => {
    const st    = getStatus(t)
    const prog  = calcProgress(t)
    const startD = t.fecha_inicio ? new Date(t.fecha_inicio) : now
    const endD   = t.fecha_fin    ? new Date(t.fecha_fin)    : now
    const left   = pct(startD)
    const width  = Math.max(4, pct(endD) - left)
    const label  = STATUS_LABEL[st] + (st !== 'pending' ? ` · ${prog}%` : '')
    const innerW = (st === 'done' || st === 'overdue') ? 100 : prog

    return `<div class="gantt-row">
      <div class="gantt-row-info">
        <div class="gr-name">${t.nombre}</div>
        <div class="gr-chapa">${t.chapa}</div>
      </div>
      <div class="gantt-bar-area">
        ${todayPct >= 0 && todayPct <= 100 ? `
          <div class="today-line" style="left:${todayPct}%"></div>
          <div class="today-pip"  style="left:${todayPct}%"></div>` : ''}
        <div class="gantt-bar ${st}" style="left:${left}%;width:${width}%">
          <div class="gantt-bar-fill" style="width:${innerW}%"></div>
          <span>${label}</span>
        </div>
      </div>
    </div>`
  }).join('')

  gantt.innerHTML = header + rowsHtml
}

/* ── TOAST ───────────────────────────── */
function toast(msg, type = '') {
  const el = document.getElementById('toast')
  el.textContent = msg
  el.className = 'toast show ' + type
  setTimeout(() => { el.className = 'toast' }, 3200)
}
