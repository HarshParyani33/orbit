import React, { createContext, useContext, useState, useEffect } from 'react';
import { AuthenticatedUser, OrganizationSummary } from '@orbit/shared';
import { apiRequest, setActiveOrgId as setClientOrgId, setAuthFailureHandler } from '../api/client';
import { LoginInput, RegisterInput } from '@orbit/validation';

interface AuthContextType {
  user: AuthenticatedUser | null;
  organizations: OrganizationSummary[];
  activeOrg: OrganizationSummary | null;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  switchOrganization: (orgId: string) => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [activeOrg, setActiveOrg] = useState<OrganizationSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const switchOrganization = (orgId: string) => {
    const found = organizations.find((o) => o.id === orgId);
    if (found) {
      setActiveOrg(found);
      setClientOrgId(found.id);
      localStorage.setItem('orbit_active_org_id', found.id);
    }
  };

  const refreshProfile = async () => {
    try {
      const data = await apiRequest<{
        user: AuthenticatedUser;
        organizations: OrganizationSummary[];
        activeOrgId?: string;
      }>('/api/auth/me');

      setUser(data.user);
      setOrganizations(data.organizations);

      const savedOrgId = localStorage.getItem('orbit_active_org_id');
      const targetOrg =
        data.organizations.find((o) => o.id === savedOrgId) ||
        data.organizations.find((o) => o.id === data.activeOrgId) ||
        data.organizations[0] ||
        null;

      setActiveOrg(targetOrg);
      if (targetOrg) {
        setClientOrgId(targetOrg.id);
      }
    } catch (err) {
      setUser(null);
      setOrganizations([]);
      setActiveOrg(null);
      setClientOrgId(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setAuthFailureHandler(() => {
      setUser(null);
      setOrganizations([]);
      setActiveOrg(null);
      setClientOrgId(null);
      localStorage.removeItem('orbit_active_org_id');
    });

    refreshProfile();
  }, []);

  const login = async (input: LoginInput) => {
    const data = await apiRequest<{
      user: AuthenticatedUser;
      organizations: OrganizationSummary[];
      activeOrgId?: string;
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });

    setUser(data.user);
    setOrganizations(data.organizations);
    const targetOrg = data.organizations.find((o) => o.id === data.activeOrgId) || data.organizations[0] || null;
    setActiveOrg(targetOrg);
    if (targetOrg) {
      setClientOrgId(targetOrg.id);
    }
  };

  const register = async (input: RegisterInput) => {
    const data = await apiRequest<{
      user: AuthenticatedUser;
      organizations: OrganizationSummary[];
      activeOrgId?: string;
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });

    setUser(data.user);
    setOrganizations(data.organizations);
    const targetOrg = data.organizations[0] || null;
    setActiveOrg(targetOrg);
    if (targetOrg) {
      setClientOrgId(targetOrg.id);
    }
  };

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      setOrganizations([]);
      setActiveOrg(null);
      setClientOrgId(null);
      localStorage.removeItem('orbit_active_org_id');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        organizations,
        activeOrg,
        isLoading,
        login,
        register,
        logout,
        switchOrganization,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
