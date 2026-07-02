<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  Clock,
  ExternalLink,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  Wand2,
} from 'lucide-vue-next';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog.vue';
import { getApiMessage } from '@/api/http';
import { getSurveyAnswersByClient } from '@/api/reportApi';
import { getSurveyForClient } from '@/api/publicSurveyApi';
import { deleteSurvey, getSurveys } from '@/api/surveyApi';
import type { PublicSurvey, Survey, SurveyClientAnswers } from '@/types/api';

type SurveyStatus = 'Borrador' | 'Requiere atencion' | 'Publicada' | 'Con resultados';
type StatusFilter = SurveyStatus | 'Todas';
type DateFilter = 'Todas' | 'Este mes' | 'Ultimos 7 dias';
type SortMode = 'recent' | 'title' | 'participants';

interface SurveyManagerRow {
  survey: Survey;
  publicSurvey: PublicSurvey | null;
  answers: SurveyClientAnswers[];
  questionCount: number;
  issueCount: number;
  participantCount: number;
  status: SurveyStatus;
  reason: string;
}

const surveys = ref<Survey[]>([]);
const surveyRows = ref<SurveyManagerRow[]>([]);
const loading = ref(true);
const error = ref('');
const success = ref('');
const surveyPendingDelete = ref<SurveyManagerRow | null>(null);
const deletingSurvey = ref(false);
const search = ref('');
const statusFilter = ref<StatusFilter>('Todas');
const dateFilter = ref<DateFilter>('Todas');
const sortMode = ref<SortMode>('recent');
const pageSize = ref(10);
const currentPage = ref(1);

const statusOptions: StatusFilter[] = ['Todas', 'Borrador', 'Requiere atencion', 'Publicada', 'Con resultados'];
const dateOptions: DateFilter[] = ['Todas', 'Este mes', 'Ultimos 7 dias'];

