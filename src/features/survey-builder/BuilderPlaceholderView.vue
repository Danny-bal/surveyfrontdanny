<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  Copy,
  ExternalLink,
  FilePlus2,
  LoaderCircle,
  Plus,
  Save,
  ScrollText,
  Trash2,
} from 'lucide-vue-next';
import PageHeader from '@/components/PageHeader.vue';
import { getApiMessage } from '@/api/http';
import { createQuestion, getQuestions } from '@/api/questionApi';
import { getResponseTypes } from '@/api/responseTypeApi';
import { assignQuestionsToSurvey, getSurveyForClient } from '@/api/publicSurveyApi';
import { getSurveyById } from '@/api/surveyApi';
import type { PublicSurvey, Question, ResponseType, SurveyQuestionAssignment } from '@/types/api';

const props = defineProps<{
  id?: string;
}>();

type WizardStepStatus = 'completed' | 'current' | 'pending' | 'blocked' | 'error';

interface BuilderRow {
  localId: number;
  idQuestion: number | '';
  idTypeResponse: number;
  responseCreatedByClient: string[];
}

const surveyTitle = ref('Encuesta');
const questions = ref<Question[]>([]);
const responseTypeOptions = ref<ResponseType[]>([]);
const publicSurvey = ref<PublicSurvey | null>(null);
const rows = ref<BuilderRow[]>([]);
const newQuestionName = ref('');
const loading = ref(true);
const saving = ref(false);
const creatingQuestion = ref(false);
const copyingLink = ref(false);
const error = ref('');
const success = ref('');
const DEBUG_SURVEY_FLOW_PREFIX = '[DEBUG-survey-flow]';

const surveyId = computed(() => Number(props.id));
const publicSurveyPath = computed(() => `/s/${surveyId.value}`);
const publicSurveyUrl = computed(() => `${window.location.origin}${publicSurveyPath.value}`);
const configuredQuestions = computed(() => publicSurvey.value?.questionListResponses ?? []);
const configuredIssues = computed(() =>
  configuredQuestions.value
    .filter((question) => getConfiguredQuestionOptionCount(question) === 0)
    .map((question) => `"${question.nameQuestion}" no tiene registro interno de respuesta`),
);
const canPreview = computed(() => configuredQuestions.value.length > 0 && configuredIssues.value.length === 0);
const canPublish = computed(() => canPreview.value);
const wizardSteps = computed<Array<{ label: string; title: string; detail: string; status: WizardStepStatus }>>(() => [
  {
    label: '1',
    title: 'Datos',
    detail: 'Completado',
    status: 'completed',
  },
  {
    label: '2',
    title: 'Preguntas',
    detail: configuredQuestions.value.length > 0 ? `${configuredQuestions.value.length} configuradas` : 'Agrega preguntas',
    status: configuredQuestions.value.length > 0 ? 'completed' : 'current',
  },
  {
    label: '3',
    title: 'Opciones',
    detail:
      configuredQuestions.value.length === 0
        ? 'Pendiente'
        : configuredIssues.value.length > 0
          ? `${configuredIssues.value.length} pendiente`
          : 'Completado',
    status: configuredQuestions.value.length === 0 ? 'blocked' : configuredIssues.value.length > 0 ? 'error' : 'completed',
  },
  {
    label: '4',
    title: 'Vista previa',
    detail: canPreview.value ? 'Disponible' : 'Bloqueada',
    status: canPreview.value ? 'completed' : 'blocked',
  },
  {
    label: '5',
    title: 'Compartir',
    detail: canPublish.value ? 'Listo' : 'Bloqueado',
    status: canPublish.value ? 'current' : 'blocked',
  },
]);
const currentGuidance = computed(() => {
  if (configuredQuestions.value.length === 0) {
    return {
      title: 'Agrega preguntas a la encuesta',
      description: 'Crea una pregunta manual o selecciona una del banco, asigna el tipo de respuesta y guarda la configuracion.',
    };
  }

  if (configuredIssues.value.length > 0) {
    return {
      title: 'Revisa la configuracion antes de compartir',
      description: 'Hay preguntas guardadas sin registro interno de respuesta. Esas preguntas no estan listas para responder.',
    };
  }

  return {
    title: 'Revisa la vista previa y comparte',
    description: 'La encuesta tiene preguntas configuradas. Puedes abrir la vista publica o copiar el enlace.',
  };
});
const assignedQuestionIds = computed(() => new Set(configuredQuestions.value.map((question) => question.idQuestion)));
const selectedQuestionIds = computed(
  () => new Set(rows.value.map((row) => row.idQuestion).filter((id): id is number => typeof id === 'number')),
);
const availableQuestions = computed(() =>
  questions.value.filter(
    (question) => !assignedQuestionIds.value.has(question.id) && !selectedQuestionIds.value.has(question.id),
  ),
);

