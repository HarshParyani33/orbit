import React from 'react';
import { useAuth } from '../context/auth-context';
import { Building2, LogOut, ChevronDown, UserCircle2 } from 'lucide-react';

export const Navbar: React.FC = () => {
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
