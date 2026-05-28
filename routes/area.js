// routes/area.js — ruta genérica para panol y calidad
const express = require('express')
const supabase = require('../config/supabase')

function makeAreaRouter(tabla) {
  const router = express.Router()

  // GET todos
  router.get('/', async (req, res) => {
    const { data, error } = await supabase
      .from(tabla)
      .select('*')
      .order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    res.json(data)
  })

  // POST crear
  router.post('/', async (req, res) => {
    const { tarea, responsable, descripcion, fecha_inicio, fecha_fin, prioridad } = req.body
    if (!tarea || !fecha_fin)
      return res.status(400).json({ error: 'tarea y fecha_fin son requeridos' })

    const { data, error } = await supabase
      .from(tabla)
      .insert([{
        tarea,
        responsable: responsable || null,
        descripcion: descripcion || null,
        fecha_inicio: fecha_inicio || new Date().toISOString().slice(0, 10),
        fecha_fin,
        prioridad: prioridad || 'normal',
        en_produccion: false,
        finalizado: false
      }])
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    res.status(201).json(data)
  })

  // PATCH actualizar
  router.patch('/:id', async (req, res) => {
    const updates = req.body
    if (updates.finalizado === true)  updates.en_produccion = true
    if (updates.finalizado === true)  updates.fecha_real_fin = new Date().toISOString().slice(0, 10)
    if (updates.finalizado === false) updates.fecha_real_fin = null

    const { data, error } = await supabase
      .from(tabla)
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    res.json(data)
  })

  // DELETE
  router.delete('/:id', async (req, res) => {
    const { error } = await supabase
      .from(tabla)
      .delete()
      .eq('id', req.params.id)

    if (error) return res.status(500).json({ error: error.message })
    res.json({ success: true })
  })

  return router
}

module.exports = makeAreaRouter
