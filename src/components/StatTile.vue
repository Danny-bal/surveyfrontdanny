<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{
  label: string;
  value: string | number;
  tone: 'green' | 'blue' | 'amber' | 'rose';
  icon: Component;
}>();
</script>

<template>
  <article class="stat-tile" :class="`stat-${tone}`">
    <div class="stat-icon">
      <component :is="icon" :size="20" />
    </div>
    <div>
      <span>{{ label }}</span>
      <strong>{{ value }}</strong>
    </div>
  </article>
</template>