type ConfiguredQuestion = NonNullable<PublicSurvey['questionListResponses']>[number];

function getConfiguredQuestionType(question: ConfiguredQuestion) {
  return question.responseType || `Tipo ${question.responseTypeId ?? 'sin configurar'}`;
}

function getConfiguredQuestionOptionCount(question: ConfiguredQuestion) {
  return question.responsesQuestion?.length ?? 0;
}

function getConfiguredQuestionResponses(question: ConfiguredQuestion) {
  return question.responsesQuestion ?? [];
}

function getConfiguredResponseLabel(response: NonNullable<ConfiguredQuestion['responsesQuestion']>[number]) {
  return response.nameResponse?.trim() || 'Texto libre';
}

function getConfiguredQuestionStatus(question: ConfiguredQuestion) {
  if (getConfiguredQuestionOptionCount(question) === 0) {
    return 'Pendiente';
  }

  if (isConfiguredWrittenQuestion(question)) {
    return 'Registro interno';
  }

  return 'Opciones publicadas';
}

function isConfiguredWrittenQuestion(question: ConfiguredQuestion) {
  const responseTypeName = getConfiguredQuestionType(question).toLowerCase();

  return (
    needsWrittenResponse(question.responseTypeId ?? -1) ||
    responseTypeName.includes('abierta') ||
    responseTypeName.includes('fecha') ||
    responseTypeName.includes('corta')
  );
}

function getPreviewInputLabel(question: ConfiguredQuestion) {
  const responseTypeName = getConfiguredQuestionType(question).toLowerCase();

  if ((question.responseTypeId ?? 0) === 9 || responseTypeName.includes('fecha')) {
    return 'Selector de fecha';
  }

  if ((question.responseTypeId ?? 0) === 10 || responseTypeName.includes('corta')) {
    return 'Respuesta corta';
  }

  return 'Campo de texto abierto';
}

function getBuilderRowQuestionName(row: BuilderRow) {
  if (!row.idQuestion) {
    return 'Pregunta sin seleccionar';
  }

  return questions.value.find((question) => question.id === row.idQuestion)?.queName ?? 'Pregunta sin nombre';
}

function getBuilderRowTypeName(row: BuilderRow) {
  return responseTypeOptions.value.find((option) => option.id === row.idTypeResponse)?.name ?? `Tipo ${row.idTypeResponse}`;
}

function logSurveyFlow(step: string, data: unknown) {
  console.log(`${DEBUG_SURVEY_FLOW_PREFIX} ${step}`, data);
}

function getConfiguredQuestionDebugInfo(question: ConfiguredQuestion) {
  return {
    idQuestion: question.idQuestion,
    nameQuestion: question.nameQuestion,
    responseType: question.responseType,
    responseTypeId: question.responseTypeId,
    responsesQuestion: (question.responsesQuestion ?? []).map((response) => ({
      idResponse: response.idResponse,
      nameResponse: response.nameResponse,
    })),
  };
}

function questionsForRow(row: BuilderRow) {
  return questions.value.filter((question) => {
    const isCurrent = question.id === row.idQuestion;
    const isFree = !assignedQuestionIds.value.has(question.id) && !selectedQuestionIds.value.has(question.id);

    return isCurrent || isFree;
  });
}

function addRow(questionId: number | '' = '') {
  rows.value.push({
    localId: Date.now() + rows.value.length,
    idQuestion: questionId,
    idTypeResponse: responseTypeOptions.value[0]?.id ?? 1,
    responseCreatedByClient: [],
  });
}

function removeRow(localId: number) {
  rows.value = rows.value.filter((row) => row.localId !== localId);
}

function needsCustomOptions(responseTypeId: number) {
  return [4, 11, 12].includes(responseTypeId);
}

function needsWrittenResponse(responseTypeId: number) {
  return [0, 3, 9, 10].includes(responseTypeId);
}

function addCustomOption(row: BuilderRow) {
  row.responseCreatedByClient.push('');
}

function removeCustomOption(row: BuilderRow, index: number) {
  row.responseCreatedByClient.splice(index, 1);
}

function normalizeRowOptions(row: BuilderRow) {
  if (needsCustomOptions(row.idTypeResponse) && row.responseCreatedByClient.length === 0) {
    row.responseCreatedByClient = ['', ''];
    return;
  }

  if (!needsCustomOptions(row.idTypeResponse)) {
    row.responseCreatedByClient = [];
  }
}

