/* ════════════════════════════════════════════════════════════
   STOCK — tabla COMPONENTE · STK MIN · STK MAX · STK ACTUAL ·
   CONSUMO MENSUAL + proyección de 12 meses.

   · Muestra TODOS los artículos del último Excel "Stock_Valorizado"
     (Código · Artículo · Cantidad · Costo) más los componentes
     cargados a mano (ej. ESCALERA).
   · Al cargarle MIN / MAX / CONSUMO a un artículo del Excel queda
     "con seguimiento" (se guarda en stock_componentes).
   · El STK ACTUAL de los artículos se actualiza en cada importación.
   ════════════════════════════════════════════════════════════ */

const STK_MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPT','OCT','NOV','DIC']
let stock = { componentes: [], articulos: [], ultima: null, error: null }
let stockVista = 'todos'          // 'todos' | 'seguimiento' | 'alerta'
const STK_MAX_FILAS = 300         // tope de filas renderizadas (con búsqueda se ve el resto)

/* ── FETCH con errores claros ────────── */
async function stockFetch(url, opt) {
  const res = await fetch(url, opt)
  const txt = await res.text()
  let j = null
  try { j = txt ? JSON.parse(txt) : null } catch (_) { /* no es JSON */ }

  if (res.status === 404 || (res.ok && j === null && /<html|<!doctype/i.test(txt))) {
    throw new Error('La ruta /api/stock no está montada en server.js (o falta reiniciar/redeployar)')
  }
  if (!res.ok) throw new Error((j && j.error) || `Error ${res.status}`)
  return j
}

