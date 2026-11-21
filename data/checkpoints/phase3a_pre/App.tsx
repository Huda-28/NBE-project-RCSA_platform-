import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { Header } from './components/Header.js';
import { Sidebar, PageId } from './components/Sidebar.js';
import { PasswordResetModal } from './components/PasswordResetModal.js';
import { LoginPage } from './pages/LoginPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { AIAgentPage } from './pages/AIAgentPage.js';
import { BackendRCSAPage } from './pages/BackendRCSAPage.js';
import { BusinessUnitsPage } from './pages/BusinessUnitsPage.js';
import { RCSATablePage } from './pages/RCSATablePage.js';
import { ReviewsPage } from './pages/ReviewsPage.js';
import { AuditTrailPage } from './pages/AuditTrailPage.js';
import { AdminPage } from './pages/AdminPage.js';

export interface AppNavigationState {
  page: PageId;
  unitId?: string;
  assessmentId?: string;
  riskId?: string;
}

const VALID_PAGES: Set<PageId> = new Set([
  'dashboard',
  'agent',
  'backend-rcsa',
  'business-units',
  'rcsa-table',
  'reviews',
  'audit',
  'admin',
]);

function readNavStateFromUrl(): AppNavigationState {
  if (typeof window === 'undefined') {
    return { page: 'dashboard' };
  }
  const params = new URLSearchParams(window.location.search);
  const rawPage = params.get('page') as PageId | null;
  const page: PageId = rawPage && VALID_PAGES.has(rawPage) ? rawPage : 'dashboard';
  const unitId = params.get('unitId') || undefined;
  const assessmentId = params.get('assessmentId') || undefined;
  const riskId = params.get('riskId') || undefined;
  return { page, unitId, assessmentId, riskId };
}

function buildUrlSearch(state: AppNavigationState): string {
  const params = new URLSearchParams();
  params.set('page', state.page);
  if (state.unitId) params.set('unitId', state.unitId);
  if (state.assessmentId) params.set('assessmentId', state.assessmentId);
  if (state.riskId) params.set('riskId', state.riskId);
  return `?${params.toString()}`;
}

const MainAppContent: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [navState, setNavState] = useState<AppNavigationState>(() => readNavStateFromUrl());

  useEffect(() => {
    const handlePopState = () => {
      setNavState(readNavStateFromUrl());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = useCallback((next: Partial<AppNavigationState> & { page: PageId }, replace = false) => {
    const fullNext: AppNavigationState = {
      page: next.page,
      unitId: next.unitId,
      assessmentId: next.assessmentId,
      riskId: next.riskId,
    };
    setNavState(fullNext);
    if (typeof window !== 'undefined') {
      const nextSearch = buildUrlSearch(fullNext);
      if (window.location.search !== nextSearch) {
        if (replace) {
          window.history.replaceState(fullNext, '', nextSearch);
        } else {
          window.history.pushState(fullNext, '', nextSearch);
        }
      }
    }
  }, []);

  const handleSelectSidebarPage = useCallback((page: PageId) => {
    // Preserve unitId when switching between unit-scoped pages if helpful, or keep clean
    navigateTo({
      page,
      unitId: page === 'rcsa-table' || page === 'business-units' || page === 'backend-rcsa' ? navState.unitId : undefined,
      assessmentId: page === 'rcsa-table' ? navState.assessmentId : undefined,
    });
  }, [navigateTo, navState.unitId, navState.assessmentId]);

  if (isLoading) {
    return (
      <div className="min-h-screen nbe-login-surface flex items-center justify-center p-4 font-['Cairo'] relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-0 nbe-login-brushed -z-10" />
        <div className="pointer-events-none absolute inset-0 nbe-login-grain mix-blend-multiply -z-10" />
        <div className="text-center text-[#09331F] space-y-3 bg-[#ECEBE8] px-8 py-6 rounded-2xl border border-[#C6C4C1] shadow-lg">
          <div className="w-10 h-10 border-4 border-[#006547] border-t-[#F79C1E] rounded-full animate-spin mx-auto" />
          <div className="text-sm font-bold">منصة RCSA - البنك الأهلي المصري</div>
          <div className="text-xs text-slate-700">جارٍ تهيئة الجلسة المصرفية والتحقق من الصلاحيات...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const renderCurrentPage = () => {
    switch (navState.page) {
      case 'dashboard':
        return <DashboardPage onNavigate={navigateTo} />;
      case 'agent':
        return <AIAgentPage />;
      case 'backend-rcsa':
        return <BackendRCSAPage initialUnitId={navState.unitId} onNavigate={navigateTo} />;
      case 'business-units':
        return <BusinessUnitsPage initialUnitId={navState.unitId} onNavigate={navigateTo} />;
      case 'rcsa-table':
        return (
          <RCSATablePage
            initialUnitId={navState.unitId}
            initialAssessmentId={navState.assessmentId}
            initialRiskId={navState.riskId}
            onNavigate={navigateTo}
          />
        );
      case 'reviews':
        return <ReviewsPage onNavigate={navigateTo} />;
      case 'audit':
        return <AuditTrailPage initialUnitId={navState.unitId} />;
      case 'admin':
        return <AdminPage />;
      default:
        return <DashboardPage onNavigate={navigateTo} />;
    }
  };

  return (
    <div className="min-h-screen nbe-app-shell flex flex-col font-['Cairo'] text-right relative isolate" dir="rtl">
      <div className="pointer-events-none fixed inset-0 nbe-login-brushed -z-10" />
      <div className="pointer-events-none fixed inset-0 nbe-login-grain mix-blend-multiply -z-10" />

      {/* Executive Header */}
      <Header />

      {/* Mandatory Password Reset Modal (Appears when must_reset_password === true) */}
      <PasswordResetModal />

      {/* Main Content Layout */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        {/* Navigation Sidebar */}
        <Sidebar currentPage={navState.page} onSelectPage={handleSelectSidebarPage} />

        {/* Page Content Viewport */}
        <main className="flex-1 min-w-0 p-6 overflow-y-auto">
          {renderCurrentPage()}
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
}

