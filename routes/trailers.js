process.env.TZ = 'America/Argentina/Buenos_Aires'
const express = require('express')
const router = express.Router()
const supabase = require('../config/supabase')

// GET todos los trailers
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('trailers')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST crear trailer
router.post('/', async (req, res) => {
  const { nombre, modelo, chapa, fecha_inicio, fecha_fin, prioridad } = req.body

  if (!nombre || !chapa || !fecha_fin)
    return res.status(400).json({ error: 'nombre, chapa y fecha_fin son requeridos' })

  const { data, error } = await supabase
    .from('trailers')
    .insert([{
      nombre,
      modelo: modelo || null,
      chapa: chapa.toUpperCase(),
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

// PATCH actualizar trailer
router.patch('/:id', async (req, res) => {
  const { id } = req.params
  const updates = req.body

  if (updates.finalizado === true)  updates.en_produccion = true
  if (updates.finalizado === true)  updates.fecha_real_fin = new Date().toISOString().slice(0, 10)
  if (updates.finalizado === false) updates.fecha_real_fin = null

  const { data, error } = await supabase
    .from('trailers')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// DELETE eliminar trailer
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('trailers')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true })
})

module.exports = router
