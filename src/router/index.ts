import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/authStore';
import AuthLayout from '@/layouts/AuthLayout.vue';
import AppLayout from '@/layouts/AppLayout.vue';
import LoginView from '@/features/auth/LoginView.vue';
import RegisterView from '@/features/auth/RegisterView.vue';
import DashboardView from '@/features/dashboard/DashboardView.vue';
import SurveysView from '@/features/surveys/SurveysView.vue';
import SurveyFormView from '@/features/surveys/SurveyFormView.vue';
import SurveyGptView from '@/features/surveys/SurveyGptView.vue';
import QuestionsView from '@/features/questions/QuestionsView.vue';
import QuestionFormView from '@/features/questions/QuestionFormView.vue';
import BuilderPlaceholderView from '@/features/survey-builder/BuilderPlaceholderView.vue';
import PublicSurveyPlaceholderView from '@/features/public-survey/PublicSurveyPlaceholderView.vue';
import ReportsPlaceholderView from '@/features/reports/ReportsPlaceholderView.vue';
import RespondSurveysView from '@/features/respond/RespondSurveysView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/dashboard',
    },
    {
      path: '/auth',
      component: AuthLayout,
      children: [
        { path: 'login', name: 'login', component: LoginView },
        { path: 'register', name: 'register', component: RegisterView },
      ],
    },
    {
      path: '/',
      component: AppLayout,
      meta: { requiresAuth: true },
      children: [
        { path: 'dashboard', name: 'dashboard', component: DashboardView },
        { path: 'surveys', name: 'surveys', component: SurveysView },
        { path: 'surveys/new', name: 'survey-create', component: SurveyFormView },
        { path: 'surveys/generate', name: 'survey-generate', component: SurveyGptView },
        { path: 'surveys/:id/edit', name: 'survey-edit', component: SurveyFormView, props: true },
        { path: 'surveys/:id/builder', name: 'survey-builder', component: BuilderPlaceholderView, props: true },
        { path: 'respond', name: 'respond-surveys', component: RespondSurveysView },
        { path: 'questions', name: 'questions', component: QuestionsView },
        { path: 'questions/new', name: 'question-create', component: QuestionFormView },
        { path: 'questions/:id/edit', name: 'question-edit', component: QuestionFormView, props: true },
        { path: 'reports', name: 'reports', component: ReportsPlaceholderView },
      ],
    },
    {
      path: '/s/:surveyId',
      name: 'public-survey',
      component: PublicSurveyPlaceholderView,
      props: true,
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/dashboard',
    },
  ],
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  const hasValidSession = auth.validateSession();

  if (to.meta.requiresAuth && !hasValidSession) {
    return { name: 'login' };
  }

  if ((to.name === 'login' || to.name === 'register') && hasValidSession) {
    return { name: 'dashboard' };
  }

  return true;
});

export default router;