const filteredRows = computed(() => {
  const normalizedSearch = search.value.trim().toLowerCase();

  return surveyRows.value.filter((row) => {
    const matchesSearch =
      !normalizedSearch ||
      row.survey.surTitle.toLowerCase().includes(normalizedSearch) ||
      row.survey.surDescription.toLowerCase().includes(normalizedSearch) ||
      row.survey.surCreatedBy.toLowerCase().includes(normalizedSearch);
    const matchesStatus = statusFilter.value === 'Todas' || row.status === statusFilter.value;
    const matchesDate = matchesDateFilter(row.survey.surCreationDate);

    return matchesSearch && matchesStatus && matchesDate;
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
const draftCount = computed(() => surveyRows.value.filter((row) => row.status === 'Borrador').length);
const attentionCount = computed(() => surveyRows.value.filter((row) => row.status === 'Requiere atencion').length);
const publishedCount = computed(() => surveyRows.value.filter((row) => row.status === 'Publicada').length);
const withResultsCount = computed(() => surveyRows.value.filter((row) => row.status === 'Con resultados').length);
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

watch([search, statusFilter, dateFilter, sortMode, pageSize], () => {
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

function getStatus(row: Pick<SurveyManagerRow, 'questionCount' | 'issueCount' | 'participantCount'>): SurveyStatus {
  if (row.questionCount === 0) {
    return 'Borrador';
  }

  if (row.issueCount > 0) {
    return 'Requiere atencion';
  }

  if (row.participantCount > 0) {
    return 'Con resultados';
  }

  return 'Publicada';
}

function getReason(row: Pick<SurveyManagerRow, 'status' | 'questionCount' | 'issueCount' | 'participantCount'>) {
  if (row.status === 'Borrador') {
    return 'Falta agregar preguntas.';
  }

  if (row.status === 'Requiere atencion') {
    return `${row.issueCount} pregunta${row.issueCount === 1 ? '' : 's'} necesita revisar opciones.`;
  }

  if (row.status === 'Con resultados') {
    return `${row.participantCount} participante${row.participantCount === 1 ? '' : 's'} respondieron.`;
  }

  return 'Lista para compartir.';
}

function getStatusClass(status: SurveyStatus) {
  if (status === 'Borrador') {
    return 'status-draft';
  }

  if (status === 'Requiere atencion') {
    return 'status-attention';
  }

  if (status === 'Con resultados') {
    return 'status-results';
  }

  return 'status-published';
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
  statusFilter.value = 'Todas';
  dateFilter.value = 'Todas';
  sortMode.value = 'recent';
  pageSize.value = 10;
}

async function buildSurveyRow(survey: Survey): Promise<SurveyManagerRow> {
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
  const participantCount = answers.length;
  const status = getStatus({ questionCount, issueCount, participantCount });

  return {
    survey,
    publicSurvey,
    answers,
    questionCount,
    issueCount,
    participantCount,
    status,
    reason: getReason({ status, questionCount, issueCount, participantCount }),
  };
}

async function loadSurveys() {
  loading.value = true;
  error.value = '';

  try {
    const response = await getSurveys();
    surveys.value = response.data ?? [];
    surveyRows.value = await Promise.all(surveys.value.map(buildSurveyRow));
  } catch {
    error.value = 'No se pudieron cargar las encuestas';
  } finally {
    loading.value = false;
  }
}

function removeSurvey(row: SurveyManagerRow) {
  surveyPendingDelete.value = row;
}

function cancelSurveyDeletion() {
  if (!deletingSurvey.value) {
    surveyPendingDelete.value = null;
  }
}

async function confirmSurveyDeletion() {
  const row = surveyPendingDelete.value;

  if (!row) {
    return;
  }

  deletingSurvey.value = true;
  error.value = '';
  success.value = '';

  try {
    await deleteSurvey(row.survey.id);
    surveyPendingDelete.value = null;
    await loadSurveys();
    success.value = 'Encuesta eliminada correctamente';
  } catch (err) {
    error.value = getApiMessage(err);
  } finally {
    deletingSurvey.value = false;
  }
}

onMounted(loadSurveys);
</script>

<template>
  <main class="page">
    <ConfirmDeleteDialog
      :open="surveyPendingDelete !== null"
      title="¿Eliminar esta encuesta?"
      :item-name="surveyPendingDelete?.survey.surTitle ?? ''"
      :loading="deletingSurvey"
      @cancel="cancelSurveyDeletion"
      @confirm="confirmSurveyDeletion"
    />

    <PageHeader title="Mis encuestas" eyebrow="Gestion" description="Gestiona, comparte y revisa tus encuestas">
      <div class="header-actions">
        <RouterLink class="secondary-button compact" to="/surveys/generate">
          <Wand2 :size="18" />
          <span>IA</span>
        </RouterLink>
        <RouterLink class="primary-button compact" to="/surveys/new">
          <Plus :size="18" />
          <span>Nueva encuesta</span>
        </RouterLink>
      </div>
    </PageHeader>

    <p v-if="error" class="inline-error">{{ error }}</p>
    <p v-if="success" class="form-success">{{ success }}</p>

    <div v-if="loading" class="loading-row">Cargando...</div>

    <EmptyState
      v-else-if="surveys.length === 0"
      title="Sin encuestas"
      text="Crea la primera encuesta del sistema"
      :icon="ClipboardList"
    >
      <div class="header-actions">
        <RouterLink class="secondary-button compact" to="/surveys/generate">
          <Wand2 :size="18" />
          <span>Generar con IA</span>
        </RouterLink>
        <RouterLink class="primary-button compact" to="/surveys/new">
          <Plus :size="18" />
          <span>Nueva encuesta</span>
        </RouterLink>
      </div>
    </EmptyState>

    <template v-else>
      <section class="survey-stats" aria-label="Resumen de encuestas">
        <article class="stat-tile stat-green">
          <div class="stat-icon">
            <ClipboardList :size="22" />
          </div>
          <div>
            <span>Total encuestas</span>
            <strong>{{ surveys.length }}</strong>
          </div>
        </article>
        <article class="stat-tile stat-amber">
          <div class="stat-icon">
            <Clock :size="22" />
          </div>
          <div>
            <span>Borradores</span>
            <strong>{{ draftCount }}</strong>
          </div>
        </article>
        <article class="stat-tile stat-rose">
          <div class="stat-icon">
            <AlertTriangle :size="22" />
          </div>
          <div>
            <span>Por revisar</span>
            <strong>{{ attentionCount }}</strong>
          </div>
        </article>
        <article class="stat-tile stat-blue">
          <div class="stat-icon">
            <Users :size="22" />
          </div>
          <div>
            <span>Con resultados</span>
            <strong>{{ withResultsCount }}</strong>
          </div>
        </article>
      </section>

      <section class="survey-toolbar">
        <label class="field survey-search">
          <span>Buscar encuesta</span>
          <div>
            <Search :size="18" />
            <input v-model="search" type="search" placeholder="Titulo, descripcion o creador" />
          </div>
        </label>

        <label class="field">
          <span>Estado</span>
          <select v-model="statusFilter">
            <option v-for="option in statusOptions" :key="option" :value="option">{{ option }}</option>
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
            <option value="participants">Mas participantes</option>
          </select>
        </label>

        <button class="secondary-button compact survey-reset" type="button" @click="resetFilters">
          <span>Limpiar</span>
        </button>
      </section>

      <section class="table-shell survey-table">
        <div class="section-heading survey-table-heading">
          <div>
            <h2>Listado de encuestas</h2>
            <p>{{ visibleRangeLabel }}</p>
          </div>
          <span class="count-pill">{{ publishedCount }} publicadas</span>
        </div>

        <div v-if="sortedRows.length === 0" class="survey-empty-filter">
          <Search :size="32" />
          <h3>Sin resultados</h3>
          <p>No hay encuestas que coincidan con los filtros actuales.</p>
          <button class="secondary-button compact" type="button" @click="resetFilters">
            <span>Limpiar filtros</span>
          </button>
        </div>

        <template v-else>
          <table>
            <thead>
              <tr>
                <th>Encuesta</th>
                <th>Estado</th>
                <th>Preguntas</th>
                <th>Participantes</th>
                <th>Fecha</th>
                <th class="action-column">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in paginatedRows" :key="row.survey.id">
                <td>
                  <div class="survey-name-cell">
                    <strong>{{ row.survey.surTitle }}</strong>
                    <span>{{ row.survey.surDescription || 'Sin descripcion' }}</span>
                    <small>Creado por {{ row.survey.surCreatedBy }}</small>
                  </div>
                </td>
                <td>
                  <div class="survey-status-cell">
                    <span class="status-badge" :class="getStatusClass(row.status)">{{ row.status }}</span>
                    <small>{{ row.reason }}</small>
                  </div>
                </td>
                <td>
                  <span class="survey-metric">{{ row.questionCount }}</span>
                </td>
                <td>
                  <span class="survey-metric">{{ row.participantCount }}</span>
                </td>
                <td>{{ formatDate(row.survey.surCreationDate) }}</td>
                <td>
                  <div class="row-actions survey-actions">
                    <RouterLink class="icon-button" :to="`/surveys/${row.survey.id}/builder`" title="Constructor">
                      <Wand2 :size="17" />
                    </RouterLink>
                    <RouterLink class="icon-button" :to="`/s/${row.survey.id}`" title="Vista publica">
                      <ExternalLink :size="17" />
                    </RouterLink>
                    <RouterLink class="icon-button" :to="{ name: 'reports', query: { surveyId: row.survey.id } }" title="Reportes">
                      <BarChart3 :size="17" />
                    </RouterLink>
                    <RouterLink class="icon-button" :to="`/surveys/${row.survey.id}/edit`" title="Editar">
                      <Pencil :size="17" />
                    </RouterLink>
                    <button class="icon-button danger" type="button" title="Eliminar" @click="removeSurvey(row)">
                      <Trash2 :size="17" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <div class="survey-pagination">
            <span>{{ visibleRangeLabel }}</span>
            <label>
              <select v-model.number="pageSize">
                <option :value="5">5 por pagina</option>
                <option :value="10">10 por pagina</option>
                <option :value="20">20 por pagina</option>
              </select>
            </label>
            <div>
              <button class="secondary-button compact" type="button" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">
                Anterior
              </button>
              <button
                v-for="page in pageNumbers"
                :key="page"
                class="icon-button survey-page"
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
