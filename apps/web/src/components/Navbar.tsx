import React from 'react';
import { useAuth } from '../context/auth-context';
import { Building2, LogOut, UserCircle2, Inbox, Layers, BookOpen, Users, Settings, Bot, CreditCard, BarChart3, Share2, Sparkles, Send } from 'lucide-react';

export type NavTab = 'inbox' | 'customers' | 'social' | 'analytics' | 'pulse' | 'campaigns' | 'ai-agents' | 'channels' | 'knowledge' | 'billing' | 'settings';

interface NavbarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onSelectTab }) => {
  const { user, organizations, activeOrg, switchOrganization, logout } = useAuth();

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold shadow-sm">
              O
            </div>
            <span className="font-bold text-lg text-slate-900 tracking-tight">Project Orbit</span>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden sm:flex items-center space-x-1 border-l border-slate-200 pl-6">
            <button
              onClick={() => onSelectTab('inbox')}
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'inbox'
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Inbox className="w-4 h-4" />
              <span>Inbox</span>
            </button>
            <button
              onClick={() => onSelectTab('customers')}
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'customers'
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Customers</span>
            </button>
            <button
              onClick={() => onSelectTab('social')}
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'social'
                  ? 'bg-pink-50 text-pink-700 font-bold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Share2 className="w-4 h-4 text-pink-600" />
              <span>Social</span>
            </button>
            <button
              onClick={() => onSelectTab('analytics')}
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'analytics'
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Analytics</span>
            </button>
            <button
              onClick={() => onSelectTab('pulse')}
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'pulse'
                  ? 'bg-purple-50 text-purple-700 font-bold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-4 h-4 text-purple-600" />
              <span>Pulse BI</span>
            </button>
            <button
              onClick={() => onSelectTab('campaigns')}
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'campaigns'
                  ? 'bg-emerald-50 text-emerald-700 font-bold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Send className="w-4 h-4 text-emerald-600" />
              <span>Campaigns</span>
            </button>
            <button
              onClick={() => onSelectTab('ai-agents')}
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'ai-agents'
                  ? 'bg-purple-50 text-purple-700 font-bold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Bot className="w-4 h-4 text-purple-600" />
              <span>AI Studio</span>
            </button>
            <button
              onClick={() => onSelectTab('channels')}
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'channels'
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Channels</span>
            </button>
            <button
              onClick={() => onSelectTab('knowledge')}
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'knowledge'
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Knowledge Base</span>
            </button>
            <button
              onClick={() => onSelectTab('billing')}
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'billing'
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>Billing & Wallet</span>
            </button>
            <button
              onClick={() => onSelectTab('settings')}
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'settings'
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </button>
          </nav>

          {/* Organization Switcher Dropdown */}
          {organizations.length > 0 && activeOrg && (
            <div className="relative">
              <div className="flex items-center space-x-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800">
                <Building2 className="w-4 h-4 text-slate-500" />
                <select
                  value={activeOrg.id}
                  onChange={(e) => switchOrganization(e.target.value)}
                  className="bg-transparent font-medium text-slate-800 focus:outline-none cursor-pointer pr-4"
                >
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} ({org.role})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-sm text-slate-600">
            <UserCircle2 className="w-5 h-5 text-slate-400" />
            <span className="font-medium text-slate-800">{user?.name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              {activeOrg?.role || 'MEMBER'}
            </span>
          </div>

          <button
            onClick={() => logout()}
            className="inline-flex items-center space-x-1.5 text-sm text-slate-500 hover:text-rose-600 px-3 py-1.5 rounded-lg hover:bg-rose-50 transition-colors"
            title="Log out of Orbit"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
};
