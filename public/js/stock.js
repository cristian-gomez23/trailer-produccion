/* ════════════════════════════════════════════════════════════
   STOCK — tabla COMPONENTE · STK MIN · STK MAX · STK ACTUAL ·
   CONSUMO MENSUAL · COSTO + proyección de 12 meses valorizada.

   · Muestra TODOS los artículos del último Excel "Stock_Valorizado"
     (Código · Artículo · Cantidad · Costo) más los componentes
     cargados a mano (ej. ESCALERA).
   · Al cargarle MIN / MAX / CONSUMO a un artículo queda "con
     seguimiento" (se guarda en stock_componentes).
   · Selector de mes: muestra el stock proyectado de ese mes,
     el valorizado total y el gasto estimado de reposición.
   ════════════════════════════════════════════════════════════ */

const STK_MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPT','OCT','NOV','DIC']
const STK_MESES_LARGO = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
let stock = { componentes: [], articulos: [], ultima: null, error: null }
let stockVista  = 'todos'         // 'todos' | 'seguimiento' | 'reponer'
let stockMesSel = 0               // 0 = mes actual · 1..11 = meses siguientes
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
   Mes 0 = STK ACTUAL. Cada mes siguiente:
   · si el mes anterior quedó ≤ STK MIN → se repone a STK MAX
     (se compran STK MAX − mes anterior)
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

/* Unidades a comprar en el mes i: si ese mes el stock queda ≤ STK MIN,
   se repone hasta STK MAX (STK MAX − stock del mes). 0 si no hace falta. */
function stockReposicion(c, i, p = stockProyeccion(c)) {
  if (!(+c.stk_max > 0)) return 0
  const v = p[i]
  return v <= +c.stk_min ? Math.max(0, +c.stk_max - v) : 0
}

function stockClase(v, min) { return v < 0 ? 'neg' : (v <= min ? 'low' : 'ok') }

/* Tiene parámetros cargados (si no, la proyección no tiene sentido) */
function stockConfigurado(r) { return +r.stk_min > 0 || +r.stk_max > 0 || +r.consumo_mensual > 0 }

/* Costo unitario:
   · artículos del Excel → SIEMPRE el último precio valorizado importado
   · componentes manuales (sin código) → costo cargado a mano          */
function stockArticulo(r) {
  return r.codigo ? stock.articulos.find(x => x.codigo === r.codigo) : null
}
function stockCosto(r) {
  const a = stockArticulo(r)
  if (a) return +a.costo || 0
  if (stockCostoManual(r)) return +r.costo_unitario
  if (r.stock_articulos && r.stock_articulos.costo != null) return +r.stock_articulos.costo
  return 0
}
function stockCostoManual(r) {
  return r.costo_unitario !== null && r.costo_unitario !== undefined && r.costo_unitario !== ''
}

/* Meses desde el actual, con año */
function stockMesesInfo() {
  const hoy = hoyCorrecto()
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1)
    return { corto: STK_MESES[d.getMonth()], largo: `${STK_MESES_LARGO[d.getMonth()]} ${d.getFullYear()}`, anio: d.getFullYear() }
  })
}

function fmtNum(v) {
  const n = Number(v)
  if (isNaN(n)) return '—'
  return Number.isInteger(n) ? String(n) : n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}
function fmtMoney(v) {
  const n = Number(v) || 0
  return '$ ' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
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
          stk_min: 0, stk_max: 0, stk_actual: a.cantidad, consumo_mensual: 0, costo_unitario: null, seguimiento: false }
  })

  // 3) componentes con código que ya no vienen en el Excel
  const huerfanos = stock.componentes
    .filter(c => c.codigo && !stock.articulos.find(a => a.codigo === c.codigo))
    .map(c => ({ ...c, key: 'c' + c.id, seguimiento: true, sinExcel: true }))

  return [...manuales, ...huerfanos, ...deExcel]
}

/* Calcula los datos del mes seleccionado para cada fila */
function stockConMes(rows, i = stockMesSel) {
  return rows.map(r => {
    const conf  = stockConfigurado(r)
    const p     = conf ? stockProyeccion(r) : Array(12).fill(+r.stk_actual)
    const costo = stockCosto(r)
    const repo  = conf ? stockReposicion(r, i, p) : 0
    return { r, p, conf, costo, cant: p[i], valor: p[i] * costo, repo, repoMonto: repo * costo }
  })
}

