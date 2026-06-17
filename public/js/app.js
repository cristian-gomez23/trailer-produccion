/* ── STATE ───────────────────────────── */
let data = { trailers: [], panol: [], calidad: [] }
let activeTab = 'trailers'
let activeView = { trailers: 'list', panol: 'list', calidad: 'list' }

/* Estado local del check de órdenes (fallback si no hay columna en Supabase) */
const ordenLocal = {}   // { [trailerId]: true|false }

/* Tipologías válidas (A–M) */
const TIPOS_VALIDAS = ['A','B','C','D','E','F','G','H','I','J','K','L','M']

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
    const [rt, rp, rc, ra] = await Promise.all([
      fetch('/api/trailers'), fetch('/api/panol'), fetch('/api/calidad'),
      fetch('/api/tareas-avance')
    ])
    data.trailers = await rt.json()
    data.panol    = await rp.json()
    data.calidad  = await rc.json()

    // Volcar el avance de órdenes guardado en Supabase a ordenLocal
    try {
      const avance = await ra.json()
      if (Array.isArray(avance)) {
        Object.keys(ordenLocal).forEach(k => delete ordenLocal[k])
        avance.forEach(a => {
          if (a.hecha) ordenLocal[ordKey(a.trailer_id, a.grupo, a.orden)] = true
        })
      }
    } catch (e) { /* sin avance persistido todavía */ }

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
  renderMateriales()
  renderOrdenes()
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
      document.getElementById('btn-nuevo-label').textContent = labels[activeTab] || 'Nuevo'
    })
  })
}

/* Vistas de la sección Trailers: list | gantt | ordenes | materiales.
   Las áreas Pañol/Calidad solo tienen list | gantt. */
