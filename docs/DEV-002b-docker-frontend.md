# DEV-002b - Docker Frontend

Imagen multi-stage para compilar el frontend React/Vite y servir `dist/` con nginx alpine.

## Build

```powershell
docker build -t pfi-mvptest-frontend .
```

Opcionalmente se puede fijar una URL de backend de build:

```powershell
docker build --build-arg VITE_API_BASE_URL=http://localhost:8080 -t pfi-mvptest-frontend .
```

## Runtime

La URL efectiva del backend se inyecta al arrancar el contenedor mediante `BACKEND_URL`. El entrypoint genera `/env.js`, que el frontend lee como `window.__PFI_CONFIG__.API_BASE_URL`.

```powershell
docker run --rm -p 8088:80 -e BACKEND_URL=http://host.docker.internal:8080 pfi-mvptest-frontend
```

Abrir:

```text
http://localhost:8088
```

## Configuracion

- `BACKEND_URL`: configuracion runtime recomendada. No requiere rebuild.
- `VITE_API_BASE_URL`: build arg compatible con Vite. Se usa como fallback si no se inyecta `BACKEND_URL`.
- Fallback final del frontend: `http://localhost:8080`.

No se guardan secretos en la imagen.

## Archivos

- `Dockerfile`: build Node `npm ci` + `npm run build`, runtime nginx alpine.
- `docker/nginx.conf`: servidor estatico con fallback SPA a `index.html`.
- `docker/entrypoint.sh`: genera `/usr/share/nginx/html/env.js` desde `BACKEND_URL`.
- `.dockerignore`: excluye `node_modules`, `dist`, `.git`, caches y metadata local.