/* ── LOAD ────────────────────────────── */
async function loadStock() {
  try {
    const [c, a, u] = await Promise.all([
      stockFetch('/api/stock/componentes'),
      stockFetch('/api/stock/articulos'),
      stockFetch('/api/stock/importaciones/ultima')
    ])
    stock.componentes = Array.isArray(c) ? c : []
    stock.articulos   = Array.isArray(a) ? a : []
    stock.ultima      = u && u.created_at ? u : null
    stock.error       = null
    fillStockDatalist()
    renderStock()
  } catch (e) {
    stock.error = e.message
    renderStock()
    toast('Stock: ' + e.message, 'error')
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

/* Tiene parámetros cargados (si no, la proyección no tiene sentido) */
function stockConfigurado(r) { return +r.stk_min > 0 || +r.stk_max > 0 || +r.consumo_mensual > 0 }

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

/* ── FILAS: componentes + artículos del Excel sin seguimiento ── */
function stockFilas() {
  const porCodigo = new Map(stock.componentes.filter(c => c.codigo).map(c => [c.codigo, c]))

  // 1) componentes manuales (sin código) arriba
  const manuales = stock.componentes
    .filter(c => !c.codigo)
    .map(c => ({ ...c, key: 'c' + c.id, seguimiento: true }))

  // 2) artículos del Excel (con o sin seguimiento), ordenados por código
  const deExcel = stock.articulos.map(a => {
    const c = porCodigo.get(a.codigo)
    return c
      ? { ...c, articulo: a.articulo, key: 'c' + c.id, seguimiento: true }
      : { id: null, key: 'a' + a.codigo, codigo: a.codigo, componente: a.articulo, articulo: a.articulo,
          stk_min: 0, stk_max: 0, stk_actual: a.cantidad, consumo_mensual: 0, seguimiento: false }
  })

  // 3) componentes con código que ya no vienen en el Excel
  const huerfanos = stock.componentes
    .filter(c => c.codigo && !stock.articulos.find(a => a.codigo === c.codigo))
    .map(c => ({ ...c, key: 'c' + c.id, seguimiento: true, sinExcel: true }))

  return [...manuales, ...huerfanos, ...deExcel]
}

function stockFiltrados() {
  const q = document.getElementById('search-input').value.trim().toLowerCase()
  return stockFilas().filter(r => {
    if (stockVista === 'seguimiento' && !r.seguimiento) return false
    if (stockVista === 'alerta' && !(r.seguimiento && stockConfigurado(r) &&
        stockProyeccion(r, 4).some(v => v <= +r.stk_min))) return false
    if (!q) return true
    return `${r.componente} ${r.codigo || ''} ${r.articulo || ''}`.toLowerCase().includes(q)
  })
}

/* ── RENDER ──────────────────────────── */
function renderStock() {
  const cont = document.getElementById('stock-body')
  if (!cont) return

  renderStockSummary()

  const meta = document.getElementById('stock-meta')
  if (meta) {
    meta.innerHTML = stock.error
      ? `<span style="color:var(--red)"><i class="ti ti-plug-connected-x"></i> ${escStk(stock.error)}</span>`
      : stock.ultima
      ? `<i class="ti ti-file-spreadsheet"></i> Último stock: <b>${new Date(stock.ultima.created_at).toLocaleString('es-AR')}</b> · ${escStk(stock.ultima.archivo || '')} · ${stock.articulos.length} artículos`
      : `<i class="ti ti-alert-triangle"></i> Todavía no se importó ningún Excel de stock`
  }

  const nSeg = stockFilas().filter(r => r.seguimiento).length
  const subtabs = `
    <div class="mat-subtabs" style="padding:12px 14px 0">
      <button class="mat-subtab ${stockVista==='todos'?'on':''}" onclick="stockVista='todos'; renderStock()"><i class="ti ti-list"></i> Todos (${stock.articulos.length + stock.componentes.filter(c => !c.codigo).length})</button>
      <button class="mat-subtab ${stockVista==='seguimiento'?'on':''}" onclick="stockVista='seguimiento'; renderStock()"><i class="ti ti-eye"></i> Con seguimiento (${nSeg})</button>
      <button class="mat-subtab ${stockVista==='alerta'?'on':''}" onclick="stockVista='alerta'; renderStock()"><i class="ti ti-alert-triangle"></i> A reponer</button>
    </div>`

  const rows = stockFiltrados()
  if (!rows.length) {
    const msg = !stock.articulos.length && !stock.componentes.length
      ? 'Importá el Excel de stock o agregá un componente'
      : stockVista === 'seguimiento' ? 'Todavía no hay componentes con seguimiento. Cargale MIN / MAX / CONSUMO a un artículo en “Todos”.'
      : stockVista === 'alerta' ? 'Ningún componente llega al mínimo en los próximos 3 meses'
      : 'Sin resultados para la búsqueda'
    cont.innerHTML = subtabs + `<div class="empty-state"><i class="ti ti-packages"></i><p>${msg}</p></div>`
    return
  }

  const visibles = rows.slice(0, STK_MAX_FILAS)
  const meses = stockMeses()
  const head = ['COMPONENTE','STK MIN','STK MAX','STK ACTUAL','CONSUMO MENSUAL']
    .map(h => `<th>${h}</th>`).join('') +
    meses.map((m, i) => `<th class="${i === 0 ? 'mes-actual' : ''}">${m}</th>`).join('') +
    '<th></th>'

  const body = visibles.map(r => {
    const conf = stockConfigurado(r)
    const p = stockProyeccion(r)
    const vinc = !!r.codigo
    const meses = conf
      ? p.map(v => `<td class="${stockClase(v, +r.stk_min)}">${fmtNum(v)}</td>`).join('')
      : `<td colspan="12" class="stk-sin-conf">Cargá MIN · MAX · CONSUMO para proyectar</td>`

    const acciones = r.id
      ? `<button class="action-btn edit" onclick="openStockModal(${r.id})" title="Editar"><i class="ti ti-pencil"></i></button>
         <button class="action-btn del"  onclick="deleteStock(${r.id})" title="Quitar seguimiento"><i class="ti ti-trash"></i></button>`
      : `<button class="action-btn edit" onclick="openStockModal(null, '${escStk(r.codigo)}')" title="Configurar"><i class="ti ti-adjustments"></i></button>`

    return `<tr data-id="${r.id ?? ''}" data-cod="${escStk(r.codigo || '')}" class="${r.seguimiento ? 'stk-seg' : ''}">
      <td class="stk-comp">
        <div class="stk-comp-name">${escStk(r.componente)}</div>
        ${vinc ? `<div class="stk-comp-cod"><span class="chapa">${escStk(r.codigo)}</span>${r.articulo && r.articulo !== r.componente ? escStk(r.articulo) : ''}${r.sinExcel ? ' <span style="color:var(--red)">· no está en el último Excel</span>' : ''}</div>` : ''}
      </td>
      <td class="ed" data-f="stk_min">${fmtNum(r.stk_min)}</td>
      <td class="ed" data-f="stk_max">${fmtNum(r.stk_max)}</td>
      ${vinc
        ? `<td class="lock" title="Se actualiza al importar el Excel">${fmtNum(r.stk_actual)}<i class="ti ti-link"></i></td>`
        : `<td class="ed" data-f="stk_actual">${fmtNum(r.stk_actual)}</td>`}
      <td class="ed" data-f="consumo_mensual">${fmtNum(r.consumo_mensual)}</td>
      ${meses}
      <td class="stk-acc"><div class="row-actions">${acciones}</div></td>
    </tr>`
  }).join('')

  const mas = rows.length > visibles.length
    ? `<div class="stk-mas">Mostrando ${visibles.length} de ${rows.length} — usá el buscador para encontrar el resto</div>` : ''

  cont.innerHTML = subtabs + `
    <div class="stock-scroll">
      <table class="stock-table">
        <thead><tr>${head}</tr></thead>
        <tbody id="stock-tbody">${body}</tbody>
      </table>
    </div>
    ${mas}
    <div class="stock-legend">
      <span><i class="sw" style="background:var(--stk-ok)"></i>Sobre el mínimo</span>
      <span><i class="sw" style="background:var(--stk-low)"></i>En o bajo el mínimo → se repone al máximo el mes siguiente</span>
      <span><i class="sw" style="background:var(--stk-neg)"></i>Negativo</span>
      <span style="color:var(--blue)"><i class="ti ti-link"></i> STK ACTUAL desde el Excel</span>
      <span>Doble clic en MIN · MAX · CONSUMO para editar</span>
    </div>`

  document.getElementById('stock-tbody').addEventListener('dblclick', stockInlineEdit)
}

function renderStockSummary() {
  const el = document.getElementById('stock-summary')
  if (!el) return
  const seg = stockFilas().filter(r => r.seguimiento && stockConfigurado(r))
  const bajo = seg.filter(c => +c.stk_actual <= +c.stk_min).length
  const prox = seg.filter(c => +c.stk_actual > +c.stk_min &&
    stockProyeccion(c, 4).slice(1).some(v => v <= +c.stk_min)).length
  const neg = stock.articulos.filter(a => +a.cantidad < 0).length

  el.innerHTML = `
    <div class="scard c-total"><div class="scard-label">Con seguimiento</div><div class="scard-val blue">${seg.length}</div></div>
    <div class="scard c-overdue"><div class="scard-label">En o bajo mínimo</div><div class="scard-val red">${bajo}</div></div>
    <div class="scard c-prod" style="border-top-color:var(--amber)"><div class="scard-label">Llegan al mínimo en 3 meses</div><div class="scard-val" style="color:var(--amber)">${prox}</div></div>
    <div class="scard c-done"><div class="scard-label">Artículos con stock negativo</div><div class="scard-val teal">${neg}</div></div>`
}

/* ── EDICIÓN INLINE ──────────────────── */
function stockInlineEdit(e) {
  const td = e.target.closest('td.ed')
  if (!td || td.querySelector('input')) return
  const tr  = td.parentElement
  const id  = tr.dataset.id ? Number(tr.dataset.id) : null
  const cod = tr.dataset.cod || null
  const f   = td.dataset.f
  const r   = stockFilas().find(x => id ? x.id === id : x.codigo === cod)
  if (!r) return

  td.innerHTML = `<input type="number" step="any" value="${r[f]}">`
  const inp = td.querySelector('input')
  inp.focus(); inp.select()

  let done = false
  const fin = async guardar => {
    if (done) return
    done = true
    if (guardar && inp.value !== '' && Number(inp.value) !== Number(r[f])) {
      if (id) await patchStock(id, { [f]: Number(inp.value) })
      else    await crearDesdeArticulo(r, { [f]: Number(inp.value) })
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

/* Primer valor cargado en un artículo del Excel → pasa a tener seguimiento */
async function crearDesdeArticulo(r, cambios) {
  try {
    const nuevo = await stockFetch('/api/stock/componentes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        componente: r.articulo, codigo: r.codigo,
        stk_min: r.stk_min, stk_max: r.stk_max, consumo_mensual: r.consumo_mensual,
        ...cambios
      })
    })
    stock.componentes.push(nuevo)
    renderStock()
    toast('Seguimiento activado', 'success')
  } catch (e) {
    toast('Error: ' + e.message, 'error')
    renderStock()
  }
}

async function patchStock(id, body) {
  try {
    const j = await stockFetch('/api/stock/componentes/' + id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
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
  const msg = c && c.codigo
    ? `¿Quitar el seguimiento de ${c.componente}? (el artículo sigue en la lista con su stock del Excel)`
    : `¿Eliminar ${c ? c.componente : 'este componente'}?`
  if (!c || !confirm(msg)) return
  try {
    await stockFetch('/api/stock/componentes/' + id, { method: 'DELETE' })
    stock.componentes = stock.componentes.filter(x => x.id !== id)
    renderStock()
    toast('Listo', 'success')
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

/* openStockModal()            → nuevo componente manual
   openStockModal(id)          → editar componente con seguimiento
   openStockModal(null, cod)   → configurar artículo del Excel           */
function openStockModal(id, codigo) {
  const c = id ? stock.componentes.find(x => x.id === id) : null
  const a = !c && codigo ? stock.articulos.find(x => x.codigo === codigo) : null

  document.getElementById('form-title-stock').textContent =
    c ? 'Editar Componente' : a ? 'Configurar Artículo' : 'Nuevo Componente'
  document.getElementById('s-edit-id').value    = c ? c.id : ''
  document.getElementById('s-componente').value = c ? c.componente : a ? a.articulo : ''
  document.getElementById('s-codigo').value     = c ? (c.codigo || '') : a ? a.codigo : ''
  document.getElementById('s-min').value        = c ? c.stk_min : ''
  document.getElementById('s-max').value        = c ? c.stk_max : ''
  document.getElementById('s-consumo').value    = c ? c.consumo_mensual : ''
  document.getElementById('s-actual').value     = c ? c.stk_actual : ''
  stockCodigoChange()
  showModal('stock')
  document.getElementById(a ? 's-min' : 's-componente').focus()
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
  // si el código ya tiene seguimiento, se edita ese en vez de duplicar
  const existente = !id && body.codigo ? stock.componentes.find(c => c.codigo === body.codigo) : null
  const editId = id || (existente ? existente.id : '')

  try {
    const j = await stockFetch(editId ? `/api/stock/componentes/${editId}` : '/api/stock/componentes', {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (editId) stock.componentes = stock.componentes.map(c => c.id === Number(editId) ? j : c)
    else        stock.componentes.push(j)
    stock.componentes.sort((a, b) => a.componente.localeCompare(b.componente))
    closeStockModal()
    renderStock()
    toast(editId ? 'Actualizado' : 'Guardado', 'success')
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
    const r = await stockFetch('/api/stock/importar', { method: 'POST', body: fd })

    document.getElementById('stock-import-body').innerHTML = `
      <div class="stk-res">
        <p><b>${r.articulos}</b> artículos leídos de <b>${escStk(f.name)}</b>${r.negativos ? ` · ${r.negativos} con cantidad negativa` : ''}.</p>
        <p><b>${r.actualizados.length}</b> componente(s) con seguimiento actualizados.</p>
        ${r.actualizados.length ? `<div class="stk-res-scroll"><table class="stk-res-table">
          <thead><tr><th>Componente</th><th>Antes</th><th>Ahora</th><th>Dif.</th></tr></thead>
          <tbody>${r.actualizados.map(a => {
            const d = a.ahora - a.antes
            return `<tr><td>${escStk(a.componente)}</td><td>${fmtNum(a.antes)}</td><td><b>${fmtNum(a.ahora)}</b></td>
              <td style="color:${d < 0 ? 'var(--red)' : d > 0 ? 'var(--green)' : 'var(--text-hint)'}">${d > 0 ? '+' : ''}${fmtNum(d)}</td></tr>`
          }).join('')}</tbody></table></div>` : ''}
        ${r.sinCoincidencia.length ? `<div class="stk-res-warn"><i class="ti ti-alert-triangle"></i> Sin código en este Excel (quedan con el stock anterior): ${r.sinCoincidencia.map(escStk).join(', ')}</div>` : ''}
        <p style="margin-top:10px;color:var(--text-sec)">Todos los artículos ya figuran en la tabla. Cargales STK MIN · MAX · CONSUMO (doble clic) para proyectarlos.</p>
      </div>`
    showModal('stock-import')
    stockVista = 'todos'
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
  const filas = stockFiltrados()
  if (!filas.length) { toast('No hay filas para exportar', 'error'); return }
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
  const rows = filas.map(c => {
    const conf = stockConfigurado(c)
    const p = stockProyeccion(c)
    const o = {
      'COMPONENTE': c.componente,
      'CÓDIGO': c.codigo || '',
      'STK MIN': +c.stk_min,
      'STK MAX': +c.stk_max,
      'STK ACTUAL': +c.stk_actual,
      'CONSUMO MENSUAL': +c.consumo_mensual
    }
    meses.forEach((m, i) => { o[m] = conf ? p[i] : '' })
    return o
  })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Stock')
  XLSX.writeFile(wb, `Stock_componentes_${hoyCorrecto().toISOString().slice(0, 10)}.xlsx`)
}