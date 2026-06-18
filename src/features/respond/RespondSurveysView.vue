<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { AlertTriangle, CheckCircle2, ClipboardList, Clock, ExternalLink, Search, Send, Users } from 'lucide-vue-next';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import { getApiMessage } from '@/api/http';
import { getSurveyAnswersByClient } from '@/api/reportApi';
import { getSurveyForClient } from '@/api/publicSurveyApi';
import { getSurveys } from '@/api/surveyApi';
import type { PublicSurvey, Survey, SurveyClientAnswers } from '@/types/api';

type AvailabilityFilter = 'Disponibles' | 'Todas' | 'No listas';
type DateFilter = 'Todas' | 'Este mes' | 'Ultimos 7 dias';
type SortMode = 'recent' | 'title' | 'participants';

interface RespondSurveyRow {
  survey: Survey;
  publicSurvey: PublicSurvey | null;
  answers: SurveyClientAnswers[];
  questionCount: number;
  issueCount: number;
  participantCount: number;
  isReady: boolean;
}

const surveys = ref<Survey[]>([]);
const rows = ref<RespondSurveyRow[]>([]);
const loading = ref(true);
const error = ref('');
const search = ref('');
const availabilityFilter = ref<AvailabilityFilter>('Disponibles');
const dateFilter = ref<DateFilter>('Todas');
const sortMode = ref<SortMode>('recent');
const pageSize = ref(6);
const currentPage = ref(1);

const availabilityOptions: AvailabilityFilter[] = ['Disponibles', 'Todas', 'No listas'];
const dateOptions: DateFilter[] = ['Todas', 'Este mes', 'Ultimos 7 dias'];

const readyRows = computed(() => rows.value.filter((row) => row.isReady));
const notReadyRows = computed(() => rows.value.filter((row) => !row.isReady));
const totalParticipants = computed(() => rows.value.reduce((total, row) => total + row.participantCount, 0));
const recentReadyCount = computed(() =>
  readyRows.value.filter((row) => {
    const createdAt = new Date(row.survey.surCreationDate);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(new Date().getDate() - 7);

    return createdAt >= sevenDaysAgo;
  }).length,
);
const filteredRows = computed(() => {
  const normalizedSearch = search.value.trim().toLowerCase();

  return rows.value.filter((row) => {
    const matchesSearch =
      !normalizedSearch ||
      row.survey.surTitle.toLowerCase().includes(normalizedSearch) ||
      row.survey.surDescription.toLowerCase().includes(normalizedSearch);
    const matchesAvailability =
      availabilityFilter.value === 'Todas' ||
      (availabilityFilter.value === 'Disponibles' && row.isReady) ||
      (availabilityFilter.value === 'No listas' && !row.isReady);
    const matchesDate = matchesDateFilter(row.survey.surCreationDate);

    return matchesSearch && matchesAvailability && matchesDate;
  });
});
const sortedRows = computed(() =>
  [...filteredRows.value].sort((current, next) => {
    if (sortMode.value === 'title') {
      return current.survey.surTitle.localeCompare(next.survey.surTitle);
    }

    if (sortMode.value === 'participants') {
      return next.participantCount - current.participantCount;
    }

    const currentDate = new Date(current.survey.surCreationDate).getTime();
    const nextDate = new Date(next.survey.surCreationDate).getTime();

    if (currentDate === nextDate) {
      return next.survey.id - current.survey.id;
    }

    return nextDate - currentDate;
  }),
);
const totalPages = computed(() => Math.max(1, Math.ceil(sortedRows.value.length / pageSize.value)));
const pageStart = computed(() => (currentPage.value - 1) * pageSize.value);
const pageEnd = computed(() => Math.min(pageStart.value + pageSize.value, sortedRows.value.length));
const paginatedRows = computed(() => sortedRows.value.slice(pageStart.value, pageEnd.value));
const visibleRangeLabel = computed(() => {
  if (sortedRows.value.length === 0) {
    return 'Mostrando 0 de 0 encuestas';
  }

  return `Mostrando ${pageStart.value + 1} a ${pageEnd.value} de ${sortedRows.value.length} encuestas`;
});
const pageNumbers = computed(() => {
  const pages = new Set<number>([1, totalPages.value, currentPage.value]);

  if (currentPage.value > 1) {
    pages.add(currentPage.value - 1);
  }

  if (currentPage.value < totalPages.value) {
    pages.add(currentPage.value + 1);
  }

  return [...pages].filter((page) => page >= 1 && page <= totalPages.value).sort((firstPage, secondPage) => firstPage - secondPage);
});

