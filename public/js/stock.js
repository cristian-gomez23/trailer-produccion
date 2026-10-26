/* ════════════════════════════════════════════════════════════
   STOCK — componentes con STK MIN / MAX / ACTUAL / CONSUMO
   y proyección de 12 meses. El STK ACTUAL de los componentes
   vinculados a un código se actualiza importando el Excel
   "Stock_Valorizado" (Código · Artículo · Cantidad · Costo).
   ════════════════════════════════════════════════════════════ */

const STK_MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPT','OCT','NOV','DIC']
let stock = { componentes: [], articulos: [], ultima: null }

/* ── LOAD ────────────────────────────── */
async function loadStock() {
  try {
    const [rc, ra, ru] = await Promise.all([
      fetch('/api/stock/componentes'),
      fetch('/api/stock/articulos'),
      fetch('/api/stock/importaciones/ultima')
    ])
    const c = await rc.json(), a = await ra.json(), u = await ru.json()
    stock.componentes = Array.isArray(c) ? c : []
    stock.articulos   = Array.isArray(a) ? a : []
    stock.ultima      = u && u.created_at ? u : null
    fillStockDatalist()
    renderStock()
  } catch (e) {
    toast('No se pudo cargar el stock', 'error')
  }
}

/* ── PROYECCIÓN (misma lógica que la planilla) ──
   Mes 1 = STK ACTUAL. Cada mes siguiente:
   · si el mes anterior quedó ≤ STK MIN → se repone a STK MAX
   · si no → mes anterior − CONSUMO MENSUAL                         */
function stockProyeccion(c, n = 12) {
  const min = +c.stk_min, max = +c.stk_max, cons = +c.consumo_mensual
  const out = [+c.stk_actual]
  for (let i = 1; i < n; i++) {
    const prev = out[i - 1]
    out.push(prev <= min && max > 0 ? max : prev - cons)
  }
  return out
}

function stockClase(v, min) { return v < 0 ? 'neg' : (v <= min ? 'low' : 'ok') }

function stockMeses() {
  const m0 = hoyCorrecto().getMonth()
  return Array.from({ length: 12 }, (_, i) => STK_MESES[(m0 + i) % 12])
}

function fmtNum(v) {
  const n = Number(v)
  if (isNaN(n)) return '—'
  return Number.isInteger(n) ? String(n) : n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

function escStk(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[m])
}

/* ── RENDER ──────────────────────────── */
function stockFiltrados() {
  const q = document.getElementById('search-input').value.trim().toLowerCase()
  return stock.componentes.filter(c => !q ||
    `${c.componente} ${c.codigo || ''} ${c.stock_articulos?.articulo || ''}`.toLowerCase().includes(q))
}

