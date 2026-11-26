<script setup lang="ts">
import type { AxiosError } from 'axios'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { bindUserRole, changeUserStatus, createUser, deleteUser, getRoles, getUserList, unbindUserRole } from '@/api/users'
import RoleManageDialog from '@/components/RoleManageDialog.vue'
import SkeletonTable from '@/components/SkeletonTable.vue'
import { useAuthStore } from '@/stores/auth'
import type { RoleSummary, UserListItem } from '@/types/api'
import { validateNewPassword } from '@/utils/passwordPolicy'
const router = useRouter()
const authStore = useAuthStore()
const FIRST_PAGE = 1
const PAGE_SIZE = 20
const USER_STATUS_ACTIVE = 'active'
const USER_STATUS_DISABLED = 'disabled'
const PERMISSION_USERS_LIST = 'users:list'
const PERMISSION_USERS_CREATE = 'users:create'
const PERMISSION_USERS_ASSIGN_ROLE = 'users:assign_role'
const PERMISSION_USERS_DISABLE = 'users:disable'
const PERMISSION_USERS_DELETE = 'users:delete'
const currentPage = ref(FIRST_PAGE)
const userItems = ref<UserListItem[]>([])
const totalCount = ref(0)
const loading = ref(false)
const loadError = ref('')
const ADMIN_ROLE_CODE = 'admin'
type RoleAction = 'bind' | 'unbind'
const canBindRoles = computed(() => authStore.hasPermission(PERMISSION_USERS_ASSIGN_ROLE))
const canChangeStatus = computed(() => authStore.hasPermission(PERMISSION_USERS_DISABLE))
const canDeleteUsers = computed(() => authStore.hasPermission(PERMISSION_USERS_DELETE))
const canManageUsers = computed(() => canBindRoles.value || canChangeStatus.value || canDeleteUsers.value)
const roleDialog = reactive({
  action: 'bind' as RoleAction, user: null as UserListItem | null, roleCode: '',
  options: [] as RoleSummary[], visible: false, loading: false, saving: false,
})
const statusChangeUserId = ref<number | null>(null)
const deletingUserId = ref<number | null>(null)
const createDialogVisible = ref(false)
const creating = ref(false)
const createFormRef = ref<FormInstance>()
const MAX_ACCOUNT_LENGTH = 50
const createForm = reactive({ username: '', password: '', display_name: '' })
const createRules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 1, max: MAX_ACCOUNT_LENGTH, message: '用户名需为 1–50 个字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入初始密码', trigger: 'blur' },
    { asyncValidator: validateNewPassword, trigger: 'blur' },
  ],
  display_name: [{ max: MAX_ACCOUNT_LENGTH, message: '显示名最多 50 个字符', trigger: 'blur' }],
}

// 做什么：校验并创建普通账号，成功后清空表单并刷新当前页
// 入参：无，读取当前表单实例和字段
// 返回：失败保留输入；401 清除登录状态，其他错误由拦截器提示
async function submitCreateUser(): Promise<void> {
  if (creating.value || !createFormRef.value || !authStore.hasPermission(PERMISSION_USERS_CREATE)) return
  creating.value = true
  try {
    const formValid = await createFormRef.value.validate().catch(() => false)
    if (!formValid) return
    const createdUser = await createUser({
      username: createForm.username, password: createForm.password,
      display_name: createForm.display_name || null,
    })
    createFormRef.value.resetFields()
    createDialogVisible.value = false
    ElMessage.success(`用户创建成功，编号 ${createdUser.id}`)
    await loadUsers()
  } catch (error) {
    // 其他请求错误已由拦截器提示，保留输入供修正后重试。
    if ((error as AxiosError).response?.status === 401) {
      createForm.password = ''
      authStore.logout()
      await router.replace('/login')
    }
  } finally {
    creating.value = false
  }
}

// 做什么：加载当前页，失败时清除旧列表并显示可重试的提示
// 入参：无，读取当前页码；每页条数固定为二十条
// 返回：无；401 清登录状态并回登录页，其他失败显示说明
async function loadUsers(): Promise<void> {
  if (loading.value) return
  loading.value = true
  loadError.value = ''
  userItems.value = []
  totalCount.value = 0
  try {
    await authStore.loadPermissions()
    if (!authStore.hasPermission(PERMISSION_USERS_LIST)) {
      loadError.value = '你没有查看用户列表的权限'
      return
    }
    const userPage = await getUserList({ page: currentPage.value, page_size: PAGE_SIZE })
    userItems.value = userPage.items
    totalCount.value = userPage.total
    currentPage.value = userPage.page
  } catch (error) {
    const status = (error as AxiosError).response?.status
    if (status === 401) {
      authStore.logout()
      await router.replace('/login')
      return
    }
    loadError.value = status === 403 ? '你没有查看用户列表的权限' : '加载用户列表失败，请重试'
  } finally {
    loading.value = false
  }
}

