import { http } from './http';
import type { SurveyGptRequest, SurveyGptResponse } from '@/types/api';

export async function generateSurveyWithGpt(payload: SurveyGptRequest) {
  const { data } = await http.post<SurveyGptResponse>('/api/SurveyGPT/GenerateSurveyWithGpt', payload);
  return data;
}
