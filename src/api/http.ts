import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:5289';

export const http = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('survey-danny-token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export function getApiMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    const status = error.response?.status;
    const url = error.config?.url ?? '';

    console.groupCollapsed('[SurveyDanny API] Error de solicitud');
    console.log('URL:', url);
    console.log('Metodo:', error.config?.method?.toUpperCase());
    console.log('Estado HTTP:', status);
    console.log('Respuesta backend:', error.response?.data ?? '(sin cuerpo de respuesta)');
    console.log('Mensaje tecnico:', error.message);
    console.groupEnd();

    if (typeof message === 'string' && message.length > 0) {
      return message;
    }

    if (status === 401 && url.includes('/api/Authentication')) {
      return 'Usuario o contrasena incorrectos';
    }

    if (status === 401) {
      return 'No tienes autorizacion para completar esta accion';
    }

    if (!error.response) {
      return 'No se pudo conectar con el servidor. Revisa que el backend este encendido y que el certificado local sea confiable';
    }
  }

  return 'No se pudo completar la solicitud';
}
