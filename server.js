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

app.use('/api/trailers', require('./routes/trailers'))
app.use('/api/settings', require('./routes/settings'))

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

// Para Vercel: exportar app además de escuchar localmente
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n✅  Trailer Tracker corriendo en http://localhost:${PORT}\n`)
  })
}

module.exports = app
