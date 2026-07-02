<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { AlertTriangle, Trash2, X } from 'lucide-vue-next';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    itemName: string;
    loading?: boolean;
  }>(),
  {
    loading: false,
  },
);

const emit = defineEmits<{
  cancel: [];
  confirm: [];
}>();

const cancelButton = ref<HTMLButtonElement | null>(null);
let previousActiveElement: HTMLElement | null = null;

function cancel() {
  if (!props.loading) {
    emit('cancel');
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    cancel();
  }
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      document.body.style.overflow = 'hidden';
      await nextTick();
      cancelButton.value?.focus();
      return;
    }

    document.body.style.overflow = '';
    previousActiveElement?.focus();
    previousActiveElement = null;
  },
);

onBeforeUnmount(() => {
  document.body.style.overflow = '';
});
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-dialog">
      <div
        v-if="open"
        class="confirm-dialog-backdrop"
        role="presentation"
        @click.self="cancel"
        @keydown="handleKeydown"
      >
        <section
          class="confirm-dialog-card"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          aria-describedby="confirm-dialog-description"
        >
          <button class="confirm-dialog-close" type="button" aria-label="Cerrar" :disabled="loading" @click="cancel">
            <X :size="20" />
          </button>

          <div class="confirm-dialog-icon" aria-hidden="true">
            <AlertTriangle :size="28" />
          </div>

          <div class="confirm-dialog-copy">
            <span>Confirmar eliminación</span>
            <h2 id="confirm-dialog-title">{{ title }}</h2>
            <p id="confirm-dialog-description">
              Estás a punto de eliminar <strong>“{{ itemName }}”</strong>. Esta acción no se puede deshacer.
            </p>
          </div>

          <div class="confirm-dialog-actions">
            <button ref="cancelButton" class="confirm-dialog-cancel" type="button" :disabled="loading" @click="cancel">
              Cancelar
            </button>
            <button class="confirm-dialog-confirm" type="button" :disabled="loading" @click="emit('confirm')">
              <Trash2 :size="18" />
              <span>{{ loading ? 'Eliminando...' : 'Sí, eliminar' }}</span>
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.confirm-dialog-backdrop {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: grid;
  place-items: center;
  overflow-y: auto;
  background: rgba(15, 23, 42, 0.58);
  backdrop-filter: blur(4px);
  padding: 24px;
}

.confirm-dialog-card {
  position: relative;
  width: min(100%, 480px);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 18px;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #ffffff;
  padding: 26px;
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.28);
}

.confirm-dialog-icon {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  color: #be123c;
  background: #fff1f2;
}

.confirm-dialog-copy {
  min-width: 0;
  padding-right: 24px;
}

.confirm-dialog-copy > span {
  display: block;
  margin-bottom: 5px;
  color: #be123c;
  font-size: 0.75rem;
  font-weight: 900;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.confirm-dialog-copy h2 {
  margin: 0;
  color: #111827;
  font-size: 1.25rem;
  line-height: 1.3;
}

.confirm-dialog-copy p {
  margin: 9px 0 0;
  color: #64748b;
  line-height: 1.55;
}

.confirm-dialog-copy strong {
  color: #334155;
  overflow-wrap: anywhere;
}

.confirm-dialog-close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 8px;
  color: #64748b;
  background: transparent;
  cursor: pointer;
}

.confirm-dialog-close:hover {
  color: #111827;
  background: #f1f5f9;
}

.confirm-dialog-actions {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid #e5e7eb;
  margin-top: 2px;
  padding-top: 18px;
}

.confirm-dialog-cancel,
.confirm-dialog-confirm {
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 8px;
  padding: 0 16px;
  font-weight: 800;
  cursor: pointer;
}

.confirm-dialog-cancel {
  border: 1px solid #d1d5db;
  color: #334155;
  background: #ffffff;
}

.confirm-dialog-cancel:hover {
  background: #f8fafc;
}

.confirm-dialog-confirm {
  border: 1px solid #be123c;
  color: #ffffff;
  background: #be123c;
}

.confirm-dialog-confirm:hover {
  border-color: #9f1239;
  background: #9f1239;
}

.confirm-dialog-cancel:focus-visible,
.confirm-dialog-confirm:focus-visible,
.confirm-dialog-close:focus-visible {
  outline: 3px solid rgba(15, 118, 110, 0.25);
  outline-offset: 2px;
}

.confirm-dialog-cancel:disabled,
.confirm-dialog-confirm:disabled,
.confirm-dialog-close:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.confirm-dialog-enter-active,
.confirm-dialog-leave-active {
  transition: opacity 160ms ease;
}

.confirm-dialog-enter-active .confirm-dialog-card,
.confirm-dialog-leave-active .confirm-dialog-card {
  transition: transform 160ms ease, opacity 160ms ease;
}

.confirm-dialog-enter-from,
.confirm-dialog-leave-to {
  opacity: 0;
}

.confirm-dialog-enter-from .confirm-dialog-card,
.confirm-dialog-leave-to .confirm-dialog-card {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
}

@media (max-width: 520px) {
  .confirm-dialog-backdrop {
    padding: 16px;
  }

  .confirm-dialog-card {
    grid-template-columns: 1fr;
    gap: 14px;
    padding: 22px;
  }

  .confirm-dialog-copy {
    padding-right: 0;
  }

  .confirm-dialog-actions {
    display: grid;
  }
}
</style>
