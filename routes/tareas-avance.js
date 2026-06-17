const express = require('express')
const router = express.Router()
const supabase = require('../config/supabase')

// GET todo el avance de tareas (todas las órdenes marcadas)
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('tareas_avance')
    .select('*')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST set estado de una orden (tildar / destildar).
// Hace upsert por (trailer_id, grupo, orden): crea o actualiza.
router.post('/', async (req, res) => {
  const { trailer_id, grupo, orden, hecha } = req.body

  if (trailer_id == null || grupo == null || orden == null)
    return res.status(400).json({ error: 'trailer_id, grupo y orden son requeridos' })

  const { data, error } = await supabase
    .from('tareas_avance')
    .upsert(
      {
        trailer_id,
        grupo,
        orden,
        hecha: hecha !== false,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'trailer_id,grupo,orden' }
    )
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

module.exports = router