function renderStock() {
  const cont = document.getElementById('stock-body')
  if (!cont) return

  renderStockSummary()

  const meta = document.getElementById('stock-meta')
  if (meta) {
    meta.innerHTML = stock.ultima
      ? `<i class="ti ti-file-spreadsheet"></i> Último stock: <b>${new Date(stock.ultima.created_at).toLocaleString('es-AR')}</b> · ${escStk(stock.ultima.archivo || '')} · ${stock.articulos.length} artículos`
      : `<i class="ti ti-alert-triangle"></i> Todavía no se importó ningún Excel de stock`
  }

  const rows = stockFiltrados()
  if (!rows.length) {
    cont.innerHTML = `<div class="empty-state"><i class="ti ti-packages"></i>
      <p>${stock.componentes.length ? 'Sin resultados para la búsqueda' : 'No hay componentes con seguimiento de stock'}</p>
      ${stock.componentes.length ? '' : `<button class="btn-nuevo" onclick="openStockModal()"><i class="ti ti-plus"></i> Agregar el primero</button>`}
    </div>`
    return
  }

  const meses = stockMeses()
  const head = ['COMPONENTE','STK MIN','STK MAX','STK ACTUAL','CONSUMO MENSUAL']
    .map(h => `<th>${h}</th>`).join('') +
    meses.map((m, i) => `<th class="${i === 0 ? 'mes-actual' : ''}">${m}</th>`).join('') +
    '<th></th>'

  const body = rows.map(c => {
    const p = stockProyeccion(c)
    const vinc = !!c.codigo
    return `<tr data-id="${c.id}">
      <td class="stk-comp">
        <div class="stk-comp-name">${escStk(c.componente)}</div>
        ${vinc ? `<div class="stk-comp-cod"><span class="chapa">${escStk(c.codigo)}</span>${escStk(c.stock_articulos?.articulo || '')}</div>` : ''}
      </td>
      <td class="ed" data-f="stk_min">${fmtNum(c.stk_min)}</td>
      <td class="ed" data-f="stk_max">${fmtNum(c.stk_max)}</td>
      ${vinc
        ? `<td class="lock" title="Se actualiza al importar el Excel">${fmtNum(c.stk_actual)}<i class="ti ti-link"></i></td>`
        : `<td class="ed" data-f="stk_actual">${fmtNum(c.stk_actual)}</td>`}
      <td class="ed" data-f="consumo_mensual">${fmtNum(c.consumo_mensual)}</td>
      ${p.map(v => `<td class="${stockClase(v, +c.stk_min)}">${fmtNum(v)}</td>`).join('')}
      <td class="stk-acc"><div class="row-actions">
        <button class="action-btn edit" onclick="openStockModal(${c.id})" title="Editar"><i class="ti ti-pencil"></i></button>
        <button class="action-btn del"  onclick="deleteStock(${c.id})" title="Eliminar"><i class="ti ti-trash"></i></button>
      </div></td>
    </tr>`
  }).join('')

  cont.innerHTML = `
    <div class="stock-scroll">
      <table class="stock-table">
        <thead><tr>${head}</tr></thead>
        <tbody id="stock-tbody">${body}</tbody>
      </table>
    </div>
    <div class="stock-legend">
      <span><i class="sw" style="background:var(--stk-ok)"></i>Sobre el mínimo</span>
      <span><i class="sw" style="background:var(--stk-low)"></i>En o bajo el mínimo → se repone al máximo el mes siguiente</span>
      <span><i class="sw" style="background:var(--stk-neg)"></i>Negativo</span>
      <span style="color:var(--blue)"><i class="ti ti-link"></i> STK ACTUAL desde el Excel</span>
      <span>Doble clic en MIN · MAX · ACTUAL · CONSUMO para editar</span>
    </div>`

  document.getElementById('stock-tbody').addEventListener('dblclick', stockInlineEdit)
}

function renderStockSummary() {
  const el = document.getElementById('stock-summary')
  if (!el) return
  const comps = stock.componentes
  const bajo = comps.filter(c => +c.stk_actual <= +c.stk_min).length
  const prox = comps.filter(c => {
    const p = stockProyeccion(c, 4)
    return +c.stk_actual > +c.stk_min && p.slice(1).some(v => v <= +c.stk_min)
  }).length
  const neg = stock.articulos.filter(a => +a.cantidad < 0).length

  el.innerHTML = `
    <div class="scard c-total"><div class="scard-label">Componentes</div><div class="scard-val blue">${comps.length}</div></div>
    <div class="scard c-overdue"><div class="scard-label">En o bajo mínimo</div><div class="scard-val red">${bajo}</div></div>
    <div class="scard c-prod" style="border-top-color:var(--amber)"><div class="scard-label">Llegan al mínimo en 3 meses</div><div class="scard-val" style="color:var(--amber)">${prox}</div></div>
    <div class="scard c-done"><div class="scard-label">Artículos con stock negativo</div><div class="scard-val teal">${neg}</div></div>`
}

/* ── EDICIÓN INLINE ──────────────────── */
function stockInlineEdit(e) {
  const td = e.target.closest('td.ed')
  if (!td || td.querySelector('input')) return
  const id = Number(td.parentElement.dataset.id)
  const f  = td.dataset.f
  const c  = stock.componentes.find(x => x.id === id)
  if (!c) return

  td.innerHTML = `<input type="number" step="any" value="${c[f]}">`
  const inp = td.querySelector('input')
  inp.focus(); inp.select()

  let done = false
  const fin = async guardar => {
    if (done) return
    done = true
    if (guardar && inp.value !== '' && Number(inp.value) !== Number(c[f])) {
      await patchStock(id, { [f]: Number(inp.value) })
    } else {
      renderStock()
    }
  }
  inp.addEventListener('keydown', ev => {
    if (ev.key === 'Enter')  fin(true)
    if (ev.key === 'Escape') fin(false)
  })
  inp.addEventListener('blur', () => fin(true))
}

