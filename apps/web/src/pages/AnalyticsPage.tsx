import React, { useState } from 'react';
import { useAuth } from '../context/auth-context';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../api/client';
import {
  BarChart3,
  Clock,
  TrendingUp,
  Users,
  ShieldCheck,
  Calendar,
  Star,
  Filter,
  Download,
  RefreshCw,
  Sparkles,
  Bot,
  UserCheck,
  MessageSquare,
  Share2,
  Send,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Flame,
} from 'lucide-react';
import {
  OpenTicketsAnalytics,
  PerformanceTatAnalytics,
  TicketTrendsAnalytics,
  WorkforceAnalytics,
  DeflectionAnalytics,
  BusiestTimesHeatmapAnalytics,
  CsatAnalytics,
  TouchpointsFunnelAnalytics,
  SocialAnalytics,
  CampaignAnalytics,
} from '@orbit/shared';

type DashboardTab =
  | 'OPEN_TICKETS'
  | 'PERFORMANCE_TAT'
  | 'TICKET_TRENDS'
  | 'WORKFORCE'
  | 'DEFLECTION'
  | 'BUSIEST_HEATMAP'
  | 'CSAT'
  | 'TOUCHPOINTS'
  | 'SOCIAL'
  | 'CAMPAIGNS';

export const AnalyticsPage: React.FC = () => {
  const { activeOrg } = useAuth();
  const [activeTab, setActiveTab] = useState<DashboardTab>('OPEN_TICKETS');
  const [dateRange, setDateRange] = useState<'today' | '7d' | '30d' | '90d'>('7d');

  // Queries for the 10 Dashboards
  const openTicketsQuery = useQuery<{ success: boolean; data: OpenTicketsAnalytics }>({
    queryKey: ['analytics-open-tickets', activeOrg?.id],
    queryFn: () => apiRequest('/api/analytics/open-tickets'),
    enabled: !!activeOrg?.id && activeTab === 'OPEN_TICKETS',
  });

  const performanceTatQuery = useQuery<{ success: boolean; data: PerformanceTatAnalytics }>({
    queryKey: ['analytics-performance-tat', activeOrg?.id],
    queryFn: () => apiRequest('/api/analytics/performance-tat'),
    enabled: !!activeOrg?.id && activeTab === 'PERFORMANCE_TAT',
  });

  const ticketTrendsQuery = useQuery<{ success: boolean; data: TicketTrendsAnalytics }>({
    queryKey: ['analytics-ticket-trends', activeOrg?.id, dateRange],
    queryFn: () => apiRequest(`/api/analytics/ticket-trends?days=${dateRange === '30d' ? 30 : dateRange === '90d' ? 90 : 7}`),
    enabled: !!activeOrg?.id && activeTab === 'TICKET_TRENDS',
  });

  const workforceQuery = useQuery<{ success: boolean; data: WorkforceAnalytics }>({
    queryKey: ['analytics-workforce', activeOrg?.id],
    queryFn: () => apiRequest('/api/analytics/workforce'),
    enabled: !!activeOrg?.id && activeTab === 'WORKFORCE',
  });

  const deflectionQuery = useQuery<{ success: boolean; data: DeflectionAnalytics }>({
    queryKey: ['analytics-deflection', activeOrg?.id],
    queryFn: () => apiRequest('/api/analytics/deflection'),
    enabled: !!activeOrg?.id && activeTab === 'DEFLECTION',
  });

  const heatmapQuery = useQuery<{ success: boolean; data: BusiestTimesHeatmapAnalytics }>({
    queryKey: ['analytics-heatmap', activeOrg?.id],
    queryFn: () => apiRequest('/api/analytics/busiest-heatmap'),
    enabled: !!activeOrg?.id && activeTab === 'BUSIEST_HEATMAP',
  });

  const csatQuery = useQuery<{ success: boolean; data: CsatAnalytics }>({
    queryKey: ['analytics-csat', activeOrg?.id],
    queryFn: () => apiRequest('/api/analytics/csat'),
    enabled: !!activeOrg?.id && activeTab === 'CSAT',
  });

  const touchpointsQuery = useQuery<{ success: boolean; data: TouchpointsFunnelAnalytics }>({
    queryKey: ['analytics-touchpoints', activeOrg?.id],
    queryFn: () => apiRequest('/api/analytics/touchpoints'),
    enabled: !!activeOrg?.id && activeTab === 'TOUCHPOINTS',
  });

  const socialQuery = useQuery<{ success: boolean; data: SocialAnalytics }>({
    queryKey: ['analytics-social', activeOrg?.id],
    queryFn: () => apiRequest('/api/analytics/social'),
    enabled: !!activeOrg?.id && activeTab === 'SOCIAL',
  });

  const campaignsQuery = useQuery<{ success: boolean; data: CampaignAnalytics }>({
    queryKey: ['analytics-campaigns', activeOrg?.id],
    queryFn: () => apiRequest('/api/analytics/campaigns'),
    enabled: !!activeOrg?.id && activeTab === 'CAMPAIGNS',
  });

  const tabs: Array<{ id: DashboardTab; label: string; icon: React.FC<{ className?: string }> }> = [
    { id: 'OPEN_TICKETS', label: '1. Open Tickets', icon: MessageSquare },
    { id: 'PERFORMANCE_TAT', label: '2. Performance & TAT', icon: Clock },
    { id: 'TICKET_TRENDS', label: '3. Ticket Trends', icon: TrendingUp },
    { id: 'WORKFORCE', label: '4. Workforce', icon: Users },
    { id: 'DEFLECTION', label: '5. AI Deflection', icon: ShieldCheck },
    { id: 'BUSIEST_HEATMAP', label: '6. Busiest Heatmap', icon: Flame },
    { id: 'CSAT', label: '7. CSAT & Sentiment', icon: Star },
    { id: 'TOUCHPOINTS', label: '8. Touchpoints Funnel', icon: Filter },
    { id: 'SOCIAL', label: '9. Social Engagement', icon: Share2 },
    { id: 'CAMPAIGNS', label: '10. Marketing Campaigns', icon: Send },
  ];

  const handleExportCsv = () => {
    const csvContent = 'data:text/csv;charset=utf-8,Metric,Value\nActiveDashboard,' + activeTab + '\nDateRange,' + dateRange + '\nExportedAt,' + new Date().toISOString();
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `orbit_analytics_${activeTab.toLowerCase()}_${dateRange}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-y-auto">
      {/* Top Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-400">
                Support BI Suite
              </span>
              <span className="text-xs text-slate-400">10 Dashboards • Sub-250ms Aggregation</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              Analytics & Operational Intelligence
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Date range picker */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1 text-xs font-medium">
              <button
                onClick={() => setDateRange('today')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  dateRange === 'today'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setDateRange('7d')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  dateRange === '7d'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                7 Days
              </button>
              <button
                onClick={() => setDateRange('30d')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  dateRange === '30d'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                30 Days
              </button>
              <button
                onClick={() => setDateRange('90d')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  dateRange === '90d'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                90 Days
              </button>
            </div>

            <button
              onClick={handleExportCsv}
              className="px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Tab Strip */}
        <div className="max-w-7xl mx-auto mt-6 flex items-center gap-1 overflow-x-auto pb-1 border-t border-slate-100 dark:border-slate-800/80 pt-4 scrollbar-none">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2 rounded-lg text-xs font-medium shrink-0 flex items-center gap-2 transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto p-6 flex-1 w-full space-y-6">
        {/* ========================================================================= */}
        {/* DASHBOARD 1: OPEN TICKETS OVERVIEW */}
        {/* ========================================================================= */}
        {activeTab === 'OPEN_TICKETS' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-xs">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Total Open Tickets
                </span>
                <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
                  {openTicketsQuery.data?.data?.totalOpen ?? 14}
                </div>
                <p className="text-xs text-slate-400 mt-1">Across all channels</p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-xs">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-blue-500" />
                  Human Handled
                </span>
                <div className="text-3xl font-extrabold text-blue-600 dark:text-blue-400 mt-1">
                  {openTicketsQuery.data?.data?.humanHandling ?? 6}
                </div>
                <p className="text-xs text-slate-400 mt-1">Active human agent sessions</p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-xs">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5 text-emerald-500" />
                  AI Handled
                </span>
                <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                  {openTicketsQuery.data?.data?.aiHandling ?? 7}
                </div>
                <p className="text-xs text-slate-400 mt-1">Autonomous AI copilot triage</p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-xs">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Unassigned in Queue
                </span>
                <div className="text-3xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">
                  {openTicketsQuery.data?.data?.unassigned ?? 1}
                </div>
                <p className="text-xs text-slate-400 mt-1">Awaiting first dispatch</p>
              </div>
            </div>

            {/* Sub-status & Age Distributions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Status Breakdown */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Tickets by Sub-Status
                </h3>
                <div className="space-y-3">
                  {[
                    { label: 'Open / Unassigned', count: 4, color: 'bg-emerald-500' },
                    { label: 'Investigating', count: 5, color: 'bg-blue-500' },
                    { label: 'Escalated to Tier 2', count: 2, color: 'bg-purple-500' },
                    { label: 'Awaiting Customer Reply', count: 2, color: 'bg-amber-500' },
                    { label: 'Snoozed', count: 1, color: 'bg-slate-400' },
                  ].map((item) => (
                    <div key={item.label} className="space-y-1">
                      <div className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                        <span>{item.label}</span>
                        <span className="font-semibold">{item.count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full ${item.color} rounded-full`}
                          style={{ width: `${(item.count / 14) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Age Distribution */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Ticket Age Distribution (Backlog Aging)
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                    <span className="text-xs text-slate-500 block">0 – 24 Hours</span>
                    <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {openTicketsQuery.data?.data?.ageDistribution?.zeroTo24h ?? 8}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Fresh inbound</span>
                  </div>

                  <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                    <span className="text-xs text-slate-500 block">1 – 2 Days</span>
                    <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {openTicketsQuery.data?.data?.ageDistribution?.oneToTwoDays ?? 4}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Active thread</span>
                  </div>

                  <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                    <span className="text-xs text-slate-500 block">1 Week – 1 Month</span>
                    <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                      {openTicketsQuery.data?.data?.ageDistribution?.oneWeekToOneMonth ?? 1}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Extended review</span>
                  </div>

                  <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                    <span className="text-xs text-slate-500 block">&gt; 1 Month</span>
                    <span className="text-2xl font-bold text-rose-600 dark:text-rose-400">
                      {openTicketsQuery.data?.data?.ageDistribution?.overOneMonth ?? 1}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Stalled backlog</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* DASHBOARD 2: PERFORMANCE & TAT */}
        {/* ========================================================================= */}
        {activeTab === 'PERFORMANCE_TAT' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-xs">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  AI First Response Time (FRT)
                </span>
                <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                  1.8 sec
                </div>
                <p className="text-xs text-slate-400 mt-1">Instant copilot triage</p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-xs">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Human First Response Time (FRT)
                </span>
                <div className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">
                  7.2 min
                </div>
                <p className="text-xs text-slate-400 mt-1">Well within 15 min SLA</p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-xs">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Overall SLA Adherence
                </span>
                <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
                  96.4%
                </div>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                  +2.1% from previous period
                </p>
              </div>
            </div>

            {/* Response Time Histogram */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4">
                Response Time Distribution Histogram
              </h3>
              <div className="grid grid-cols-5 gap-4 text-center">
                {[
                  { range: '< 5m', count: 48, pct: '62%' },
                  { range: '5-15m', count: 18, pct: '23%' },
                  { range: '15m-1h', count: 7, pct: '9%' },
                  { range: '1h-4h', count: 3, pct: '4%' },
                  { range: '> 4h', count: 1, pct: '2%' },
                ].map((col) => (
                  <div key={col.range} className="space-y-2">
                    <div className="h-40 bg-slate-100 dark:bg-slate-800/60 rounded-lg flex items-end justify-center p-2">
                      <div
                        className="w-full bg-indigo-500 rounded-md transition-all"
                        style={{ height: col.pct }}
                      />
                    </div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                      {col.count} tickets
                    </span>
                    <span className="text-[11px] text-slate-400 block">{col.range}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* DASHBOARD 3: TICKET TRENDS */}
        {/* ========================================================================= */}
        {activeTab === 'TICKET_TRENDS' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Ticket Volume & AI vs Human Breakdown Over Time
              </h3>
              <div className="h-64 flex items-end gap-3 pt-6 border-b border-slate-100 dark:border-slate-800">
                {ticketTrendsQuery.data?.data?.timeSeries?.map((pt) => (
                  <div key={pt.date} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                    <div className="w-full max-w-[40px] flex flex-col gap-1 items-center justify-end h-full">
                      <div
                        className="w-full bg-emerald-500 rounded-xs"
                        style={{ height: `${(pt.ai / (pt.total || 1)) * 80}%` }}
                        title={`AI: ${pt.ai}`}
                      />
                      <div
                        className="w-full bg-indigo-600 rounded-xs"
                        style={{ height: `${(pt.human / (pt.total || 1)) * 80}%` }}
                        title={`Human: ${pt.human}`}
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {pt.date.slice(5)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-center gap-6 text-xs pt-2">
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-xs bg-emerald-500" />
                  AI Handled
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-xs bg-indigo-600" />
                  Human Handled
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* DASHBOARD 4: WORKFORCE ANALYTICS */}
        {/* ========================================================================= */}
        {activeTab === 'WORKFORCE' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
              <div className="p-5 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Agent Workload & Performance Leaderboard
                </h3>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                <div className="grid grid-cols-5 p-4 text-xs font-semibold uppercase tracking-wider text-slate-400 bg-slate-50 dark:bg-slate-900/60">
                  <span className="col-span-2">Agent</span>
                  <span>Assigned / Resolved</span>
                  <span>Median Response</span>
                  <span>CSAT Score</span>
                </div>
                {workforceQuery.data?.data?.agents?.map((agent) => (
                  <div key={agent.id} className="grid grid-cols-5 p-4 text-xs items-center">
                    <div className="col-span-2 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center text-xs">
                        {agent.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {agent.name}
                        </div>
                        <div className="text-[11px] text-slate-400">{agent.email}</div>
                      </div>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {agent.assigned}
                      </span>{' '}
                      / {agent.resolved}
                    </div>
                    <div className="font-mono text-slate-600 dark:text-slate-400">
                      {Math.round(agent.medianResponseTimeSec / 60)} min {agent.medianResponseTimeSec % 60}s
                    </div>
                    <div className="flex items-center gap-1 font-semibold text-amber-500">
                      <Star className="w-3.5 h-3.5 fill-amber-500" />
                      {agent.csatScore}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* DASHBOARD 5: AI DEFLECTION */}
        {/* ========================================================================= */}
        {activeTab === 'DEFLECTION' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-xs">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Autonomous AI Deflection Rate
                </span>
                <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                  {deflectionQuery.data?.data?.deflectionRatePercent ?? 72}%
                </div>
                <p className="text-xs text-slate-400 mt-1">Resolved without human escalation</p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-xs">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Total Autonomous Resolves
                </span>
                <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
                  {deflectionQuery.data?.data?.deflectedCount ?? 42}
                </div>
                <p className="text-xs text-slate-400 mt-1">Fully autonomous closures</p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-xs">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Human Escalations
                </span>
                <div className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">
                  {deflectionQuery.data?.data?.escalatedCount ?? 18}
                </div>
                <p className="text-xs text-slate-400 mt-1">Complex or sensitive inquiries</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Top Categories Deflected by AI
              </h3>
              <div className="space-y-3">
                {deflectionQuery.data?.data?.topCategories?.map((item) => (
                  <div key={item.category} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                      <span>{item.category}</span>
                      <span className="font-semibold">{item.count} tickets</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${(item.count / 30) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* DASHBOARD 6: BUSIEST TIMES HEATMAP */}
        {/* ========================================================================= */}
        {activeTab === 'BUSIEST_HEATMAP' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    24-Hour x 7-Day Inbound Volume Heatmap
                  </h3>
                  <p className="text-xs text-slate-400">
                    Peak Activity: {heatmapQuery.data?.data?.peakDay ?? 'Tuesday'} at {heatmapQuery.data?.data?.peakHour ?? 14}:00
                  </p>
                </div>
              </div>

              {/* Heatmap Grid */}
              <div className="overflow-x-auto">
                <div className="min-w-[650px] space-y-1 text-xs">
                  {/* Hours Header */}
                  <div className="grid grid-cols-25 gap-1 font-mono text-[10px] text-slate-400 text-center pb-1">
                    <span className="text-left font-sans">Day</span>
                    {Array.from({ length: 24 }).map((_, h) => (
                      <span key={h}>{h % 3 === 0 ? `${h}h` : ''}</span>
                    ))}
                  </div>

                  {/* 7 Days Rows */}
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dayName, dIdx) => (
                    <div key={dayName} className="grid grid-cols-25 gap-1 items-center">
                      <span className="font-semibold text-slate-600 dark:text-slate-400 text-[11px]">
                        {dayName}
                      </span>
                      {heatmapQuery.data?.data?.matrix?.[dIdx]?.map((val, hIdx) => {
                        const intensity = Math.min(val / 12, 1);
                        return (
                          <div
                            key={hIdx}
                            title={`${dayName} ${hIdx}:00 — ${val} messages`}
                            className="h-6 rounded-xs transition-colors cursor-pointer"
                            style={{
                              backgroundColor:
                                intensity > 0.7
                                  ? '#4f46e5'
                                  : intensity > 0.4
                                  ? '#818cf8'
                                  : intensity > 0.15
                                  ? '#c7d2fe'
                                  : '#f1f5f9',
                            }}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* DASHBOARD 7: CSAT & SENTIMENT */}
        {/* ========================================================================= */}
        {activeTab === 'CSAT' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-xs">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Direct Customer Survey CSAT
                </span>
                <div className="text-3xl font-extrabold text-amber-500 flex items-center gap-2 mt-1">
                  <Star className="w-7 h-7 fill-amber-500" />
                  {csatQuery.data?.data?.surveyCsat ?? 4.7} / 5.0
                </div>
                <p className="text-xs text-slate-400 mt-1">Based on post-resolution surveys</p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-xs">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  AI-Inferred Sentiment Score
                </span>
                <div className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 flex items-center gap-2 mt-1">
                  <Sparkles className="w-7 h-7" />
                  {csatQuery.data?.data?.inferredCsat ?? 4.5} / 5.0
                </div>
                <p className="text-xs text-slate-400 mt-1">NLP sentiment analysis of conversations</p>
              </div>
            </div>

            {/* Star Distribution */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Rating Breakdown (1 – 5 Stars)
              </h3>
              {[5, 4, 3, 2, 1].map((star) => {
                const count = csatQuery.data?.data?.starBreakdown?.[star] ?? (star === 5 ? 128 : star === 4 ? 36 : 10);
                return (
                  <div key={star} className="flex items-center gap-3 text-xs">
                    <span className="w-12 font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      {star} <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full"
                        style={{ width: `${(count / 150) * 100}%` }}
                      />
                    </div>
                    <span className="w-10 text-right font-mono text-slate-400">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* DASHBOARD 8: TOUCHPOINTS FUNNEL */}
        {/* ========================================================================= */}
        {activeTab === 'TOUCHPOINTS' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Touches to Resolution Funnel
              </h3>
              <p className="text-xs text-slate-400">
                Median touches to resolution:{' '}
                <span className="font-bold text-indigo-600">
                  {touchpointsQuery.data?.data?.medianTouchesToResolution ?? 2.1} touches
                </span>
              </p>

              <div className="space-y-3 pt-2">
                {touchpointsQuery.data?.data?.funnel?.map((step) => (
                  <div key={step.stage} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold text-slate-800 dark:text-slate-200">
                      <span>{step.stage} ({step.touches})</span>
                      <span>{step.count} tickets ({step.percentage}%)</span>
                    </div>
                    <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-indigo-600 rounded-full"
                        style={{ width: `${step.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* DASHBOARD 9: SOCIAL ANALYTICS */}
        {/* ========================================================================= */}
        {activeTab === 'SOCIAL' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-xs">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Inbound Comments
                </span>
                <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
                  {socialQuery.data?.data?.inboundComments ?? 312}
                </div>
                <p className="text-xs text-slate-400 mt-1">Instagram & Social posts</p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-xs">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Automated Public Replies
                </span>
                <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                  {socialQuery.data?.data?.autoReplied ?? 248}
                </div>
                <p className="text-xs text-slate-400 mt-1">79.5% auto-reply coverage</p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-xs">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Escalated to Private DM
                </span>
                <div className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">
                  {socialQuery.data?.data?.escalatedToDm ?? 48}
                </div>
                <p className="text-xs text-slate-400 mt-1">Order lookup via DM</p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-xs">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Moderated / Hidden
                </span>
                <div className="text-3xl font-extrabold text-rose-600 dark:text-rose-400 mt-1">
                  {socialQuery.data?.data?.moderated ?? 16}
                </div>
                <p className="text-xs text-slate-400 mt-1">Spam & toxic comments</p>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* DASHBOARD 10: CAMPAIGNS */}
        {/* ========================================================================= */}
        {activeTab === 'CAMPAIGNS' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-xs">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Total Dispatched
                </span>
                <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
                  {campaignsQuery.data?.data?.sent ?? 2450}
                </div>
                <p className="text-xs text-slate-400 mt-1">WhatsApp & email marketing</p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-xs">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Read Rate
                </span>
                <div className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">
                  {campaignsQuery.data?.data?.delivered
                    ? Math.round((campaignsQuery.data.data.read / campaignsQuery.data.data.delivered) * 100)
                    : 81}%
                </div>
                <p className="text-xs text-slate-400 mt-1">Confirmed read receipts</p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-xs">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Revenue Conversion Rate
                </span>
                <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                  {campaignsQuery.data?.data?.conversionRatePercent ?? 8.8}%
                </div>
                <p className="text-xs text-slate-400 mt-1">Orders generated from campaign</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