function stockFiltrados() {
  const q = document.getElementById('search-input').value.trim().toLowerCase()
  return stockConMes(stockFilas()).filter(x => {
    const r = x.r
    if (stockVista === 'seguimiento' && !r.seguimiento) return false
    if (stockVista === 'reponer' && !(x.repo > 0)) return false
    if (!q) return true
    return `${r.componente} ${r.codigo || ''} ${r.articulo || ''}`.toLowerCase().includes(q)
  })
}

function setStockMes(i) {
  stockMesSel = Number(i)
  renderStock()
}

/* ── RENDER ──────────────────────────── */
function renderStock() {
  const cont = document.getElementById('stock-body')
  if (!cont) return

  const meses = stockMesesInfo()
  const mes = meses[stockMesSel]
  const todas = stockConMes(stockFilas())

  renderStockSummary(todas, mes)

  const meta = document.getElementById('stock-meta')
  if (meta) {
    const neg = stock.articulos.filter(a => +a.cantidad < 0).length
    meta.innerHTML = stock.error
      ? `<span style="color:var(--red)"><i class="ti ti-plug-connected-x"></i> ${escStk(stock.error)}</span>`
      : stock.ultima
      ? `<i class="ti ti-file-spreadsheet"></i> Último stock: <b>${new Date(stock.ultima.created_at).toLocaleString('es-AR')}</b> · ${escStk(stock.ultima.archivo || '')} · ${stock.articulos.length} artículos${neg ? ` · <span style="color:var(--red)">${neg} con stock negativo</span>` : ''}`
      : `<i class="ti ti-alert-triangle"></i> Todavía no se importó ningún Excel de stock`
  }

  const nSeg  = todas.filter(x => x.r.seguimiento).length
  const nRepo = todas.filter(x => x.repo > 0).length
  const subtabs = `
    <div class="mat-subtabs stk-subtabs">
      <button class="mat-subtab ${stockVista==='todos'?'on':''}" onclick="stockVista='todos'; renderStock()"><i class="ti ti-list"></i> Todos (${todas.length})</button>
      <button class="mat-subtab ${stockVista==='seguimiento'?'on':''}" onclick="stockVista='seguimiento'; renderStock()"><i class="ti ti-eye"></i> Con seguimiento (${nSeg})</button>
      <button class="mat-subtab ${stockVista==='reponer'?'on':''}" onclick="stockVista='reponer'; renderStock()"><i class="ti ti-shopping-cart"></i> A reponer en ${mes.corto} (${nRepo})</button>
      <label class="stk-mes-sel">
        <i class="ti ti-calendar"></i> Mes
        <select onchange="setStockMes(this.value)">
          ${meses.map((m, i) => `<option value="${i}" ${i === stockMesSel ? 'selected' : ''}>${m.largo}${i === 0 ? ' (actual)' : ''}</option>`).join('')}
        </select>
      </label>
    </div>`

  const rows = stockFiltrados()
  if (!rows.length) {
    const msg = !stock.articulos.length && !stock.componentes.length
      ? 'Importá el Excel de stock o agregá un componente'
      : stockVista === 'seguimiento' ? 'Todavía no hay componentes con seguimiento. Cargale MIN / MAX / CONSUMO a un artículo en “Todos”.'
      : stockVista === 'reponer' ? `No hay reposiciones previstas en ${mes.largo}`
      : 'Sin resultados para la búsqueda'
    cont.innerHTML = subtabs + `<div class="empty-state"><i class="ti ti-packages"></i><p>${msg}</p></div>`
    return
  }

  const visibles = rows.slice(0, STK_MAX_FILAS)
  const head = ['COMPONENTE','STK MIN','STK MAX','STK ACTUAL','CONSUMO MENSUAL','COSTO UNIT.']
    .map(h => `<th>${h}</th>`).join('') +
    meses.map((m, i) => `<th class="stk-mes-th ${i === stockMesSel ? 'mes-sel' : ''}" onclick="setStockMes(${i})" title="${m.largo}">${m.corto}${i > 0 && m.anio !== meses[0].anio && meses[i-1].anio !== m.anio ? `<small>${m.anio}</small>` : ''}</th>`).join('') +
    `<th class="stk-money-th">VALORIZADO<br><small>${mes.corto}</small></th>
     <th class="stk-money-th">A REPONER<br><small>${mes.corto}</small></th>
     <th></th>`

  const body = visibles.map(x => {
    const r = x.r
    const vinc = !!r.codigo
    const mesesHtml = x.conf
      ? x.p.map((v, i) => {
          const rep = stockReposicion(r, i, x.p)
          return `<td class="${stockClase(v, +r.stk_min)} ${i === stockMesSel ? 'mes-sel' : ''} ${rep > 0 ? 'rep' : ''}"
            ${rep > 0 ? `title="Reposición: ${fmtNum(rep)} u · ${fmtMoney(rep * x.costo)}"` : ''}>${fmtNum(v)}</td>`
        }).join('')
      : `<td colspan="12" class="stk-sin-conf">Cargá MIN · MAX · CONSUMO para proyectar</td>`

    const costoCell = stockArticulo(r)
      ? `<td class="lock stk-money" title="Último precio valorizado (Excel)">${fmtMoney(x.costo)}</td>`
      : r.id
        ? `<td class="ed stk-money" data-f="costo_unitario" title="Costo manual">${stockCostoManual(r) ? fmtMoney(x.costo) : '<span style="color:var(--text-hint)">cargar</span>'}</td>`
        : `<td class="stk-money">${fmtMoney(x.costo)}</td>`

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
      ${costoCell}
      ${mesesHtml}
      <td class="stk-money stk-val">${fmtMoney(x.valor)}</td>
      <td class="stk-money stk-rep ${x.repoMonto > 0 ? 'on' : ''}">${x.repoMonto > 0 ? `${fmtMoney(x.repoMonto)}<small>${fmtNum(x.repo)} u</small>` : '—'}</td>
      <td class="stk-acc"><div class="row-actions">${acciones}</div></td>
    </tr>`
  }).join('')

  // Totales de TODAS las filas filtradas (no solo las visibles)
  const totVal  = rows.reduce((s, x) => s + x.valor, 0)
  const totRepo = rows.reduce((s, x) => s + x.repoMonto, 0)
  const foot = `<tr>
      <td class="stk-comp"><b>TOTAL ${escStk(mes.largo.toUpperCase())}</b> <span style="color:var(--text-hint);font-weight:400">· ${rows.length} filas</span></td>
      <td colspan="${5 + 12}"></td>
      <td class="stk-money"><b>${fmtMoney(totVal)}</b></td>
      <td class="stk-money"><b>${fmtMoney(totRepo)}</b></td>
      <td></td>
    </tr>`

  const mas = rows.length > visibles.length
    ? `<div class="stk-mas">Mostrando ${visibles.length} de ${rows.length} — usá el buscador para encontrar el resto (los totales incluyen todas)</div>` : ''

  cont.innerHTML = subtabs + `
    <div class="stock-scroll">
      <table class="stock-table">
        <thead><tr>${head}</tr></thead>
        <tbody id="stock-tbody">${body}</tbody>
        <tfoot>${foot}</tfoot>
      </table>
    </div>
    ${mas}
    <div class="stock-legend">
      <span><i class="sw" style="background:var(--stk-ok)"></i>Sobre el mínimo</span>
      <span><i class="sw" style="background:var(--stk-low)"></i>En o bajo el mínimo → se compra hasta el máximo (gasto en ese mes)</span>
      <span><i class="sw" style="background:var(--stk-neg)"></i>Negativo</span>
      <span><i class="sw stk-sw-rep"></i>Mes de compra</span>
      <span>Montos al último precio valorizado del Excel</span>
      <span style="color:var(--blue)"><i class="ti ti-link"></i> Dato del Excel</span>
      <span>Doble clic en MIN · MAX · CONSUMO para editar · clic en un mes para seleccionarlo</span>
    </div>`

  document.getElementById('stock-tbody').addEventListener('dblclick', stockInlineEdit)
}

function renderStockSummary(todas, mes) {
  const el = document.getElementById('stock-summary')
  if (!el) return
  const seg   = todas.filter(x => x.r.seguimiento && x.conf)
  const bajo  = seg.filter(x => x.cant <= +x.r.stk_min).length
  const valor = todas.reduce((s, x) => s + x.valor, 0)
  const repoX = todas.filter(x => x.repoMonto > 0)
  const repo  = repoX.reduce((s, x) => s + x.repoMonto, 0)
  // gasto acumulado desde el mes actual hasta el seleccionado (inclusive)
  let acum = 0
  for (let i = 0; i <= stockMesSel; i++) {
    acum += stockConMes(stockFilas().filter(r => stockConfigurado(r)), i).reduce((s, x) => s + x.repoMonto, 0)
  }
  const sinCosto = seg.filter(x => !x.costo).length

  el.innerHTML = `
    <div class="scard c-total"><div class="scard-label">Con seguimiento</div><div class="scard-val blue">${seg.length}</div>
      <div class="scard-sub">${sinCosto ? `<span style="color:var(--amber-text)">${sinCosto} sin costo</span>` : 'todos con costo'}</div></div>
    <div class="scard c-overdue"><div class="scard-label">En o bajo mínimo · ${mes.corto}</div><div class="scard-val red">${bajo}</div>
      <div class="scard-sub">${mes.largo}</div></div>
    <div class="scard c-prod"><div class="scard-label">Valorizado total · ${mes.corto}</div><div class="scard-val green stk-scard-money">${fmtMoney(valor)}</div>
      <div class="scard-sub">${stockMesSel === 0 ? 'stock actual según Excel' : 'stock proyectado a ' + mes.largo}</div></div>
    <div class="scard" style="border-top-color:var(--amber)"><div class="scard-label">Gasto a reponer · ${mes.corto}</div><div class="scard-val stk-scard-money" style="color:var(--amber)">${fmtMoney(repo)}</div>
      <div class="scard-sub">${repoX.length} componente(s)${stockMesSel > 0 ? ` · acumulado hasta ${mes.corto}: <b>${fmtMoney(acum)}</b>` : ''}</div></div>`
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

  const actual = f === 'costo_unitario' ? (stockCostoManual(r) ? r.costo_unitario : '') : r[f]
  td.innerHTML = `<input type="number" step="any" value="${actual}">`
  const inp = td.querySelector('input')
  inp.focus(); inp.select()

  let done = false
  const fin = async guardar => {
    if (done) return
    done = true
    const cambio = f === 'costo_unitario'
      ? inp.value !== String(actual)
      : inp.value !== '' && Number(inp.value) !== Number(r[f])
    if (guardar && cambio) {
      const val = f === 'costo_unitario' && inp.value === '' ? null : Number(inp.value)
      if (id) await patchStock(id, { [f]: val })
      else    await crearDesdeArticulo(r, { [f]: val })
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
  document.getElementById('s-costo').value      = c && stockCostoManual(c) ? c.costo_unitario : ''
  stockCodigoChange()
  showModal('stock')
  document.getElementById(a ? 's-min' : 's-componente').focus()
}

function closeStockModal() {
  document.getElementById('modal-stock').style.display = 'none'
}

function stockCodigoChange() {
  const cod   = document.getElementById('s-codigo').value.trim()
  const hint  = document.getElementById('s-codigo-hint')
  const act   = document.getElementById('s-actual')
  const costo = document.getElementById('s-costo')
  const a = stock.articulos.find(x => x.codigo === cod)

  if (a) {
    hint.innerHTML = `<b>${escStk(a.articulo)}</b> — stock en Excel: <b>${fmtNum(a.cantidad)}</b> · costo ${fmtMoney(a.costo)}`
    act.value = a.cantidad
    act.disabled = true
    costo.value = ''
    costo.disabled = true
    costo.placeholder = `Último precio del Excel: ${fmtMoney(a.costo)}`
    const comp = document.getElementById('s-componente')
    if (!comp.value) comp.value = a.articulo
  } else {
    hint.textContent = cod
      ? 'Ese código no está en el último Excel importado'
      : 'Opcional. Si lo vinculás, el STK ACTUAL y el costo se actualizan con cada importación.'
    act.disabled = false
    costo.disabled = false
    costo.placeholder = 'Costo por unidad'
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
    stk_actual:      document.getElementById('s-actual').value || 0,
    costo_unitario:  document.getElementById('s-costo').value === '' ? null : document.getElementById('s-costo').value
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
        <p style="margin-top:10px;color:var(--text-sec)">Stock y costos actualizados. Cargá STK MIN · MAX · CONSUMO (doble clic) para proyectar.</p>
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
  const meses = stockMesesInfo()
  const mes = meses[stockMesSel]
  const rows = filas.map(x => {
    const c = x.r
    const o = {
      'COMPONENTE': c.componente,
      'CÓDIGO': c.codigo || '',
      'STK MIN': +c.stk_min,
      'STK MAX': +c.stk_max,
      'STK ACTUAL': +c.stk_actual,
      'CONSUMO MENSUAL': +c.consumo_mensual,
      'COSTO UNIT.': x.costo
    }
    meses.forEach((m, i) => { o[`${m.corto} ${m.anio}`] = x.conf ? x.p[i] : '' })
    o[`VALORIZADO ${mes.corto}`] = Math.round(x.valor)
    o[`A REPONER ${mes.corto} (u)`] = x.repo || ''
    o[`A REPONER ${mes.corto} ($)`] = x.repoMonto ? Math.round(x.repoMonto) : ''
    return o
  })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Stock')
  XLSX.writeFile(wb, `Stock_${mes.corto}_${mes.anio}_${hoyCorrecto().toISOString().slice(0, 10)}.xlsx`)
}