async function reloadQuestions() {
  const questionResponse = await getQuestions();
  questions.value = questionResponse.data ?? [];
}

async function loadBuilder() {
  if (!surveyId.value) {
    error.value = 'Encuesta no valida';
    loading.value = false;
    return;
  }

  loading.value = true;
  error.value = '';

  try {
    const [surveyResponse, , nextResponseTypes] = await Promise.all([
      getSurveyById(surveyId.value),
      reloadQuestions(),
      getResponseTypes(),
    ]);
    surveyTitle.value = surveyResponse.data?.surTitle ?? 'Encuesta';
    responseTypeOptions.value = nextResponseTypes;

    try {
      const publicResponse = await getSurveyForClient(surveyId.value);
      publicSurvey.value = publicResponse.data ?? null;
      logSurveyFlow('constructor_manual_configuracion_recibida', {
        surveyId: surveyId.value,
        success: publicResponse.success,
        message: publicResponse.message,
        survey: publicResponse.data,
        questions: publicResponse.data?.questionListResponses?.map(getConfiguredQuestionDebugInfo) ?? [],
      });
    } catch {
      publicSurvey.value = null;
    }

    if (rows.value.length === 0 && availableQuestions.value.length > 0) {
      addRow();
    }
  } catch (err) {
    error.value = getApiMessage(err);
  } finally {
    loading.value = false;
  }
}

async function createManualQuestion() {
  const questionName = newQuestionName.value.trim();

  if (!questionName) {
    error.value = 'Escribe la pregunta antes de agregarla';
    return;
  }

  const alreadyExists = questions.value.some((question) => question.queName.trim().toLowerCase() === questionName.toLowerCase());

  if (alreadyExists) {
    error.value = 'Ya existe una pregunta con ese texto';
    return;
  }

  creatingQuestion.value = true;
  error.value = '';
  success.value = '';

  try {
    const response = await createQuestion({ queName: questionName });

    if (!response.success || !response.data) {
      error.value = response.message || 'No se pudo agregar la pregunta';
      return;
    }

    await reloadQuestions();
    addRow(response.data);
    newQuestionName.value = '';
    success.value = 'Pregunta agregada al constructor';
  } catch (err) {
    error.value = getApiMessage(err);
  } finally {
    creatingQuestion.value = false;
  }
}

async function copyPublicLink() {
  if (!canPublish.value) {
    error.value = 'Agrega al menos una pregunta antes de publicar';
    return;
  }

  copyingLink.value = true;
  error.value = '';
  success.value = '';

  try {
    await navigator.clipboard.writeText(publicSurveyUrl.value);
    success.value = 'Enlace publico copiado';
  } catch {
    error.value = 'No se pudo copiar el enlace publico';
  } finally {
    copyingLink.value = false;
  }
}

async function submit() {
  const payloadRows = rows.value.filter((row): row is BuilderRow & { idQuestion: number } => Number(row.idQuestion) > 0);
  const ids = payloadRows.map((row) => row.idQuestion);
  const hasRepeatedRows = ids.some((id, index) => ids.indexOf(id) !== index);
  const rowsWithoutOptions = payloadRows.filter(
    (row) => needsCustomOptions(row.idTypeResponse) && row.responseCreatedByClient.every((option) => !option.trim()),
  );

  if (payloadRows.length === 0) {
    error.value = 'Selecciona al menos una pregunta';
    return;
  }

  if (hasRepeatedRows) {
    error.value = 'No se puede guardar la misma pregunta dos veces';
    return;
  }

  if (rowsWithoutOptions.length > 0) {
    error.value = 'Agrega opciones para las preguntas de opcion multiple, casillas o desplegable';
    return;
  }

  saving.value = true;
  error.value = '';
  success.value = '';

  try {
    const questionsPlusAnswers: SurveyQuestionAssignment[] = payloadRows.map((row) => ({
      idQuestion: row.idQuestion,
      idTypeResponse: row.idTypeResponse,
      responseCreatedByClient: needsCustomOptions(row.idTypeResponse)
        ? row.responseCreatedByClient.map((option) => option.trim()).filter(Boolean)
        : needsWrittenResponse(row.idTypeResponse)
          ? ['']
          : [],
    }));
    const payload = {
      idSurvey: surveyId.value,
      questionsPlusAnswers,
    };

    logSurveyFlow('constructor_manual_antes_de_guardar', {
      surveyId: surveyId.value,
      surveyTitle: surveyTitle.value,
      rows: payloadRows.map((row) => ({
        idQuestion: row.idQuestion,
        questionName: questions.value.find((question) => question.id === row.idQuestion)?.queName ?? '',
        idTypeResponse: row.idTypeResponse,
        responseTypeName: responseTypeOptions.value.find((option) => option.id === row.idTypeResponse)?.name ?? '',
        isWrittenResponse: needsWrittenResponse(row.idTypeResponse),
        isCustomOptions: needsCustomOptions(row.idTypeResponse),
        responseCreatedByClient: row.responseCreatedByClient,
      })),
      payload,
      payloadJson: JSON.stringify(payload, null, 2),
    });

    const response = await assignQuestionsToSurvey(payload);

    logSurveyFlow('constructor_manual_respuesta_guardado', {
      surveyId: surveyId.value,
      response,
    });

    if (!response.success) {
      error.value = response.message || 'No se pudo guardar la configuracion';
      return;
    }

    success.value = 'Configuracion guardada. Revisa la vista previa antes de compartir.';
    rows.value = [];
    await loadBuilder();
  } catch (err) {
    error.value = getApiMessage(err);
  } finally {
    saving.value = false;
  }
}