watch([search, availabilityFilter, dateFilter, sortMode, pageSize], () => {
  currentPage.value = 1;
});

watch(totalPages, (nextTotalPages) => {
  if (currentPage.value > nextTotalPages) {
    currentPage.value = nextTotalPages;
  }
});

function getConfiguredQuestions(publicSurvey: PublicSurvey | null) {
  return publicSurvey?.questionListResponses ?? [];
}

function getIssueCount(publicSurvey: PublicSurvey | null) {
  return getConfiguredQuestions(publicSurvey).filter((question) => (question.responsesQuestion?.length ?? 0) === 0).length;
}

function getAvailabilityLabel(row: RespondSurveyRow) {
  return row.isReady ? 'Disponible' : 'No lista';
}

function getAvailabilityClass(row: RespondSurveyRow) {
  return row.isReady ? 'status-published' : 'status-attention';
}

function getAvailabilityReason(row: RespondSurveyRow) {
  if (row.isReady) {
    return `${row.questionCount} pregunta${row.questionCount === 1 ? '' : 's'} lista${row.questionCount === 1 ? '' : 's'} para responder.`;
  }

  if (row.questionCount === 0) {
    return 'Aun no tiene preguntas configuradas.';
  }

  return `${row.issueCount} pregunta${row.issueCount === 1 ? '' : 's'} necesita revisar opciones.`;
}

