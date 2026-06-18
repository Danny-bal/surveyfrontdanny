<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{
  title: string;
  text: string;
  icon: Component;
}>();
</script>

<template>
  <section class="empty-state">
    <component :is="icon" :size="34" />
    <h2>{{ title }}</h2>
    <p>{{ text }}</p>
    <slot />
  </section>
</template>
