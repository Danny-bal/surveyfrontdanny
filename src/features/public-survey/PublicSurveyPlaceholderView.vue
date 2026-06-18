<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { AlertCircle, ArrowLeft, ArrowRight, ClipboardCheck, LoaderCircle, Send } from 'lucide-vue-next';
import { getApiMessage } from '@/api/http';
import { answerSurvey, getSurveyForClient } from '@/api/publicSurveyApi';
import { useAuthStore } from '@/stores/authStore';
import type { PublicSurvey, ResponseSurveyByClientRequest } from '@/types/api';

const props = defineProps<{
  surveyId?: string;
}>();

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const survey = ref<PublicSurvey | null>(null);
const answers = reactive<Record<number, number>>({});
const writtenAnswers = reactive<Record<number, string>>({});
const loading = ref(true);
const sending = ref(false);
const error = ref('');
const success = ref('');
const submitted = ref(false);
const currentQuestionIndex = ref(0);
const movingQuestion = ref(false);
const DEBUG_SURVEY_FLOW_PREFIX = '[DEBUG-survey-flow]';

type PublicSurveyQuestion = NonNullable<PublicSurvey['questionListResponses']>[number];

const questions = computed(() => survey.value?.questionListResponses ?? []);
const isComplete = computed(() =>
  questions.value.length > 0 && questions.value.every((question) => hasQuestionAnswer(question)),
);
const currentQuestion = computed(() => questions.value[currentQuestionIndex.value] ?? null);
const currentQuestionKey = computed(() => {
  if (!currentQuestion.value) {
    return 'empty-question';
  }

  return `${currentQuestionIndex.value}-${currentQuestion.value.idQuestion}`;
});
const isLastQuestion = computed(() => currentQuestionIndex.value === questions.value.length - 1);
const isCurrentAnswered = computed(() => {
  if (!currentQuestion.value) {
    return false;
  }

  return hasQuestionAnswer(currentQuestion.value);
});
const progressPercent = computed(() => {
  if (questions.value.length === 0) {
    return 0;
  }

  return ((currentQuestionIndex.value + 1) / questions.value.length) * 100;
});
const progressLabel = computed(() => {
  if (questions.value.length === 0) {
    return 'Sin preguntas';
  }

  return `Pregunta ${currentQuestionIndex.value + 1} de ${questions.value.length}`;
});

function clearAnswers() {
  Object.keys(answers).forEach((key) => {
    delete answers[Number(key)];
  });
  Object.keys(writtenAnswers).forEach((key) => {
    delete writtenAnswers[Number(key)];
  });
}

function logSurveyFlow(step: string, data: unknown) {
  console.log(`${DEBUG_SURVEY_FLOW_PREFIX} ${step}`, data);
}

function getQuestionResponses(question: PublicSurveyQuestion) {
  return question.responsesQuestion ?? [];
}

function getQuestionResponseType(question: PublicSurveyQuestion) {
  return question.responseType ?? '';
}

function getQuestionResponseTypeLabel(question: PublicSurveyQuestion) {
  if (isWrittenQuestion(question)) {
    return writtenInputType(question) === 'date' ? 'Fecha' : 'Respuesta abierta';
  }

  return question.responseType || `Tipo ${question.responseTypeId ?? 'sin configurar'}`;
}

function getQuestionDebugInfo(question: PublicSurveyQuestion) {
  return {
    idQuestion: question.idQuestion,
    nameQuestion: question.nameQuestion,
    responseType: question.responseType,
    responseTypeId: question.responseTypeId,
    hasResponseType: Boolean(question.responseType),
    isWrittenQuestion: isWrittenQuestion(question),
    responsesQuestion: getQuestionResponses(question).map((response) => ({
      idResponse: response.idResponse,
      nameResponse: response.nameResponse,
    })),
  };
}

function getAnswerDebugSnapshot() {
  return {
    currentQuestionIndex: currentQuestionIndex.value,
    currentQuestionId: currentQuestion.value?.idQuestion ?? null,
    isCurrentAnswered: isCurrentAnswered.value,
    isComplete: isComplete.value,
    selectedAnswers: { ...answers },
    writtenAnswers: { ...writtenAnswers },
  };
}

