<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  PieChart,
  Search,
  Send,
  Share2,
} from 'lucide-vue-next';
import Chart from 'primevue/chart';
import PageHeader from '@/components/PageHeader.vue';
import StatTile from '@/components/StatTile.vue';
import { getSurveyForClient } from '@/api/publicSurveyApi';
import { getQuestions } from '@/api/questionApi';
import { getSurveyAnswersByClient } from '@/api/reportApi';
import { getSurveys } from '@/api/surveyApi';
import type { PublicSurvey, Question, Survey, SurveyClientAnswers } from '@/types/api';

type DashboardStatus = 'Borrador' | 'Requiere atencion' | 'Publicada' | 'Con resultados';
type StatusFilter = DashboardStatus | 'Todas';
type DateFilter = 'Todas' | 'Este mes' | 'Ultimos 7 dias';

interface SurveyDashboardRow {
  survey: Survey;
  publicSurvey: PublicSurvey | null;
  answers: SurveyClientAnswers[];
  questionCount: number;
  issueCount: number;
  participantCount: number;
  answerCount: number;
  status: DashboardStatus;
  reason: string;
  actionLabel: string;
  actionTo: string | { name: string; query?: Record<string, number> };
}

const surveys = ref<Survey[]>([]);
const questions = ref<Question[]>([]);
const surveyRows = ref<SurveyDashboardRow[]>([]);
const route = useRoute();
const loading = ref(true);
const error = ref('');
const statusFilter = ref<StatusFilter>('Todas');
const dateFilter = ref<DateFilter>('Todas');
const searchQuery = ref('');

const statusOptions: StatusFilter[] = ['Todas', 'Borrador', 'Requiere atencion', 'Publicada', 'Con resultados'];
const dateOptions: DateFilter[] = ['Todas', 'Este mes', 'Ultimos 7 dias'];

function getStatusFromQuery(): StatusFilter {
  const rawStatus = Array.isArray(route.query.status) ? route.query.status[0] : route.query.status;

  return statusOptions.includes(rawStatus as StatusFilter) ? (rawStatus as StatusFilter) : 'Todas';
}

const filteredRows = computed(() => {
  const normalizedSearch = searchQuery.value.trim().toLowerCase();

  return surveyRows.value.filter((row) => {
    const matchesStatus = statusFilter.value === 'Todas' || row.status === statusFilter.value;
    const matchesSearch =
      !normalizedSearch ||
      row.survey.surTitle.toLowerCase().includes(normalizedSearch) ||
      row.survey.surCreatedBy.toLowerCase().includes(normalizedSearch);
    const matchesDate = matchesDateFilter(row.survey.surCreationDate);

    return matchesStatus && matchesSearch && matchesDate;
  });
});

const latestRows = computed(() =>
  [...filteredRows.value]
    .sort((current, next) => {
      const currentDate = new Date(current.survey.surCreationDate).getTime();
      const nextDate = new Date(next.survey.surCreationDate).getTime();

      if (currentDate === nextDate) {
        return next.survey.id - current.survey.id;
      }

      return nextDate - currentDate;
    })
    .slice(0, 8),
);

const totalResponses = computed(() => surveyRows.value.reduce((total, row) => total + row.answerCount, 0));
const totalParticipants = computed(() => surveyRows.value.reduce((total, row) => total + row.participantCount, 0));
const draftCount = computed(() => surveyRows.value.filter((row) => row.status === 'Borrador').length);
const attentionCount = computed(() => surveyRows.value.filter((row) => row.status === 'Requiere atencion').length);
const publishedCount = computed(() => surveyRows.value.filter((row) => row.status === 'Publicada').length);
const withResultsCount = computed(() => surveyRows.value.filter((row) => row.status === 'Con resultados').length);

const recommendedActions = computed(() =>
  surveyRows.value
    .filter((row) => row.status !== 'Publicada' || row.participantCount === 0)
    .sort((current, next) => getRecommendationPriority(current) - getRecommendationPriority(next))
    .slice(0, 5),
);

const statusChartData = computed(() => ({
  labels: ['Borrador', 'Requiere atencion', 'Publicada', 'Con resultados'],
  datasets: [
    {
      data: [draftCount.value, attentionCount.value, publishedCount.value, withResultsCount.value],
      backgroundColor: ['#d97706', '#be123c', '#0f766e', '#2563eb'],
      borderWidth: 0,
    },
  ],
}));

const responseChartRows = computed(() =>
  [...surveyRows.value]
    .sort((current, next) => next.participantCount - current.participantCount)
    .slice(0, 6),
);

const responsesChartData = computed(() => ({
  labels: responseChartRows.value.map((row) => row.survey.surTitle),
  datasets: [
    {
      label: 'Participantes',
      data: responseChartRows.value.map((row) => row.participantCount),
      backgroundColor: '#0f766e',
      borderRadius: 8,
    },
  ],
}));

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom',
    },
  },
}));