onMounted(loadBuilder);
</script>

<template>
  <main class="page">
    <PageHeader title="Ciclo de encuesta" :eyebrow="surveyTitle" description="Asistente de creacion">
      <div class="header-actions">
        <RouterLink class="secondary-button compact" :to="{ name: 'reports', query: { surveyId } }">
          <BarChart3 :size="18" />
          <span>Reportes</span>
        </RouterLink>
        <RouterLink class="secondary-button compact" to="/surveys">
          <ClipboardList :size="18" />
          <span>Encuestas</span>
        </RouterLink>
      </div>
    </PageHeader>

    <section class="cycle-strip" aria-label="Ciclo de encuesta">
      <article v-for="step in wizardSteps" :key="step.title" class="wizard-step" :class="`is-${step.status}`">
        <span>{{ step.label }}</span>
        <strong>{{ step.title }}</strong>
        <small>{{ step.detail }}</small>
      </article>
    </section>

    <section class="flow-guidance" :class="{ 'has-issues': configuredIssues.length > 0 }">
      <div>
        <span class="eyebrow">Paso actual</span>
        <h2>{{ currentGuidance.title }}</h2>
        <p>{{ currentGuidance.description }}</p>
      </div>
      <ul v-if="configuredIssues.length > 0">
        <li v-for="issue in configuredIssues" :key="issue">{{ issue }}</li>
      </ul>
    </section>

    <p v-if="error" class="inline-error">{{ error }}</p>
    <p v-if="success" class="form-success">{{ success }}</p>

    <div v-if="loading" class="loading-row">Cargando...</div>

    <template v-else>
      <section class="publish-panel">
        <div>
          <span class="eyebrow">Compartir</span>
          <h2>Enlace publico</h2>
          <p v-if="!canPublish">Completa la configuracion para habilitar la vista publica.</p>
          <p v-else>{{ configuredQuestions.length }} preguntas listas para responder</p>
        </div>
        <div class="publish-actions">
          <label class="copy-field">
            <span>URL</span>
            <input :value="publicSurveyUrl" readonly type="text" />
          </label>
          <button class="secondary-button compact" :disabled="copyingLink || !canPublish" type="button" @click="copyPublicLink">
            <LoaderCircle v-if="copyingLink" class="spin" :size="17" />
            <Copy v-else :size="17" />
            <span>Copiar</span>
          </button>
          <RouterLink class="primary-button compact" :to="publicSurveyPath">
            <ExternalLink :size="17" />
            <span>Abrir</span>
          </RouterLink>
        </div>
      </section>

      <section class="builder-grid">
        <div class="builder-column">
          <div class="section-heading">
            <h2>Agregar y configurar</h2>
            <button class="secondary-button compact" type="button" :disabled="availableQuestions.length === 0" @click="addRow()">
              <Plus :size="17" />
              <span>Banco</span>
            </button>
          </div>

          <form class="quick-question" @submit.prevent="createManualQuestion">
            <label class="field">
              <span>Pregunta manual</span>
              <input v-model="newQuestionName" type="text" />
            </label>
            <button class="secondary-button compact" :disabled="creatingQuestion" type="submit">
              <LoaderCircle v-if="creatingQuestion" class="spin" :size="17" />
              <FilePlus2 v-else :size="17" />
              <span>Agregar</span>
            </button>
          </form>

          <form class="builder-form" @submit.prevent="submit">
            <div v-if="rows.length === 0" class="placeholder-panel compact-panel">
              <ScrollText :size="30" />
              <h3>Sin preguntas por guardar</h3>
            </div>

            <div v-for="row in rows" :key="row.localId" class="builder-row">
              <div class="row-context">
                <strong>{{ getBuilderRowQuestionName(row) }}</strong>
                <span>{{ getBuilderRowTypeName(row) }}</span>
              </div>

              <label class="field">
                <span>Pregunta</span>
                <select v-model.number="row.idQuestion" required>
                  <option disabled value="">Seleccionar</option>
                  <option v-for="question in questionsForRow(row)" :key="question.id" :value="question.id">
                    {{ question.queName }}
                  </option>
                </select>
              </label>

              <label class="field">
                <span>Tipo</span>
                <select v-model.number="row.idTypeResponse" required @change="normalizeRowOptions(row)">
                  <option v-for="option in responseTypeOptions" :key="option.id" :value="option.id">
                    {{ option.name }}
                  </option>
                </select>
              </label>

              <button class="icon-button danger row-remove" type="button" title="Quitar" @click="removeRow(row.localId)">
                <Trash2 :size="17" />
              </button>

              <div v-if="needsCustomOptions(row.idTypeResponse)" class="custom-options">
                <div class="custom-options-heading">
                  <span>Opciones de respuesta</span>
                  <button class="secondary-button compact" type="button" @click="addCustomOption(row)">
                    <Plus :size="16" />
                    <span>Opcion</span>
                  </button>
                </div>
                <div v-for="(_, optionIndex) in row.responseCreatedByClient" :key="optionIndex" class="custom-option-row">
                  <input v-model="row.responseCreatedByClient[optionIndex]" type="text" placeholder="Texto de opcion" />
                  <button
                    class="icon-button danger"
                    type="button"
                    title="Quitar opcion"
                    @click="removeCustomOption(row, optionIndex)"
                  >
                    <Trash2 :size="16" />
                  </button>
                </div>
              </div>
            </div>

            <div class="form-actions">
              <button class="primary-button" :disabled="saving || rows.length === 0" type="submit">
                <LoaderCircle v-if="saving" class="spin" :size="18" />
                <Save v-else :size="18" />
                <span>Guardar y revisar</span>
              </button>
            </div>
          </form>
        </div>

        <div class="builder-column">
          <div class="section-heading">
            <h2>Configuradas</h2>
            <span class="count-pill">{{ configuredQuestions.length }}</span>
          </div>

          <div v-if="configuredQuestions.length === 0" class="placeholder-panel">
            <ClipboardCheck :size="34" />
            <h3>Sin preguntas</h3>
          </div>

          <div v-else class="assigned-list">
            <article v-for="question in configuredQuestions" :key="question.idQuestion" class="assigned-item configured-detail">
              <div class="configured-question-header">
                <div>
                  <strong>{{ question.nameQuestion }}</strong>
                  <span>{{ getConfiguredQuestionType(question) }}</span>
                </div>
                <small>{{ getConfiguredQuestionStatus(question) }}</small>
              </div>

              <div v-if="getConfiguredQuestionResponses(question).length > 0" class="configured-responses">
                <span v-for="response in getConfiguredQuestionResponses(question)" :key="response.idResponse" class="configured-response-pill">
                  <strong>ID {{ response.idResponse }}</strong>
                  <span>{{ getConfiguredResponseLabel(response) }}</span>
                </span>
              </div>

              <p v-else class="configured-warning">Sin responseid interno despues de guardar</p>
            </article>
          </div>

          <div class="section-heading preview-heading">
            <h2>Vista previa</h2>
            <span class="count-pill">{{ canPreview ? 'Lista' : 'Bloqueada' }}</span>
          </div>

          <div v-if="!canPreview" class="placeholder-panel compact-panel">
            <ClipboardCheck :size="34" />
            <h3>Vista previa pendiente</h3>
          </div>

          <div v-else class="preview-list">
            <article v-for="question in configuredQuestions" :key="`preview-${question.idQuestion}`" class="preview-question">
              <div class="preview-question-heading">
                <strong>{{ question.nameQuestion }}</strong>
                <span>{{ getConfiguredQuestionType(question) }}</span>
              </div>

              <div v-if="isConfiguredWrittenQuestion(question)" class="preview-input">
                {{ getPreviewInputLabel(question) }}
              </div>

              <div v-else class="preview-options">
                <span v-for="response in getConfiguredQuestionResponses(question)" :key="response.idResponse">
                  {{ getConfiguredResponseLabel(response) }}
                </span>
              </div>
            </article>
          </div>
        </div>
      </section>
    </template>
  </main>
</template>
