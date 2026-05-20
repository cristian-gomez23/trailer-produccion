# 🚛 Trailer Production Tracker

Módulo independiente de gestión de trailers en producción.  
Backend Node.js + Express · Base de datos Supabase (schema `produccion`)

---

## ⚡ Setup en 5 pasos

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar el schema en Supabase

> Este módulo usa el **mismo proyecto Supabase** que la app de fabricación,
> pero en un schema separado `produccion`. Las tablas existentes no se tocan.

1. Ir a **Supabase Dashboard → SQL Editor → New Query**
2. Pegar y ejecutar el contenido de `supabase/schema.sql`
3. Ir a **Settings → API → Exposed schemas**
4. Agregar `produccion` a la lista (además de `public`) y guardar

### 3. Crear el archivo `.env`
```bash
cp .env.example .env
```
Editá `.env` — usá las **mismas credenciales** de tu proyecto Supabase:
```env
SUPABASE_URL=https://tu-proyecto.supabase.co   # igual que fabricación
SUPABASE_ANON_KEY=eyJ...tu_clave...            # igual que fabricación
COMPANY_NAME=Mi Empresa S.A.
PRIMARY_COLOR=#1D9E75
SECONDARY_COLOR=#0F6E56
PORT=3001   # puerto diferente al de fabricación
```

### 4. Correr la app
```bash
npm run dev   # desarrollo (con auto-reload)
npm start     # producción
```

### 5. Abrir en el navegador
```
http://localhost:3001
```

---

## 📁 Estructura
```
trailer-tracker/
├── server.js              # Express principal
├── .env                   # Credenciales (NO subir a git)
├── .env.example           # Plantilla
├── config/
│   └── supabase.js        # Cliente apuntando al schema "produccion"
├── routes/
│   ├── trailers.js        # CRUD trailers
│   └── settings.js        # Branding y uploads
├── public/
│   ├── index.html
│   ├── css/app.css
│   ├── js/app.js
│   └── img/               # Logo y favicon
└── supabase/
    └── schema.sql         # Script para crear schema "produccion"
```

---

## 🔗 Relación con la app de fabricación

| | App fabricación | Trailer Tracker |
|---|---|---|
| Supabase proyecto | ✅ mismo | ✅ mismo |
| Schema | `public` | `produccion` |
| Puerto local | 3000 | 3001 |
| Código | independiente | independiente |

---

## 🛠 Requisitos
- Node.js 18+
- Mismo proyecto Supabase que la app de fabricación
