<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { AlertCircle, LoaderCircle, LogIn } from 'lucide-vue-next';
import { getApiMessage } from '@/api/http';
import { useAuthStore } from '@/stores/authStore';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const username = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');

function getRedirectTarget() {
  const redirect = Array.isArray(route.query.redirect) ? route.query.redirect[0] : route.query.redirect;

  if (typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('/auth')) {
    return redirect;
  }

  return '/dashboard';
}

async function submit() {
  error.value = '';
  loading.value = true;

  try {
    const loginUsername = username.value.trim();

    const response = await auth.login({
      username: loginUsername,
      password: password.value,
    });

    if (!response.success) {
      error.value = response.message || 'No se pudo iniciar sesion';
      return;
    }

    router.push(getRedirectTarget());
  } catch (err) {
    error.value = getApiMessage(err);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <form class="auth-card" @submit.prevent="submit">
    <div class="form-heading">
      <span>Acceso</span>
      <h2>Iniciar sesion</h2>
    </div>

    <label class="field">
      <span>Usuario o correo</span>
      <input v-model="username" autocomplete="username" required type="text" />
    </label>

    <label class="field">
      <span>Contrasena</span>
      <input v-model="password" autocomplete="current-password" required type="password" />
    </label>

    <p v-if="error" class="form-alert">
      <AlertCircle :size="18" />
      {{ error }}
    </p>

    <button class="primary-button" :disabled="loading" type="submit">
      <LoaderCircle v-if="loading" class="spin" :size="18" />
      <LogIn v-else :size="18" />
      <span>Entrar</span>
    </button>

    <p class="auth-switch">
      Sin cuenta
      <RouterLink to="/auth/register">Crear usuario</RouterLink>
    </p>
  </form>
</template>
