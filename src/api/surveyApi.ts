import { http } from './http';
import type { GenericResponse, Survey, SurveyCreateRequest } from '@/types/api';

export async function getSurveys() {
  const { data } = await http.get<GenericResponse<Survey[]>>('/api/Survey');
  return data;
}

export async function getSurveyById(id: number) {
  const { data } = await http.get<GenericResponse<Survey>>(`/api/Survey/${id}`);
  return data;
}

export async function createSurvey(payload: SurveyCreateRequest) {
  const { data } = await http.post<GenericResponse<boolean>>('/api/Survey', payload);
  return data;
}

export async function updateSurvey(id: number, payload: SurveyCreateRequest) {
  const { data } = await http.put<GenericResponse<boolean>>(`/api/Survey/${id}`, payload);
  return data;
}

export async function deleteSurvey(id: number) {
  const { data } = await http.delete<GenericResponse<boolean>>(`/api/Survey/${id}`);
  return data;
}
