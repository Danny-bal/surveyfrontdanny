<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Copy, FileText, Layers3, Pencil, Plus, Search, ScrollText, Trash2 } from 'lucide-vue-next';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog.vue';
import { getApiMessage } from '@/api/http';
import { createQuestion, deleteQuestion, getQuestions } from '@/api/questionApi';
import type { Question } from '@/types/api';

const questions = ref<Question[]>([]);
const loading = ref(true);
const duplicatingId = ref<number | null>(null);
const questionPendingDelete = ref<Question | null>(null);
const deletingQuestion = ref(false);
const error = ref('');
const success = ref('');
const search = ref('');
const lengthFilter = ref('all');
const sortMode = ref('recent');
const pageSize = ref(10);
const currentPage = ref(1);

const sortedQuestions = computed(() => {
  const query = search.value.trim().toLowerCase();

  return [...questions.value]
    .filter((question) => {
      const name = question.queName.trim();
      const matchesSearch = name.toLowerCase().includes(query);
      const lengthGroup = getQuestionLengthGroup(question);
      const matchesLength = lengthFilter.value === 'all' || lengthFilter.value === lengthGroup;

      return matchesSearch && matchesLength;
    })
    .sort((firstQuestion, secondQuestion) => {
      if (sortMode.value === 'az') {
        return firstQuestion.queName.localeCompare(secondQuestion.queName);
      }

      if (sortMode.value === 'za') {
        return secondQuestion.queName.localeCompare(firstQuestion.queName);
      }

      return secondQuestion.id - firstQuestion.id;
    });
});
const totalPages = computed(() => Math.max(1, Math.ceil(sortedQuestions.value.length / pageSize.value)));
const pageStart = computed(() => (currentPage.value - 1) * pageSize.value);
const pageEnd = computed(() => Math.min(pageStart.value + pageSize.value, sortedQuestions.value.length));
const paginatedQuestions = computed(() => sortedQuestions.value.slice(pageStart.value, pageEnd.value));
const shortQuestionsCount = computed(() => questions.value.filter((question) => getQuestionLengthGroup(question) === 'short').length);
const longQuestionsCount = computed(() => questions.value.filter((question) => getQuestionLengthGroup(question) === 'long').length);
const visibleRangeLabel = computed(() => {
  if (sortedQuestions.value.length === 0) {
    return 'Mostrando 0 de 0 preguntas';
  }

  return `Mostrando ${pageStart.value + 1} a ${pageEnd.value} de ${sortedQuestions.value.length} preguntas`;
});
const pageNumbers = computed(() => {
  const pages = new Set<number>([1, totalPages.value, currentPage.value]);

  if (currentPage.value > 1) {
    pages.add(currentPage.value - 1);
  }

  if (currentQuestionCanMoveForward()) {
    pages.add(currentPage.value + 1);
  }

  return [...pages].filter((page) => page >= 1 && page <= totalPages.value).sort((firstPage, secondPage) => firstPage - secondPage);
});

watch([search, lengthFilter, sortMode, pageSize], () => {
  currentPage.value = 1;
});

watch(totalPages, (nextTotalPages) => {
  if (currentPage.value > nextTotalPages) {
    currentPage.value = nextTotalPages;
  }
});

function currentQuestionCanMoveForward() {
  return currentPage.value < totalPages.value;
}

function getQuestionLengthGroup(question: Question) {
  const length = question.queName.trim().length;

  if (length <= 80) {
    return 'short';
  }

  if (length <= 160) {
    return 'medium';
  }

  return 'long';
}

function getQuestionLengthLabel(question: Question) {
  const group = getQuestionLengthGroup(question);

  if (group === 'short') {
    return 'Corta';
  }

  if (group === 'medium') {
    return 'Media';
  }

  return 'Larga';
}

function getQuestionLengthClass(question: Question) {
  return `question-length-${getQuestionLengthGroup(question)}`;
}

function goToPage(page: number) {
  currentPage.value = Math.min(Math.max(page, 1), totalPages.value);
}

function resetFilters() {
  search.value = '';
  lengthFilter.value = 'all';
  sortMode.value = 'recent';
  pageSize.value = 10;
}

async function loadQuestions() {
  loading.value = true;
  error.value = '';

  try {
    const response = await getQuestions();
    questions.value = response.data ?? [];
  } catch {
    error.value = 'No se pudieron cargar las preguntas';
  } finally {
    loading.value = false;
  }
}

async function duplicateQuestion(question: Question) {
  duplicatingId.value = question.id;
  error.value = '';
  success.value = '';

  try {
    const response = await createQuestion({
      queName: `${question.queName} (copia)`,
    });

    if (!response.success) {
      error.value = response.message || 'No se pudo duplicar la pregunta';
      return;
    }

    await loadQuestions();
    success.value = 'Pregunta duplicada correctamente';
  } catch (err) {
    error.value = getApiMessage(err);
  } finally {
    duplicatingId.value = null;
  }
}

function removeQuestion(question: Question) {
  questionPendingDelete.value = question;
}

function cancelQuestionDeletion() {
  if (!deletingQuestion.value) {
    questionPendingDelete.value = null;
  }
}

async function confirmQuestionDeletion() {
  const question = questionPendingDelete.value;

  if (!question) {
    return;
  }

  deletingQuestion.value = true;
  error.value = '';
  success.value = '';

  try {
    await deleteQuestion(question.id);
    questionPendingDelete.value = null;
    await loadQuestions();
    success.value = 'Pregunta eliminada correctamente';
  } catch (err) {
    error.value = getApiMessage(err);
  } finally {
    deletingQuestion.value = false;
  }
}

