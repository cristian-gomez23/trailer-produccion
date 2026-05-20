const express = require('express')
const router = express.Router()
const multer = require('multer')
const path = require('path')
const fs = require('fs')

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../public/img')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    const name = file.fieldname === 'favicon' ? 'favicon' + ext : 'logo' + ext
    cb(null, name)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|svg\+xml|x-icon|vnd.microsoft.icon|webp/
    cb(null, allowed.test(file.mimetype))
  }
})

// GET config actual
router.get('/', (req, res) => {
  res.json({
    company_name: process.env.COMPANY_NAME || 'Mi Empresa',
    primary_color: process.env.PRIMARY_COLOR || '#1D9E75',
    secondary_color: process.env.SECONDARY_COLOR || '#0F6E56',
    logo: getFileIfExists('logo'),
    favicon: getFileIfExists('favicon')
  })
})

// POST actualizar colores y nombre
router.post('/branding', (req, res) => {
  const { company_name, primary_color, secondary_color } = req.body
  const envPath = path.join(__dirname, '../.env')

  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''

  const set = (key, val) => {
    const re = new RegExp(`^${key}=.*$`, 'm')
    if (re.test(content)) content = content.replace(re, `${key}=${val}`)
    else content += `\n${key}=${val}`
  }

  if (company_name)   set('COMPANY_NAME', company_name)
  if (primary_color)  set('PRIMARY_COLOR', primary_color)
  if (secondary_color) set('SECONDARY_COLOR', secondary_color)

  fs.writeFileSync(envPath, content)

  // Actualizar process.env en caliente
  if (company_name)   process.env.COMPANY_NAME = company_name
  if (primary_color)  process.env.PRIMARY_COLOR = primary_color
  if (secondary_color) process.env.SECONDARY_COLOR = secondary_color

  res.json({ success: true })
})

// POST subir logo
router.post('/logo', upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' })
  res.json({ path: '/img/' + req.file.filename })
})

// POST subir favicon
router.post('/favicon', upload.single('favicon'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' })
  res.json({ path: '/img/' + req.file.filename })
})

function getFileIfExists(base) {
  const dir = path.join(__dirname, '../public/img')
  const exts = ['.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp', '.ico']
  for (const ext of exts) {
    if (fs.existsSync(path.join(dir, base + ext))) return `/img/${base}${ext}`
  }
  return null
}

module.exports = router
