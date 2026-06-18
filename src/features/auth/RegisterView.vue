<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { AlertCircle, LoaderCircle, UserPlus } from 'lucide-vue-next';
import { getApiMessage } from '@/api/http';
import { useAuthStore } from '@/stores/authStore';

const auth = useAuthStore();
const router = useRouter();

const username = ref('');
const email = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');
const success = ref('');

async function submit() {
  error.value = '';
  success.value = '';
  loading.value = true;

  try {
    const response = await auth.register({
      username: username.value,
      email: email.value,
      password: password.value,
    });

    if (!response.success) {
      error.value = response.message || 'No se pudo crear el usuario';
      return;
    }

    success.value = 'Usuario creado correctamente';
    window.setTimeout(() => router.push('/auth/login'), 700);
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
      <span>Registro</span>
      <h2>Crear usuario</h2>
    </div>

    <label class="field">
      <span>Usuario</span>
      <input v-model="username" autocomplete="username" required type="text" />
    </label>

    <label class="field">
      <span>Correo</span>
      <input v-model="email" autocomplete="email" required type="email" />
    </label>

    <label class="field">
      <span>Contrasena</span>
      <input v-model="password" autocomplete="new-password" required type="password" />
    </label>

    <p v-if="error" class="form-alert">
      <AlertCircle :size="18" />
      {{ error }}
    </p>
    <p v-if="success" class="form-success">{{ success }}</p>

    <button class="primary-button" :disabled="loading" type="submit">
      <LoaderCircle v-if="loading" class="spin" :size="18" />
      <UserPlus v-else :size="18" />
      <span>Crear cuenta</span>
    </button>

    <p class="auth-switch">
      Ya tengo cuenta
      <RouterLink to="/auth/login">Iniciar sesion</RouterLink>
    </p>
  </form>
</template>