onMounted(loadQuestions);
</script>

<template>
  <main class="page">
    <ConfirmDeleteDialog
      :open="questionPendingDelete !== null"
      title="¿Eliminar esta pregunta?"
      :item-name="questionPendingDelete?.queName ?? ''"
      :loading="deletingQuestion"
      @cancel="cancelQuestionDeletion"
      @confirm="confirmQuestionDeletion"
    />

    <PageHeader title="Preguntas" eyebrow="Banco" description="Administra y organiza tu banco de preguntas">
      <RouterLink class="primary-button compact" to="/questions/new">
        <Plus :size="18" />
        <span>Nueva pregunta</span>
      </RouterLink>
    </PageHeader>

    <p v-if="error" class="inline-error">{{ error }}</p>
    <p v-if="success" class="form-success">{{ success }}</p>

    <div v-if="loading" class="loading-row">Cargando...</div>

    <EmptyState
      v-else-if="questions.length === 0"
      title="Sin preguntas"
      text="Registra la primera pregunta"
      :icon="ScrollText"
    >
      <RouterLink class="primary-button compact" to="/questions/new">
        <Plus :size="18" />
        <span>Nueva pregunta</span>
      </RouterLink>
    </EmptyState>

    <template v-else>
      <section class="question-bank-stats" aria-label="Resumen de preguntas">
        <article class="stat-tile stat-green">
          <div class="stat-icon">
            <ScrollText :size="22" />
          </div>
          <div>
            <span>Total banco</span>
            <strong>{{ questions.length }}</strong>
          </div>
        </article>
        <article class="stat-tile stat-blue">
          <div class="stat-icon">
            <Search :size="22" />
          </div>
          <div>
            <span>Resultados</span>
            <strong>{{ sortedQuestions.length }}</strong>
          </div>
        </article>
        <article class="stat-tile stat-amber">
          <div class="stat-icon">
            <FileText :size="22" />
          </div>
          <div>
            <span>Preguntas cortas</span>
            <strong>{{ shortQuestionsCount }}</strong>
          </div>
        </article>
        <article class="stat-tile stat-rose">
          <div class="stat-icon">
            <Layers3 :size="22" />
          </div>
          <div>
            <span>Preguntas largas</span>
            <strong>{{ longQuestionsCount }}</strong>
          </div>
        </article>
      </section>

      <section class="question-bank-toolbar">
        <label class="field question-bank-search">
          <span>Buscar pregunta</span>
          <div>
            <Search :size="18" />
            <input v-model="search" type="search" placeholder="Buscar por texto" />
          </div>
        </label>

        <label class="field">
          <span>Longitud</span>
          <select v-model="lengthFilter">
            <option value="all">Todas</option>
            <option value="short">Cortas</option>
            <option value="medium">Medias</option>
            <option value="long">Largas</option>
          </select>
        </label>

        <label class="field">
          <span>Ordenar</span>
          <select v-model="sortMode">
            <option value="recent">Mas recientes</option>
            <option value="az">A-Z</option>
            <option value="za">Z-A</option>
          </select>
        </label>

        <button class="secondary-button compact question-bank-reset" type="button" @click="resetFilters">
          <span>Limpiar</span>
        </button>
      </section>

      <section class="table-shell question-bank-table">
        <div class="section-heading question-bank-table-heading">
          <div>
            <h2>Listado de preguntas</h2>
            <p>{{ visibleRangeLabel }}</p>
          </div>
          <RouterLink class="secondary-button compact" to="/questions/new">
            <Plus :size="17" />
            <span>Nueva</span>
          </RouterLink>
        </div>

        <div v-if="sortedQuestions.length === 0" class="question-bank-empty-filter">
          <Search :size="32" />
          <h3>Sin resultados</h3>
          <p>No hay preguntas que coincidan con los filtros actuales.</p>
          <button class="secondary-button compact" type="button" @click="resetFilters">
            <span>Limpiar filtros</span>
          </button>
        </div>

        <template v-else>
          <table>
            <thead>
              <tr>
                <th>Pregunta</th>
                <th>Longitud</th>
                <th>Referencia</th>
                <th>Uso</th>
                <th class="action-column">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="question in paginatedQuestions" :key="question.id">
                <td>
                  <div class="question-bank-name">
                    <strong>{{ question.queName }}</strong>
                    <span>{{ question.queName.length }} caracteres</span>
                  </div>
                </td>
                <td>
                  <span class="question-length-badge" :class="getQuestionLengthClass(question)">
                    {{ getQuestionLengthLabel(question) }}
                  </span>
                </td>
                <td>
                  <span class="question-id-pill">ID {{ question.id }}</span>
                </td>
                <td>
                  <span class="question-bank-use">Disponible para encuestas</span>
                </td>
                <td>
                  <div class="row-actions question-bank-actions">
                    <RouterLink class="icon-button" :to="`/questions/${question.id}/edit`" title="Editar">
                      <Pencil :size="17" />
                    </RouterLink>
                    <button
                      class="icon-button"
                      type="button"
                      title="Duplicar"
                      :disabled="duplicatingId === question.id"
                      @click="duplicateQuestion(question)"
                    >
                      <Copy :size="17" />
                    </button>
                    <button class="icon-button danger" type="button" title="Eliminar" @click="removeQuestion(question)">
                      <Trash2 :size="17" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <div class="question-bank-pagination">
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
                class="icon-button question-bank-page"
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
