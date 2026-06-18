<script setup lang="ts">
import * as XLSX from 'xlsx-js-style';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Download,
  Eraser,
  FileSpreadsheet,
  FileText,
  Filter,
  PieChart,
  RefreshCw,
  SlidersHorizontal,
  Table2,
  UserRound,
  Users,
} from 'lucide-vue-next';
import PageHeader from '@/components/PageHeader.vue';
import { getApiMessage } from '@/api/http';
import { getSurveyForClient } from '@/api/publicSurveyApi';
import { getSurveyAnswersByClient } from '@/api/reportApi';
import { getSurveys } from '@/api/surveyApi';
import type { PublicSurvey, Survey, SurveyClientAnswers } from '@/types/api';

interface QuestionRow {
  id: number;
  question: string;
  responseType: string;
  options: number;
}

interface ReportRow {
  id: number;
  question: string;
  option: string;
  total: number;
  percent: number;
}

interface ClientReportRow {
  id: number;
  userName: string;
  answers: Array<{ question: string; answer: string }>;
  answerCount: number;
}

interface SummaryQuestionGroup {
  question: string;
  total: number;
  rows: ReportRow[];
}

type ExcelCellValue = string | number;
type ExcelRow = ExcelCellValue[];

const route = useRoute();

const surveys = ref<Survey[]>([]);
const selectedSurveyId = ref<number | ''>('');
const publicSurvey = ref<PublicSurvey | null>(null);
const answersByClient = ref<SurveyClientAnswers[]>([]);
const loading = ref(true);
const loadingConfig = ref(false);
const error = ref('');
const configError = ref('');
const reportError = ref('');
const selectedParticipant = ref('Todos');
const startDate = ref('');
const endDate = ref('');
const advancedFiltersOpen = ref(false);
const minimumAnswers = ref(0);
const summarySort = ref<'total' | 'question'>('total');
const selectedChartQuestion = ref('');
const chartColors = ['#0f766e', '#2563eb', '#f59e0b', '#e11d48', '#7c3aed', '#0891b2', '#65a30d', '#475569'];

const selectedSurvey = computed(() => surveys.value.find((survey) => survey.id === selectedSurveyId.value) ?? null);
const participantOptions = computed(() => [
  'Todos',
  ...Array.from(new Set(answersByClient.value.map((client) => client.userName || 'Usuario sin nombre'))).sort((first, second) =>
    first.localeCompare(second),
  ),
]);
const questionRows = computed<QuestionRow[]>(() =>
  (publicSurvey.value?.questionListResponses ?? []).map((question) => ({
    id: question.idQuestion,
    question: question.nameQuestion,
    responseType: question.responseType ?? `Tipo ${question.responseTypeId ?? 'sin configurar'}`,
    options: question.responsesQuestion?.length ?? 0,
  })),
);
const selectedSurveyInDateRange = computed(() => {
  if (!selectedSurvey.value) {
    return true;
  }

  const createdAt = toDateInputValue(selectedSurvey.value.surCreationDate);
  const afterStart = !startDate.value || createdAt >= startDate.value;
  const beforeEnd = !endDate.value || createdAt <= endDate.value;

  return afterStart && beforeEnd;
});
const filteredAnswersByClient = computed(() => {
  if (!selectedSurveyInDateRange.value) {
    return [];
  }

  return answersByClient.value.filter((client) => {
    const userName = client.userName || 'Usuario sin nombre';
    const matchesParticipant = selectedParticipant.value === 'Todos' || userName === selectedParticipant.value;
    const answerCount = client.parametersRespondeds?.length ?? 0;

    return matchesParticipant && answerCount >= minimumAnswers.value;
  });
});
const resultRows = computed<ReportRow[]>(() => {
  const totalsByQuestion = new Map<string, number>();
  const totalsByAnswer = new Map<string, { question: string; option: string; total: number }>();

  filteredAnswersByClient.value.forEach((client) => {
    (client.parametersRespondeds ?? []).forEach((answer) => {
      const question = answer.questionName || 'Pregunta sin nombre';
      const option = answer.questionAnswer || 'Sin respuesta';
      const key = `${question}::${option}`;

      totalsByQuestion.set(question, (totalsByQuestion.get(question) ?? 0) + 1);

      const current = totalsByAnswer.get(key);
      totalsByAnswer.set(key, {
        question,
        option,
        total: (current?.total ?? 0) + 1,
      });
    });
  });

  const rows = Array.from(totalsByAnswer.values()).map((row, index) => {
    const questionTotal = totalsByQuestion.get(row.question) || row.total;

    return {
      id: index + 1,
      question: row.question,
      option: row.option,
      total: row.total,
      percent: Math.round((row.total / questionTotal) * 100),
    };
  });

  return rows.sort((firstRow, secondRow) => {
    if (summarySort.value === 'question') {
      return firstRow.question.localeCompare(secondRow.question);
    }

    return secondRow.total - firstRow.total;
  });
});
const questionDistributionRows = computed(() =>
  resultRows.value
    .filter((row) => row.question === selectedChartQuestion.value)
    .sort((firstRow, secondRow) => secondRow.total - firstRow.total),
);
const questionDistributionTotal = computed(() => questionDistributionRows.value.reduce((total, row) => total + row.total, 0));
const questionTopOption = computed(() => questionDistributionRows.value[0] ?? null);
const questionDistributionLegend = computed(() =>
  questionDistributionRows.value.map((row, index) => ({
    ...row,
    color: chartColors[index % chartColors.length],
    percent: getQuestionDistributionPercent(row.total),
  })),
);
const questionDistributionChartStyle = computed(() => {
  if (questionDistributionTotal.value === 0) {
    return {};
  }

  let start = 0;
  const segments = questionDistributionRows.value.map((row, index) => {
    const end = start + (row.total / questionDistributionTotal.value) * 100;
    const segment = `${chartColors[index % chartColors.length]} ${start}% ${end}%`;
    start = end;
    return segment;
  });

  return { background: `conic-gradient(${segments.join(', ')})` };
});
const clientRows = computed<ClientReportRow[]>(() =>
  filteredAnswersByClient.value.map((client, index) => ({
    id: index + 1,
    userName: client.userName || 'Usuario sin nombre',
    answers: (client.parametersRespondeds ?? []).map((answer) => ({
      question: answer.questionName || 'Pregunta sin nombre',
      answer: answer.questionAnswer || 'Sin respuesta',
    })),
    answerCount: client.parametersRespondeds?.length ?? 0,
  })),
);
const totalResponses = computed(() => resultRows.value.reduce((total, row) => total + row.total, 0));
const totalParticipants = computed(() => filteredAnswersByClient.value.length);
const totalPossibleAnswers = computed(() => Math.max(totalParticipants.value * questionRows.value.length, 0));
const answerCoverage = computed(() => {
  if (totalPossibleAnswers.value === 0) {
    return 0;
  }

  return Math.min(100, Math.round((totalResponses.value / totalPossibleAnswers.value) * 100));
});
const hasResults = computed(() => resultRows.value.length > 0);
const hasQuestionDistribution = computed(() => questionDistributionRows.value.length > 0);
const summaryQuestionGroups = computed<SummaryQuestionGroup[]>(() => {
  const groups = new Map<string, SummaryQuestionGroup>();

  resultRows.value.forEach((row) => {
    const group = groups.get(row.question) ?? {
      question: row.question,
      total: 0,
      rows: [],
    };

    group.total += row.total;
    group.rows.push(row);
    groups.set(row.question, group);
  });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      rows: [...group.rows].sort((firstRow, secondRow) => secondRow.total - firstRow.total),
    }))
    .sort((firstGroup, secondGroup) => {
      if (summarySort.value === 'question') {
        return firstGroup.question.localeCompare(secondGroup.question);
      }

      return secondGroup.total - firstGroup.total;
    });
});
const frequentRows = computed(() => [...resultRows.value].sort((firstRow, secondRow) => secondRow.total - firstRow.total).slice(0, 6));
const frequentMaxTotal = computed(() => Math.max(...frequentRows.value.map((row) => row.total), 1));