function getQuestionPayloadStatus(question: PublicSurveyQuestion, responseid: string, clientResponseWritten: string) {
  if (isWrittenQuestion(question)) {
    if (!clientResponseWritten) {
      return 'ABIERTA_SIN_TEXTO';
    }

    if (responseid === '0') {
      return 'ABIERTA_SIN_RESPONSEID';
    }

    return 'OK';
  }

  return responseid ? 'OK' : 'OPCION_SIN_RESPONSEID';
}

function getResponseTextById(question: PublicSurveyQuestion, responseId: string) {
  const numericResponseId = Number(responseId);

  return getQuestionResponses(question).find((response) => response.idResponse === numericResponseId)?.nameResponse ?? '';
}

function isWrittenQuestion(question: PublicSurveyQuestion) {
  const normalizedType = getQuestionResponseType(question).toLowerCase();
  const responseTypeId = question.responseTypeId;

  return responseTypeId === 0 || [3, 9, 10].includes(responseTypeId ?? -1) || normalizedType.includes('abierta') || normalizedType.includes('fecha') || normalizedType.includes('corta');
}

function isLikertQuestion(question: PublicSurveyQuestion) {
  const normalizedType = getQuestionResponseType(question).toLowerCase();

  return question.responseTypeId === 8 || normalizedType.includes('likert');
}

function getLikertScaleStep(optionIndex: number, totalOptions: number) {
  if (totalOptions <= 1) {
    return 3;
  }

  return Math.min(5, Math.max(1, Math.round((optionIndex / (totalOptions - 1)) * 4) + 1));
}

function getLikertToneClass(optionIndex: number, totalOptions: number) {
  return `likert-tone-${getLikertScaleStep(optionIndex, totalOptions)}`;
}

function getLikertFaceClass(optionIndex: number, totalOptions: number) {
  const step = getLikertScaleStep(optionIndex, totalOptions);

  if (step === 1) {
    return 'likert-face-frown';
  }

  if (step === 2) {
    return 'likert-face-sad';
  }

  if (step === 3) {
    return 'likert-face-neutral';
  }

  if (step === 4) {
    return 'likert-face-smile';
  }

  return 'likert-face-happy';
}

function getLikertGridStyle(question: PublicSurveyQuestion) {
  const optionCount = Math.max(getQuestionResponses(question).length, 1);

  return {
    gridTemplateColumns: `repeat(${optionCount}, minmax(92px, 1fr))`,
  };
}

function writtenInputType(question: PublicSurveyQuestion) {
  const normalizedType = getQuestionResponseType(question).toLowerCase();

  return [9].includes(question.responseTypeId ?? 0) || normalizedType.includes('fecha') ? 'date' : 'text';
}

function hasQuestionAnswer(question: PublicSurveyQuestion) {
  if (isWrittenQuestion(question)) {
    return Boolean(writtenAnswers[question.idQuestion]?.trim());
  }

  return answers[question.idQuestion] !== undefined && answers[question.idQuestion] !== null;
}

function getWrittenQuestionResponseId(question: PublicSurveyQuestion) {
  const responseId = getQuestionResponses(question)[0]?.idResponse;

  return responseId === undefined || responseId === null ? null : responseId;
}

function getWrittenQuestionPayloadResponseId(question: PublicSurveyQuestion) {
  return getWrittenQuestionResponseId(question) ?? 0;
}

watch(currentQuestion, (question) => {
  if (!question) {
    return;
  }

  logSurveyFlow('pregunta_actual_llega_al_front', {
    rawQuestion: question,
    interpretedQuestion: getQuestionDebugInfo(question),
    currentQuestionIndex: currentQuestionIndex.value,
    progressLabel: progressLabel.value,
    responseTypeLabelShown: getQuestionResponseTypeLabel(question),
    writtenResponseIdFromApi: getWrittenQuestionResponseId(question),
    writtenResponseIdUsedForPayload: getWrittenQuestionPayloadResponseId(question),
    hasRegistrationOption: getWrittenQuestionResponseId(question) !== null,
    responsesCount: getQuestionResponses(question).length,
    snapshot: getAnswerDebugSnapshot(),
  });
});

function selectResponse(questionId: number, responseId: number) {
  answers[questionId] = responseId;
  error.value = '';

  logSurveyFlow('respuesta_marcada', {
    questionId,
    responseId,
    question: questions.value.find((question) => question.idQuestion === questionId) ?? null,
    snapshot: getAnswerDebugSnapshot(),
  });
}

