import { http } from './http';
import type { GenericResponse, SurveyClientAnswers } from '@/types/api';

export async function getSurveyAnswersByClient(surveyId: number) {
  const { data } = await http.get<GenericResponse<SurveyClientAnswers[]>>(
    `/api/SurveysForClients/GetAnswersByClient/${surveyId}`,
  );
  return data;
}
