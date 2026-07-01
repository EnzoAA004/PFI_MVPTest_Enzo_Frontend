# Deploy Frontend

## Vercel

Configuracion recomendada:

- Framework preset: Vite
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`
- Produccion: usar backend Spring Boot publicado como unica API del frontend.

## Variables de entorno

```text
VITE_API_BASE_URL=https://url-backend
VITE_USE_MOCK=false
```

`VITE_API_BASE_URL` debe apuntar al backend Spring Boot publicado. El frontend no debe consumir directamente el modulo Python FastAPI.

## Checklist rapido

- Conectar el repositorio en Vercel.
- Seleccionar Framework preset `Vite`.
- Configurar Build command `npm run build`.
- Configurar Output directory `dist`.
- Cargar `VITE_API_BASE_URL=https://url-backend`.
- Cargar `VITE_USE_MOCK=false`.
- Confirmar CORS en backend para el dominio de Vercel.
- Ejecutar deploy y validar dashboard, caso demo y guardado de revision.

## Verificacion previa

Antes de publicar:

```bash
npm install
npm run build
```

Confirmar que la UI indique que la salida es asistiva y requiere revision profesional.
