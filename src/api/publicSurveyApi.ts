import { http } from './http';
import type {
  GenericResponse,
  PublicSurvey,
  ResponseSurveyByClientRequest,
  SurveyForClientsCreateRequest,
} from '@/types/api';

export async function assignQuestionsToSurvey(payload: SurveyForClientsCreateRequest) {
  const { data } = await http.post<GenericResponse<boolean>>('/api/SurveysForClients', payload);
  return data;
}

export async function getSurveyForClient(id: number) {
  const { data } = await http.get<GenericResponse<PublicSurvey>>(`/api/SurveysForClients/${id}`);
  return data;
}

export async function answerSurvey(payload: ResponseSurveyByClientRequest) {
  const { data } = await http.post<GenericResponse<boolean>>('/api/SurveysForClients/responseSurvey', payload);
  return data;
}
