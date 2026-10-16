require('dotenv').config()
const express = require('express')
const path = require('path')

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, 'public')))

app.get('/api/config', (req, res) => {
  res.json({
    company_name:    process.env.COMPANY_NAME    || 'Trailer Tracker',
    primary_color:   process.env.PRIMARY_COLOR   || '#1D9E75',
    secondary_color: process.env.SECONDARY_COLOR || '#0F6E56'
  })
})

// Diagnóstico: muestra a qué proyecto de Supabase apunta este deploy
// y el error COMPLETO (message + code + hint + details) de una query de prueba.
// El hint de PostgREST lista qué schemas están expuestos en ESE proyecto.
app.get('/api/diag', async (req, res) => {
  const supabase = require('./config/supabase')

  let supabase_host = null
  try { supabase_host = new URL(process.env.SUPABASE_URL).host } catch (e) {}

  const { data, error } = await supabase
    .from('trailers')
    .select('id')
    .limit(1)

  res.json({
    supabase_host,                                   // ref del proyecto que usa Vercel
    schema_configurado: 'produccion',
    anon_key_definida: Boolean(process.env.SUPABASE_ANON_KEY),
    query_ok: !error,
    filas: error ? null : (data ? data.length : 0),
    error: error
      ? { message: error.message, code: error.code, hint: error.hint, details: error.details }
      : null
  })
})

app.use('/api/trailers', require('./routes/trailers'))
app.use('/api/settings', require('./routes/settings'))
app.use('/api/tareas-avance', require('./routes/tareas-avance'))

const makeAreaRouter = require('./routes/area')
app.use('/api/panol',   makeAreaRouter('panol'))
app.use('/api/calidad', makeAreaRouter('calidad'))

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n✅  Trailer Tracker corriendo en http://localhost:${PORT}\n`)
  })
}

module.exports = app