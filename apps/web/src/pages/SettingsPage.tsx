import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/auth-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../api/client';
import {
  Settings,
  Clock,
  Building2,
  Users,
  Shield,
  Save,
  CheckCircle2,
  AlertCircle,
  Plus,
  Mail,
  UserPlus,
  Globe,
  Radio,
  Key,
  Webhook,
  Copy,
  Trash2,
} from 'lucide-react';
import { BusinessHoursSchedule, Role } from '@orbit/shared';

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const SettingsPage: React.FC = () => {
  const { activeOrg, user } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'business-hours' | 'members' | 'developer' | 'general'>('business-hours');

  // Developer Keys & Webhooks State
  const [newKeyName, setNewKeyName] = useState('');
  const [rawGeneratedKey, setRawGeneratedKey] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [copiedNotice, setCopiedNotice] = useState(false);

  // Business Hours State
  const [schedule, setSchedule] = useState<BusinessHoursSchedule | null>(null);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);
  const [saveErrorNotice, setSaveErrorNotice] = useState<string | null>(null);

  // Invite Member State
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER');
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  // 1. Fetch organization details including members
  const { data: orgDetail, isLoading: isLoadingOrg } = useQuery<{
    id: string;
    name: string;
    slug: string;
    memberships: {
      id: string;
      role: Role;
      user: { id: string; name: string; email: string };
    }[];
  }>({
    queryKey: ['org-detail', activeOrg?.id],
    queryFn: () => apiRequest(`/api/organizations/${activeOrg?.id}`),
    enabled: !!activeOrg?.id,
  });

  // 2. Fetch Business Hours Schedule
  const { data: fetchedSchedule, isLoading: isLoadingSchedule } = useQuery<BusinessHoursSchedule>({
    queryKey: ['business-hours', activeOrg?.id],
    queryFn: () => apiRequest(`/api/organizations/${activeOrg?.id}/business-hours`),
    enabled: !!activeOrg?.id,
  });

  // 3. Fetch Live Business Hours Status
  const { data: liveStatus, refetch: refetchLiveStatus } = useQuery<{
    isWithin: boolean;
    reason?: string;
    timezone: string;
    enabled: boolean;
    outOfHoursMessage: string;
  }>({
    queryKey: ['business-hours-status', activeOrg?.id],
    queryFn: () => apiRequest(`/api/organizations/${activeOrg?.id}/business-hours/status`),
    enabled: !!activeOrg?.id,
  });

  useEffect(() => {
    if (fetchedSchedule) {
      setSchedule(fetchedSchedule);
    }
  }, [fetchedSchedule]);

  // Save Business Hours Mutation
  const saveScheduleMutation = useMutation({
    mutationFn: (updated: BusinessHoursSchedule) =>
      apiRequest<BusinessHoursSchedule>(`/api/organizations/${activeOrg?.id}/business-hours`, {
        method: 'PUT',
        body: JSON.stringify(updated),
      }),
    onSuccess: (data: BusinessHoursSchedule) => {
      setSchedule(data);
      setSaveSuccessNotice('Business hours schedule saved successfully.');
      setTimeout(() => setSaveSuccessNotice(null), 3000);
      refetchLiveStatus();
      queryClient.invalidateQueries({ queryKey: ['business-hours', activeOrg?.id] });
    },
    onError: (err: any) => {
      setSaveErrorNotice(err?.message || 'Failed to save business hours schedule.');
      setTimeout(() => setSaveErrorNotice(null), 4000);
    },
  });

  // Invite Member Mutation
  const inviteMemberMutation = useMutation({
    mutationFn: (data: { email: string; role: 'ADMIN' | 'MEMBER' }) =>
      apiRequest(`/api/organizations/${activeOrg?.id}/members`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      setInviteEmail('');
      setInviteMessage('Member added successfully.');
      setTimeout(() => setInviteMessage(null), 3000);
      queryClient.invalidateQueries({ queryKey: ['org-detail', activeOrg?.id] });
    },
    onError: (err: any) => {
      setInviteMessage(err?.message || 'Failed to invite member.');
      setTimeout(() => setInviteMessage(null), 4000);
    },
  });

  // Developer API Keys Query & Mutations
  const { data: apiKeys = [], refetch: refetchKeys } = useQuery<{ id: string; name: string; prefix: string; scopes: string[]; createdAt: string }[]>({
    queryKey: ['developer-keys', activeOrg?.id],
    queryFn: () => apiRequest('/api/developer/keys'),
    enabled: !!activeOrg?.id && activeTab === 'developer',
  });

  const { data: webhooks = [], refetch: refetchWebhooks } = useQuery<{ id: string; targetUrl: string; secret: string; events: string[]; createdAt: string }[]>({
    queryKey: ['developer-webhooks', activeOrg?.id],
    queryFn: () => apiRequest('/api/developer/webhooks'),
    enabled: !!activeOrg?.id && activeTab === 'developer',
  });

  const createKeyMutation = useMutation({
    mutationFn: (name: string) =>
      apiRequest<{ id: string; name: string; key: string; prefix: string }>('/api/developer/keys', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: (data) => {
      setRawGeneratedKey(data.key);
      setNewKeyName('');
      refetchKeys();
    },
  });

  const revokeKeyMutation = useMutation({
    mutationFn: (keyId: string) =>
      apiRequest(`/api/developer/keys/${keyId}`, { method: 'DELETE' }),
    onSuccess: () => refetchKeys(),
  });

  const subscribeWebhookMutation = useMutation({
    mutationFn: (targetUrl: string) =>
      apiRequest('/api/developer/webhooks', {
        method: 'POST',
        body: JSON.stringify({ targetUrl }),
      }),
    onSuccess: () => {
      setWebhookUrl('');
      refetchWebhooks();
    },
  });

  const deleteWebhookMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/developer/webhooks/${id}`, { method: 'DELETE' }),
    onSuccess: () => refetchWebhooks(),
  });

  const handleDayChange = (
    dayIndex: number,
    field: 'openTime' | 'closeTime' | 'closed',
    value: string | boolean
  ) => {
    if (!schedule) return;
    const newScheduleList = [...schedule.schedule];
    newScheduleList[dayIndex] = {
      ...newScheduleList[dayIndex],
      [field]: value,
    };
    setSchedule({
      ...schedule,
      schedule: newScheduleList,
    });
  };

  const handleSaveSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedule) return;
    saveScheduleMutation.mutate(schedule);
  };

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    inviteMemberMutation.mutate({
      email: inviteEmail.trim(),
      role: inviteRole,
    });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
          <Settings className="w-6 h-6 text-indigo-600" />
          <span>Workspace Settings</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Configure operating hours, automated out-of-office responses, and team permissions.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('business-hours')}
          className={`inline-flex items-center space-x-2 py-3 px-4 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'business-hours'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Business Hours & Schedule</span>
        </button>

        <button
          onClick={() => setActiveTab('members')}
          className={`inline-flex items-center space-x-2 py-3 px-4 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'members'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Team & Roles</span>
        </button>

        <button
          onClick={() => setActiveTab('developer')}
          className={`inline-flex items-center space-x-2 py-3 px-4 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'developer'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Key className="w-4 h-4" />
          <span>API Keys & Webhooks</span>
        </button>

        <button
          onClick={() => setActiveTab('general')}
          className={`inline-flex items-center space-x-2 py-3 px-4 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'general'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Organization Profile</span>
        </button>
      </div>

      {/* TAB 1: Business Hours */}
      {activeTab === 'business-hours' && (
        <div className="space-y-6">
          {/* Live Status Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div
                className={`w-3.5 h-3.5 rounded-full ${
                  liveStatus?.isWithin ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                }`}
              />
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Current Status: {liveStatus?.isWithin ? 'OPEN (Inside Business Hours)' : 'CLOSED (Outside Hours)'}
                </h3>
                <p className="text-xs text-slate-500">
                  {liveStatus?.isWithin
                    ? `Currently serving customers in timezone ${liveStatus?.timezone}`
                    : `Reason: ${liveStatus?.reason || 'Scheduled closed period'}`}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <span className="text-xs text-slate-400">Enforcement:</span>
              <button
                type="button"
                onClick={() => {
                  if (!schedule) return;
                  const updated = { ...schedule, enabled: !schedule.enabled };
                  setSchedule(updated);
                  saveScheduleMutation.mutate(updated);
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  schedule?.enabled ? 'bg-indigo-600' : 'bg-slate-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    schedule?.enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Schedule Form */}
          {isLoadingSchedule || !schedule ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading business hours...</div>
          ) : (
            <form onSubmit={handleSaveSchedule} className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-6">
              {/* Timezone Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-slate-400" />
                  <span>Workspace Timezone</span>
                </label>
                <select
                  value={schedule.timezone}
                  onChange={(e) => setSchedule({ ...schedule, timezone: e.target.value })}
                  className="w-full sm:w-72 px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>

              {/* Weekly Schedule Table */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                  Weekly Operating Schedule
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                  {schedule.schedule.map((day, idx) => (
                    <div
                      key={day.dayOfWeek}
                      className={`p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs ${
                        day.closed ? 'bg-slate-50/70 text-slate-400' : 'bg-white text-slate-800'
                      }`}
                    >
                      <div className="w-28 font-semibold flex items-center space-x-2">
                        <span>{DAYS_OF_WEEK[day.dayOfWeek]}</span>
                      </div>

                      <div className="flex items-center space-x-3">
                        <label className="flex items-center space-x-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={day.closed}
                            onChange={(e) => handleDayChange(idx, 'closed', e.target.checked)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                          />
                          <span className="text-slate-600">Closed All Day</span>
                        </label>

                        {!day.closed && (
                          <div className="flex items-center space-x-2">
                            <input
                              type="time"
                              value={day.openTime}
                              onChange={(e) => handleDayChange(idx, 'openTime', e.target.value)}
                              className="px-2 py-1 border border-slate-300 rounded text-xs font-mono text-slate-800"
                            />
                            <span>to</span>
                            <input
                              type="time"
                              value={day.closeTime}
                              onChange={(e) => handleDayChange(idx, 'closeTime', e.target.value)}
                              className="px-2 py-1 border border-slate-300 rounded text-xs font-mono text-slate-800"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Out-of-hours Message */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Automated Out-of-Office Response Message
                </label>
                <textarea
                  value={schedule.outOfHoursMessage}
                  onChange={(e) => setSchedule({ ...schedule, outOfHoursMessage: e.target.value })}
                  rows={3}
                  className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                  placeholder="Message sent automatically to customers who message outside business hours..."
                />
              </div>

              {/* Feedback and Submit */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                <div>
                  {saveSuccessNotice && (
                    <span className="inline-flex items-center space-x-1 text-xs font-semibold text-emerald-600">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{saveSuccessNotice}</span>
                    </span>
                  )}
                  {saveErrorNotice && (
                    <span className="inline-flex items-center space-x-1 text-xs font-semibold text-rose-600">
                      <AlertCircle className="w-4 h-4" />
                      <span>{saveErrorNotice}</span>
                    </span>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={saveScheduleMutation.isPending}
                  className="inline-flex items-center space-x-2 px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{saveScheduleMutation.isPending ? 'Saving...' : 'Save Schedule'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* TAB 2: Members & Team */}
      {activeTab === 'members' && (
        <div className="space-y-6">
          {/* Add Member Form */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-indigo-600" />
              <span>Invite New Team Member</span>
            </h3>

            <form onSubmit={handleInviteSubmit} className="flex flex-col sm:flex-row items-center gap-3">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
                required
                className="w-full sm:flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />

              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'ADMIN' | 'MEMBER')}
                className="w-full sm:w-36 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="MEMBER">Member / Agent</option>
                <option value="ADMIN">Administrator</option>
              </select>

              <button
                type="submit"
                disabled={!inviteEmail.trim() || inviteMemberMutation.isPending}
                className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
              >
                {inviteMemberMutation.isPending ? 'Inviting...' : 'Send Invite'}
              </button>
            </form>

            {inviteMessage && (
              <p className="text-xs text-indigo-600 font-semibold">{inviteMessage}</p>
            )}
          </div>

          {/* Members Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 font-semibold text-xs text-slate-700 uppercase">
              Current Organization Members
            </div>
            <div className="divide-y divide-slate-100">
              {isLoadingOrg ? (
                <div className="p-8 text-center text-xs text-slate-400">Loading members...</div>
              ) : (
                orgDetail?.memberships.map((m) => (
                  <div key={m.id} className="p-4 flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center">
                        {m.user.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900">{m.user.name}</div>
                        <div className="text-slate-500">{m.user.email}</div>
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] uppercase border ${
                        m.role === 'OWNER'
                          ? 'bg-purple-50 text-purple-700 border-purple-200'
                          : m.role === 'ADMIN'
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {m.role}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB: Developer API Keys & Webhooks */}
      {activeTab === 'developer' && (
        <div className="space-y-6">
          {/* API Keys Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Key className="w-4 h-4 text-indigo-600" />
                  <span>Workspace REST API Keys</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Cryptographically hashed API keys for headless API access and external workflows.
                </p>
              </div>
            </div>

            {/* Generated Raw Key Alert */}
            {rawGeneratedKey && (
              <div className="p-4 rounded-xl bg-amber-50 border-2 border-amber-300 space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold text-amber-900">
                  <span>New API Key Generated — Copy Now (Will Not Be Shown Again)</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(rawGeneratedKey);
                      setCopiedNotice(true);
                      setTimeout(() => setCopiedNotice(false), 2000);
                    }}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 bg-amber-200 hover:bg-amber-300 rounded text-amber-900 text-xs font-semibold"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedNotice ? 'Copied!' : 'Copy Key'}</span>
                  </button>
                </div>
                <div className="font-mono bg-white p-2 rounded border border-amber-200 break-all text-slate-800">
                  {rawGeneratedKey}
                </div>
              </div>
            )}

            {/* Create Key Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newKeyName.trim()) return;
                createKeyMutation.mutate(newKeyName.trim());
              }}
              className="flex items-center gap-3"
            >
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g. Production CI Ingest Key"
                className="w-full sm:w-72 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={!newKeyName.trim() || createKeyMutation.isPending}
                className="inline-flex items-center space-x-1 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Key</span>
              </button>
            </form>

            {/* API Keys Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
              {apiKeys.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">No API keys created yet.</div>
              ) : (
                apiKeys.map((k) => (
                  <div key={k.id} className="p-3.5 flex items-center justify-between text-xs">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-slate-900">{k.name}</div>
                      <div className="font-mono text-[11px] text-slate-400">{k.prefix}</div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-[10px] text-slate-400">
                        Created {new Date(k.createdAt).toLocaleDateString()}
                      </span>
                      <button
                        onClick={() => revokeKeyMutation.mutate(k.id)}
                        className="text-rose-600 hover:text-rose-800 p-1"
                        title="Revoke Key"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Outbound Webhooks Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-5">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Webhook className="w-4 h-4 text-indigo-600" />
                <span>Outbound Webhook Subscriptions</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time event dispatches signed with HMAC-SHA256 headers.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!webhookUrl.trim()) return;
                subscribeWebhookMutation.mutate(webhookUrl.trim());
              }}
              className="flex items-center gap-3"
            >
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-domain.com/webhook"
                required
                className="w-full sm:w-96 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={!webhookUrl.trim() || subscribeWebhookMutation.isPending}
                className="inline-flex items-center space-x-1 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Subscribe Webhook</span>
              </button>
            </form>

            <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
              {webhooks.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">No webhook subscriptions active.</div>
              ) : (
                webhooks.map((sub) => (
                  <div key={sub.id} className="p-3.5 flex items-center justify-between text-xs">
                    <div className="space-y-0.5">
                      <div className="font-mono text-slate-900 font-semibold">{sub.targetUrl}</div>
                      <div className="text-[10px] text-slate-400 font-mono">Secret: {sub.secret.slice(0, 12)}…</div>
                    </div>
                    <button
                      onClick={() => deleteWebhookMutation.mutate(sub.id)}
                      className="text-rose-600 hover:text-rose-800 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Organization Profile */}
      {activeTab === 'general' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-indigo-600" />
            <span>Organization Profile</span>
          </h3>

          <div className="space-y-3 text-xs max-w-lg">
            <div>
              <span className="text-slate-500 font-medium">Organization Name</span>
              <div className="font-semibold text-slate-900 mt-0.5 text-sm">{activeOrg?.name}</div>
            </div>

            <div>
              <span className="text-slate-500 font-medium">Workspace Slug</span>
              <div className="font-mono text-slate-700 mt-0.5">{activeOrg?.slug}</div>
            </div>

            <div>
              <span className="text-slate-500 font-medium">Organization ID</span>
              <div className="font-mono text-slate-400 mt-0.5">{activeOrg?.id}</div>
            </div>

            <div>
              <span className="text-slate-500 font-medium">Your Role</span>
              <div className="font-semibold text-indigo-600 mt-0.5">{activeOrg?.role}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