const barOptions = computed(() => ({
  ...chartOptions.value,
  scales: {
    y: {
      beginAtZero: true,
      ticks: {
        precision: 0,
      },
    },
  },
}));

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

function getConfiguredQuestions(publicSurvey: PublicSurvey | null) {
  return publicSurvey?.questionListResponses ?? [];
}

function getIssueCount(publicSurvey: PublicSurvey | null) {
  return getConfiguredQuestions(publicSurvey).filter((question) => (question.responsesQuestion?.length ?? 0) === 0).length;
}

function getStatus(row: Pick<SurveyDashboardRow, 'questionCount' | 'issueCount' | 'participantCount'>): DashboardStatus {
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

function getReason(row: Pick<SurveyDashboardRow, 'status' | 'questionCount' | 'issueCount' | 'participantCount'>) {
  if (row.status === 'Borrador') {
    return 'Falta agregar preguntas para continuar.';
  }

  if (row.status === 'Requiere atencion') {
    return `${row.issueCount} pregunta${row.issueCount === 1 ? '' : 's'} necesita completar opciones o registro interno.`;
  }

  if (row.status === 'Con resultados') {
    return `${row.participantCount} participante${row.participantCount === 1 ? '' : 's'} respondieron esta encuesta.`;
  }

  return 'Lista para compartir y recibir respuestas.';
}

function getAction(row: Pick<SurveyDashboardRow, 'survey' | 'status' | 'participantCount'>) {
  if (row.status === 'Borrador') {
    return {
      label: 'Agregar preguntas',
      to: `/surveys/${row.survey.id}/builder`,
    };
  }

  if (row.status === 'Requiere atencion') {
    return {
      label: 'Completar opciones',
      to: `/surveys/${row.survey.id}/builder`,
    };
  }

  if (row.status === 'Con resultados') {
    return {
      label: 'Ver resultados',
      to: { name: 'reports', query: { surveyId: row.survey.id } },
    };
  }

  return {
    label: row.participantCount > 0 ? 'Ver resultados' : 'Compartir encuesta',
    to: `/s/${row.survey.id}`,
  };
}

function getRecommendationPriority(row: SurveyDashboardRow) {
  if (row.status === 'Borrador') {
    return 1;
  }

  if (row.status === 'Requiere atencion') {
    return 2;
  }

  if (row.status === 'Publicada' && row.participantCount === 0) {
    return 3;
  }

  return 4;
}

function getStatusTone(status: DashboardStatus) {
  if (status === 'Borrador') {
    return 'draft';
  }

  if (status === 'Requiere atencion') {
    return 'attention';
  }

  if (status === 'Con resultados') {
    return 'results';
  }

  return 'published';
}

function getRecommendationIcon(status: DashboardStatus) {
  if (status === 'Borrador') {
    return FileText;
  }

  if (status === 'Requiere atencion') {
    return AlertTriangle;
  }

  if (status === 'Con resultados') {
    return BarChart3;
  }

  return Share2;
}

async function buildSurveyRow(survey: Survey): Promise<SurveyDashboardRow> {
  const [configurationResponse, answersResponse] = await Promise.allSettled([
    getSurveyForClient(survey.id),
    getSurveyAnswersByClient(survey.id),
  ]);
  const publicSurvey =
    configurationResponse.status === 'fulfilled' && configurationResponse.value.success
      ? configurationResponse.value.data
      : null;
  const answers = answersResponse.status === 'fulfilled' && answersResponse.value.success ? answersResponse.value.data ?? [] : [];
  const questionCount = getConfiguredQuestions(publicSurvey).length;
  const issueCount = getIssueCount(publicSurvey);
  const participantCount = answers.length;
  const answerCount = answers.reduce((total, client) => total + (client.parametersRespondeds?.length ?? 0), 0);
  const status = getStatus({ questionCount, issueCount, participantCount });
  const action = getAction({ survey, status, participantCount });

  return {
    survey,
    publicSurvey,
    answers,
    questionCount,
    issueCount,
    participantCount,
    answerCount,
    status,
    reason: getReason({ status, questionCount, issueCount, participantCount }),
    actionLabel: action.label,
    actionTo: action.to,
  };
}

async function loadData() {
  loading.value = true;
  error.value = '';

  try {
    const [surveyResponse, questionResponse] = await Promise.all([getSurveys(), getQuestions()]);
    surveys.value = surveyResponse.data ?? [];
    questions.value = questionResponse.data ?? [];
    surveyRows.value = await Promise.all(surveys.value.map(buildSurveyRow));
  } catch {
    error.value = 'No se pudo cargar el dashboard';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  statusFilter.value = getStatusFromQuery();
  loadData();
});

watch(
  () => route.query.status,
  () => {
    statusFilter.value = getStatusFromQuery();
  },
);
</script>

<template>
  <main class="page">
    <PageHeader title="Dashboard" eyebrow="Panel principal" description="Resumen, pendientes y siguientes acciones">
      <RouterLink class="primary-button compact" to="/surveys/new">
        <ClipboardCheck :size="18" />
        <span>Crear encuesta</span>
      </RouterLink>
    </PageHeader>

    <p v-if="error" class="inline-error">{{ error }}</p>

    <section class="stats-grid dashboard-stats" aria-label="Indicadores">
      <StatTile label="Total encuestas" :value="loading ? '...' : surveys.length" tone="green" :icon="ClipboardList" />
      <StatTile label="Borrador" :value="loading ? '...' : draftCount" tone="amber" :icon="Clock" />
      <StatTile label="Requieren atencion" :value="loading ? '...' : attentionCount" tone="rose" :icon="AlertTriangle" />
      <StatTile label="Publicadas" :value="loading ? '...' : publishedCount" tone="green" :icon="CheckCircle2" />
      <StatTile label="Participantes" :value="loading ? '...' : totalParticipants" tone="blue" :icon="Send" />
      <StatTile label="Preguntas" :value="loading ? '...' : questions.length" tone="blue" :icon="FileText" />
    </section>

    <div v-if="loading" class="loading-row">Cargando dashboard...</div>

    <template v-else>
      <section v-if="surveys.length === 0" class="empty-state dashboard-empty">
        <ClipboardList :size="42" />
        <h2>No hay encuestas creadas todavia</h2>
        <p>Cree su primera encuesta para comenzar a recopilar informacion.</p>
        <RouterLink class="primary-button compact" to="/surveys/new">
          <ClipboardCheck :size="18" />
          <span>Crear encuesta</span>
        </RouterLink>
      </section>

      <template v-else>
        <section class="content-section dashboard-actions">
          <div class="section-heading">
            <h2>Acciones recomendadas</h2>
            <span class="count-pill">{{ recommendedActions.length }}</span>
          </div>

          <div v-if="recommendedActions.length === 0" class="panel-empty compact-panel">
            <CheckCircle2 :size="32" />
            <strong>No hay pendientes por ahora</strong>
          </div>

          <div v-else class="recommendation-list">
            <article v-for="row in recommendedActions" :key="row.survey.id" class="recommendation-item">
              <div class="recommendation-icon" :class="`status-${getStatusTone(row.status)}`">
                <component :is="getRecommendationIcon(row.status)" :size="20" />
              </div>
              <div>
                <strong>{{ row.survey.surTitle }}</strong>
                <span>{{ row.reason }}</span>
              </div>
              <RouterLink class="secondary-button compact" :to="row.actionTo">
                <span>{{ row.actionLabel }}</span>
              </RouterLink>
            </article>
          </div>
        </section>

        <section class="reports-grid dashboard-chart-grid">
          <article class="chart-panel">
            <div class="section-heading">
              <h2>Estado de encuestas</h2>
              <PieChart :size="20" />
            </div>
            <div class="chart-box">
              <Chart type="doughnut" :data="statusChartData" :options="chartOptions" />
            </div>
          </article>

          <article class="chart-panel">
            <div class="section-heading">
              <h2>Respuestas por encuesta</h2>
              <BarChart3 :size="20" />
            </div>
            <div v-if="responseChartRows.length > 0" class="chart-box">
              <Chart type="bar" :data="responsesChartData" :options="barOptions" />
            </div>
            <div v-else class="panel-empty">
              <BarChart3 :size="32" />
              <strong>Todavia no existen respuestas</strong>
            </div>
          </article>
        </section>

        <section class="content-section">
          <div class="section-heading">
            <h2>Encuestas recientes</h2>
            <RouterLink to="/surveys">Ver todas</RouterLink>
          </div>

          <div class="dashboard-filters">
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
            <label class="field dashboard-search">
              <span>Buscar encuesta</span>
              <div>
                <Search :size="17" />
                <input v-model="searchQuery" type="search" placeholder="Titulo o creador" />
              </div>
            </label>
          </div>

          <div class="table-shell">
            <table>
              <thead>
                <tr>
                  <th>Encuesta</th>
                  <th>Estado</th>
                  <th>Preguntas</th>
                  <th>Participantes</th>
                  <th>Fecha</th>
                  <th class="action-column">Accion</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in latestRows" :key="row.survey.id">
                  <td>
                    <strong>{{ row.survey.surTitle }}</strong>
                    <span class="table-help">{{ row.reason }}</span>
                  </td>
                  <td>
                    <span class="status-badge" :class="`status-${getStatusTone(row.status)}`">{{ row.status }}</span>
                  </td>
                  <td>{{ row.questionCount }}</td>
                  <td>{{ row.participantCount }}</td>
                  <td>{{ new Date(row.survey.surCreationDate).toLocaleDateString() }}</td>
                  <td>
                    <div class="row-actions">
                      <RouterLink class="primary-button compact" :to="row.actionTo">
                        <span>{{ row.actionLabel }}</span>
                      </RouterLink>
                    </div>
                  </td>
                </tr>
                <tr v-if="latestRows.length === 0">
                  <td colspan="6">No hay encuestas con esos filtros</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </template>
  </main>
</template>
