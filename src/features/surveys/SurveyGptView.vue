<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, BarChart3, ClipboardList, ExternalLink, LoaderCircle, Wand2 } from 'lucide-vue-next';
import PageHeader from '@/components/PageHeader.vue';
import { getApiMessage } from '@/api/http';
import { generateSurveyWithGpt } from '@/api/surveyGptApi';
import type { SurveyGptGenerated } from '@/types/api';

const router = useRouter();

const responseTypeLabels: Record<number, string> = {
  1: 'Si/No',
  2: 'Escala 1-5',
  3: 'Abierta',
  4: 'Opcion multiple',
  5: 'Verdadero/Falso',
  6: 'Clasificacion 1-10',
  7: 'De acuerdo/Desacuerdo',
  8: 'Escala Likert',
  9: 'Fecha',
  10: 'Respuesta corta',
  11: 'Casillas de verificacion',
  12: 'Desplegable',
};

const topic = ref('');
const objective = ref('');
const quantity = ref(8);
const saving = ref(false);
const error = ref('');
const success = ref('');
const generatedSurveyId = ref<number | null>(null);
const generatedSurvey = ref<SurveyGptGenerated | null>(null);

const canSubmit = computed(() => topic.value.trim().length > 0 && objective.value.trim().length > 0 && quantity.value > 0);

async function submit() {
  if (!canSubmit.value) {
    error.value = 'Completa tema, objetivo y cantidad';
    return;
  }

  saving.value = true;
  error.value = '';
  success.value = '';
  generatedSurveyId.value = null;
  generatedSurvey.value = null;

  try {
    const response = await generateSurveyWithGpt({
      temaEncuesta: topic.value.trim(),
      objetivo: objective.value.trim(),
      cantidadPreguntas: quantity.value,
    });

    if (!response.success || !response.surveyId) {
      error.value = response.message || 'No se pudo generar la encuesta';
      return;
    }

    generatedSurveyId.value = response.surveyId;
    generatedSurvey.value = response.surveyGenerated;
    success.value = response.message || 'Encuesta generada correctamente';
  } catch (err) {
    error.value = getApiMessage(err);
  } finally {
    saving.value = false;
  }
}

function goToBuilder() {
  if (generatedSurveyId.value) {
    router.push(`/surveys/${generatedSurveyId.value}/builder`);
  }
}
</script>

<template>
  <main class="page">
    <PageHeader title="Generar encuesta" eyebrow="IA" description="Crear encuesta completa desde un objetivo">
      <RouterLink class="secondary-button compact" to="/surveys">
        <ArrowLeft :size="18" />
        <span>Volver</span>
      </RouterLink>
    </PageHeader>

    <section class="ai-builder-grid">
      <form class="form-surface ai-form" @submit.prevent="submit">
        <p v-if="error" class="inline-error">{{ error }}</p>
        <p v-if="success" class="form-success">{{ success }}</p>

        <label class="field">
          <span>Tema de la encuesta</span>
          <input v-model="topic" required type="text" placeholder="Ej. Satisfaccion del cliente" />
        </label>

        <label class="field">
          <span>Objetivo</span>
          <textarea
            v-model="objective"
            required
            rows="6"
            placeholder="Ej. Medir la percepcion del servicio y detectar oportunidades de mejora"
          />
        </label>

        <label class="field">
          <span>Cantidad de preguntas</span>
          <input v-model.number="quantity" min="1" max="20" required type="number" />
        </label>

        <div class="form-actions">
          <button class="primary-button" :disabled="saving || !canSubmit" type="submit">
            <LoaderCircle v-if="saving" class="spin" :size="18" />
            <Wand2 v-else :size="18" />
            <span>{{ saving ? 'Generando' : 'Generar y guardar' }}</span>
          </button>
        </div>
      </form>

      <section class="generated-panel">
        <div class="section-heading">
          <h2>Resultado</h2>
          <Wand2 :size="20" />
        </div>

        <div v-if="!generatedSurvey" class="placeholder-panel compact-panel">
          <Wand2 :size="34" />
          <h3>Lista para generar</h3>
        </div>

        <template v-else>
          <div class="generated-summary">
            <span class="eyebrow">Encuesta creada</span>
            <h3>{{ generatedSurvey.surTitle }}</h3>
            <p>{{ generatedSurvey.surDescription }}</p>
          </div>

          <div class="generated-actions">
            <button class="primary-button compact" type="button" @click="goToBuilder">
              <ClipboardList :size="17" />
              <span>Constructor</span>
            </button>
            <RouterLink class="secondary-button compact" :to="`/s/${generatedSurveyId}`">
              <ExternalLink :size="17" />
              <span>Publica</span>
            </RouterLink>
            <RouterLink class="secondary-button compact" :to="{ name: 'reports', query: { surveyId: generatedSurveyId } }">
              <BarChart3 :size="17" />
              <span>Reportes</span>
            </RouterLink>
          </div>

          <div class="generated-list">
            <article v-for="question in generatedSurvey.questionName" :key="question.name" class="generated-question">
              <div>
                <strong>{{ question.name }}</strong>
                <span>{{ responseTypeLabels[question.responseTypeId] ?? `Tipo ${question.responseTypeId}` }}</span>
              </div>
              <small v-if="question.responsesCreated.length > 0">
                {{ question.responsesCreated.length }} opciones
              </small>
            </article>
          </div>
        </template>
      </section>
    </section>
  </main>
</template>
