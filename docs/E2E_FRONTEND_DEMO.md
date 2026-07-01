# E2E Frontend Demo

Este recorrido valida el flujo completo:

```text
Frontend React -> Spring Boot Backend -> Python FastAPI AI Module
```

El frontend no consume el modulo Python FastAPI de forma directa.

## 1. Levantar AI Module

Desde el repositorio del modulo de IA, iniciar el servicio FastAPI segun su README. Confirmar que el backend Spring Boot pueda alcanzarlo desde su configuracion interna.

## 2. Levantar Backend Spring Boot

Desde el repositorio backend:

```bash
./mvnw spring-boot:run
```

Verificar:

```bash
curl http://localhost:8080/api/ai/health
curl http://localhost:8080/api/ai/models
```

## 3. Levantar Frontend

En este repositorio:

```bash
npm install
npm run dev
```

Variables locales sugeridas:

```text
VITE_API_BASE_URL=http://localhost:8080
VITE_USE_MOCK=false
```

Para demo sin backend disponible:

```text
VITE_USE_MOCK=true
```

## 4. Ejecutar Caso Demo

1. Abrir la URL de Vite.
2. Verificar el banner "Salida asistiva. Requiere revision profesional."
3. Presionar "Ejecutar caso demo".
4. Confirmar que se muestre `runId`, detalle de caso, panel agente, evidencia visual y mediciones.
5. Si el backend no responde, confirmar el aviso "modo demo local".

## 5. Guardar Revision

1. Elegir estado: `pendiente`, `aceptado`, `observado` o `descartado`.
2. Completar observaciones.
3. Presionar "Guardar revision".
4. Confirmar badge de estado actualizado.
5. Si el PATCH no confirma desde backend, confirmar que la UI guarde localmente y avise modo demo.

## Capturas sugeridas para defensa

- Pantalla inicial con banner metodologico y estado del backend.
- Worklist con caso demo.
- Detalle con `runId` visible.
- Panel agente con prioridad, flags, razones y revision profesional requerida.
- Evidencia visual con overlay real o placeholder con ruta.
- Tabla de mediciones.
- Formulario de revision antes y despues de guardar.
- Aviso de modo demo local cuando el backend no este disponible.