function recordWrittenAnswerInput(questionId: number, event: Event) {
  const input = event.target as HTMLInputElement | null;

  writtenAnswers[questionId] = input?.value ?? '';
  error.value = '';

  logSurveyFlow('respuesta_escrita', {
    questionId,
    value: writtenAnswers[questionId],
    question: questions.value.find((question) => question.idQuestion === questionId) ?? null,
    snapshot: getAnswerDebugSnapshot(),
  });
}

function goBack() {
  if (movingQuestion.value) {
    return;
  }

  movingQuestion.value = true;
  error.value = '';
  const previousQuestionIndex = currentQuestionIndex.value;
  currentQuestionIndex.value = Math.max(currentQuestionIndex.value - 1, 0);
  logSurveyFlow('navegacion_pregunta', {
    direction: 'back',
    previousQuestionIndex,
    nextQuestionIndex: currentQuestionIndex.value,
    snapshot: getAnswerDebugSnapshot(),
  });
  window.setTimeout(() => {
    movingQuestion.value = false;
  }, 180);
}

function goNext() {
  if (movingQuestion.value) {
    return;
  }

  const question = currentQuestion.value;

  if (!question) {
    return;
  }

  if (!isCurrentAnswered.value) {
    error.value = 'Responde esta pregunta para continuar';
    logSurveyFlow('navegacion_bloqueada_sin_respuesta', {
      question: currentQuestion.value,
      snapshot: getAnswerDebugSnapshot(),
    });
    return;
  }

  movingQuestion.value = true;
  error.value = '';
  const previousQuestionIndex = currentQuestionIndex.value;
  currentQuestionIndex.value = Math.min(currentQuestionIndex.value + 1, questions.value.length - 1);
  logSurveyFlow('navegacion_pregunta', {
    direction: 'next',
    previousQuestionIndex,
    nextQuestionIndex: currentQuestionIndex.value,
    snapshot: getAnswerDebugSnapshot(),
  });
  window.setTimeout(() => {
    movingQuestion.value = false;
  }, 180);
}

async function loadSurvey() {
  loading.value = true;
  error.value = '';

  try {
    logSurveyFlow('cargando_encuesta', {
      routeSurveyId: props.surveyId,
      parsedSurveyId: Number(props.surveyId),
    });

    const response = await getSurveyForClient(Number(props.surveyId));

    logSurveyFlow('encuesta_recibida', {
      success: response.success,
      message: response.message,
      survey: response.data,
      questions: response.data?.questionListResponses?.map(getQuestionDebugInfo) ?? [],
    });

    if (!response.success || !response.data) {
      error.value = response.message || 'Encuesta no disponible';
      return;
    }

    survey.value = response.data;
    currentQuestionIndex.value = 0;
    submitted.value = false;
    clearAnswers();

    logSurveyFlow('estado_inicializado', {
      surveyId: survey.value.surveyId,
      surveyName: survey.value.surveyName,
      totalQuestions: questions.value.length,
      snapshot: getAnswerDebugSnapshot(),
    });
  } catch (err) {
    logSurveyFlow('error_cargando_encuesta', err);
    error.value = getApiMessage(err);
  } finally {
    loading.value = false;
  }
}

