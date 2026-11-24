<script setup lang="ts">
defineProps<{ displayName: string; loggingOut: boolean }>()
const emit = defineEmits<{ logout: [] }>()
</script>

<template>
  <div class="sidebar-bottom">
    <div class="sidebar-account">
      <span class="account-avatar">{{ displayName.slice(0, 1) }}</span>
      <div class="account-text">
        <strong>{{ displayName }}</strong>
        <span>个人工作空间</span>
      </div>
    </div>
    <button class="logout-button" type="button" :aria-label="loggingOut ? '退出中' : '退出登录'"
      title="退出登录" :disabled="loggingOut" :aria-busy="loggingOut" @click="emit('logout')">
      <svg v-if="loggingOut" class="logout-loading" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 12a9 9 0 1 1-9-9" />
      </svg>
      <svg v-else viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9" />
      </svg>
      <span>{{ loggingOut ? '退出中…' : '退出登录' }}</span>
    </button>
  </div>
</template>

<style scoped>
.sidebar-bottom {
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--color-line);
}

.sidebar-account {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
}

.account-avatar {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 10px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-weight: 600;
}

.account-text {
  min-width: 0;
}

.account-text strong {
  display: block;
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-text span {
  display: block;
  margin-top: 3px;
  font-size: 11px;
  color: var(--color-text-faint);
}

.logout-button {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.logout-button:enabled:hover {
  background: rgba(20, 35, 61, 0.05);
  color: var(--color-danger);
}

.logout-button:disabled {
  cursor: wait;
}

.logout-button svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@media (prefers-reduced-motion: no-preference) {
  .logout-loading {
    animation: logout-spin 1s linear infinite;
  }
}

@keyframes logout-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 900px) {
  .account-text,
  .logout-button > span {
    display: none;
  }

  .logout-button {
    justify-content: center;
    padding: 0;
  }

  .sidebar-account {
    justify-content: center;
    padding: 10px 0;
  }
}
</style>
