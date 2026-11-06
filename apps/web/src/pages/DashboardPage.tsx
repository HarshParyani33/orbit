import React, { useState } from 'react';
import { useAuth } from '../context/auth-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../api/client';
import {
  MessageSquare,
  ShieldCheck,
  Building,
  Plus,
  RefreshCw,
  Layers,
  Lock,
} from 'lucide-react';

interface Channel {
  id: string;
  name: string;
  provider: string;
  status: string;
  createdAt: string;
}

export const DashboardPage: React.FC = () => {
  const { user, activeOrg } = useAuth();
  const queryClient = useQueryClient();
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelProvider, setNewChannelProvider] = useState('WEB_CHAT');
  const [isCreating, setIsCreating] = useState(false);

  // Fetch channels strictly for the active tenant (TenantGuard + TenantTransactionRunner)
  const {
    data: channels = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<Channel[]>({
    queryKey: ['channels', activeOrg?.id],
    queryFn: () => apiRequest<Channel[]>('/api/channels'),
    enabled: !!activeOrg?.id,
  });

  // Create Channel Mutation
  const createChannelMutation = useMutation({
    mutationFn: (data: { name: string; provider: string }) =>
      apiRequest<Channel>('/api/channels', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      setNewChannelName('');
      setIsCreating(false);
      queryClient.invalidateQueries({ queryKey: ['channels', activeOrg?.id] });
    },
  });

  const handleCreateChannel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    createChannelMutation.mutate({
      name: newChannelName.trim(),
      provider: newChannelProvider,
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Banner: Active Tenant Scope */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <Building className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold text-slate-900">{activeOrg?.name}</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {activeOrg?.status || 'ACTIVE'}
            </span>
          </div>
          <p className="text-sm text-slate-500">
            Tenant ID: <code className="text-xs font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">{activeOrg?.id}</code> • Slug: <span className="font-medium text-slate-700">{activeOrg?.slug}</span>
          </p>
        </div>

        <div className="flex items-center space-x-4">
          <div className="text-right">
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Your Membership Role</p>
            <p className="text-sm font-bold text-slate-800">{activeOrg?.role}</p>
          </div>
          <div className="h-8 w-px bg-slate-200" />
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Multi-Tenant Security Verification Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-2">
          <div className="flex items-center space-x-2 text-indigo-600">
            <ShieldCheck className="w-5 h-5" />
            <h3 className="font-semibold text-sm text-slate-900">PostgreSQL Row-Level Security</h3>
          </div>
          <p className="text-xs text-slate-600">
            All tenant queries execute inside an interactive transaction with <code className="bg-slate-100 px-1 py-0.5 rounded">SET LOCAL app.current_org_id</code>. Cross-tenant access is prohibited at the database engine level.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-2">
          <div className="flex items-center space-x-2 text-emerald-600">
            <Lock className="w-5 h-5" />
            <h3 className="font-semibold text-sm text-slate-900">Argon2id Session Security</h3>
          </div>
          <p className="text-xs text-slate-600">
            HTTP-only cookies guard JWT access and rotated refresh tokens. Automatic reuse theft detection revokes compromised sessions immediately.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-2">
          <div className="flex items-center space-x-2 text-blue-600">
            <Layers className="w-5 h-5" />
            <h3 className="font-semibold text-sm text-slate-900">Tenant Isolation Guard</h3>
          </div>
          <p className="text-xs text-slate-600">
            Every request validates membership in <code className="bg-slate-100 px-1 py-0.5 rounded">{activeOrg?.slug}</code> before reaching domain handlers. Client-supplied org headers cannot bypass authorization.
          </p>
        </div>
      </div>

      {/* Connected Channels Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Communication Channels</h2>
            <p className="text-sm text-slate-500">
              Customer touchpoints configured for <span className="font-medium text-slate-700">{activeOrg?.name}</span>
            </p>
          </div>

          <button
            onClick={() => setIsCreating(!isCreating)}
            className="inline-flex items-center space-x-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>{isCreating ? 'Cancel' : 'Add Channel'}</span>
          </button>
        </div>

        {/* Add Channel Inline Form */}
        {isCreating && (
          <form
            onSubmit={handleCreateChannel}
            className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4"
          >
            <h3 className="font-semibold text-sm text-slate-800">Add New Channel to {activeOrg?.name}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Channel Name</label>
                <input
                  type="text"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  placeholder="e.g. Website Support Widget"
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Provider Type</label>
                <select
                  value={newChannelProvider}
                  onChange={(e) => setNewChannelProvider(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="WEB_CHAT">Website Chat Widget</option>
                  <option value="META_WHATSAPP">WhatsApp Business</option>
                  <option value="META_INSTAGRAM">Instagram Messaging</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-3.5 py-1.5 text-sm text-slate-600 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createChannelMutation.isPending}
                className="px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50"
              >
                {createChannelMutation.isPending ? 'Saving...' : 'Save Channel'}
              </button>
            </div>
          </form>
        )}

        {/* Channels List */}
        {isLoading ? (
          <div className="py-12 text-center text-sm text-slate-400">Loading channels...</div>
        ) : channels.length === 0 ? (
          <div className="py-12 border-2 border-dashed border-slate-200 rounded-xl text-center space-y-3">
            <MessageSquare className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-medium text-slate-600">No channels configured in this workspace yet</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Channels belong strictly to {activeOrg?.name} and are isolated from all other organizations.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {channels.map((channel) => (
              <div
                key={channel.id}
                className="border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                      <MessageSquare className="w-4 h-4" />
                    </span>
                    <h3 className="font-semibold text-sm text-slate-900">{channel.name}</h3>
                  </div>
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700">
                    {channel.status}
                  </span>
                </div>

                <div className="text-xs text-slate-500 space-y-1">
                  <p>Provider: <span className="font-mono text-slate-700 font-medium">{channel.provider}</span></p>
                  <p className="font-mono text-[10px] text-slate-400 truncate">ID: {channel.id}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