// 做什么：判断目标是否为已确认身份之外的用户
// 入参：该行的用户编号
// 返回：可操作他人时为 true；身份未加载或目标是本人时为 false
function canEditUser(userId: number): boolean {
  const currentUserId = authStore.currentUser?.id
  return currentUserId !== undefined && currentUserId !== userId
}

// 做什么：打开角色选择，追加读取角色清单，撤销列出目标已有角色
// 入参：当前行的公开用户信息和操作类型
// 返回：无；无权或正在处理时不打开，加载出错时保留空清单
async function openRoleDialog(user: UserListItem, action: RoleAction): Promise<void> {
  if (!canBindRoles.value || !canEditUser(user.id) || roleDialog.loading || roleDialog.saving) return
  roleDialog.user = user
  roleDialog.action = action
  roleDialog.roleCode = ''
  roleDialog.options = action === 'unbind' ? user.roles ?? [] : []
  roleDialog.visible = true
  if (action === 'unbind') return

  const requestAccountKey = authStore.accountKey
  roleDialog.loading = true
  try {
    const roles = await getRoles()
    if (requestAccountKey === authStore.accountKey && roleDialog.visible) roleDialog.options = roles.items
  } catch {
    // 加载失败由请求拦截器提示，用户可关闭后重试。
  } finally {
    roleDialog.loading = false
  }
}

// 做什么：在敏感操作前显示二次确认框
// 入参：说明、标题和确认按钮文案
// 返回：确认时为 true，取消、关闭或提示失败时为 false
async function confirmUserAction(message: string, title: string, confirmText: string): Promise<boolean> {
  try {
    await ElMessageBox.confirm(message, title, {
      type: 'warning', confirmButtonText: confirmText, cancelButtonText: '取消',
    })
    return true
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error('无法打开确认提示，请重试')
    return false
  }
}

// 做什么：提交追加或撤销角色，撤销管理员角色前先确认
// 入参：无，读取角色弹窗的目标、操作和选择
// 返回：成功后关闭并刷新列表；取消或接口失败时保留选择
async function submitRoleChange(): Promise<void> {
  const { user, roleCode, action } = roleDialog
  if (!user || !roleCode || !canBindRoles.value || !canEditUser(user.id) || roleDialog.saving) return
  const requestAccountKey = authStore.accountKey
  roleDialog.saving = true
  try {
    if (action === 'unbind' && roleCode === ADMIN_ROLE_CODE && !await confirmUserAction(
      `确认撤销「${user.username}」的管理员角色？`, '撤销管理员角色', '确认撤销',
    )) return
    if (requestAccountKey !== authStore.accountKey || !canBindRoles.value || !canEditUser(user.id)) return
    if (action === 'bind') {
      const result = await bindUserRole(user.id, { role_code: roleCode })
      ElMessage.success(result.created ? '角色追加成功' : '该角色已绑定，无需重复追加')
    } else {
      const result = await unbindUserRole(user.id, roleCode)
      ElMessage.success(result.removed ? '角色撤销成功' : '该角色已撤销')
    }
    roleDialog.visible = false
    await loadUsers()
  } catch {
    // 请求错误已由统一拦截器提示，保留当前选择以便重试。
  } finally {
    roleDialog.saving = false
  }
}

// 做什么：切换他人的启用状态，停用前先确认
// 入参：当前行的公开用户信息
// 返回：成功时刷新列表；取消或失败时保留当前显示
async function submitUserStatus(user: UserListItem): Promise<void> {
  if (!canChangeStatus.value || !canEditUser(user.id) || statusChangeUserId.value !== null) return
  const requestAccountKey = authStore.accountKey
  const status = user.status === USER_STATUS_ACTIVE ? USER_STATUS_DISABLED : USER_STATUS_ACTIVE
  statusChangeUserId.value = user.id
  try {
    if (status === USER_STATUS_DISABLED && !await confirmUserAction(
      `停用「${user.username}」会使其当前登录失效，是否继续？`, '停用账号', '确认停用',
    )) return
    if (requestAccountKey !== authStore.accountKey || !canChangeStatus.value || !canEditUser(user.id)) return
    const result = await changeUserStatus(user.id, { status })
    const message = result.status === USER_STATUS_ACTIVE ? '账号已启用' : '账号已停用'
    ElMessage.success(result.changed ? message : '账号状态未变化')
    await loadUsers()
  } catch {
    // 请求错误已由统一拦截器提示，保留已展示的状态。
  } finally {
    statusChangeUserId.value = null
  }
}

