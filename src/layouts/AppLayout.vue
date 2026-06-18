<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { Component } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import {
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  FilePlus2,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Send,
  Sparkles,
  UserCircle,
} from 'lucide-vue-next';
import { getSurveys } from '@/api/surveyApi';
import { useAuthStore } from '@/stores/authStore';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const collapsed = ref(false);
const mobileOpen = ref(false);
const menuLoading = ref(false);
const menuStats = ref({
  total: 0,
});

type NavTarget = string | { name: string; query?: Record<string, string> };

interface NavItem {
  label: string;
  to: NavTarget;
  icon: Component;
  badge?: number;
}

const mainNavItems = computed<NavItem[]>(() => [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
]);

const surveyNavItems = computed<NavItem[]>(() => [
  { label: 'Mis encuestas', to: '/surveys', icon: ClipboardList, badge: menuStats.value.total || undefined },
  { label: 'Banco de preguntas', to: '/questions', icon: ClipboardCheck },
  { label: 'Crear con IA', to: '/surveys/generate', icon: Sparkles },
]);

const resultsNavItems = computed<NavItem[]>(() => [
  { label: 'Responder encuestas', to: '/respond', icon: Send },
  { label: 'Reportes', to: '/reports', icon: BarChart3 },
]);

const roleLabel = computed(() => {
  const roles = auth.user?.roles ?? [];

  if (roles.some((role) => role.toLowerCase().includes('admin'))) {
    return 'Administrador';
  }

  if (roles.length > 0) {
    return roles.join(', ');
  }

  return 'Sesion activa';
});

async function loadMenuStats() {
  if (menuLoading.value) {
    return;
  }

  menuLoading.value = true;

  try {
    const response = await getSurveys();
    const surveys = response.data ?? [];

    menuStats.value = {
      total: surveys.length,
    };
  } catch {
    menuStats.value = {
      total: 0,
    };
  } finally {
    menuLoading.value = false;
  }
}

function logout() {
  auth.logout();
  router.push('/auth/login');
}

onMounted(loadMenuStats);
watch(
  () => route.fullPath,
  () => {
    loadMenuStats();
  },
);
</script>

<template>
  <div class="app-shell" :class="{ collapsed }">
    <aside class="sidebar" :class="{ 'mobile-open': mobileOpen }">
      <div class="sidebar-top">
        <RouterLink class="app-logo" to="/dashboard" @click="mobileOpen = false">
          <span>SD</span>
          <strong>SurveyDanny</strong>
        </RouterLink>
        <button class="icon-button desktop-only" type="button" title="Contraer menu" @click="collapsed = !collapsed">
          <PanelLeftOpen v-if="collapsed" :size="19" />
          <PanelLeftClose v-else :size="19" />
        </button>
      </div>

      <RouterLink class="quick-create-button" to="/surveys/new" title="Crear encuesta manual" @click="mobileOpen = false">
        <FilePlus2 :size="18" />
        <span>Crear manual</span>
      </RouterLink>

      <nav class="nav-list" aria-label="Navegacion principal">
        <RouterLink
          v-for="item in mainNavItems"
          :key="item.label"
          :to="item.to"
          class="nav-item"
          :title="item.label"
          @click="mobileOpen = false"
        >
          <component :is="item.icon" :size="19" />
          <span>{{ item.label }}</span>
          <small v-if="item.badge" class="nav-badge">{{ item.badge }}</small>
        </RouterLink>

        <div class="nav-group">
          <span class="nav-group-title">Encuestas</span>
          <RouterLink
            v-for="item in surveyNavItems"
            :key="item.label"
            :to="item.to"
            class="nav-item nav-subitem"
            :title="item.label"
            @click="mobileOpen = false"
          >
            <component :is="item.icon" :size="18" />
            <span>{{ item.label }}</span>
            <small v-if="item.badge" class="nav-badge">{{ item.badge }}</small>
          </RouterLink>
        </div>

        <div class="nav-group">
          <span class="nav-group-title">Participacion</span>
          <RouterLink
            v-for="item in resultsNavItems"
            :key="item.label"
            :to="item.to"
            class="nav-item"
            :title="item.label"
            @click="mobileOpen = false"
          >
            <component :is="item.icon" :size="19" />
            <span>{{ item.label }}</span>
            <small v-if="item.badge" class="nav-badge">{{ item.badge }}</small>
          </RouterLink>
        </div>
      </nav>

      <div class="sidebar-bottom">
        <div class="user-chip">
          <UserCircle :size="18" />
          <div>
            <strong>{{ auth.user?.username }}</strong>
            <span>Rol: {{ roleLabel }}</span>
          </div>
        </div>
        <button class="logout-button" type="button" @click="logout">
          <LogOut :size="18" />
          <span>Cerrar sesion</span>
        </button>
      </div>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <button class="icon-button mobile-only" type="button" title="Abrir menu" @click="mobileOpen = !mobileOpen">
          <Menu :size="22" />
        </button>
        <div>
          <span>SurveyDanny</span>
          <strong>{{ auth.user?.username }}</strong>
        </div>
      </header>
      <RouterView />
    </section>
  </div>
</template>