async function patchStock(id, body) {
  try {
    const res = await fetch('/api/stock/componentes/' + id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const j = await res.json()
    if (!res.ok) throw new Error(j.error)
    stock.componentes = stock.componentes.map(c => c.id === id ? j : c)
    renderStock()
    toast('Actualizado', 'success')
  } catch (e) {
    toast('Error: ' + e.message, 'error')
    renderStock()
  }
}

async function deleteStock(id) {
  const c = stock.componentes.find(x => x.id === id)
  if (!c || !confirm(`¿Eliminar ${c.componente} del seguimiento de stock?`)) return
  try {
    const res = await fetch('/api/stock/componentes/' + id, { method: 'DELETE' })
    if (!res.ok) { const j = await res.json(); throw new Error(j.error) }
    stock.componentes = stock.componentes.filter(x => x.id !== id)
    renderStock()
    toast('Eliminado', 'success')
  } catch (e) { toast('Error: ' + e.message, 'error') }
}

/* ── MODAL ALTA / EDICIÓN ────────────── */
function fillStockDatalist() {
  const dl = document.getElementById('stk-articulos')
  if (!dl) return
  dl.innerHTML = stock.articulos
    .map(a => `<option value="${escStk(a.codigo)}">${escStk(a.articulo)} — stock ${fmtNum(a.cantidad)}</option>`)
    .join('')
}

function openStockModal(id) {
  const c = id ? stock.componentes.find(x => x.id === id) : null
  document.getElementById('form-title-stock').textContent = c ? 'Editar Componente' : 'Nuevo Componente'
  document.getElementById('s-edit-id').value    = c ? c.id : ''
  document.getElementById('s-componente').value = c ? c.componente : ''
  document.getElementById('s-codigo').value     = c ? (c.codigo || '') : ''
  document.getElementById('s-min').value        = c ? c.stk_min : ''
  document.getElementById('s-max').value        = c ? c.stk_max : ''
  document.getElementById('s-consumo').value    = c ? c.consumo_mensual : ''
  document.getElementById('s-actual').value     = c ? c.stk_actual : ''
  stockCodigoChange()
  showModal('stock')
  document.getElementById('s-componente').focus()
}

function closeStockModal() {
  document.getElementById('modal-stock').style.display = 'none'
}

function stockCodigoChange() {
  const cod  = document.getElementById('s-codigo').value.trim()
  const hint = document.getElementById('s-codigo-hint')
  const act  = document.getElementById('s-actual')
  const a = stock.articulos.find(x => x.codigo === cod)

  if (a) {
    hint.innerHTML = `<b>${escStk(a.articulo)}</b> — stock en Excel: <b>${fmtNum(a.cantidad)}</b>`
    act.value = a.cantidad
    act.disabled = true
    const comp = document.getElementById('s-componente')
    if (!comp.value) comp.value = a.articulo
  } else {
    hint.textContent = cod
      ? 'Ese código no está en el último Excel importado'
      : 'Opcional. Si lo vinculás, el STK ACTUAL se actualiza con cada importación.'
    act.disabled = false
  }
}

async function saveStock() {
  const id = document.getElementById('s-edit-id').value
  const body = {
    componente:      document.getElementById('s-componente').value.trim(),
    codigo:          document.getElementById('s-codigo').value.trim(),
    stk_min:         document.getElementById('s-min').value || 0,
    stk_max:         document.getElementById('s-max').value || 0,
    consumo_mensual: document.getElementById('s-consumo').value || 0,
    stk_actual:      document.getElementById('s-actual').value || 0
  }
  if (!body.componente) { toast('Completá el nombre del componente', 'error'); return }
  if (Number(body.stk_max) && Number(body.stk_max) < Number(body.stk_min)) {
    toast('El STK MAX no puede ser menor al STK MIN', 'error'); return
  }

  try {
    const res = await fetch(id ? `/api/stock/componentes/${id}` : '/api/stock/componentes', {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const j = await res.json()
    if (!res.ok) throw new Error(j.error)
    if (id) stock.componentes = stock.componentes.map(c => c.id === Number(id) ? j : c)
    else    stock.componentes.push(j)
    stock.componentes.sort((a, b) => a.componente.localeCompare(b.componente))
    closeStockModal()
    renderStock()
    toast(id ? 'Actualizado' : 'Guardado', 'success')
  } catch (e) { toast('Error: ' + e.message, 'error') }
}

/* ── IMPORTAR EXCEL ──────────────────── */
function pickStockExcel() { document.getElementById('stock-file').click() }

async function importStockExcel(input) {
  const f = input.files[0]
  if (!f) return
  const btn = document.getElementById('btn-stock-import')
  const fd = new FormData()
  fd.append('archivo', f)
  btn.disabled = true
  btn.innerHTML = '<i class="ti ti-loader-2"></i> Importando…'

  try {
    const res = await fetch('/api/stock/importar', { method: 'POST', body: fd })
    const r = await res.json()
    if (!res.ok) throw new Error(r.error)

    document.getElementById('stock-import-body').innerHTML = `
      <div class="stk-res">
        <p><b>${r.articulos}</b> artículos leídos de <b>${escStk(f.name)}</b>${r.negativos ? ` · ${r.negativos} con cantidad negativa` : ''}.</p>
        <p><b>${r.actualizados.length}</b> componente(s) con stock actualizado.</p>
        ${r.actualizados.length ? `<div class="stk-res-scroll"><table class="stk-res-table">
          <thead><tr><th>Componente</th><th>Antes</th><th>Ahora</th><th>Dif.</th></tr></thead>
          <tbody>${r.actualizados.map(a => {
            const d = a.ahora - a.antes
            return `<tr><td>${escStk(a.componente)}</td><td>${fmtNum(a.antes)}</td><td><b>${fmtNum(a.ahora)}</b></td>
              <td style="color:${d < 0 ? 'var(--red)' : d > 0 ? 'var(--green)' : 'var(--text-hint)'}">${d > 0 ? '+' : ''}${fmtNum(d)}</td></tr>`
          }).join('')}</tbody></table></div>` : ''}
        ${r.sinCoincidencia.length ? `<div class="stk-res-warn"><i class="ti ti-alert-triangle"></i> Sin código en este Excel (quedan con el stock anterior): ${r.sinCoincidencia.map(escStk).join(', ')}</div>` : ''}
      </div>`
    showModal('stock-import')
    await loadStock()
  } catch (e) {
    toast('Error al importar: ' + e.message, 'error')
  }

  btn.disabled = false
  btn.innerHTML = '<i class="ti ti-file-upload"></i> Importar stock Excel'
  input.value = ''
}

/* ── EXPORTAR ────────────────────────── */
async function exportStockExcel() {
  if (!stock.componentes.length) { toast('No hay componentes para exportar', 'error'); return }
  if (typeof XLSX === 'undefined') {
    await new Promise((ok, err) => {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
      s.onload = ok; s.onerror = err
      document.head.appendChild(s)
    }).catch(() => toast('No se pudo cargar la librería de Excel', 'error'))
    if (typeof XLSX === 'undefined') return
  }
  const meses = stockMeses()
  const rows = stockFiltrados().map(c => {
    const p = stockProyeccion(c)
    const o = {
      'COMPONENTE': c.componente,
      'CÓDIGO': c.codigo || '',
      'STK MIN': +c.stk_min,
      'STK MAX': +c.stk_max,
      'STK ACTUAL': +c.stk_actual,
      'CONSUMO MENSUAL': +c.consumo_mensual
    }
    meses.forEach((m, i) => { o[m] = p[i] })
    return o
  })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Stock')
  XLSX.writeFile(wb, `Stock_componentes_${hoyCorrecto().toISOString().slice(0, 10)}.xlsx`)
}