// 做什么：逻辑删除他人账号，删除前说明后果并二次确认
// 入参：当前行的公开用户信息
// 返回：成功后刷新列表；取消或失败时保留当前显示
async function submitUserDelete(user: UserListItem): Promise<void> {
  if (!canDeleteUsers.value || !canEditUser(user.id) || deletingUserId.value !== null) return
  const requestAccountKey = authStore.accountKey
  deletingUserId.value = user.id
  try {
    const confirmed = await confirmUserAction(
      `删除后「${user.username}」会立即退出登录并从列表移除，账号无法恢复。是否继续？`, '删除账号', '确认删除',
    )
    if (!confirmed || requestAccountKey !== authStore.accountKey || !canDeleteUsers.value || !canEditUser(user.id)) return
    await deleteUser(user.id)
    ElMessage.success(`账号「${user.username}」已删除`)
    // 新手注意：删掉一页里的最后一条后，这一页就像空了的抽屉，要退回上一页才看得到东西。
    const lastPage = Math.max(FIRST_PAGE, Math.ceil((totalCount.value - 1) / PAGE_SIZE))
    currentPage.value = Math.min(currentPage.value, lastPage)
    await loadUsers()
  } catch {
    // 请求错误已由统一拦截器提示，保留已展示的列表。
  } finally {
    deletingUserId.value = null
  }
}
onMounted(loadUsers)
</script>

