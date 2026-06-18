import { http } from './http';
import type { GenericResponse, LoginRequest, RegisterRequest } from '@/types/api';

export async function login(payload: LoginRequest) {
  const { data } = await http.post<GenericResponse<string>>('/api/Authentication/Login', payload);
  return data;
}

export async function register(payload: RegisterRequest) {
  const { data } = await http.post<GenericResponse<number>>('/api/Authentication/register', payload);
  return data;
}
