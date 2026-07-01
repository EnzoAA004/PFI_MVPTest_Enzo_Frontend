# Deploy Frontend

## Vercel

Configuracion recomendada:

- Framework preset: Vite
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`

## Variables de entorno

```text
VITE_API_BASE_URL=https://url-backend
VITE_USE_MOCK=false
```

`VITE_API_BASE_URL` debe apuntar al backend Spring Boot publicado. El frontend no debe consumir directamente el modulo Python FastAPI.

## Verificacion previa

Antes de publicar:

```bash
npm install
npm run build
```

Confirmar que la UI indique que la salida es asistiva y requiere revision profesional.
