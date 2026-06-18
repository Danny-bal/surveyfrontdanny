import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import * as authApi from '@/api/authApi';
import type { LoginRequest, RegisterRequest, SessionUser } from '@/types/api';

const tokenKey = 'survey-danny-token';

function decodeJwtPayload(token: string) {
  const [, payload] = token.split('.');

  if (!payload) {
    throw new Error('Token invalido');
  }

  const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
  const paddedPayload = normalizedPayload.padEnd(
    normalizedPayload.length + ((4 - (normalizedPayload.length % 4)) % 4),
    '=',
  );

  return JSON.parse(atob(paddedPayload));
}

function parseToken(token: string): SessionUser | null {
  try {
    const decoded = decodeJwtPayload(token);
    const roleClaim = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';
    const nameClaim = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name';
    const rawRoles = decoded[roleClaim] ?? decoded.role ?? [];

    if (typeof decoded.exp === 'number' && decoded.exp * 1000 <= Date.now()) {
      throw new Error('Token expirado');
    }

    return {
      username: decoded[nameClaim] ?? decoded.name ?? 'Usuario',
      roles: Array.isArray(rawRoles) ? rawRoles : [rawRoles],
    };
  } catch {
    localStorage.removeItem(tokenKey);
    return null;
  }
}

export const useAuthStore = defineStore('auth', () => {
  const storedToken = localStorage.getItem(tokenKey);
  const parsedUser = storedToken ? parseToken(storedToken) : null;
  const token = ref(parsedUser ? storedToken : null);
  const user = ref<SessionUser | null>(parsedUser);

  const isAuthenticated = computed(() => Boolean(token.value && user.value));

  function validateSession() {
    const nextToken = localStorage.getItem(tokenKey);

    if (!nextToken) {
      token.value = null;
      user.value = null;
      return false;
    }

    const nextUser = parseToken(nextToken);

    if (!nextUser) {
      token.value = null;
      user.value = null;
      return false;
    }

    token.value = nextToken;
    user.value = nextUser;
    return true;
  }

  async function login(payload: LoginRequest) {
    const response = await authApi.login(payload);

    if (response.success && response.data) {
      const nextUser = parseToken(response.data);

      if (!nextUser) {
        return {
          ...response,
          success: false,
          message: 'Token invalido',
        };
      }

      token.value = response.data;
      user.value = nextUser;
      localStorage.setItem(tokenKey, response.data);
    }

    return response;
  }

  async function register(payload: RegisterRequest) {
    return authApi.register(payload);
  }

  function logout() {
    token.value = null;
    user.value = null;
    localStorage.removeItem(tokenKey);
  }

  return {
    token,
    user,
    isAuthenticated,
    validateSession,
    login,
    register,
    logout,
  };
});
