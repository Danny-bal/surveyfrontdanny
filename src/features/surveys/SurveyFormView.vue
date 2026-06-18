<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, LoaderCircle, Save } from 'lucide-vue-next';
import PageHeader from '@/components/PageHeader.vue';
import { createSurvey, getSurveyById, getSurveys, updateSurvey } from '@/api/surveyApi';
import { getApiMessage } from '@/api/http';

const props = defineProps<{
  id?: string;
}>();

const router = useRouter();
const isEdit = computed(() => Boolean(props.id));
const title = ref('');
const description = ref('');
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const DEBUG_SURVEY_FLOW_PREFIX = '[DEBUG-survey-flow]';

function logSurveyFlow(step: string, data: unknown) {
  console.log(`${DEBUG_SURVEY_FLOW_PREFIX} ${step}`, data);
}

async function loadSurvey() {
  if (!props.id) {
    return;
  }

  loading.value = true;
  error.value = '';

  try {
    const response = await getSurveyById(Number(props.id));
    title.value = response.data.surTitle;
    description.value = response.data.surDescription;
  } catch (err) {
    error.value = getApiMessage(err);
  } finally {
    loading.value = false;
  }
}

async function findCreatedSurveyId(payload: { surTitle: string; surDescription: string }) {
  const response = await getSurveys();
  const surveys = response.data ?? [];

  return (
    surveys
      .filter((survey) => survey.surTitle === payload.surTitle && survey.surDescription === payload.surDescription)
      .sort((current, next) => {
        const currentDate = new Date(current.surCreationDate).getTime();
        const nextDate = new Date(next.surCreationDate).getTime();

        if (currentDate === nextDate) {
          return next.id - current.id;
        }

        return nextDate - currentDate;
      })[0]?.id ?? null
  );
}

async function submit() {
  saving.value = true;
  error.value = '';

  try {
    const payload = {
      surTitle: title.value,
      surDescription: description.value,
    };

    if (props.id) {
      const response = await updateSurvey(Number(props.id), payload);
      logSurveyFlow('encuesta_manual_guardada', {
        mode: 'edit',
        surveyId: Number(props.id),
        payload,
        response,
      });

      if (!response.success) {
        error.value = response.message || 'No se pudo guardar la encuesta';
        return;
      }

      router.push('/surveys');
    } else {
      const response = await createSurvey(payload);
      const createdSurveyId = response.success ? await findCreatedSurveyId(payload) : null;

      logSurveyFlow('encuesta_manual_guardada', {
        mode: 'create',
        payload,
        response,
        createdSurveyId,
      });

      if (!response.success) {
        error.value = response.message || 'No se pudo crear la encuesta';
        return;
      }

      if (!createdSurveyId) {
        error.value = 'Encuesta creada, pero no se pudo abrir el constructor automaticamente';
        return;
      }

      router.push(`/surveys/${createdSurveyId}/builder`);
    }
  } catch (err) {
    error.value = getApiMessage(err);
  } finally {
    saving.value = false;
  }
}

onMounted(loadSurvey);
</script>

<template>
  <main class="page narrow-page">
    <PageHeader :title="isEdit ? 'Editar encuesta' : 'Nueva encuesta'" eyebrow="Encuestas" description="Datos principales">
      <RouterLink class="secondary-button compact" to="/surveys">
        <ArrowLeft :size="18" />
        <span>Volver</span>
      </RouterLink>
    </PageHeader>

    <form class="form-surface" @submit.prevent="submit">
      <p v-if="error" class="inline-error">{{ error }}</p>
      <div v-if="loading" class="loading-row">Cargando...</div>

      <template v-else>
        <label class="field">
          <span>Titulo</span>
          <input v-model="title" required type="text" />
        </label>

        <label class="field">
          <span>Descripcion</span>
          <textarea v-model="description" required rows="5" />
        </label>

        <div class="form-actions">
          <button class="primary-button" :disabled="saving" type="submit">
            <LoaderCircle v-if="saving" class="spin" :size="18" />
            <Save v-else :size="18" />
            <span>{{ isEdit ? 'Guardar cambios' : 'Guardar y continuar' }}</span>
          </button>
        </div>
      </template>
    </form>
  </main>
</template>
