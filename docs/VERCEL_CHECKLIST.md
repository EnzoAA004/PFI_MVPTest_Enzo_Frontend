# Vercel Checklist

- [ ] Repo conectado en Vercel.
- [ ] Framework preset configurado como `Vite`.
- [ ] Build command configurado como `npm run build`.
- [ ] Output directory configurado como `dist`.
- [ ] Variable `VITE_API_BASE_URL=https://url-backend` cargada.
- [ ] Variable `VITE_USE_MOCK=false` cargada.
- [ ] CORS del backend permite el dominio generado por Vercel.
- [ ] Dashboard probado en deploy.
- [ ] Caso demo probado en deploy.
- [ ] Guardado de revision probado en deploy.

## Nota

El deploy de frontend debe llamar solamente al backend Spring Boot publicado. El fallback mock se conserva para demos locales, pero en Vercel productivo debe quedar `VITE_USE_MOCK=false`.