function matchesDateFilter(dateValue: string) {
  if (dateFilter.value === 'Todas') {
    return true;
  }

  const createdAt = new Date(dateValue);
  const today = new Date();

  if (dateFilter.value === 'Este mes') {
    return createdAt.getMonth() === today.getMonth() && createdAt.getFullYear() === today.getFullYear();
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(today.getDate() - 7);

  return createdAt >= sevenDaysAgo;
}

function formatDate(dateValue: string) {
  return new Date(dateValue).toLocaleDateString();
}

function goToPage(page: number) {
  currentPage.value = Math.min(Math.max(page, 1), totalPages.value);
}

function resetFilters() {
  search.value = '';
  availabilityFilter.value = 'Disponibles';
  dateFilter.value = 'Todas';
  sortMode.value = 'recent';
  pageSize.value = 6;
}

async function buildRespondRow(survey: Survey): Promise<RespondSurveyRow> {
  const [publicSurvey, answers] = await Promise.all([
    getSurveyForClient(survey.id)
      .then((response) => response.data ?? null)
      .catch(() => null),
    getSurveyAnswersByClient(survey.id)
      .then((response) => response.data ?? [])
      .catch(() => []),
  ]);
  const questionCount = getConfiguredQuestions(publicSurvey).length;
  const issueCount = getIssueCount(publicSurvey);

  return {
    survey,
    publicSurvey,
    answers,
    questionCount,
    issueCount,
    participantCount: answers.length,
    isReady: questionCount > 0 && issueCount === 0,
  };
}

async function loadSurveys() {
  loading.value = true;
  error.value = '';

  try {
    const response = await getSurveys();
    surveys.value = response.data ?? [];
    rows.value = await Promise.all(surveys.value.map(buildRespondRow));
  } catch (err) {
    error.value = getApiMessage(err);
  } finally {
    loading.value = false;
  }
}

onMounted(loadSurveys);
</script>

<template>
  <main class="page">
    <PageHeader title="Responder encuestas" eyebrow="Participacion" description="Encuentra encuestas disponibles para participar">
      <RouterLink class="secondary-button compact" to="/surveys">
        <ClipboardList :size="18" />
        <span>Gestionar</span>
      </RouterLink>
    </PageHeader>

    <p v-if="error" class="inline-error">{{ error }}</p>

    <div v-if="loading" class="loading-row">Cargando...</div>

    <EmptyState
      v-else-if="surveys.length === 0"
      title="Sin encuestas"
      text="Cuando exista una encuesta, aparecera aqui para responder"
      :icon="Send"
    />

    <template v-else>
      <section class="respond-stats" aria-label="Resumen de participacion">
        <article class="stat-tile stat-green">
          <div class="stat-icon">
            <CheckCircle2 :size="22" />
          </div>
          <div>
            <span>Disponibles</span>
            <strong>{{ readyRows.length }}</strong>
          </div>
        </article>
        <article class="stat-tile stat-blue">
          <div class="stat-icon">
            <Clock :size="22" />
          </div>
          <div>
            <span>Recientes</span>
            <strong>{{ recentReadyCount }}</strong>
          </div>
        </article>
        <article class="stat-tile stat-amber">
          <div class="stat-icon">
            <Users :size="22" />
          </div>
          <div>
            <span>Participaciones</span>
            <strong>{{ totalParticipants }}</strong>
          </div>
        </article>
        <article class="stat-tile stat-rose">
          <div class="stat-icon">
            <AlertTriangle :size="22" />
          </div>
          <div>
            <span>No listas</span>
            <strong>{{ notReadyRows.length }}</strong>
          </div>
        </article>
      </section>

      <section class="respond-toolbar">
        <label class="field respond-search">
          <span>Buscar encuesta</span>
          <div>
            <Search :size="18" />
            <input v-model="search" type="search" placeholder="Buscar por titulo o descripcion" />
          </div>
        </label>

        <label class="field">
          <span>Disponibilidad</span>
          <select v-model="availabilityFilter">
            <option v-for="option in availabilityOptions" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>

        <label class="field">
          <span>Fecha</span>
          <select v-model="dateFilter">
            <option v-for="option in dateOptions" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>

        <label class="field">
          <span>Ordenar</span>
          <select v-model="sortMode">
            <option value="recent">Mas recientes</option>
            <option value="title">Titulo A-Z</option>
            <option value="participants">Mas respondidas</option>
          </select>
        </label>

        <button class="secondary-button compact respond-reset" type="button" @click="resetFilters">
          <span>Limpiar</span>
        </button>
      </section>

      <section class="respond-panel">
        <div class="section-heading respond-heading">
          <div>
            <h2>Encuestas para responder</h2>
            <p>{{ visibleRangeLabel }}</p>
          </div>
          <span class="count-pill">{{ readyRows.length }} disponibles</span>
        </div>

        <div v-if="sortedRows.length === 0" class="respond-empty-filter">
          <Search :size="32" />
          <h3>Sin resultados</h3>
          <p>No hay encuestas que coincidan con los filtros actuales.</p>
          <button class="secondary-button compact" type="button" @click="resetFilters">
            <span>Limpiar filtros</span>
          </button>
        </div>

        <template v-else>
          <div class="respond-grid">
            <article v-for="row in paginatedRows" :key="row.survey.id" class="respond-card">
              <div class="respond-card-header">
                <span class="status-badge" :class="getAvailabilityClass(row)">{{ getAvailabilityLabel(row) }}</span>
                <small>{{ formatDate(row.survey.surCreationDate) }}</small>
              </div>

              <div class="respond-card-body">
                <h3>{{ row.survey.surTitle }}</h3>
                <p>{{ row.survey.surDescription || 'Sin descripcion' }}</p>
              </div>

              <div class="respond-card-meta">
                <span>{{ row.questionCount }} preguntas</span>
                <span>{{ row.participantCount }} participaciones</span>
              </div>

              <p class="respond-card-note">{{ getAvailabilityReason(row) }}</p>

              <div class="respond-card-actions">
                <RouterLink v-if="row.isReady" class="primary-button compact" :to="`/s/${row.survey.id}`">
                  <Send :size="17" />
                  <span>Responder</span>
                </RouterLink>
                <button v-else class="secondary-button compact" type="button" disabled>
                  <AlertTriangle :size="17" />
                  <span>No disponible</span>
                </button>
                <RouterLink class="icon-button" :to="`/s/${row.survey.id}`" title="Abrir encuesta">
                  <ExternalLink :size="17" />
                </RouterLink>
              </div>
            </article>
          </div>

          <div class="respond-pagination">
            <span>{{ visibleRangeLabel }}</span>
            <label>
              <select v-model.number="pageSize">
                <option :value="6">6 por pagina</option>
                <option :value="9">9 por pagina</option>
                <option :value="12">12 por pagina</option>
              </select>
            </label>
            <div>
              <button class="secondary-button compact" type="button" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">
                Anterior
              </button>
              <button
                v-for="page in pageNumbers"
                :key="page"
                class="icon-button respond-page"
                :class="{ active: page === currentPage }"
                type="button"
                @click="goToPage(page)"
              >
                {{ page }}
              </button>
              <button class="secondary-button compact" type="button" :disabled="currentPage === totalPages" @click="goToPage(currentPage + 1)">
                Siguiente
              </button>
            </div>
          </div>
        </template>
      </section>
    </template>
  </main>
</template>