<template>
  <!-- 首屏没有数据时用骨架表；已有数据的分页刷新才用轻遮罩，避免整页闪白 -->
  <section v-loading="loading && !!userItems.length" class="users-card">
    <div class="users-heading">
      <div>
        <h1>用户管理</h1>
        <p>查看成员账号、管理角色和账号状态。每页显示二十条记录。</p>
      </div>
      <div class="users-toolbar">
        <el-button :loading="loading" @click="loadUsers">刷新列表</el-button>
        <el-button v-if="!loading && !loadError && authStore.hasPermission(PERMISSION_USERS_CREATE)" type="primary" class="ink-button" @click="createDialogVisible = true">新建用户</el-button>
      </div>
    </div>
    <div class="data-panel">
    <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" />
    <SkeletonTable v-else-if="loading && !userItems.length" :rows="10" :columns="5" label="正在加载用户列表" />
    <el-table v-else :data="userItems" row-key="id" empty-text="暂无用户" class="data-table">
      <el-table-column prop="id" label="编号" width="90" class-name="is-faint" />
      <el-table-column label="用户名" min-width="170">
        <template #default="{ row }">
          <span class="user-cell">
            <!-- 首字母圆标：比纯文字更容易在列表里把人和人对上 -->
            <i class="user-avatar" aria-hidden="true">{{ row.username.slice(0, 1).toUpperCase() }}</i>
            <span class="user-name">{{ row.username }}</span>
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="display_name" label="显示名" min-width="150" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === USER_STATUS_ACTIVE ? 'success' : 'info'">
            {{ row.status === USER_STATUS_ACTIVE ? '正常' : '已停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="已绑定角色" min-width="220">
        <template #default="{ row }">
          <template v-if="Array.isArray(row.roles)">
            <el-tag v-for="role in row.roles" :key="role.code" class="role-tag">{{ role.name }}</el-tag>
            <span v-if="row.roles.length === 0">未绑定角色</span>
          </template>
          <span v-else>角色信息待加载</span>
        </template>
      </el-table-column>
      <el-table-column v-if="canManageUsers" label="操作" :width="canDeleteUsers ? 296 : 234">
        <template #default="{ row }">
          <template v-if="canBindRoles">
            <el-button link type="primary" :disabled="!canEditUser(row.id) || roleDialog.loading || roleDialog.saving"
              @click="openRoleDialog(row, 'bind')">追加角色</el-button>
            <el-button link type="primary"
              :disabled="!canEditUser(row.id) || roleDialog.loading || roleDialog.saving || !row.roles?.length"
              @click="openRoleDialog(row, 'unbind')">撤销角色</el-button>
          </template>
          <el-button v-if="canChangeStatus" link :type="row.status === USER_STATUS_ACTIVE ? 'danger' : 'success'"
            :loading="statusChangeUserId === row.id" :disabled="!canEditUser(row.id) || statusChangeUserId !== null"
            @click="submitUserStatus(row)">{{ row.status === USER_STATUS_ACTIVE ? '停用' : '启用' }}</el-button>
          <el-button v-if="canDeleteUsers" link type="danger" class="user-delete"
            :loading="deletingUserId === row.id" :disabled="!canEditUser(row.id) || deletingUserId !== null"
            @click="submitUserDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination v-if="!loadError" v-model:current-page="currentPage" :page-size="PAGE_SIZE"
      :total="totalCount" :disabled="loading" layout="slot, prev, pager, next" @current-change="loadUsers">
      <span class="data-total">共 {{ totalCount }} 条</span>
    </el-pagination>
    </div>
  </section>
  <RoleManageDialog v-model="roleDialog.visible" v-model:role-code="roleDialog.roleCode"
    :action="roleDialog.action" :user="roleDialog.user" :options="roleDialog.options"
    :loading="roleDialog.loading" :saving="roleDialog.saving"
    :show-admin-warning="roleDialog.action === 'bind' && roleDialog.roleCode === ADMIN_ROLE_CODE"
    @submit="submitRoleChange" />
  <el-dialog v-model="createDialogVisible" title="新建用户" width="min(440px, calc(100% - 32px))"
    :show-close="!creating" :close-on-click-modal="!creating" :close-on-press-escape="!creating"
    @closed="createFormRef?.resetFields()">
    <el-form ref="createFormRef" :model="createForm" :rules="createRules" :disabled="creating" label-position="top" @submit.prevent="submitCreateUser">
      <el-form-item label="用户名" prop="username">
        <el-input v-model="createForm.username" autocomplete="off" :maxlength="MAX_ACCOUNT_LENGTH" />
      </el-form-item>
      <el-form-item label="初始密码" prop="password">
        <el-input v-model="createForm.password" type="password" autocomplete="new-password" show-password />
      </el-form-item>
      <el-form-item label="显示名（可选）" prop="display_name">
        <el-input v-model="createForm.display_name" :maxlength="MAX_ACCOUNT_LENGTH" />
      </el-form-item>
      <el-button native-type="submit" type="primary" class="ink-button" :loading="creating" :disabled="!authStore.hasPermission(PERMISSION_USERS_CREATE)">确认创建</el-button>
      <el-button :disabled="creating" @click="createDialogVisible = false">取消</el-button>
    </el-form>
  </el-dialog>
</template>

<style scoped>
/* 与知识库列表同一套：标题行在白板上方，表格装在白色圆角板里，表格本身的样子由全局 .data-table 负责 */
.users-card {
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
}

/* 标题在左、操作在右；窄屏时自动换成上下两行 */
.users-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.users-heading h1 {
  margin: 0;
  font-size: 26px;
  font-weight: 650;
  line-height: 1.25;
  letter-spacing: -0.01em;
}

.users-heading p {
  margin: 6px 0 0;
  font-size: 14px;
  color: var(--color-text-muted);
}

.users-toolbar {
  display: flex;
  gap: 8px;
}

/* 用户名一格：首字母圆标 + 账号 */
.user-cell {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.user-avatar {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--color-user-bubble);
  color: var(--color-text);
  font-size: 12px;
  font-style: normal;
  font-weight: 600;
  text-transform: uppercase;
}

.user-name {
  overflow: hidden;
  font-weight: 500;
  color: var(--color-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-tag {
  margin: 3px 8px 3px 0;
}

.role-tag:last-child {
  margin-right: 0;
}

/* 删除放在操作列最右，和前面的操作之间留一道细线：它是这里唯一无法撤回的动作 */
.user-delete {
  position: relative;
  margin-left: 10px;
  padding-left: 12px;
}

.user-delete::before {
  position: absolute;
  left: -6px;
  width: 1px;
  height: 12px;
  background: var(--color-line);
  content: '';
}

@media (max-width: 600px) {
  .users-heading h1 {
    font-size: 22px;
  }

  /* 窄屏两侧留白收一点，表格才放得下 */
  .users-card :deep(.data-panel) {
    padding: 0 12px;
  }
}
</style>