async function submit() {
  const hasValidSession = auth.validateSession();

  if (!hasValidSession) {
    logSurveyFlow('envio_encuesta_completo', {
      moment: 'sesion_invalida',
      session: {
        hasToken: Boolean(auth.token),
        isAuthenticated: hasValidSession,
        user: auth.user,
      },
      route: route.fullPath,
    });
    error.value = 'Inicia sesion para enviar tus respuestas';
    router.push({
      name: 'login',
      query: {
        redirect: route.fullPath,
      },
    });
    return;
  }

  if (!survey.value || !isComplete.value) {
    error.value = 'Completa la secuencia de preguntas';
    return;
  }

  sending.value = true;
  error.value = '';
  success.value = '';

  try {
    const payload: ResponseSurveyByClientRequest = {
      idSurvey: String(survey.value.surveyId),
      responseQuestions: questions.value.map((question) => ({
        questionId: String(question.idQuestion),
        responseid: String(isWrittenQuestion(question) ? getWrittenQuestionPayloadResponseId(question) : answers[question.idQuestion]),
        clientResponseWritten: isWrittenQuestion(question) ? writtenAnswers[question.idQuestion]?.trim() : '',
      })),
    };
    const payloadReview = payload.responseQuestions.map((payloadQuestion, index) => {
      const question = questions.value[index];

      return {
        order: index + 1,
        questionId: payloadQuestion.questionId,
        questionName: question.nameQuestion,
        responseType: getQuestionResponseTypeLabel(question),
        isWrittenQuestion: isWrittenQuestion(question),
        responseid: payloadQuestion.responseid,
        responseTextSelected: getResponseTextById(question, payloadQuestion.responseid),
        clientResponseWritten: payloadQuestion.clientResponseWritten,
        status: getQuestionPayloadStatus(question, payloadQuestion.responseid, payloadQuestion.clientResponseWritten ?? ''),
        availableResponses: getQuestionResponses(question).map((response) => ({
          idResponse: response.idResponse,
          nameResponse: response.nameResponse,
        })),
      };
    });

    logSurveyFlow('envio_encuesta_completo', {
      moment: 'antes_de_enviar',
      session: {
        hasToken: Boolean(auth.token),
        isAuthenticated: hasValidSession,
        user: auth.user,
      },
      survey: {
        idSurvey: survey.value.surveyId,
        surveyName: survey.value.surveyName,
      },
      route: route.fullPath,
      payload,
      payloadJson: JSON.stringify(payload, null, 2),
      questionsRaw: questions.value.map((question) => ({
        idQuestion: question.idQuestion,
        nameQuestion: question.nameQuestion,
        responseType: question.responseType,
        responseTypeId: question.responseTypeId,
        responsesQuestion: getQuestionResponses(question).map((response) => ({
          idResponse: response.idResponse,
          nameResponse: response.nameResponse,
        })),
      })),
      questionsInterpreted: questions.value.map(getQuestionDebugInfo),
      questionsReview: payloadReview,
      snapshot: getAnswerDebugSnapshot(),
    });

    const response = await answerSurvey(payload);

    logSurveyFlow('respuesta_backend_al_enviar', response);

    if (!response.success) {
      error.value = response.message || 'No se pudieron guardar las respuestas';
      return;
    }

    submitted.value = true;
    success.value = 'Encuesta completada. Gracias por ayudarnos a mejorar. Volviendo al dashboard...';
    window.setTimeout(() => {
      router.replace({ name: 'dashboard' }).then(() => {
        if (route.name === 'public-survey') {
          window.location.assign('/dashboard');
        }
      });
    }, 1400);
  } catch (err) {
    logSurveyFlow('error_al_enviar_respuestas', err);
    error.value = getApiMessage(err);
  } finally {
    sending.value = false;
  }
}

onMounted(loadSurvey);
</script>

