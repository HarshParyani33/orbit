import React, { useState } from 'react';
import { useAuth } from './context/auth-context';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { Navbar } from './components/Navbar';

export const App: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [authView, setAuthView] = useState<'login' | 'register'>('login');

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
      <Navbar />
      <main className="flex-1">
        <DashboardPage />
      </main>
    </div>
  );
};
