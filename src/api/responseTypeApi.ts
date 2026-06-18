import { http } from './http';
import type { GenericResponse, ResponseType } from '@/types/api';

const fallbackResponseTypes: ResponseType[] = [
  { id: 1, name: 'Si/No' },
  { id: 2, name: 'Escala 1-5' },
  { id: 3, name: 'Abierta' },
  { id: 4, name: 'Opcion multiple' },
  { id: 5, name: 'Verdadero/Falso' },
  { id: 6, name: 'Clasificacion 1-10' },
  { id: 7, name: 'De acuerdo/Desacuerdo' },
  { id: 8, name: 'Escala Likert' },
  { id: 9, name: 'Fecha' },
  { id: 10, name: 'Respuesta corta' },
  { id: 11, name: 'Casillas de verificacion' },
  { id: 12, name: 'Desplegable' },
];

const responseTypesEndpoint = import.meta.env.VITE_RESPONSE_TYPES_ENDPOINT ?? '/api/ResponseTypes';

type RawResponseType = {
  id?: number;
  idTypeResponse?: number;
  idResponseType?: number;
  name?: string;
  nameTypeResponse?: string;
  typeResponse?: string;
  description?: string;
};

function normalizeResponseType(rawType: RawResponseType): ResponseType | null {
  const id = rawType.id ?? rawType.idTypeResponse ?? rawType.idResponseType;
  const name = rawType.name ?? rawType.nameTypeResponse ?? rawType.typeResponse ?? rawType.description;

  if (typeof id !== 'number' || typeof name !== 'string' || name.length === 0) {
    return null;
  }

  return { id, name };
}

export async function getResponseTypes() {
  try {
    const { data } = await http.get<GenericResponse<RawResponseType[]> | RawResponseType[]>(responseTypesEndpoint);
    const rawTypes = Array.isArray(data) ? data : data.data;
    const responseTypes = (rawTypes ?? []).map(normalizeResponseType).filter((type): type is ResponseType => Boolean(type));

    if (responseTypes.length > 0) {
      return responseTypes;
    }
  } catch {
    // The backend currently has no known catalog endpoint, so keep the UI usable.
  }

  return fallbackResponseTypes;
}
