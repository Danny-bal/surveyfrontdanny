import { http } from './http';
import type { GenericResponse, Question, QuestionCreateRequest } from '@/types/api';

export async function getQuestions() {
  const { data } = await http.get<GenericResponse<Question[]>>('/api/Question');
  return data;
}

export async function getQuestionById(id: number) {
  const { data } = await http.get<GenericResponse<Question>>(`/api/Question/${id}`);
  return data;
}

export async function createQuestion(payload: QuestionCreateRequest) {
  const { data } = await http.post<GenericResponse<number>>('/api/Question', payload);
  return data;
}

export async function updateQuestion(id: number, payload: Question) {
  const { data } = await http.put<GenericResponse<boolean>>(`/api/Question/${id}`, payload);
  return data;
}

export async function deleteQuestion(id: number) {
  const { data } = await http.delete<GenericResponse<boolean>>(`/api/Question/${id}`);
  return data;
}