function switchView(area, view, btn) {
  activeView[area] = view
  btn.closest('.tab-view-btns').querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'))
  btn.classList.add('active')

  if (area === 'trailers') {
    const views = ['list', 'gantt', 'ordenes', 'materiales']
    views.forEach(v => {
      const el = document.getElementById('trailers-' + v)
      if (el) el.style.display = (v === view) ? 'block' : 'none'
    })
    if (view === 'gantt')      renderGantt('trailers')
    if (view === 'ordenes')    renderOrdenes()
    if (view === 'materiales') renderMateriales()
    return
  }

  // Pañol / Calidad: solo list | gantt
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
    } else if (activeTab === 'panol' || activeTab === 'calidad') {
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
    const tip = document.getElementById('t-tipologia')
    if (tip) tip.value = ''
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
    const tipEl = document.getElementById('t-tipologia')
    body = { nombre, modelo: document.getElementById('t-modelo').value.trim(),
             chapa, fecha_inicio: document.getElementById('t-inicio').value,
             fecha_fin: fecha, prioridad: document.getElementById('t-prio').value,
             tipologia: tipEl ? tipEl.value : '' }
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
    const tip = document.getElementById('t-tipologia')
    if (tip) tip.value = item.tipologia || ''
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
      const tipoHtml = item.tipologia
        ? `<span class="tipo-badge">${item.tipologia}</span>`
        : `<span class="tipo-badge tipo-empty" title="Sin tipología asignada">—</span>`
      return `<tr class="row-${st}">
        <td data-label="Chapa"><span class="chapa">${item.chapa}</span></td>
        <td data-label="Trailer"><div class="t-name">${item.nombre}</div>${prioHtml}</td>
        <td data-label="Tipología">${tipoHtml}</td>
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

/* ════════════════════════════════════════════════════════════
   Catálogo de órdenes con materiales — window.ORDENES
   (definido en ordenes-data.js). Estructura:
   ORDENES[TIPO] = [{grupo, gdesc, qty,
     ordenes:[{orden, cod, tarea, sector, oper, horas,
       materiales:[{cod, mat, un, cant}]}]}]
   ════════════════════════════════════════════════════════════ */

function ordenesForTipo(tipo) {
  if (!tipo || typeof window.ORDENES === 'undefined') return null
  return window.ORDENES[tipo] || null
}

function fmtHoras(h) {
  if (h === null || h === undefined) return '—'
  if (h >= 1) return (h % 1 === 0 ? h : h.toFixed(1)) + ' h'
  return Math.round(h * 60) + ' min'
}
function fmtCant(c) {
  if (c === null || c === undefined) return '0'
  return (c % 1 === 0) ? c : c.toFixed(2)
}

/* ════════════════════════════════════════════════════════════
   ÓRDENES — réplica del Excel: Grupo › Orden (F00X) › materiales.
   El check aplica solo a la orden (la tarea).
   ════════════════════════════════════════════════════════════ */

let ordSel = null
function ordKey(trailerId, grupo, orden) { return `${trailerId}:${grupo}:${orden}` }
function ordenCumplida(trailerId, grupo, orden) { return !!ordenLocal[ordKey(trailerId, grupo, orden)] }

function renderOrdenes() {
  const cont = document.getElementById('ordenes-body')
  if (!cont) return

  if (typeof window.ORDENES === 'undefined') {
    cont.innerHTML = `<div class="empty-state"><i class="ti ti-clipboard-list"></i>
      <p>No se cargó el catálogo de órdenes (ordenes-data.js).</p></div>`
    return
  }

  const activos = data.trailers.filter(t => !t.finalizado)
  const conTipo = activos.filter(t => t.tipologia)
  const sinTipo = activos.filter(t => !t.tipologia)

  if (!conTipo.length) {
    cont.innerHTML = `<div class="empty-state"><i class="ti ti-clipboard-list"></i>
      <p>Ningún trailer activo tiene tipología asignada.<br>
      Editá un trailer y asignale una tipología (A–M) para ver sus órdenes de trabajo.</p></div>`
    return
  }

  if (ordSel === null || !conTipo.find(t => t.id === ordSel)) ordSel = conTipo[0].id

  const warn = sinTipo.length
    ? `<span class="mat-warn"><i class="ti ti-alert-triangle"></i> ${sinTipo.length} sin tipología</span>` : ''

  cont.innerHTML = `
    <div class="mat-toolbar">
      <label for="ord-trailer">Trailer</label>
      <select id="ord-trailer" onchange="ordSel = Number(this.value); renderOrdenesDetalle()">
        ${conTipo.map(t => `<option value="${t.id}" ${t.id===ordSel?'selected':''}>${t.nombre} · Tipología ${t.tipologia}</option>`).join('')}
      </select>
      ${warn}
    </div>
    <div id="ord-detalle"></div>`
  renderOrdenesDetalle()
}

function renderOrdenesDetalle() {
  const det = document.getElementById('ord-detalle')
  if (!det) return
  const t = data.trailers.find(x => x.id === ordSel)
  if (!t) { det.innerHTML = ''; return }

  const groups = ordenesForTipo(t.tipologia)
  if (!groups) {
    det.innerHTML = `<div class="empty-state"><i class="ti ti-help-circle"></i>
      <p>No hay órdenes cargadas para la tipología ${t.tipologia}.</p></div>`
    return
  }

  let nOrd = 0, nHechas = 0, hTotal = 0
  groups.forEach(g => g.ordenes.forEach(o => {
    nOrd++; hTotal += (o.horas || 0)
    if (ordenCumplida(t.id, g.grupo, o.orden)) nHechas++
  }))

  const cards = `
    <div class="ord-stats">
      <div class="ord-stat"><span class="ord-stat-val">${nOrd}</span><span class="ord-stat-lbl">órdenes</span></div>
      <div class="ord-stat"><span class="ord-stat-val ord-ok">${nHechas}</span><span class="ord-stat-lbl">completadas</span></div>
      <div class="ord-stat"><span class="ord-stat-val">${fmtHoras(hTotal)}</span><span class="ord-stat-lbl">mano de obra</span></div>
    </div>`

  const body = groups.map(g => {
    const ordenes = g.ordenes.map(o => {
      const done = ordenCumplida(t.id, g.grupo, o.orden)
      const mats = o.materiales.length
        ? `<table class="ord-mat-table"><tbody>
            ${o.materiales.map(m => `<tr class="${m.compra ? '' : 'ord-mat-reproc'}">
              <td class="mat-cod">#${m.cod}</td>
              <td class="mat-name">${m.mat || '<span style="color:var(--text-ter,#9ca3af)">(sin descripción)</span>'}${m.corte ? ` <span class="mat-corte">${m.corte}</span>` : ''}${m.previo ? ` <span class="mat-previo" title="Viene de ${m.previo} — no se compra de nuevo"><i class="ti ti-arrow-back-up" aria-hidden="true"></i> ${m.previo}</span>` : ''}</td>
              <td class="mat-cant">${fmtCant(m.cant)} <span class="mat-un">${m.un || ''}</span></td>
            </tr>`).join('')}
          </tbody></table>`
        : `<div class="ord-mat-empty">Sin materiales en esta orden</div>`
      return `
        <div class="ord-order ${done ? 'ord-order-done' : ''}">
          <div class="ord-order-head">
            <button class="ord-check ${done ? 'checked' : ''}"
              onclick="toggleOrden(${t.id}, ${g.grupo}, ${o.orden})"
              title="${done ? 'Desmarcar' : 'Marcar completada'}" aria-label="Marcar orden completada">
              <i class="ti ti-check"></i>
            </button>
            <span class="ord-task-cod">${o.cod || ''}</span>
            <span class="ord-order-name">${o.tarea}</span>
            <span class="ord-order-meta">
              ${o.sector ? `<span class="ord-chip ord-chip-sector" title="Sector">${o.sector}</span>` : ''}
              ${o.oper ? `<span class="ord-chip" title="Operarios"><i class="ti ti-user" aria-hidden="true"></i> ${o.oper}</span>` : ''}
              <span class="ord-chip ord-chip-time" title="Tiempo"><i class="ti ti-clock" aria-hidden="true"></i> ${fmtHoras(o.horas)}</span>
            </span>
          </div>
          ${mats}
        </div>`
    }).join('')

    const totalOrd = g.ordenes.length
    const hechasG = g.ordenes.filter(o => ordenCumplida(t.id, g.grupo, o.orden)).length
    const todasG = totalOrd > 0 && hechasG === totalOrd
    const algunaG = hechasG > 0 && hechasG < totalOrd

    return `
      <details class="ord-group" open>
        <summary class="ord-group-head">
          <button class="ord-check ord-check-group ${todasG ? 'checked' : ''} ${algunaG ? 'partial' : ''}"
            onclick="event.preventDefault(); event.stopPropagation(); toggleGrupo(${t.id}, ${g.grupo})"
            title="${todasG ? 'Desmarcar grupo' : 'Marcar todo el grupo'}" aria-label="Marcar todas las órdenes del grupo">
            <i class="ti ti-${todasG ? 'check' : (algunaG ? 'minus' : 'check')}"></i>
          </button>
          <span class="ord-group-name">Grupo ${g.grupo} · ${g.gdesc || ''}</span>
          <span class="ord-group-progress">${hechasG}/${totalOrd}</span>
          <span class="ord-group-qty">×${g.qty}</span>
          <i class="ti ti-chevron-down ord-group-chev" aria-hidden="true"></i>
        </summary>
        ${ordenes}
      </details>`
  }).join('')

  det.innerHTML = `
    <div class="mat-detalle-head">
      <div class="mat-detalle-title">${t.nombre}</div>
      <div class="mat-detalle-sub">Tipología ${t.tipologia} · órdenes de trabajo con sus materiales</div>
    </div>
    ${cards}
    ${body}`
}

/* Marca o desmarca TODAS las órdenes de un grupo del trailer.
   Si todas están hechas → las desmarca; si no → las marca todas. */
async function toggleGrupo(trailerId, grupo) {
  const t = data.trailers.find(x => x.id === trailerId)
  if (!t) return
  const groups = ordenesForTipo(t.tipologia)
  if (!groups) return
  const g = groups.find(gr => gr.grupo === grupo)
  if (!g) return

  const todas = g.ordenes.every(o => ordenCumplida(trailerId, grupo, o.orden))
  const nuevo = !todas   // si estaban todas → desmarcar; si no → marcar todas

  g.ordenes.forEach(o => { ordenLocal[ordKey(trailerId, grupo, o.orden)] = nuevo })
  renderOrdenesDetalle()

  // Persistir cada orden del grupo en Supabase
  try {
    await Promise.all(g.ordenes.map(o =>
      fetch('/api/tareas-avance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trailer_id: trailerId, grupo, orden: o.orden, hecha: nuevo })
      })
    ))
  } catch (e) { toast('No se pudo guardar el avance del grupo', 'error') }
}

async function toggleOrden(trailerId, grupo, orden) {
  const k = ordKey(trailerId, grupo, orden)
  ordenLocal[k] = !ordenLocal[k]
  renderOrdenesDetalle()
  // Persistir en Supabase (tabla tareas_avance)
  try {
    await fetch('/api/tareas-avance', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trailer_id: trailerId, grupo, orden, hecha: ordenLocal[k] })
    })
  } catch (e) { toast('No se pudo guardar el avance', 'error') }
}

/* ════════════════════════════════════════════════════════════
   MATERIALES — dos sub-vistas:
   · Planificación: trailers (acotados por fechas) → órdenes × cantidad
   · Cotizar órdenes: selección de órdenes sueltas de cualquier trailer
   Toggle "incluir completadas" aplica a ambas (por defecto las excluye).
   ════════════════════════════════════════════════════════════ */

let matSubview = 'plan'        // 'plan' | 'cotizar'
let planDesde = ''
let planHasta = ''
let planSel = null             // Set de ids de trailers, o null = autollenar
let incluirCompletadas = false // toggle
let cotizSel = {}              // { 'trailerId:grupo:orden': true } órdenes elegidas para cotizar

function planTrailersDisponibles() {
  return data.trailers.filter(t => !t.finalizado && t.tipologia)
}

function planSolapa(t) {
  if (!planDesde && !planHasta) return true
  const ini = t.fecha_inicio ? parseDate(t.fecha_inicio) : null
  const fin = t.fecha_fin ? parseDate(t.fecha_fin) : ini
  if (!ini && !fin) return true
  const d = planDesde ? parseDate(planDesde) : null
  const h = planHasta ? parseDate(planHasta) : null
  const tIni = ini || fin, tFin = fin || ini
  if (d && tFin < d) return false
  if (h && tIni > h) return false
  return true
}

/* Trailers que entran al rango de fechas (los chips se acotan a esto) */
function planTrailersEnRango() {
  return planTrailersDisponibles().filter(planSolapa)
}

/* ¿La orden está completada? (tildada en la pestaña Órdenes) */
function ordenEstaCompletada(trailerId, grupo, orden) {
  return !!ordenLocal[ordKey(trailerId, grupo, orden)]
}

function renderMateriales() {
  const cont = document.getElementById('materiales-body')
  if (!cont) return

  if (typeof window.ORDENES === 'undefined') {
    cont.innerHTML = `<div class="empty-state"><i class="ti ti-package"></i>
      <p>No se cargó el catálogo (ordenes-data.js).</p></div>`
    return
  }
  if (!planTrailersDisponibles().length) {
    cont.innerHTML = `<div class="empty-state"><i class="ti ti-package"></i>
      <p>Ningún trailer activo tiene tipología asignada para planificar.</p></div>`
    return
  }

  const tabs = `
    <div class="mat-subtabs">
      <button class="mat-subtab ${matSubview==='plan'?'on':''}" onclick="matSubview='plan'; renderMateriales()"><i class="ti ti-calendar-stats" aria-hidden="true"></i> Planificación</button>
      <button class="mat-subtab ${matSubview==='cotizar'?'on':''}" onclick="matSubview='cotizar'; renderMateriales()"><i class="ti ti-checklist" aria-hidden="true"></i> Cotizar órdenes</button>
      <label class="mat-toggle">
        <input type="checkbox" ${incluirCompletadas?'checked':''} onchange="incluirCompletadas=this.checked; renderMateriales()"/>
        Incluir completadas
      </label>
    </div>`

  cont.innerHTML = tabs + `<div id="mat-sub"></div>`
  if (matSubview === 'plan') renderPlanificacion()
  else renderCotizar()
}

/* ─────────────── SUB-VISTA: PLANIFICACIÓN ─────────────── */
function renderPlanificacion() {
  const sub = document.getElementById('mat-sub')
  if (!sub) return

  const enRango = planTrailersEnRango()
  // Si planSel es null, o quedó con ids fuera de rango, lo reseteo a "todos los del rango"
  if (planSel === null) planSel = new Set(enRango.map(t => t.id))
  // Limpiar selección de ids que ya no están en rango
  planSel = new Set([...planSel].filter(id => enRango.find(t => t.id === id)))

  const chips = enRango.length ? enRango.map(t => {
    const on = planSel.has(t.id)
    return `<button class="plan-chip ${on ? 'on' : ''}" onclick="togglePlanTrailer(${t.id})">
      ${on ? '<i class="ti ti-check" aria-hidden="true"></i> ' : ''}${t.nombre} · ${t.tipologia}
    </button>`
  }).join('') : `<span class="plan-empty-chips">Ningún trailer en este rango de fechas</span>`

  sub.innerHTML = `
    <div class="plan-filters">
      <div class="plan-filter-row">
        <label>Desde</label>
        <input type="date" value="${planDesde}" onchange="planDesde=this.value; planSel=null; renderPlanificacion()"/>
        <label>Hasta</label>
        <input type="date" value="${planHasta}" onchange="planHasta=this.value; planSel=null; renderPlanificacion()"/>
        <button class="plan-clear" onclick="planDesde=''; planHasta=''; planSel=null; renderPlanificacion()">Limpiar fechas</button>
      </div>
      <div class="plan-trailers">
        <div class="plan-trailers-head">
          <span>Trailers a producir ${enRango.length ? `(${enRango.length} en rango)` : ''}</span>
          <span>
            <button class="plan-mini" onclick="planSelAll(true)">Todos</button>
            <button class="plan-mini" onclick="planSelAll(false)">Ninguno</button>
          </span>
        </div>
        <div class="plan-chips">${chips}</div>
      </div>
    </div>
    <div id="plan-result"></div>`
  renderPlanResult()
}

function togglePlanTrailer(id) {
  if (!planSel) planSel = new Set()
  if (planSel.has(id)) planSel.delete(id); else planSel.add(id)
  renderPlanificacion()
}
function planSelAll(all) {
  const enRango = planTrailersEnRango()
  planSel = all ? new Set(enRango.map(t => t.id)) : new Set()
  renderPlanificacion()
}

function renderPlanResult() {
  const res = document.getElementById('plan-result')
  if (!res) return
  const enPlan = planTrailersEnRango().filter(t => planSel.has(t.id))

  if (!enPlan.length) {
    res.innerHTML = `<div class="empty-state"><i class="ti ti-calendar-off"></i>
      <p>Seleccioná al menos un trailer para planificar.</p></div>`
    return
  }

  const ordAgg = {}, matAgg = {}
  const porTipo = {}
  enPlan.forEach(t => { porTipo[t.tipologia] = (porTipo[t.tipologia] || 0) + 1 })

  // Recorremos por trailer (no por tipología) para poder excluir órdenes
  // completadas de ESE trailer puntual.
  enPlan.forEach(t => {
    const groups = ordenesForTipo(t.tipologia)
    if (!groups) return
    groups.forEach(g => {
      g.ordenes.forEach(o => {
        if (!incluirCompletadas && ordenEstaCompletada(t.id, g.grupo, o.orden)) return
        const factor = g.qty   // veces que se ejecuta la orden en este trailer
        const key = o.cod
        if (!ordAgg[key]) ordAgg[key] = { cod: o.cod, tarea: o.tarea, sector: o.sector, horas: 0, cant: 0 }
        ordAgg[key].cant += factor
        ordAgg[key].horas += (o.horas || 0) * factor
        o.materiales.forEach(m => {
          if (!m.compra) return   // reproceso: no inflar la compra
          if (!matAgg[m.cod]) matAgg[m.cod] = { cod: m.cod, mat: m.mat, un: m.un, cant: 0 }
          matAgg[m.cod].cant += (m.cant || 0) * factor
        })
      })
    })
  })

  res.innerHTML = buildResultHtml(enPlan.length, ordAgg, matAgg, {
    resumen: Object.keys(porTipo).sort().map(tp => `${porTipo[tp]}× Tip. ${tp}`).join('  ·  ')
  })
}

/* ─────────────── SUB-VISTA: COTIZAR ÓRDENES ─────────────── */
function renderCotizar() {
  const sub = document.getElementById('mat-sub')
  if (!sub) return

  const trailers = planTrailersDisponibles()

  const listas = trailers.map(t => {
    const groups = ordenesForTipo(t.tipologia)
    if (!groups) return ''
    const filas = groups.flatMap(g => g.ordenes
      .filter(o => incluirCompletadas || !ordenEstaCompletada(t.id, g.grupo, o.orden))
      .map(o => {
        const k = ordKey(t.id, g.grupo, o.orden)
        const on = !!cotizSel[k]
        const comp = ordenEstaCompletada(t.id, g.grupo, o.orden)
        return `
          <label class="cotiz-row ${on?'on':''}">
            <input type="checkbox" ${on?'checked':''} onchange="toggleCotiz('${k}')"/>
            <span class="ord-task-cod">${o.cod}</span>
            <span class="cotiz-name">${o.tarea}${comp?' <span class="cotiz-comp">completada</span>':''}</span>
            <span class="ord-chip ord-chip-sector">${o.sector||'—'}</span>
            <span class="cotiz-qty">×${g.qty}</span>
          </label>`
      })).join('')
    if (!filas) return ''
    return `
      <details class="cotiz-trailer">
        <summary><i class="ti ti-truck" aria-hidden="true"></i> ${t.nombre} · Tipología ${t.tipologia} <i class="ti ti-chevron-down plan-chev" aria-hidden="true"></i></summary>
        <div class="cotiz-list">${filas}</div>
      </details>`
  }).join('')

  sub.innerHTML = `
    <div class="cotiz-intro">Elegí órdenes de cualquier trailer para cotizar el material. Se suma la cantidad de cada orden × las veces que su grupo entra en ese trailer.</div>
    <div class="cotiz-toolbar">
      <button class="plan-mini" onclick="cotizSel={}; renderCotizar()">Limpiar selección</button>
    </div>
    <div class="cotiz-trailers">${listas || '<div class="empty-state"><p>No hay órdenes disponibles.</p></div>'}</div>
    <div id="cotiz-result"></div>`
  renderCotizResult()
}

function toggleCotiz(k) {
  if (cotizSel[k]) delete cotizSel[k]; else cotizSel[k] = true
  renderCotizar()
}

function renderCotizResult() {
  const res = document.getElementById('cotiz-result')
  if (!res) return
  const claves = Object.keys(cotizSel)
  if (!claves.length) {
    res.innerHTML = `<div class="empty-state"><i class="ti ti-checklist"></i>
      <p>Seleccioná órdenes para ver el material a cotizar.</p></div>`
    return
  }

  const ordAgg = {}, matAgg = {}
  claves.forEach(k => {
    const [trailerId, grupo, orden] = k.split(':').map(Number)
    const t = data.trailers.find(x => x.id === trailerId)
    if (!t) return
    const groups = ordenesForTipo(t.tipologia)
    if (!groups) return
    const g = groups.find(gr => gr.grupo === grupo)
    if (!g) return
    const o = g.ordenes.find(or => or.orden === orden)
    if (!o) return
    const factor = g.qty
    const key = o.cod + '·' + t.nombre
    ordAgg[key] = { cod: o.cod, tarea: `${o.tarea} (${t.nombre})`, sector: o.sector, horas: (o.horas||0)*factor, cant: factor }
    o.materiales.forEach(m => {
      if (!m.compra) return   // reproceso: no inflar la compra
      if (!matAgg[m.cod]) matAgg[m.cod] = { cod: m.cod, mat: m.mat, un: m.un, cant: 0 }
      matAgg[m.cod].cant += (m.cant || 0) * factor
    })
  })

  res.innerHTML = buildResultHtml(null, ordAgg, matAgg, {
    resumen: `${claves.length} órdenes seleccionadas`,
    matOpen: true
  })
}

/* ─────────────── Render compartido del resultado ─────────────── */
function buildResultHtml(nTrailers, ordAgg, matAgg, opts = {}) {
  const ordenList = Object.values(ordAgg).sort((a, b) => a.cod.localeCompare(b.cod))
  const matList = Object.values(matAgg).filter(m => m.cant > 0)
    .sort((a, b) => (a.mat || '').localeCompare(b.mat || ''))
  const totalOrdenes = ordenList.reduce((s, o) => s + o.cant, 0)
  const totalHoras = ordenList.reduce((s, o) => s + o.horas, 0)

  const cards = `
    <div class="ord-stats">
      ${nTrailers !== null ? `<div class="ord-stat"><span class="ord-stat-val">${nTrailers}</span><span class="ord-stat-lbl">trailers</span></div>` : ''}
      <div class="ord-stat"><span class="ord-stat-val">${Math.round(totalOrdenes)}</span><span class="ord-stat-lbl">órdenes</span></div>
      <div class="ord-stat"><span class="ord-stat-val">${Math.round(totalHoras)} h</span><span class="ord-stat-lbl">mano de obra</span></div>
      <div class="ord-stat"><span class="ord-stat-val">${matList.length}</span><span class="ord-stat-lbl">materiales</span></div>
    </div>
    ${opts.resumen ? `<div class="plan-resumen">${opts.resumen}</div>` : ''}`

  const ordenesHtml = `
    <div class="plan-section-title"><i class="ti ti-clipboard-list" aria-hidden="true"></i> Órdenes a ejecutar</div>
    <div class="ord-list">
      ${ordenList.map(o => `
        <div class="plan-orden-row">
          <span class="ord-task-cod">${o.cod}</span>
          <span class="plan-orden-name">${o.tarea}</span>
          <span class="plan-orden-meta">
            ${o.sector ? `<span class="ord-chip ord-chip-sector">${o.sector}</span>` : ''}
            <span class="ord-chip ord-chip-time"><i class="ti ti-clock" aria-hidden="true"></i> ${fmtHoras(o.horas)}</span>
          </span>
          <span class="plan-orden-cant">×${Math.round(o.cant)}</span>
        </div>`).join('')}
    </div>`

  const materialesHtml = `
    <details class="plan-details" ${opts.matOpen ? 'open' : ''}>
      <summary class="plan-section-title"><i class="ti ti-package" aria-hidden="true"></i> Materia prima a comprar (${matList.length}) <i class="ti ti-chevron-down plan-chev" aria-hidden="true"></i></summary>
      <table class="mat-table plan-mat-table"><tbody>
        ${matList.map(m => `<tr>
          <td class="mat-cod">#${m.cod}</td>
          <td class="mat-name">${m.mat || '<span style="color:var(--text-ter,#9ca3af)">(sin descripción)</span>'}</td>
          <td class="mat-cant">${fmtCant(m.cant)} <span class="mat-un">${m.un || ''}</span></td>
        </tr>`).join('')}
      </tbody></table>
    </details>`

  return cards + ordenesHtml + materialesHtml
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
      ? [name, item.tipologia ? `Tipología: ${item.tipologia}` : null,
         item.modelo ? `Modelo: ${item.modelo}` : null, `Chapa: ${item.chapa}`,
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