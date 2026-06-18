<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, LoaderCircle, Save } from 'lucide-vue-next';
import PageHeader from '@/components/PageHeader.vue';
import { createQuestion, getQuestionById, updateQuestion } from '@/api/questionApi';
import { getApiMessage } from '@/api/http';

const props = defineProps<{
  id?: string;
}>();

const router = useRouter();
const isEdit = computed(() => Boolean(props.id));
const name = ref('');
const loading = ref(false);
const saving = ref(false);
const error = ref('');

async function loadQuestion() {
  if (!props.id) {
    return;
  }

  loading.value = true;
  error.value = '';

  try {
    const response = await getQuestionById(Number(props.id));
    name.value = response.data.queName;
  } catch (err) {
    error.value = getApiMessage(err);
  } finally {
    loading.value = false;
  }
}

async function submit() {
  saving.value = true;
  error.value = '';

  try {
    if (props.id) {
      await updateQuestion(Number(props.id), {
        id: Number(props.id),
        queName: name.value,
      });
    } else {
      await createQuestion({
        queName: name.value,
      });
    }

    router.push('/questions');
  } catch (err) {
    error.value = getApiMessage(err);
  } finally {
    saving.value = false;
  }
}

onMounted(loadQuestion);
</script>

<template>
  <main class="page narrow-page">
    <PageHeader :title="isEdit ? 'Editar pregunta' : 'Nueva pregunta'" eyebrow="Banco" description="Texto de pregunta">
      <RouterLink class="secondary-button compact" to="/questions">
        <ArrowLeft :size="18" />
        <span>Volver</span>
      </RouterLink>
    </PageHeader>

    <form class="form-surface" @submit.prevent="submit">
      <p v-if="error" class="inline-error">{{ error }}</p>
      <div v-if="loading" class="loading-row">Cargando...</div>

      <template v-else>
        <label class="field">
          <span>Pregunta</span>
          <textarea v-model="name" required rows="4" />
        </label>

        <div class="form-actions">
          <button class="primary-button" :disabled="saving" type="submit">
            <LoaderCircle v-if="saving" class="spin" :size="18" />
            <Save v-else :size="18" />
            <span>Guardar</span>
          </button>
        </div>
      </template>
    </form>
  </main>
</template>
