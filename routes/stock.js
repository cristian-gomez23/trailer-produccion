// routes/stock.js — Stock de componentes + importación del Excel "Stock_Valorizado"
const express = require('express')
const router = express.Router()
const multer = require('multer')
const XLSX = require('xlsx')
const supabase = require('../config/supabase')

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /\.(xlsx|xls|csv)$/i.test(file.originalname))
})

// ---------- helpers ----------
const norm = s => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '')

const num = v => {
  if (v == null || v === '') return 0
  if (typeof v === 'number') return v
  // admite "1.234,56" y "1234.56"
  let s = String(v).trim()
  if (/,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return isNaN(n) ? 0 : n
}

// Busca la fila de encabezados y mapea columnas (Código / Artículo / Cantidad / Costo)
function parseStockExcel(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true })

  let hIdx = -1, col = {}
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const h = rows[i].map(norm)
    const c = h.findIndex(x => x === 'codigo' || x === 'cod')
    const a = h.findIndex(x => x === 'articulo' || x === 'descripcion')
    const q = h.findIndex(x => x === 'cantidad' || x === 'stock')
    if (c >= 0 && q >= 0) {
      hIdx = i
      col = { codigo: c, articulo: a, cantidad: q, costo: h.findIndex(x => x === 'costo') }
      break
    }
  }
  if (hIdx < 0) throw new Error('No se encontraron las columnas "Código" y "Cantidad" en el Excel')

  const map = new Map()
  for (const r of rows.slice(hIdx + 1)) {
    const codigo = r[col.codigo] != null ? String(r[col.codigo]).trim() : ''
    if (!codigo) continue
    map.set(codigo, {
      codigo,
      articulo: col.articulo >= 0 && r[col.articulo] != null ? String(r[col.articulo]).trim() : codigo,
      cantidad: num(r[col.cantidad]),
      costo: col.costo >= 0 ? num(r[col.costo]) : 0,
      actualizado_at: new Date().toISOString()
    })
  }
  return [...map.values()]
}

// ---------- ARTÍCULOS (foto del Excel) ----------
router.get('/articulos', async (req, res) => {
  const { data, error } = await supabase
    .from('stock_articulos')
    .select('codigo, articulo, cantidad, costo, actualizado_at')
    .order('codigo')
    .range(0, 9999)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ---------- IMPORTAR EXCEL ----------
router.post('/importar', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Subí un archivo .xlsx' })
    const articulos = parseStockExcel(req.file.buffer)
    if (!articulos.length) return res.status(400).json({ error: 'El Excel no tiene filas con código' })

    // 1) upsert de artículos en lotes
    for (let i = 0; i < articulos.length; i += 500) {
      const { error } = await supabase
        .from('stock_articulos')
        .upsert(articulos.slice(i, i + 500), { onConflict: 'codigo' })
      if (error) throw error
    }

    // 2) actualizar stk_actual de componentes vinculados
    const { data: comps, error: e2 } = await supabase
      .from('stock_componentes')
      .select('id, codigo, componente, stk_actual')
      .not('codigo', 'is', null)
    if (e2) throw e2

    const porCodigo = new Map(articulos.map(a => [a.codigo, a]))
    const actualizados = []
    const sinCoincidencia = []
    for (const c of comps) {
      const a = porCodigo.get(c.codigo)
      if (!a) { sinCoincidencia.push(c.componente); continue }
      const { error } = await supabase
        .from('stock_componentes')
        .update({ stk_actual: a.cantidad, updated_at: new Date().toISOString() })
        .eq('id', c.id)
      if (error) throw error
      actualizados.push({ componente: c.componente, antes: Number(c.stk_actual), ahora: a.cantidad })
    }

    // 3) log
    await supabase.from('stock_importaciones').insert([{
      archivo: req.file.originalname,
      articulos: articulos.length,
      componentes_actualizados: actualizados.length
    }])

    res.json({
      articulos: articulos.length,
      negativos: articulos.filter(a => a.cantidad < 0).length,
      actualizados,
      sinCoincidencia
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/importaciones/ultima', async (req, res) => {
  const { data, error } = await supabase
    .from('stock_importaciones')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data[0] || null)
})

// ---------- COMPONENTES ----------
router.get('/componentes', async (req, res) => {
  const { data, error } = await supabase
    .from('stock_componentes')
    .select('*, stock_articulos(articulo, costo)')
    .order('componente')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.post('/componentes', async (req, res) => {
  const { componente, codigo, stk_min, stk_max, stk_actual, consumo_mensual, costo_unitario } = req.body
  if (!componente) return res.status(400).json({ error: 'componente es requerido' })

  let actual = num(stk_actual)
  if (codigo) {
    const { data: art } = await supabase
      .from('stock_articulos').select('cantidad').eq('codigo', codigo).maybeSingle()
    if (!art) return res.status(400).json({ error: `El código ${codigo} no está en el último Excel importado` })
    actual = Number(art.cantidad)
  }

  const { data, error } = await supabase
    .from('stock_componentes')
    .insert([{
      componente: componente.trim().toUpperCase(),
      codigo: codigo || null,
      stk_min: num(stk_min),
      stk_max: num(stk_max),
      stk_actual: actual,
      consumo_mensual: num(consumo_mensual),
      // costo manual: solo si se carga (si no, se usa el costo del Excel)
      costo_unitario: costo_unitario === '' || costo_unitario == null ? null : num(costo_unitario)
    }])
    .select('*, stock_articulos(articulo, costo)')
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

router.patch('/componentes/:id', async (req, res) => {
  const permitidos = ['componente', 'codigo', 'stk_min', 'stk_max', 'stk_actual', 'consumo_mensual', 'costo_unitario']
  const updates = { updated_at: new Date().toISOString() }
  for (const k of permitidos) {
    if (!(k in req.body)) continue
    const v = req.body[k]
    if (k === 'componente') updates[k] = String(v).trim().toUpperCase()
    else if (k === 'codigo') updates[k] = v || null
    else if (k === 'costo_unitario') updates[k] = v === '' || v == null ? null : num(v)
    else updates[k] = num(v)
  }

  // si se vincula un código, toma la cantidad del Excel
  if (updates.codigo) {
    const { data: art } = await supabase
      .from('stock_articulos').select('cantidad').eq('codigo', updates.codigo).maybeSingle()
    if (!art) return res.status(400).json({ error: `El código ${updates.codigo} no está en el último Excel importado` })
    updates.stk_actual = Number(art.cantidad)
  }

  const { data, error } = await supabase
    .from('stock_componentes')
    .update(updates)
    .eq('id', req.params.id)
    .select('*, stock_articulos(articulo, costo)')
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.delete('/componentes/:id', async (req, res) => {
  const { error } = await supabase
    .from('stock_componentes')
    .delete()
    .eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true })
})

module.exports = router