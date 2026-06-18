# SurveyDanny Web

Frontend en Vue 3 para el sistema de encuestas SurveyDanny.

## Requisitos

- Node.js LTS instalado.
- npm disponible en PowerShell.
- Backend ejecutandose en `https://localhost:7176`.

## Primer arranque

```powershell
cd C:\SurveyDannyWeb
npm install
npm run dev
```

Si el navegador bloquea el certificado local del backend, ejecuta una vez:

```powershell
dotnet dev-certs https --trust
```

Luego abre:

```txt
http://localhost:5173
```

## Configuracion opcional

Si el backend expone un endpoint distinto para el catalogo de tipos de respuesta, configura:

```env
VITE_RESPONSE_TYPES_ENDPOINT=/api/ResponseTypes
```

## Estructura principal

```txt
src/
  api/          conexion con el backend
  assets/       estilos globales
  features/     pantallas por modulo
  layouts/      estructura visual del login y del panel
  router/       rutas de la aplicacion
  stores/       estado global, como sesion y token
  types/        modelos TypeScript basados en tu API
```

## Modulos iniciales

- Autenticacion: login y registro.
- Dashboard: resumen inicial.
- Encuestas: listado, creacion, edicion y eliminacion.
- Preguntas: listado, creacion, edicion y eliminacion.
- Constructor de encuestas: asignacion de preguntas y tipos de respuesta por encuesta.
- Encuesta publica: carga de encuesta y envio de respuestas.
- Reportes: reservado para resultados.
