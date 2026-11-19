import React, { useState } from 'react';
import { useAuth } from '../context/auth-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../api/client';
import {
  Users,
  Search,
  Plus,
  Mail,
  Phone,
  ShieldCheck,
  ShieldAlert,
  GitMerge,
  ExternalLink,
  X,
  MessageSquare,
  Clock,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { CustomerSummary } from '@orbit/shared';

export const CustomersPage: React.FC = () => {
  const { activeOrg } = useAuth();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [mergeReason, setMergeReason] = useState('');

  // Form state for creating customer
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');

  // 1. Fetch customers list
  const {
    data: customers = [],
    isLoading,
    refetch,
  } = useQuery<CustomerSummary[]>({
    queryKey: ['customers', activeOrg?.id, searchQuery],
    queryFn: () => {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      const qs = params.toString() ? `?${params.toString()}` : '';
      return apiRequest<CustomerSummary[]>(`/api/customers${qs}`);
    },
    enabled: !!activeOrg?.id,
  });

  // 2. Fetch selected customer details
  const { data: selectedCustomer } = useQuery<CustomerSummary>({
    queryKey: ['customer', activeOrg?.id, selectedCustomerId],
    queryFn: () => apiRequest<CustomerSummary>(`/api/customers/${selectedCustomerId}`),
    enabled: !!activeOrg?.id && !!selectedCustomerId,
  });

  // 3. Create customer mutation
  const createCustomerMutation = useMutation({
    mutationFn: (data: { name: string; email?: string; phone?: string }) =>
      apiRequest<CustomerSummary>('/api/customers', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: (newCust) => {
      setIsCreateModalOpen(false);
      setNewName('');
      setNewEmail('');
      setNewPhone('');
      queryClient.invalidateQueries({ queryKey: ['customers', activeOrg?.id] });
      setSelectedCustomerId(newCust.id);
    },
  });

  // 4. Merge customers mutation
  const mergeCustomersMutation = useMutation({
    mutationFn: (data: { sourceId: string; targetCustomerId: string; reason: string }) =>
      apiRequest(`/api/customers/${data.sourceId}/merge`, {
        method: 'POST',
        body: JSON.stringify({
          targetCustomerId: data.targetCustomerId,
          reason: data.reason,
        }),
      }),
    onSuccess: () => {
      setIsMergeModalOpen(false);
      setMergeSourceId('');
      setMergeTargetId('');
      setMergeReason('');
      queryClient.invalidateQueries({ queryKey: ['customers', activeOrg?.id] });
      setSelectedCustomerId(null);
    },
  });

  const handleCreateCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    createCustomerMutation.mutate({
      name: newName.trim(),
      email: newEmail.trim() || undefined,
      phone: newPhone.trim() || undefined,
    });
  };

  const handleMergeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mergeSourceId || !mergeTargetId || !mergeReason.trim()) return;
    mergeCustomersMutation.mutate({
      sourceId: mergeSourceId,
      targetCustomerId: mergeTargetId,
      reason: mergeReason.trim(),
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Users className="w-6 h-6 text-indigo-600" />
            <span>Customer CRM Directory</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage multi-channel customer identities, contact graph, and interaction history.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              setMergeSourceId('');
              setMergeTargetId('');
              setMergeReason('');
              setIsMergeModalOpen(true);
            }}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-2xs transition-colors"
          >
            <GitMerge className="w-4 h-4 text-slate-500" />
            <span>Merge Profiles</span>
          </button>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Customer</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Customers</span>
          <div className="text-2xl font-bold text-slate-900 mt-1">{customers.length}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Verified Identities</span>
          <div className="text-2xl font-bold text-emerald-600 mt-1">
            {customers.reduce((acc, c) => acc + (c.channelIdentities?.filter((i) => i.verified).length || 0), 0)}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Active Conversations</span>
          <div className="text-2xl font-bold text-indigo-600 mt-1">
            {customers.reduce((acc, c) => acc + (c._count?.conversations || c.conversations?.length || 0), 0)}
          </div>
        </div>
      </div>

      {/* Search Toolbar */}
      <div className="flex items-center space-x-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by customer name, email, phone or identity..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 placeholder-slate-400"
          />
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-xs text-slate-400 space-y-2">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p>Loading customer database...</p>
          </div>
        ) : customers.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-400 space-y-2">
            <Users className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="font-semibold text-slate-600">No customers found</p>
            <p>Create a customer profile or connect a channel to begin.</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Contact Details</th>
                <th className="py-3 px-4">Linked Channels</th>
                <th className="py-3 px-4">Conversations</th>
                <th className="py-3 px-4">Created Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setSelectedCustomerId(c.id)}
                  className="hover:bg-indigo-50/40 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center shrink-0">
                        {c.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900">{c.name}</div>
                        <div className="font-mono text-[10px] text-slate-400">ID: {c.id.slice(0, 8)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="space-y-1">
                      <div className="text-slate-700 flex items-center space-x-1.5">
                        <Mail className="w-3 h-3 text-slate-400" />
                        <span>{c.email || <span className="text-slate-400 italic">None</span>}</span>
                      </div>
                      <div className="text-slate-500 flex items-center space-x-1.5 text-[11px]">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{c.phone || <span className="text-slate-400 italic">None</span>}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {c.channelIdentities && c.channelIdentities.length > 0 ? (
                        c.channelIdentities.map((id) => (
                          <span
                            key={id.id}
                            className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200"
                          >
                            <span>{id.provider}</span>
                            {id.verified && <ShieldCheck className="w-3 h-3 text-emerald-600" />}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400 italic">No channels</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-700">
                    {c._count?.conversations || c.conversations?.length || 0}
                  </td>
                  <td className="py-3 px-4 text-slate-500">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCustomerId(c.id);
                      }}
                      className="text-indigo-600 hover:text-indigo-800 font-semibold"
                    >
                      Inspect Profile &rarr;
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Customer Profile Slide-over Drawer */}
      {selectedCustomerId && selectedCustomer && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600" />
                <span>Customer Profile Detail</span>
              </h2>
              <button
                onClick={() => setSelectedCustomerId(null)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Header Card */}
              <div className="flex items-center space-x-4 p-4 rounded-xl bg-indigo-50/60 border border-indigo-100">
                <div className="w-14 h-14 rounded-full bg-indigo-600 text-white font-bold text-xl flex items-center justify-center shrink-0">
                  {selectedCustomer.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{selectedCustomer.name}</h3>
                  <p className="text-xs text-slate-500 font-mono">ID: {selectedCustomer.id}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Joined {new Date(selectedCustomer.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Contact Information */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Contact Info</h4>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Email Address:</span>
                    <span className="font-semibold text-slate-800">{selectedCustomer.email || 'None'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Phone Number:</span>
                    <span className="font-semibold text-slate-800">{selectedCustomer.phone || 'None'}</span>
                  </div>
                </div>
              </div>

              {/* Linked Channel Identities */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Linked Channel Graph
                </h4>
                <div className="space-y-2">
                  {selectedCustomer.channelIdentities && selectedCustomer.channelIdentities.length > 0 ? (
                    selectedCustomer.channelIdentities.map((id) => (
                      <div
                        key={id.id}
                        className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-bold text-slate-900">{id.provider}</div>
                          <div className="font-mono text-[11px] text-slate-500">{id.externalId}</div>
                        </div>
                        {id.verified ? (
                          <span className="inline-flex items-center space-x-1 text-emerald-600 text-xs font-semibold">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Verified</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 text-amber-600 text-xs font-semibold">
                            <ShieldAlert className="w-3.5 h-3.5" />
                            <span>Unverified</span>
                          </span>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 italic">No external channel identities mapped yet.</p>
                  )}
                </div>
              </div>

              {/* Merge Actions */}
              <div className="pt-4 border-t border-slate-200">
                <button
                  onClick={() => {
                    setMergeSourceId(selectedCustomer.id);
                    setIsMergeModalOpen(true);
                  }}
                  className="w-full inline-flex items-center justify-center space-x-2 px-4 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-lg transition-colors"
                >
                  <GitMerge className="w-4 h-4" />
                  <span>Merge This Customer Profile</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Customer Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">New Customer Profile</h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  placeholder="e.g. Jane Doe"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="jane.doe@example.com"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+14155552671"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newName.trim() || createCustomerMutation.isPending}
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm disabled:opacity-50"
                >
                  {createCustomerMutation.isPending ? 'Saving...' : 'Create Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Merge Modal */}
      {isMergeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <GitMerge className="w-5 h-5 text-indigo-600" />
                <span>Merge Customer Profiles</span>
              </h3>
              <button
                onClick={() => setIsMergeModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Merging merges the source customer into the target customer. All channels, conversations, and audit records will point to the target customer.
            </p>

            <form onSubmit={handleMergeSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Source Customer (will be merged & deactivated) *
                </label>
                <select
                  value={mergeSourceId}
                  onChange={(e) => setMergeSourceId(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- Choose Source Customer --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.email || c.phone || c.id.slice(0, 8)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target Customer (primary survivor) *
                </label>
                <select
                  value={mergeTargetId}
                  onChange={(e) => setMergeTargetId(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- Choose Target Customer --</option>
                  {customers
                    .filter((c) => c.id !== mergeSourceId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.email || c.phone || c.id.slice(0, 8)})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Merge Reason / Audit Justification *
                </label>
                <input
                  type="text"
                  value={mergeReason}
                  onChange={(e) => setMergeReason(e.target.value)}
                  required
                  placeholder="e.g. Duplicate profile detected across WhatsApp and Web Chat"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsMergeModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!mergeSourceId || !mergeTargetId || !mergeReason.trim() || mergeCustomersMutation.isPending}
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm disabled:opacity-50"
                >
                  {mergeCustomersMutation.isPending ? 'Merging...' : 'Confirm Profile Merge'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
