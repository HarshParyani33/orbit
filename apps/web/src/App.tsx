import React, { useState } from 'react';
import { useAuth } from './context/auth-context';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { InboxPage } from './pages/InboxPage';
import { CustomersPage } from './pages/CustomersPage';
import { SocialInboxPage } from './pages/SocialInboxPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { PulseAiPage } from './pages/PulseAiPage';
import { AiAgentsPage } from './pages/AiAgentsPage';
import { KnowledgeBasePage } from './pages/KnowledgeBasePage';
import { BillingPage } from './pages/BillingPage';
import { SettingsPage } from './pages/SettingsPage';
import { Navbar, NavTab } from './components/Navbar';

export const App: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const [activeTab, setActiveTab] = useState<NavTab>('inbox');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-500">Initializing Orbit session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (authView === 'register') {
      return <RegisterPage onSwitchToLogin={() => setAuthView('login')} />;
    }
    return <LoginPage onSwitchToRegister={() => setAuthView('register')} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar activeTab={activeTab} onSelectTab={setActiveTab} />
      <main className="flex-1">
        {activeTab === 'inbox' && <InboxPage />}
        {activeTab === 'customers' && <CustomersPage />}
        {activeTab === 'social' && <SocialInboxPage />}
        {activeTab === 'analytics' && <AnalyticsPage />}
        {activeTab === 'pulse' && <PulseAiPage />}
        {activeTab === 'ai-agents' && <AiAgentsPage />}
        {activeTab === 'channels' && <DashboardPage />}
        {activeTab === 'knowledge' && <KnowledgeBasePage />}
        {activeTab === 'billing' && <BillingPage />}
        {activeTab === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
};