<template>
  <main class="public-shell">
    <section v-if="loading" class="public-panel">
      <div class="brand-mark">SD</div>
      <ClipboardCheck :size="42" />
      <h1>Cargando encuesta</h1>
    </section>

    <section v-else-if="error && !survey" class="public-panel">
      <div class="brand-mark">SD</div>
      <AlertCircle :size="42" />
      <h1>Encuesta no disponible</h1>
      <p>{{ error }}</p>
    </section>

    <form v-else-if="survey" class="public-form" @submit.prevent="submit">
      <header class="public-header">
        <div class="brand-mark">SD</div>
        <div>
          <span>SurveyDanny</span>
          <h1>{{ survey.surveyName }}</h1>
        </div>
      </header>

      <p v-if="error" class="inline-error">{{ error }}</p>
      <section v-if="submitted" class="completion-card">
        <ClipboardCheck :size="44" />
        <h2>Encuesta completada</h2>
        <p>{{ success }}</p>
      </section>

      <template v-else>
        <section class="form-progress" aria-label="Progreso de encuesta">
          <div>
            <span>{{ progressLabel }}</span>
            <strong>{{ Math.round(progressPercent) }}%</strong>
          </div>
          <div class="progress-track">
            <span :style="{ width: `${progressPercent}%` }" />
          </div>
        </section>

        <section v-if="questions.length === 0" class="question-card">
          <div class="question-heading">
            <strong>Esta encuesta aun no tiene preguntas</strong>
          </div>
        </section>

        <article v-else-if="currentQuestion" :key="currentQuestionKey" class="question-card">
          <div class="question-heading">
            <div>
              <small>{{ progressLabel }}</small>
              <strong>{{ currentQuestion.nameQuestion }}</strong>
            </div>
            <span>{{ getQuestionResponseTypeLabel(currentQuestion) }}</span>
          </div>

          <div v-if="isWrittenQuestion(currentQuestion)" class="choice-list">
            <label class="field">
              <span>Respuesta</span>
              <input
                v-model="writtenAnswers[currentQuestion.idQuestion]"
                :type="writtenInputType(currentQuestion)"
                @input="recordWrittenAnswerInput(currentQuestion.idQuestion, $event)"
              />
            </label>
          </div>

          <div v-else-if="isLikertQuestion(currentQuestion)" class="likert-scale" role="radiogroup" :aria-label="currentQuestion.nameQuestion" :style="getLikertGridStyle(currentQuestion)">
            <span class="likert-end likert-minus" aria-hidden="true">-</span>
            <span class="likert-end likert-plus" aria-hidden="true">+</span>
            <div class="likert-track" aria-hidden="true" :style="getLikertGridStyle(currentQuestion)">
              <span
                v-for="(_, responseIndex) in getQuestionResponses(currentQuestion)"
                :key="`segment-${currentQuestion.idQuestion}-${responseIndex}`"
                class="likert-segment"
                :class="getLikertToneClass(responseIndex, getQuestionResponses(currentQuestion).length)"
              />
            </div>

            <label
              v-for="(response, responseIndex) in getQuestionResponses(currentQuestion)"
              :key="response.idResponse"
              class="likert-option"
              :class="[
                getLikertToneClass(responseIndex, getQuestionResponses(currentQuestion).length),
                getLikertFaceClass(responseIndex, getQuestionResponses(currentQuestion).length),
                { selected: answers[currentQuestion.idQuestion] === response.idResponse },
              ]"
              @click="selectResponse(currentQuestion.idQuestion, response.idResponse)"
            >
              <input
                v-model.number="answers[currentQuestion.idQuestion]"
                type="radio"
                :name="`q-${currentQuestion.idQuestion}`"
                :value="response.idResponse"
                @change="selectResponse(currentQuestion.idQuestion, response.idResponse)"
              />
              <span class="likert-face" aria-hidden="true">
                <span class="likert-eye left" />
                <span class="likert-eye right" />
                <span class="likert-mouth" />
              </span>
              <span class="likert-option-label">{{ response.nameResponse || 'Respuesta sin texto' }}</span>
            </label>
          </div>

          <div v-else class="choice-list">
            <label
              v-for="response in getQuestionResponses(currentQuestion)"
              :key="response.idResponse"
              class="choice-option"
              :class="{ selected: answers[currentQuestion.idQuestion] === response.idResponse }"
              @click="selectResponse(currentQuestion.idQuestion, response.idResponse)"
            >
              <input
                v-model.number="answers[currentQuestion.idQuestion]"
                type="radio"
                :name="`q-${currentQuestion.idQuestion}`"
                :value="response.idResponse"
                @change="selectResponse(currentQuestion.idQuestion, response.idResponse)"
              />
              <span>{{ response.nameResponse || 'Respuesta sin texto' }}</span>
            </label>
          </div>
        </article>

        <div class="public-actions">
          <button class="secondary-button" type="button" :disabled="currentQuestionIndex === 0 || movingQuestion" @click.prevent="goBack">
            <ArrowLeft :size="18" />
            <span>Anterior</span>
          </button>
          <button v-if="!isLastQuestion" class="primary-button" type="button" :disabled="questions.length === 0 || movingQuestion" @click.prevent="goNext">
            <ArrowRight :size="18" />
            <span>Siguiente</span>
          </button>
          <button v-else class="primary-button" :disabled="sending || success.length > 0 || !isComplete" type="submit">
            <LoaderCircle v-if="sending" class="spin" :size="18" />
            <Send v-else :size="18" />
            <span>Enviar</span>
          </button>
        </div>
      </template>
    </form>
  </main>
</template>
