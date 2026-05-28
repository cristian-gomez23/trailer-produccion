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

function bindForm() {
  document.getElementById('btn-open-form').addEventListener('click', () => {
    document.getElementById('form-title').textContent = 'Nuevo Trailer'
    document.getElementById('f-edit-id').value = ''
    clearForm()
    document.getElementById('f-inicio').value = hoyCorrecto().toISOString().slice(0,10)
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

// Fecha de hoy en zona horaria Argentina
function parseDate(str) {
  if (!str) return null
  const [y, m, d] = str.slice(0,10).split("-").map(Number)
  return new Date(y, m - 1, d, 12, 0, 0)
}

function hoyCorrecto() {
  const str = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const [y, m, d] = str.split("-").map(Number); return new Date(y, m - 1, d, 12, 0, 0)
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
          ? hoyCorrecto().toISOString().slice(0,10)
          : t.fecha_inicio
      })
    })
    if (!res.ok) throw new Error()
    await loadTrailers()
    toast(newProd ? '▶ Producción iniciada' : 'Producción pausada', 'success')
  } catch { toast('Error al actualizar', 'error') }
}

async function toggleDone(id) {
  const t = trailers.find(x => x.id === id)
  if (!t) return
  const newDone = !t.finalizado
  try {
    const res = await fetch(`/api/trailers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ finalizado: newDone, en_produccion: newDone ? true : t.en_produccion })
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

function bindFilters() {
  document.getElementById('search-input').addEventListener('input', renderTable)
  document.getElementById('filter-status').addEventListener('change', renderTable)
}

function calcProgress(t) {
  if (t.finalizado) return 100
  if (!t.en_produccion || !t.fecha_inicio || !t.fecha_fin) return 0
  const start = parseDate(t.fecha_inicio)
  const end   = parseDate(t.fecha_fin)
  const now   = hoyCorrecto()
  const total = end - start
  if (total <= 0) return now >= end ? 100 : 0
  return Math.min(100, Math.max(0, Math.round(((now - start) / total) * 100)))
}

function getStatus(t) {
  if (t.finalizado) return 'done'
  if (!t.en_produccion) return 'pending'
  const now = hoyCorrecto()
  return now > parseDate(t.fecha_fin) ? 'overdue' : 'in-prod'
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

    const btnPlay = !t.finalizado ? `
      <button class="action-btn play ${t.en_produccion ? 'active' : ''}"
        onclick="toggleProduccion(${t.id})"
        title="${t.en_produccion ? 'Pausar producción' : 'Iniciar producción'}">
        <i class="ti ti-${t.en_produccion ? 'player-pause' : 'player-play'}"></i>
      </button>` : ''

    const btnCheck = `
      <button class="action-btn check ${t.finalizado ? 'active' : ''}"
        onclick="toggleDone(${t.id})"
        title="${t.finalizado ? 'Desmarcar' : 'Marcar como finalizado'}">
        <i class="ti ti-check"></i>
      </button>`

    return `<tr class="row-${st}">
      <td data-label="Chapa"><span class="chapa">${t.chapa}</span></td>
      <td data-label="Trailer"><div class="t-name">${t.nombre}</div>${prioHtml}</td>
      <td data-label="Modelo" style="color:var(--text-sec)">${t.modelo || '—'}</td>
      <td data-label="Inicio" style="color:var(--text-sec)">${fmtDate(t.fecha_inicio)}</td>
      <td data-label="Fin est." style="font-weight:600">${fmtDate(t.fecha_fin)}</td>
      <td data-label="Avance" class="progress-cell">
        <div class="progress-bg"><div class="progress-fill" style="width:${pct}%;background:${BAR_COLOR[st]}"></div></div>
        <div class="progress-pct">${pct}%</div>
      </td>
      <td data-label="Estado"><span class="badge ${BADGE_CLASS[st]}">${STATUS_LABEL[st]}</span></td>
      <td data-label="Acciones">
        <div class="row-actions">
          ${btnPlay}${btnCheck}
          <button class="action-btn edit" onclick="editTrailer(${t.id})" title="Editar"><i class="ti ti-pencil"></i></button>
          <button class="action-btn del"  onclick="deleteTrailer(${t.id})" title="Eliminar"><i class="ti ti-trash"></i></button>
        </div>
      </td>
    </tr>`
  }).join('')
}

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

  const now = hoyCorrecto()
  const allDates = trailers.flatMap(t => [
    t.fecha_inicio ? parseDate(t.fecha_inicio) : now,
    t.fecha_fin    ? parseDate(t.fecha_fin) : now
  ])
  let minD = new Date(Math.min(...allDates.map(d => d.getTime())))
  let maxD = new Date(Math.max(...allDates.map(d => d.getTime())))
  minD.setDate(minD.getDate() - 4)
  maxD.setDate(maxD.getDate() + 7)

  const span = maxD.getTime() - minD.getTime()

  // Columnas siempre en viernes
  const cols = []
  const firstFriday = new Date(minD)
  const dayOfWeek = firstFriday.getDay()
  const daysUntilFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 6
  firstFriday.setDate(firstFriday.getDate() + daysUntilFriday)
  for (let d = new Date(firstFriday); d <= maxD; d.setDate(d.getDate() + 7)) {
    cols.push(new Date(d))
  }

  const pct = d => Math.max(0, Math.min(100, ((d.getTime() - minD.getTime()) / span) * 100))
  const todayPct = pct(now)

  const header = `<div class="gantt-header">
    <div class="gantt-label-col"></div>
    <div class="gantt-timeline" style="position:relative">
      ${cols.map(d => {
        const leftPct = pct(d)
        const isT = Math.abs(d.getTime() - now.getTime()) < 86400000 * 3
        return `<div class="gantt-col-abs ${isT?'today-col':''}" style="left:${leftPct}%"><span>${d.getDate()}/${d.getMonth()+1}</span></div>`
      }).join('')}
    </div>
  </div>`

  // Ordenar por fecha_inicio asc, pendientes al final
  const sorted = [...trailers].sort((a, b) => {
    const da = a.fecha_inicio ? parseDate(a.fecha_inicio) : new Date('9999-01-01')
    const db = b.fecha_inicio ? parseDate(b.fecha_inicio) : new Date('9999-01-01')
    return da - db
  })

  const rowsHtml = sorted.map(t => {
    const st    = getStatus(t)
    const prog  = calcProgress(t)
    const startD = t.fecha_inicio ? parseDate(t.fecha_inicio) : now
    const endD   = t.fecha_fin    ? parseDate(t.fecha_fin) : now
    const left   = pct(startD)
    const width  = Math.max(4, pct(endD) - left)
    const label  = STATUS_LABEL[st] + (st !== 'pending' ? ` · ${prog}%` : '')
    const innerW = (st === 'done' || st === 'overdue') ? 100 : prog

    const tooltip = [
      t.nombre,
      t.modelo ? `Modelo: ${t.modelo}` : null,
      `Chapa: ${t.chapa}`,
      t.fecha_inicio ? `Inicio: ${fmtDate(t.fecha_inicio)}` : null,
      `Fin estimado: ${fmtDate(t.fecha_fin)}`,
      t.fecha_real_fin ? `Fin real: ${fmtDate(t.fecha_real_fin)}` : null,
      `Estado: ${STATUS_LABEL[st]}`,
      st !== 'pending' ? `Avance: ${prog}%` : null,
    ].filter(Boolean).join('\n')

    return `<div class="gantt-row">
      <div class="gantt-row-info">
        <div class="gr-name">${t.nombre}</div>
        <div class="gr-chapa">${t.chapa}${t.modelo ? ' · ' + t.modelo : ''}</div>
      </div>
      <div class="gantt-bar-area">
        ${todayPct >= 0 && todayPct <= 100 ? `
          <div class="today-line" style="left:${todayPct}%"></div>
          <div class="today-pip"  style="left:${todayPct}%"></div>` : ''}
        <div class="gantt-bar ${st}" style="left:${left}%;width:${width}%"
          onmouseenter="showTooltip(event, \`${tooltip.replace(/`/g,"'")}\`)"
          onmouseleave="hideTooltip()">
          <div class="gantt-bar-fill" style="width:${innerW}%"></div>
          <span>${label}</span>
        </div>
        <div class="gantt-end-label" style="left:${left + width}%">${fmtDate(t.fecha_fin)}</div>
      </div>
    </div>`
  }).join('')

  gantt.innerHTML = header + rowsHtml
}

/* ── TOOLTIP ─────────────────────────── */
function showTooltip(e, text) {
  let tip = document.getElementById('gantt-tooltip')
  if (!tip) {
    tip = document.createElement('div')
    tip.id = 'gantt-tooltip'
    document.body.appendChild(tip)
  }
  tip.innerHTML = text.split('\n').map((l,i) =>
    i === 0 ? `<strong>${l}</strong>` : `<span>${l}</span>`
  ).join('')
  tip.style.display = 'flex'
  positionTooltip(e, tip)
}

function positionTooltip(e, tip) {
  const x = e.clientX + 14
  const y = e.clientY - 10
  tip.style.left = Math.min(x, window.innerWidth - 220) + 'px'
  tip.style.top  = Math.max(y, 8) + 'px'
}

function hideTooltip() {
  const tip = document.getElementById('gantt-tooltip')
  if (tip) tip.style.display = 'none'
}

function toast(msg, type = '') {
  const el = document.getElementById('toast')
  el.textContent = msg
  el.className = 'toast show ' + type
  setTimeout(() => { el.className = 'toast' }, 3200)
}