watch(selectedSurvey, (survey) => {
  if (!survey) {
    return;
  }

  startDate.value = toDateInputValue(survey.surCreationDate);
  endDate.value = toDateInputValue(new Date().toISOString());
});

watch(selectedSurveyId, () => {
  selectedParticipant.value = 'Todos';
  loadSurveyConfiguration();
});

watch(
  questionRows,
  (rows) => {
    if (rows.length === 0) {
      selectedChartQuestion.value = '';
      return;
    }

    if (!rows.some((row) => row.question === selectedChartQuestion.value)) {
      selectedChartQuestion.value = rows[0].question;
    }
  },
  { immediate: true },
);

function toDateInputValue(dateValue: string) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toISOString().slice(0, 10);
}

function getRequestedSurveyId() {
  const rawSurveyId = Array.isArray(route.query.surveyId) ? route.query.surveyId[0] : route.query.surveyId;
  const parsedSurveyId = Number(rawSurveyId);

  return Number.isFinite(parsedSurveyId) ? parsedSurveyId : null;
}

function formatDate(dateValue: string) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return 'Sin fecha';
  }

  return new Intl.DateTimeFormat('es-EC', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function getQuestionStatusClass(question: QuestionRow) {
  return question.options > 0 ? 'status-published' : 'status-attention';
}

function getQuestionStatusLabel(question: QuestionRow) {
  return question.options > 0 ? 'Publicada' : 'Sin opciones';
}

function getQuestionDistributionPercent(total: number) {
  if (questionDistributionTotal.value === 0) {
    return 0;
  }

  return Math.round((total / questionDistributionTotal.value) * 100);
}

function getFrequentPercent(total: number) {
  return Math.round((total / frequentMaxTotal.value) * 100);
}

function applyFilters() {
  advancedFiltersOpen.value = false;
}

function clearFilters() {
  selectedParticipant.value = 'Todos';
  minimumAnswers.value = 0;
  summarySort.value = 'total';

  if (selectedSurvey.value) {
    startDate.value = toDateInputValue(selectedSurvey.value.surCreationDate);
    endDate.value = toDateInputValue(new Date().toISOString());
  }
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugify(value: string) {
  const normalizedValue = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  return normalizedValue || 'reporte';
}

function getReportFileBaseName() {
  const surveyName = selectedSurvey.value?.surTitle?.trim() || 'encuesta';
  const reportDate = new Date().toISOString().slice(0, 10);

  return `reporte-${slugify(surveyName)}-${reportDate}`;
}

function formatGeneratedAt() {
  return new Intl.DateTimeFormat('es-EC', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
}

function getSortLabel() {
  return summarySort.value === 'question' ? 'Pregunta A-Z' : 'Mayor total';
}

function getResponsibleUser() {
  return selectedSurvey.value?.surCreatedBy || 'Administrador';
}

function getConsultedPeriod() {
  return `${startDate.value || 'Sin fecha'} - ${endDate.value || 'Sin fecha'}`;
}

function getReportMetrics() {
  return [
    {
      label: 'Total de preguntas',
      value: questionRows.value.length,
      detail: 'Configuradas en esta encuesta',
      tone: 'blue',
    },
    {
      label: 'Participantes unicos',
      value: totalParticipants.value,
      detail: 'Dentro de los filtros activos',
      tone: 'green',
    },
    {
      label: 'Respuestas registradas',
      value: totalResponses.value,
      detail: 'Total de respuestas filtradas',
      tone: 'amber',
    },
    {
      label: 'Finalizacion estimada',
      value: `${answerCoverage.value}%`,
      detail: 'Segun respuestas recibidas',
      tone: 'rose',
    },
    {
      label: 'Opciones con datos',
      value: resultRows.value.length,
      detail: 'Combinaciones agrupadas',
      tone: 'purple',
    },
  ];
}

function getFilterRows() {
  return [
    ['Encuesta', selectedSurvey.value?.surTitle ?? 'Sin encuesta seleccionada'],
    ['Fecha de creacion', selectedSurvey.value ? formatDate(selectedSurvey.value.surCreationDate) : 'Sin fecha'],
    ['Desde', startDate.value || 'Sin filtro'],
    ['Hasta', endDate.value || 'Sin filtro'],
    ['Participante', selectedParticipant.value],
    ['Minimo de respuestas', minimumAnswers.value],
    ['Orden aplicado', getSortLabel()],
  ];
}

function getParticipantAnswerRows() {
  return clientRows.value.flatMap((client) =>
    client.answers.map((answer) => [client.userName, answer.question, answer.answer]),
  );
}

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function renderPdfTable(headers: string[], rows: Array<Array<string | number>>, emptyMessage: string) {
  const colSpan = headers.length;
  const bodyRows =
    rows.length > 0
      ? rows
          .map(
            (row) => `
              <tr>
                ${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}
              </tr>
            `,
          )
          .join('')
      : `<tr><td class="empty-cell" colspan="${colSpan}">${escapeHtml(emptyMessage)}</td></tr>`;

  return `
    <table class="report-table">
      <thead>
        <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
  `;
}

function renderPdfBarChart() {
  if (frequentRows.value.length === 0) {
    return '<p class="empty-text">Sin respuestas principales.</p>';
  }

  const chartRows = frequentRows.value.slice(0, 6);
  const barAreaX = 150;
  const barAreaWidth = 205;
  const rowHeight = 29;
  const svgHeight = 44 + chartRows.length * rowHeight;
  const bars = chartRows
    .map((row, index) => {
      const y = 38 + index * rowHeight;
      const width = Math.max(3, (row.total / frequentMaxTotal.value) * barAreaWidth);

      return `
        <text x="12" y="${y}" class="svg-label">${escapeHtml(truncateText(row.option, 24))}</text>
        <rect x="${barAreaX}" y="${y - 13}" width="${barAreaWidth}" height="15" rx="4" fill="#e2e8f0" />
        <rect x="${barAreaX}" y="${y - 13}" width="${width}" height="15" rx="4" fill="#0f766e" />
        <text x="${barAreaX + barAreaWidth + 14}" y="${y}" class="svg-value">${row.total}</text>
      `;
    })
    .join('');

  return `
    <svg class="pdf-bar-chart" viewBox="0 0 420 ${svgHeight}" role="img" aria-label="Respuestas principales">
      <text x="12" y="16" class="svg-kicker">Respuesta</text>
      <text x="${barAreaX}" y="16" class="svg-kicker">Total registrado</text>
      ${bars}
    </svg>
  `;
}

function renderPdfDonutChart() {
  const donutRows = questionDistributionLegend.value.slice(0, 6);

  if (donutRows.length === 0 || questionDistributionTotal.value === 0) {
    return '<p class="empty-text">Sin distribucion seleccionada.</p>';
  }

  let offset = 0;
  const circles = donutRows
    .map((row) => {
      const segmentPercent = (row.total / questionDistributionTotal.value) * 100;
      const circle = `
        <circle
          cx="82"
          cy="96"
          r="48"
          fill="none"
          stroke="${row.color}"
          stroke-width="28"
          pathLength="100"
          stroke-dasharray="${segmentPercent} ${100 - segmentPercent}"
          stroke-dashoffset="${-offset}"
          transform="rotate(-90 82 96)"
        />
      `;

      offset += segmentPercent;
      return circle;
    })
    .join('');
  const legend = donutRows
    .map(
      (row, index) => `
        <rect x="185" y="${44 + index * 24}" width="10" height="10" rx="2" fill="${row.color}" />
        <text x="204" y="${53 + index * 24}" class="svg-label">${escapeHtml(truncateText(row.option, 24))}</text>
        <text x="376" y="${53 + index * 24}" class="svg-value">${row.percent}%</text>
      `,
    )
    .join('');

  return `
    <svg class="pdf-donut-chart" viewBox="0 0 420 190" role="img" aria-label="Distribucion por pregunta">
      <circle cx="82" cy="96" r="48" fill="none" stroke="#e2e8f0" stroke-width="28" />
      ${circles}
      <circle cx="82" cy="96" r="27" fill="#ffffff" />
      <text x="82" y="92" text-anchor="middle" class="svg-total">${questionDistributionTotal.value}</text>
      <text x="82" y="109" text-anchor="middle" class="svg-kicker">respuestas</text>
      <text x="185" y="22" class="svg-kicker">${escapeHtml(truncateText(selectedChartQuestion.value || 'Pregunta seleccionada', 34))}</text>
      ${legend}
    </svg>
  `;
}

function renderPdfVisualPanels() {
  return `
    <section class="section visual-grid">
      <article class="chart-panel">
        <h2>Respuestas principales</h2>
        ${renderPdfBarChart()}
      </article>
      <article class="chart-panel">
        <h2>Distribucion por pregunta</h2>
        ${renderPdfDonutChart()}
      </article>
    </section>
  `;
}

function buildPdfReportHtml() {
  const surveyTitle = selectedSurvey.value?.surTitle ?? 'Reporte de encuesta';
  const surveyDescription = selectedSurvey.value?.surDescription || 'Sin descripcion registrada.';
  const metricCards = getReportMetrics()
    .map(
      (metric) => `
        <article class="metric-card ${metric.tone}">
          <span>${escapeHtml(metric.label)}</span>
          <strong>${escapeHtml(metric.value)}</strong>
          <small>${escapeHtml(metric.detail)}</small>
        </article>
      `,
    )
    .join('');
  const filterBadges = getFilterRows()
    .map(
      ([label, value]) => `
        <div class="filter-pill">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `,
    )
    .join('');
  const summaryBlocks = summaryQuestionGroups.value.length
    ? summaryQuestionGroups.value
        .map(
          (group) => `
            <article class="question-block">
              <header>
                <h3>${escapeHtml(group.question)}</h3>
                <strong>${group.total} respuestas</strong>
              </header>
              ${group.rows
                .map(
                  (row) => `
                    <div class="answer-line">
                      <span>${escapeHtml(row.option)}</span>
                      <div class="bar"><i style="width:${row.percent}%"></i></div>
                      <strong>${row.total} - ${row.percent}%</strong>
                    </div>
                  `,
                )
                .join('')}
            </article>
          `,
        )
        .join('')
    : '<p class="empty-text">Sin respuestas recibidas.</p>';

  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(surveyTitle)}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            background: #f3f6f8;
            color: #17202a;
            font-family: Arial, Helvetica, sans-serif;
          }
          .sheet {
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            padding: 18mm;
            background: #ffffff;
          }
          .report-cover {
            border-bottom: 4px solid #0f766e;
            display: flex;
            justify-content: space-between;
            gap: 24px;
            padding-bottom: 18px;
          }
          .report-heading {
            align-items: center;
            display: flex;
            gap: 18px;
            min-width: 0;
          }
          .report-icon {
            align-items: end;
            background: #0b2f63;
            border-radius: 10px;
            display: flex;
            flex: 0 0 auto;
            gap: 5px;
            height: 66px;
            justify-content: center;
            padding: 14px;
            width: 66px;
          }
          .report-icon i {
            background: #bfdbfe;
            border-radius: 3px;
            display: block;
            width: 9px;
          }
          .report-icon i:nth-child(1) { height: 18px; }
          .report-icon i:nth-child(2) { height: 28px; }
          .report-icon i:nth-child(3) { height: 40px; }
          .brand {
            color: #0f766e;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          h1 {
            font-size: 30px;
            line-height: 1.15;
            margin: 8px 0;
          }
          .description {
            color: #475569;
            font-size: 13px;
            line-height: 1.6;
            margin: 0;
            max-width: 570px;
          }
          .generated-box {
            background: #eef8f5;
            border: 1px solid #b7e2d5;
            border-radius: 8px;
            min-width: 170px;
            padding: 12px;
            text-align: right;
          }
          .generated-box span {
            color: #64748b;
            display: block;
            font-size: 11px;
            text-transform: uppercase;
          }
          .generated-box strong {
            color: #0f766e;
            display: block;
            font-size: 13px;
            margin-top: 5px;
          }
          .meta-strip {
            display: grid;
            gap: 10px;
            grid-template-columns: repeat(3, 1fr);
            margin: 18px 0;
          }
          .meta-item {
            border: 1px solid #d9e2ea;
            border-radius: 8px;
            padding: 12px;
          }
          .meta-item span {
            color: #64748b;
            display: block;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
          }
          .meta-item strong {
            color: #102a43;
            display: block;
            font-size: 13px;
            margin-top: 6px;
          }
          .filter-panel {
            border: 1px solid #d9e2ea;
            border-radius: 8px;
            margin-bottom: 18px;
            padding: 12px;
          }
          .filter-panel h2 {
            border: 0;
            color: #102a43;
            font-size: 14px;
            margin: 0 0 10px;
            padding: 0;
            text-transform: uppercase;
          }
          .metrics {
            display: grid;
            gap: 10px;
            grid-template-columns: repeat(5, 1fr);
            margin: 18px 0;
          }
          .metric-card {
            border-left: 5px solid #0f766e;
            border-radius: 8px;
            background: #f8fafc;
            padding: 12px;
          }
          .metric-card.blue { border-color: #2563eb; }
          .metric-card.amber { border-color: #d97706; }
          .metric-card.rose { border-color: #e11d48; }
          .metric-card.purple { border-color: #7c3aed; }
          .metric-card span,
          .filter-pill span {
            color: #64748b;
            display: block;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
          }
          .metric-card strong {
            display: block;
            font-size: 23px;
            margin: 6px 0 2px;
          }
          .metric-card small {
            color: #64748b;
            font-size: 11px;
          }
          .filters {
            display: grid;
            gap: 8px;
            grid-template-columns: repeat(4, 1fr);
          }
          .filter-pill {
            border: 1px solid #d9e2ea;
            border-radius: 8px;
            padding: 10px;
          }
          .filter-pill strong {
            display: block;
            font-size: 12px;
            margin-top: 5px;
          }
          .section {
            break-inside: avoid;
            margin-top: 18px;
          }
          .section h2 {
            border-bottom: 1px solid #d9e2ea;
            font-size: 17px;
            margin: 0 0 10px;
            padding-bottom: 8px;
          }
          .visual-grid {
            display: grid;
            gap: 12px;
            grid-template-columns: 1fr 1fr;
          }
          .chart-panel {
            border: 1px solid #d9e2ea;
            border-radius: 8px;
            padding: 12px;
          }
          .chart-panel h2 {
            color: #102a43;
            font-size: 14px;
            text-align: center;
            text-transform: uppercase;
          }
          .pdf-bar-chart,
          .pdf-donut-chart {
            display: block;
            height: auto;
            width: 100%;
          }
          .svg-label {
            fill: #243b53;
            font-size: 11px;
          }
          .svg-value {
            fill: #102a43;
            font-size: 11px;
            font-weight: 700;
          }
          .svg-kicker {
            fill: #64748b;
            font-size: 9px;
            font-weight: 700;
            text-transform: uppercase;
          }
          .svg-total {
            fill: #102a43;
            font-size: 20px;
            font-weight: 800;
          }
          .chart-bars {
            display: grid;
            gap: 9px;
          }
          .chart-bar-row {
            align-items: center;
            display: grid;
            gap: 8px;
            grid-template-columns: minmax(90px, 1fr) 1.4fr 42px;
          }
          .chart-bar-row span,
          .chart-bar-row strong {
            font-size: 11px;
          }
          .chart-track {
            background: #e2e8f0;
            border-radius: 999px;
            height: 12px;
            overflow: hidden;
          }
          .chart-track i {
            background: linear-gradient(90deg, #16a34a, #60a5fa);
            display: block;
            height: 100%;
          }
          .donut-layout {
            align-items: center;
            display: grid;
            gap: 12px;
            grid-template-columns: 136px 1fr;
            min-height: 150px;
          }
          .donut {
            align-items: center;
            border-radius: 50%;
            display: flex;
            height: 136px;
            justify-content: center;
            position: relative;
            width: 136px;
          }
          .donut::after {
            background: #ffffff;
            border-radius: 50%;
            content: '';
            height: 72px;
            position: absolute;
            width: 72px;
          }
          .donut span {
            color: #102a43;
            font-size: 18px;
            font-weight: 800;
            position: relative;
            text-align: center;
            z-index: 1;
          }
          .donut small {
            color: #64748b;
            display: block;
            font-size: 9px;
            font-weight: 700;
          }
          .donut-legend {
            display: grid;
            gap: 8px;
          }
          .donut-legend-row {
            align-items: center;
            display: grid;
            gap: 8px;
            grid-template-columns: 10px 1fr 42px;
            font-size: 11px;
          }
          .donut-legend-row i {
            border-radius: 2px;
            height: 10px;
            width: 10px;
          }
          .report-table {
            border-collapse: collapse;
            font-size: 11px;
            width: 100%;
          }
          .report-table th {
            background: #102a43;
            color: #ffffff;
            font-size: 10px;
            letter-spacing: 0.03em;
            padding: 8px;
            text-align: left;
            text-transform: uppercase;
          }
          .report-table td {
            border-bottom: 1px solid #e2e8f0;
            color: #27364a;
            padding: 8px;
            vertical-align: top;
          }
          .empty-cell,
          .empty-text {
            color: #64748b;
            font-style: italic;
          }
          .question-block {
            border: 1px solid #d9e2ea;
            border-radius: 8px;
            margin-bottom: 10px;
            overflow: hidden;
          }
          .question-block header {
            align-items: center;
            background: #f8fafc;
            display: flex;
            justify-content: space-between;
            padding: 10px 12px;
          }
          .question-block h3 {
            font-size: 13px;
            margin: 0;
          }
          .question-block header strong {
            color: #0f766e;
            font-size: 12px;
          }
          .answer-line {
            align-items: center;
            display: grid;
            gap: 10px;
            grid-template-columns: 1.2fr 1fr 90px;
            padding: 8px 12px;
          }
          .answer-line + .answer-line {
            border-top: 1px solid #eef2f6;
          }
          .answer-line span,
          .answer-line strong {
            font-size: 11px;
          }
          .bar {
            background: #e2e8f0;
            border-radius: 999px;
            height: 8px;
            overflow: hidden;
          }
          .bar i {
            background: #0f766e;
            display: block;
            height: 100%;
          }
          @page { margin: 12mm; size: A4; }
          @media print {
            * {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            body { background: #ffffff; }
            .sheet { box-shadow: none; margin: 0; min-height: auto; padding: 0; width: auto; }
          }
        </style>
      </head>
      <body>
        <main class="sheet">
          <header class="report-cover">
            <div class="report-heading">
              <div class="report-icon" aria-hidden="true"><i></i><i></i><i></i></div>
              <div>
                <span class="brand">Reporte de resultados</span>
                <h1>${escapeHtml(surveyTitle)}</h1>
                <p class="description">${escapeHtml(surveyDescription)}</p>
              </div>
            </div>
            <aside class="generated-box">
              <span>Generado</span>
              <strong>${escapeHtml(formatGeneratedAt())}</strong>
            </aside>
          </header>

          <section class="meta-strip">
            <div class="meta-item">
              <span>Fecha de generacion</span>
              <strong>${escapeHtml(formatGeneratedAt())}</strong>
            </div>
            <div class="meta-item">
              <span>Usuario responsable</span>
              <strong>${escapeHtml(getResponsibleUser())}</strong>
            </div>
            <div class="meta-item">
              <span>Periodo consultado</span>
              <strong>${escapeHtml(getConsultedPeriod())}</strong>
            </div>
          </section>

          <section class="filter-panel">
            <h2>Filtros aplicados</h2>
            <div class="filters">${filterBadges}</div>
          </section>

          <section class="metrics">${metricCards}</section>
          ${renderPdfVisualPanels()}

          <section class="section">
            <h2>Resumen ejecutivo</h2>
            ${renderPdfTable(
              ['Pregunta', 'Respuesta', 'Total', 'Porcentaje'],
              resultRows.value.map((row) => [row.question, row.option, row.total, `${row.percent}%`]),
              'Sin resultados para exportar.',
            )}
          </section>

          <section class="section">
            <h2>Lectura por pregunta</h2>
            ${summaryBlocks}
          </section>

          <section class="section">
            <h2>Respuestas principales</h2>
            ${renderPdfTable(
              ['No.', 'Pregunta', 'Respuesta', 'Total'],
              frequentRows.value.map((row, index) => [index + 1, row.question, row.option, row.total]),
              'Sin respuestas principales.',
            )}
          </section>

          <section class="section">
            <h2>Detalle por participante</h2>
            ${renderPdfTable(
              ['Participante', 'Pregunta', 'Respuesta'],
              getParticipantAnswerRows(),
              'Sin participantes dentro de los filtros.',
            )}
          </section>

          <section class="section">
            <h2>Preguntas publicadas</h2>
            ${renderPdfTable(
              ['Pregunta', 'Tipo', 'Opciones', 'Estado'],
              questionRows.value.map((question) => [
                question.question,
                question.responseType,
                question.options,
                getQuestionStatusLabel(question),
              ]),
              'Sin preguntas publicadas.',
            )}
          </section>
        </main>
      </body>
    </html>
  `;
}

const excelThinBorder = {
  top: { style: 'thin', color: { rgb: 'D9E2EA' } },
  bottom: { style: 'thin', color: { rgb: 'D9E2EA' } },
  left: { style: 'thin', color: { rgb: 'D9E2EA' } },
  right: { style: 'thin', color: { rgb: 'D9E2EA' } },
};
const excelStyles = {
  title: {
    font: { bold: true, sz: 18, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: '0B2F63' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: excelThinBorder,
  },
  subtitle: {
    font: { bold: true, sz: 11, color: { rgb: '0B2F63' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'EAF2FF' } },
    alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
    border: excelThinBorder,
  },
  section: {
    font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: '102A43' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: excelThinBorder,
  },
  header: {
    font: { bold: true, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: '0B2F63' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: excelThinBorder,
  },
  label: {
    font: { bold: true, color: { rgb: '0B2F63' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'F3F8FF' } },
    alignment: { vertical: 'center', wrapText: true },
    border: excelThinBorder,
  },
  cell: {
    alignment: { vertical: 'top', wrapText: true },
    border: excelThinBorder,
  },
  muted: {
    font: { italic: true, color: { rgb: '64748B' } },
    alignment: { vertical: 'top', wrapText: true },
    border: excelThinBorder,
  },
  segmentOn: {
    fill: { patternType: 'solid', fgColor: { rgb: '0F766E' } },
    border: excelThinBorder,
  },
  segmentOff: {
    fill: { patternType: 'solid', fgColor: { rgb: 'E2E8F0' } },
    border: excelThinBorder,
  },
};
const excelMetricStyles: Record<string, Record<string, unknown>> = {
  blue: {
    font: { bold: true, color: { rgb: '1D4ED8' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'EFF6FF' } },
    alignment: { vertical: 'center', wrapText: true },
    border: excelThinBorder,
  },
  green: {
    font: { bold: true, color: { rgb: '15803D' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'F0FDF4' } },
    alignment: { vertical: 'center', wrapText: true },
    border: excelThinBorder,
  },
  amber: {
    font: { bold: true, color: { rgb: 'B45309' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'FFFBEB' } },
    alignment: { vertical: 'center', wrapText: true },
    border: excelThinBorder,
  },
  rose: {
    font: { bold: true, color: { rgb: 'BE123C' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'FFF1F2' } },
    alignment: { vertical: 'center', wrapText: true },
    border: excelThinBorder,
  },
  purple: {
    font: { bold: true, color: { rgb: '6D28D9' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'F5F3FF' } },
    alignment: { vertical: 'center', wrapText: true },
    border: excelThinBorder,
  },
};

function blankExcelRow(columnCount: number): ExcelRow {
  return Array.from({ length: columnCount }, () => '');
}

function withEmptyExcelRow(rows: ExcelRow[], columnCount: number, emptyMessage: string) {
  return rows.length ? rows : [[emptyMessage, ...blankExcelRow(columnCount - 1)]];
}

function getExcelCell(sheet: XLSX.WorkSheet, rowIndex: number, columnIndex: number) {
  const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });

  if (!sheet[address]) {
    sheet[address] = { t: 's', v: '' };
  }

  return sheet[address] as XLSX.CellObject;
}

function styleExcelCell(sheet: XLSX.WorkSheet, rowIndex: number, columnIndex: number, style: Record<string, unknown>) {
  getExcelCell(sheet, rowIndex, columnIndex).s = style;
}

function styleExcelRow(sheet: XLSX.WorkSheet, rowIndex: number, columnCount: number, style: Record<string, unknown>) {
  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    styleExcelCell(sheet, rowIndex, columnIndex, style);
  }
}

function styleExcelRange(
  sheet: XLSX.WorkSheet,
  startRow: number,
  endRow: number,
  startColumn: number,
  endColumn: number,
  style: Record<string, unknown>,
) {
  for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
    for (let columnIndex = startColumn; columnIndex <= endColumn; columnIndex += 1) {
      styleExcelCell(sheet, rowIndex, columnIndex, style);
    }
  }
}

function mergeExcelRow(sheet: XLSX.WorkSheet, rowIndex: number, startColumn: number, endColumn: number) {
  const merges = (sheet['!merges'] as XLSX.Range[] | undefined) ?? [];

  merges.push({ s: { r: rowIndex, c: startColumn }, e: { r: rowIndex, c: endColumn } });
  sheet['!merges'] = merges;
}

function applyPercentFormat(sheet: XLSX.WorkSheet, startRow: number, endRow: number, columnIndex: number) {
  for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
    const cell = getExcelCell(sheet, rowIndex, columnIndex);

    if (typeof cell.v === 'number') {
      cell.z = '0%';
    }
  }
}

function createExcelSheet(workbook: XLSX.WorkBook, sheetName: string, rows: ExcelRow[], columnWidths: number[]) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);

  sheet['!cols'] = columnWidths.map((wch) => ({ wch }));
  sheet['!margins'] = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);

  return sheet;
}

function styleExcelTable(
  sheet: XLSX.WorkSheet,
  headerRow: number,
  dataStartRow: number,
  dataEndRow: number,
  columnCount: number,
  emptyMessage: string,
) {
  styleExcelRow(sheet, headerRow, columnCount, excelStyles.header);
  styleExcelRange(sheet, dataStartRow, dataEndRow, 0, columnCount - 1, excelStyles.cell);

  const firstCell = getExcelCell(sheet, dataStartRow, 0);

  if (firstCell.v === emptyMessage) {
    styleExcelRange(sheet, dataStartRow, dataEndRow, 0, columnCount - 1, excelStyles.muted);
  }

  sheet['!autofilter'] = {
    ref: XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: dataEndRow, c: columnCount - 1 } }),
  };
}

function appendStandardExcelSheet(
  workbook: XLSX.WorkBook,
  sheetName: string,
  sectionTitle: string,
  headers: string[],
  rows: ExcelRow[],
  emptyMessage: string,
  columnWidths: number[],
  percentColumns: number[] = [],
) {
  const surveyTitle = selectedSurvey.value?.surTitle ?? 'Reporte de encuesta';
  const columnCount = headers.length;
  const safeRows = withEmptyExcelRow(rows, columnCount, emptyMessage);
  const sheetRows: ExcelRow[] = [
    [sectionTitle, ...blankExcelRow(columnCount - 1)],
    [surveyTitle, ...blankExcelRow(columnCount - 1)],
    blankExcelRow(columnCount),
    ['Fecha de generacion', formatGeneratedAt(), 'Periodo consultado', getConsultedPeriod(), ...blankExcelRow(Math.max(0, columnCount - 4))],
    blankExcelRow(columnCount),
    ['Detalle', ...blankExcelRow(columnCount - 1)],
    headers,
    ...safeRows,
  ];
  const sheet = createExcelSheet(workbook, sheetName, sheetRows, columnWidths);
  const lastColumn = columnCount - 1;
  const dataStartRow = 7;
  const dataEndRow = sheetRows.length - 1;

  mergeExcelRow(sheet, 0, 0, lastColumn);
  mergeExcelRow(sheet, 1, 0, lastColumn);
  mergeExcelRow(sheet, 5, 0, lastColumn);
  styleExcelRow(sheet, 0, columnCount, excelStyles.title);
  styleExcelRow(sheet, 1, columnCount, excelStyles.subtitle);
  styleExcelRange(sheet, 3, 3, 0, lastColumn, excelStyles.label);
  styleExcelRow(sheet, 5, columnCount, excelStyles.section);
  styleExcelTable(sheet, 6, dataStartRow, dataEndRow, columnCount, emptyMessage);
  percentColumns.forEach((columnIndex) => applyPercentFormat(sheet, dataStartRow, dataEndRow, columnIndex));
}

function appendSummaryExcelSheet(workbook: XLSX.WorkBook) {
  const surveyTitle = selectedSurvey.value?.surTitle ?? 'Reporte de encuesta';
  const columnCount = 6;
  const rows: ExcelRow[] = [];
  const addRow = (row: ExcelRow) => {
    rows.push([...row, ...blankExcelRow(Math.max(0, columnCount - row.length))]);
    return rows.length - 1;
  };
  const titleRow = addRow(['REPORTE DE RESULTADOS']);
  const subtitleRow = addRow([surveyTitle]);
  const metaRow = addRow(['Fecha de generacion', formatGeneratedAt(), 'Usuario responsable', getResponsibleUser(), 'Periodo consultado', getConsultedPeriod()]);

  addRow(blankExcelRow(columnCount));
  const metricsSectionRow = addRow(['1. RESUMEN GENERAL']);
  const metricsHeaderRow = addRow(['Indicador', 'Valor', 'Detalle']);
  const metricStartRow = rows.length;
  getReportMetrics().forEach((metric) => addRow([metric.label, metric.value, metric.detail]));
  const metricEndRow = rows.length - 1;

  addRow(blankExcelRow(columnCount));
  const topSectionRow = addRow(['2. RESPUESTAS PRINCIPALES']);
  const topHeaderRow = addRow(['No.', 'Pregunta', 'Respuesta', 'Total', 'Porcentaje', 'Peso visual']);
  const topStartRow = rows.length;
  withEmptyExcelRow(
    frequentRows.value.map((row, index) => [index + 1, row.question, row.option, row.total, row.percent / 100, row.total / frequentMaxTotal.value]),
    columnCount,
    'Sin respuestas principales.',
  ).forEach((row) => addRow(row));
  const topEndRow = rows.length - 1;
  const sheet = createExcelSheet(workbook, 'Resumen', rows, [26, 24, 38, 14, 16, 16]);

  [titleRow, subtitleRow, metricsSectionRow, topSectionRow].forEach((rowIndex) => mergeExcelRow(sheet, rowIndex, 0, columnCount - 1));
  styleExcelRow(sheet, titleRow, columnCount, excelStyles.title);
  styleExcelRow(sheet, subtitleRow, columnCount, excelStyles.subtitle);
  styleExcelRange(sheet, metaRow, metaRow, 0, columnCount - 1, excelStyles.label);
  styleExcelRow(sheet, metricsSectionRow, columnCount, excelStyles.section);
  styleExcelRow(sheet, metricsHeaderRow, 3, excelStyles.header);
  styleExcelRange(sheet, metricStartRow, metricEndRow, 0, 2, excelStyles.cell);
  getReportMetrics().forEach((metric, index) => {
    const rowIndex = metricStartRow + index;
    styleExcelRange(sheet, rowIndex, rowIndex, 0, 2, excelMetricStyles[metric.tone] ?? excelStyles.cell);
  });
  styleExcelRow(sheet, topSectionRow, columnCount, excelStyles.section);
  styleExcelTable(sheet, topHeaderRow, topStartRow, topEndRow, columnCount, 'Sin respuestas principales.');
  applyPercentFormat(sheet, topStartRow, topEndRow, 4);
  applyPercentFormat(sheet, topStartRow, topEndRow, 5);
}

function appendChartsExcelSheet(workbook: XLSX.WorkBook) {
  const surveyTitle = selectedSurvey.value?.surTitle ?? 'Reporte de encuesta';
  const columnCount = 14;
  const segmentHeaders = Array.from({ length: 10 }, (_, index) => `${index + 1}`);
  const rows: ExcelRow[] = [];
  const addRow = (row: ExcelRow) => {
    rows.push([...row, ...blankExcelRow(Math.max(0, columnCount - row.length))]);
    return rows.length - 1;
  };
  const titleRow = addRow(['GRAFICOS Y DATOS VISUALES']);
  const subtitleRow = addRow([surveyTitle]);

  addRow(blankExcelRow(columnCount));
  const barsSectionRow = addRow(['1. BARRAS - RESPUESTAS PRINCIPALES']);
  const barsHeaderRow = addRow(['No.', 'Respuesta', 'Total', 'Porcentaje', ...segmentHeaders]);
  const barsStartRow = rows.length;
  const barRows = frequentRows.value.map((row, index) => [
    index + 1,
    row.option,
    row.total,
    row.total / frequentMaxTotal.value,
    ...Array.from({ length: 10 }, () => ' '),
  ]);

  withEmptyExcelRow(barRows, columnCount, 'Sin respuestas principales.').forEach((row) => addRow(row));
  const barsEndRow = rows.length - 1;

  addRow(blankExcelRow(columnCount));
  const donutSectionRow = addRow(['2. DISTRIBUCION POR PREGUNTA']);
  const questionRow = addRow(['Pregunta seleccionada', selectedChartQuestion.value || 'Sin pregunta seleccionada']);
  const donutHeaderRow = addRow(['Respuesta', 'Total', 'Porcentaje']);
  const donutStartRow = rows.length;
  const donutRows = questionDistributionLegend.value.map((row) => [row.option, row.total, row.percent / 100]);

  withEmptyExcelRow(donutRows, 3, 'Sin distribucion seleccionada.').forEach((row) => addRow(row));
  const donutEndRow = rows.length - 1;
  const sheet = createExcelSheet(workbook, 'Graficos', rows, [10, 34, 12, 14, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]);

  [titleRow, subtitleRow, barsSectionRow, donutSectionRow].forEach((rowIndex) => mergeExcelRow(sheet, rowIndex, 0, columnCount - 1));
  mergeExcelRow(sheet, questionRow, 1, columnCount - 1);
  styleExcelRow(sheet, titleRow, columnCount, excelStyles.title);
  styleExcelRow(sheet, subtitleRow, columnCount, excelStyles.subtitle);
  styleExcelRow(sheet, barsSectionRow, columnCount, excelStyles.section);
  styleExcelRow(sheet, donutSectionRow, columnCount, excelStyles.section);
  styleExcelRow(sheet, barsHeaderRow, columnCount, excelStyles.header);
  styleExcelRange(sheet, barsStartRow, barsEndRow, 0, columnCount - 1, excelStyles.cell);
  applyPercentFormat(sheet, barsStartRow, barsEndRow, 3);

  frequentRows.value.forEach((row, index) => {
    const rowIndex = barsStartRow + index;
    const filledSegments = Math.round((row.total / frequentMaxTotal.value) * 10);

    for (let columnIndex = 4; columnIndex < 14; columnIndex += 1) {
      styleExcelCell(sheet, rowIndex, columnIndex, columnIndex - 4 < filledSegments ? excelStyles.segmentOn : excelStyles.segmentOff);
    }
  });
  styleExcelRange(sheet, questionRow, questionRow, 0, columnCount - 1, excelStyles.label);
  styleExcelRow(sheet, donutHeaderRow, 3, excelStyles.header);
  styleExcelRange(sheet, donutStartRow, donutEndRow, 0, 2, excelStyles.cell);
  applyPercentFormat(sheet, donutStartRow, donutEndRow, 2);
}

function buildExcelWorkbook() {
  const workbook = XLSX.utils.book_new();
  const responseRows = resultRows.value.map((row) => [row.id, row.question, row.option, row.total, row.percent / 100]);
  const participantRows = clientRows.value.flatMap((client) =>
    client.answers.map((answer, index) => [client.id, client.userName, index + 1, answer.question, answer.answer]),
  );
  const questionConfigRows = questionRows.value.map((question) => [
    question.id,
    question.question,
    question.responseType,
    question.options,
    getQuestionStatusLabel(question),
  ]);

  workbook.Props = {
    Title: 'Reporte de resultados',
    Subject: selectedSurvey.value?.surTitle ?? 'Reporte de encuesta',
    Author: getResponsibleUser(),
    CreatedDate: new Date(),
  };

  appendSummaryExcelSheet(workbook);
  appendStandardExcelSheet(
    workbook,
    'Filtros',
    'FILTROS APLICADOS',
    ['Campo', 'Valor'],
    getFilterRows(),
    'Sin filtros aplicados.',
    [28, 46],
  );
  appendChartsExcelSheet(workbook);
  appendStandardExcelSheet(
    workbook,
    'Respuestas',
    'DETALLE DE RESPUESTAS',
    ['ID', 'Pregunta', 'Respuesta', 'Total', 'Porcentaje'],
    responseRows,
    'Sin respuestas recibidas.',
    [10, 42, 34, 12, 14],
    [4],
  );
  appendStandardExcelSheet(
    workbook,
    'Participantes',
    'DETALLE POR PARTICIPANTE',
    ['ID participante', 'Participante', 'No.', 'Pregunta', 'Respuesta'],
    participantRows,
    'Sin participantes dentro de los filtros.',
    [16, 26, 10, 42, 34],
  );
  appendStandardExcelSheet(
    workbook,
    'Preguntas',
    'PREGUNTAS PUBLICADAS',
    ['ID', 'Pregunta', 'Tipo', 'Opciones', 'Estado'],
    questionConfigRows,
    'Sin preguntas publicadas.',
    [10, 46, 24, 12, 18],
  );

  return workbook;
}

function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportExcel() {
  XLSX.writeFile(buildExcelWorkbook(), `${getReportFileBaseName()}.xlsx`, { compression: true });
}

function exportPdf() {
  const reportWindow = window.open('', '_blank', 'width=1100,height=800');
  const reportHtml = buildPdfReportHtml();

  if (!reportWindow) {
    downloadTextFile(`${getReportFileBaseName()}.html`, reportHtml, 'text/html;charset=utf-8;');
    return;
  }

  reportWindow.document.open();
  reportWindow.document.write(reportHtml);
  reportWindow.document.close();
  reportWindow.focus();

  window.setTimeout(() => {
    reportWindow.print();
  }, 450);
}

async function refreshReport() {
  if (selectedSurveyId.value) {
    await loadSurveyConfiguration();
    return;
  }

  await loadSurveys();
}

async function loadSurveys() {
  loading.value = true;
  error.value = '';

  try {
    const response = await getSurveys();
    surveys.value = response.data ?? [];

    const requestedSurveyId = getRequestedSurveyId();
    selectedSurveyId.value =
      requestedSurveyId && surveys.value.some((survey) => survey.id === requestedSurveyId)
        ? requestedSurveyId
        : surveys.value[0]?.id ?? '';
  } catch (err) {
    error.value = getApiMessage(err);
  } finally {
    loading.value = false;
  }
}

async function loadSurveyConfiguration() {
  publicSurvey.value = null;
  answersByClient.value = [];
  configError.value = '';
  reportError.value = '';

  if (!selectedSurveyId.value) {
    return;
  }

  loadingConfig.value = true;

  try {
    const [configurationResponse, reportResponse] = await Promise.all([
      getSurveyForClient(Number(selectedSurveyId.value)),
      getSurveyAnswersByClient(Number(selectedSurveyId.value)),
    ]);
    publicSurvey.value = configurationResponse.data ?? null;
    answersByClient.value = reportResponse.data ?? [];
  } catch (err) {
    const message = getApiMessage(err);
    configError.value = message;
    reportError.value = message;
  } finally {
    loadingConfig.value = false;
  }
}

onMounted(loadSurveys);
</script>

<template>
  <main class="page reports-page">
    <PageHeader title="Reportes" eyebrow="Resultados" description="Analiza los resultados de tus encuestas">
      <div class="header-actions report-header-actions">
        <RouterLink class="secondary-button compact" to="/surveys">
          <ClipboardList :size="18" />
          <span>Encuestas</span>
        </RouterLink>
        <button class="secondary-button compact" type="button" :disabled="!hasResults" @click="exportPdf">
          <Download :size="18" />
          <span>Exportar PDF</span>
        </button>
        <button class="secondary-button compact" type="button" :disabled="!hasResults" @click="exportExcel">
          <FileSpreadsheet :size="18" />
          <span>Exportar Excel</span>
        </button>
        <button class="secondary-button compact" type="button" :disabled="loading || loadingConfig" @click="refreshReport">
          <RefreshCw :class="{ spin: loading || loadingConfig }" :size="18" />
          <span>Actualizar</span>
        </button>
      </div>
    </PageHeader>

    <p v-if="error" class="inline-error">{{ error }}</p>
    <div v-if="loading" class="loading-row">Cargando...</div>

    <template v-else>
      <section class="report-filter-card">
        <label class="field report-survey-field">
          <span>Encuesta</span>
          <select v-model.number="selectedSurveyId">
            <option disabled value="">Seleccionar encuesta</option>
            <option v-for="survey in surveys" :key="survey.id" :value="survey.id">
              {{ survey.surTitle }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>Desde</span>
          <input v-model="startDate" type="date" />
        </label>

        <label class="field">
          <span>Hasta</span>
          <input v-model="endDate" type="date" />
        </label>

        <label class="field">
          <span>Participante</span>
          <select v-model="selectedParticipant">
            <option v-for="participant in participantOptions" :key="participant" :value="participant">
              {{ participant }}
            </option>
          </select>
        </label>

        <button class="secondary-button compact" type="button" @click="advancedFiltersOpen = !advancedFiltersOpen">
          <SlidersHorizontal :size="17" />
          <span>Filtros avanzados</span>
        </button>
        <button class="secondary-button compact" type="button" @click="clearFilters">
          <Eraser :size="17" />
          <span>Limpiar</span>
        </button>
        <button class="primary-button compact" type="button" @click="applyFilters">
          <Filter :size="17" />
          <span>Aplicar filtros</span>
        </button>
      </section>

      <section v-if="advancedFiltersOpen" class="report-advanced-card">
        <label class="field">
          <span>Mínimo de respuestas</span>
          <input v-model.number="minimumAnswers" min="0" type="number" />
        </label>
        <label class="field">
          <span>Orden de resumen</span>
          <select v-model="summarySort">
            <option value="total">Mayor total</option>
            <option value="question">Pregunta A-Z</option>
          </select>
        </label>
      </section>

      <p v-if="configError" class="inline-error">{{ configError }}</p>

      <section class="report-hero-card">
        <div>
          <span class="eyebrow">Encuesta en análisis</span>
          <h2>{{ selectedSurvey?.surTitle ?? 'Sin encuesta seleccionada' }}</h2>
          <p>{{ selectedSurvey?.surDescription || 'Selecciona una encuesta para visualizar resultados.' }}</p>
        </div>
        <div class="report-date-chip">
          <CalendarDays :size="18" />
          <span>{{ selectedSurvey ? formatDate(selectedSurvey.surCreationDate) : 'Sin fecha' }}</span>
        </div>
      </section>

      <section class="report-stats-grid" aria-label="Indicadores de resultados">
        <article class="stat-tile stat-green">
          <div class="stat-icon">
            <FileText :size="22" />
          </div>
          <div>
            <span>Preguntas publicadas</span>
            <strong>{{ loadingConfig ? '...' : questionRows.length }}</strong>
            <small>Configuradas en esta encuesta</small>
          </div>
        </article>
        <article class="stat-tile stat-blue">
          <div class="stat-icon">
            <Users :size="22" />
          </div>
          <div>
            <span>Participantes únicos</span>
            <strong>{{ loadingConfig ? '...' : totalParticipants }}</strong>
            <small>Dentro de los filtros activos</small>
          </div>
        </article>
        <article class="stat-tile stat-amber">
          <div class="stat-icon">
            <BarChart3 :size="22" />
          </div>
          <div>
            <span>Respuestas registradas</span>
            <strong>{{ loadingConfig ? '...' : totalResponses }}</strong>
            <small>Total de respuestas filtradas</small>
          </div>
        </article>
        <article class="stat-tile stat-rose">
          <div class="stat-icon">
            <CheckCircle2 :size="22" />
          </div>
          <div>
            <span>Finalización estimada</span>
            <strong>{{ loadingConfig ? '...' : `${answerCoverage}%` }}</strong>
            <small>Según respuestas recibidas</small>
          </div>
        </article>
      </section>

      <section class="report-chart-grid">
        <article class="report-card report-analysis-card">
          <div class="section-heading">
            <div>
              <h2>Distribución por pregunta</h2>
              <p>Selecciona una pregunta para analizar sus respuestas</p>
            </div>
            <PieChart :size="20" />
          </div>

          <label class="field report-question-select">
            <span>Pregunta</span>
            <select v-model="selectedChartQuestion">
              <option disabled value="">Seleccionar pregunta</option>
              <option v-for="question in questionRows" :key="question.id" :value="question.question">
                {{ question.question }}
              </option>
            </select>
          </label>

          <div v-if="hasQuestionDistribution" class="question-distribution-board">
            <aside class="question-distribution-insight">
              <div class="question-donut-panel">
                <div class="question-donut" :style="questionDistributionChartStyle">
                  <span>
                    <strong>{{ questionDistributionTotal }}</strong>
                    respuestas
                  </span>
                </div>
                <div class="question-chart-legend">
                  <span
                    v-for="row in questionDistributionLegend"
                    :key="`${row.question}-${row.option}-legend`"
                  >
                    <i :style="{ background: row.color }" />
                    <b>{{ row.percent }}%</b>
                    {{ row.option }}
                  </span>
                </div>
              </div>

              <span>Pregunta analizada</span>
              <strong>{{ selectedChartQuestion }}</strong>

              <div class="question-insight-grid">
                <div>
                  <span>Total respuestas</span>
                  <strong>{{ questionDistributionTotal }}</strong>
                </div>
                <div>
                  <span>Opciones con datos</span>
                  <strong>{{ questionDistributionRows.length }}</strong>
                </div>
              </div>

              <div class="question-top-answer">
                <span>Opción más seleccionada</span>
                <strong>{{ questionTopOption?.option }}</strong>
                <small>{{ questionTopOption?.total }} respuestas</small>
              </div>
            </aside>

            <div class="option-distribution-list">
              <article
                v-for="(row, index) in questionDistributionLegend"
                :key="`${row.question}-${row.option}`"
                class="option-distribution-row"
                :style="{ '--bar-color': row.color }"
              >
                <div class="option-distribution-head">
                  <div>
                    <span class="report-rank">{{ index + 1 }}</span>
                    <strong>{{ row.option }}</strong>
                  </div>
                  <span>
                    {{ row.total }} respuestas
                    <b>{{ row.percent }}%</b>
                  </span>
                </div>
                <div class="report-big-track">
                  <span :style="{ width: `${row.percent}%` }" />
                </div>
              </article>
            </div>
          </div>
          <div v-else class="panel-empty">
            <PieChart :size="32" />
            <strong>Sin resultados para esta pregunta</strong>
          </div>
        </article>

        <article class="report-card report-analysis-card">
          <div class="section-heading">
            <div>
              <h2>Respuestas principales</h2>
              <p>Respuestas más frecuentes en toda la encuesta</p>
            </div>
            <BarChart3 :size="20" />
          </div>
          <div v-if="hasResults" class="top-response-grid">
            <article v-for="(row, index) in frequentRows" :key="`${row.question}-${row.option}`" class="top-response-card">
              <span class="report-rank">{{ index + 1 }}</span>
              <div class="top-response-copy">
                <span>{{ row.question }}</span>
                <strong>{{ row.option }}</strong>
              </div>
              <div class="top-response-meter">
                <div class="report-big-track">
                  <span :style="{ width: `${getFrequentPercent(row.total)}%` }" />
                </div>
                <strong>{{ row.total }} respuestas</strong>
              </div>
            </article>
          </div>
          <div v-else class="panel-empty">
            <BarChart3 :size="32" />
            <strong>Sin datos para graficar</strong>
          </div>
        </article>
      </section>

      <section class="report-card">
        <div class="section-heading">
          <div>
            <h2>Resumen de respuestas</h2>
            <p>{{ resultRows.length }} combinaciones agrupadas por pregunta</p>
          </div>
          <Table2 :size="20" />
        </div>
        <p v-if="reportError" class="inline-error">{{ reportError }}</p>
        <div v-if="hasResults" class="report-summary-groups">
          <article v-for="group in summaryQuestionGroups" :key="group.question" class="report-summary-group">
            <header>
              <div>
                <strong>{{ group.question }}</strong>
                <span>{{ group.rows.length }} respuestas distintas</span>
              </div>
              <b>{{ group.total }} respuestas</b>
            </header>
            <div class="report-summary-options">
              <div v-for="row in group.rows" :key="`${row.question}-${row.option}`" class="report-summary-option">
                <span>{{ row.option }}</span>
                <div class="report-percent-track">
                  <span :style="{ width: `${row.percent}%` }" />
                </div>
                <strong>{{ row.total }} - {{ row.percent }}%</strong>
              </div>
            </div>
          </article>
        </div>
        <div v-else class="panel-empty compact-panel">
          <Table2 :size="32" />
          <strong>Sin respuestas recibidas</strong>
        </div>
      </section>

      <section class="report-card">
        <div class="section-heading">
          <div>
            <h2>Detalle por participante</h2>
            <p>{{ clientRows.length }} participantes filtrados</p>
          </div>
          <UserRound :size="20" />
        </div>
        <div v-if="clientRows.length > 0" class="participant-list">
          <details v-for="client in clientRows" :key="client.id" class="participant-card" :open="client.id === 1">
            <summary class="participant-card-heading">
              <div>
                <strong>{{ client.userName }}</strong>
                <span>{{ client.answerCount }} respuestas registradas</span>
              </div>
              <ChevronDown :size="19" />
            </summary>
            <div class="participant-answer-list">
              <span v-for="answer in client.answers" :key="`${client.id}-${answer.question}`">
                <strong>{{ answer.question }}</strong>
                {{ answer.answer }}
              </span>
            </div>
          </details>
        </div>
        <div v-else class="panel-empty compact-panel">
          <UserRound :size="32" />
          <strong>Sin participantes registrados</strong>
        </div>
      </section>

      <section class="report-card report-table-card">
        <div class="section-heading">
          <div>
            <h2>Preguntas publicadas</h2>
            <p>Configuración actual de la encuesta</p>
          </div>
          <ClipboardList :size="20" />
        </div>
        <div v-if="loadingConfig" class="loading-row">Cargando configuración...</div>
        <div v-else-if="questionRows.length > 0" class="report-table-wrap">
          <table class="report-table">
            <thead>
              <tr>
                <th>Pregunta</th>
                <th>Tipo</th>
                <th>Opciones</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="question in questionRows" :key="question.id">
                <td>
                  <strong>{{ question.question }}</strong>
                </td>
                <td>{{ question.responseType }}</td>
                <td>
                  <span class="report-count-pill">{{ question.options }}</span>
                </td>
                <td>
                  <span class="status-badge" :class="getQuestionStatusClass(question)">
                    {{ getQuestionStatusLabel(question) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="panel-empty compact-panel">
          <ClipboardList :size="32" />
          <strong>Sin preguntas publicadas</strong>
        </div>
      </section>
    </template>
  </main>
</template>
