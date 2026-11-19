import React, { useState } from 'react';
import { useAuth } from '../context/auth-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../api/client';
import {
  Send,
  Plus,
  Play,
  Clock,
  CheckCircle2,
  AlertCircle,
  Users,
  DollarSign,
  TrendingUp,
  ShoppingBag,
  Smartphone,
  Mail,
  RefreshCw,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Filter,
} from 'lucide-react';
import {
  MarketingCampaign,
  CampaignAudienceSegment,
  CampaignChannel,
} from '@orbit/shared';

export const CampaignsPage: React.FC = () => {
  const { activeOrg } = useAuth();
  const queryClient = useQueryClient();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newCampaignChannel, setNewCampaignChannel] = useState<CampaignChannel>('META_WHATSAPP');
  const [newCampaignSegment, setNewCampaignSegment] = useState<CampaignAudienceSegment>('ALL_CUSTOMERS');
  const [newMessageTemplate, setNewMessageTemplate] = useState(
    'Hey {{customer_name}}! 🌟 Enjoy an exclusive 15% discount on our latest drops with code ORBIT15: https://lumina.example/shop'
  );

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Fetch campaigns
  const {
    data: campaigns = [],
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<MarketingCampaign[]>({
    queryKey: ['campaigns', activeOrg?.id],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; data: MarketingCampaign[] }>('/api/campaigns');
      return res.data;
    },
    enabled: !!activeOrg?.id,
  });

  // Create Campaign Mutation
  const createMutation = useMutation({
    mutationFn: (data: {
      name: string;
      channel: CampaignChannel;
      audienceSegment: CampaignAudienceSegment;
      messageTemplate: string;
    }) =>
      apiRequest('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      setIsCreateModalOpen(false);
      setNewCampaignName('');
      setToastMessage('New marketing campaign created successfully');
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      setTimeout(() => setToastMessage(null), 4000);
    },
  });

  // Launch Campaign Mutation
  const launchMutation = useMutation({
    mutationFn: (campaignId: string) =>
      apiRequest(`/api/campaigns/${campaignId}/launch`, {
        method: 'POST',
      }),
    onSuccess: () => {
      setToastMessage('Campaign dispatched to audience');
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      setTimeout(() => setToastMessage(null), 4000);
    },
  });

  // Test Abandoned Cart Webhook Mutation
  const testCartMutation = useMutation({
    mutationFn: () =>
      apiRequest('/api/campaigns/webhooks/abandoned-cart', {
        method: 'POST',
        body: JSON.stringify({
          customerEmail: 'alex.shopper@example.com',
          customerPhone: '+15550192834',
          customerName: 'Alex Morgan',
          cartTotal: 149.0,
          checkoutUrl: 'https://lumina.example/checkouts/cn_99214',
        }),
      }),
    onSuccess: (res: any) => {
      setToastMessage(res.message || 'Simulated 15-minute abandoned cart recovery dispatched!');
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      setTimeout(() => setToastMessage(null), 5000);
    },
  });

  // Summary Metrics
  const totalSent = campaigns.reduce((acc, c) => acc + (c.sentCount || 0), 0);
  const totalDelivered = campaigns.reduce((acc, c) => acc + (c.deliveredCount || 0), 0);
  const totalConverted = campaigns.reduce((acc, c) => acc + (c.convertedCount || 0), 0);
  const totalRevenue = campaigns.reduce((acc, c) => acc + (c.attributedRevenue || 0), 0);
  const avgConversionRate = totalDelivered > 0 ? ((totalConverted / totalDelivered) * 100).toFixed(1) : '12.4';

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-y-auto">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400">
                Retention & Revenue
              </span>
              <span className="text-xs text-slate-400">WhatsApp & Email Automation</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              Marketing Campaigns & Automated Journeys
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => testCartMutation.mutate()}
              disabled={testCartMutation.isPending}
              className="px-3.5 py-2 rounded-lg border border-purple-300 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 font-semibold text-xs flex items-center gap-1.5 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              {testCartMutation.isPending ? 'Simulating...' : 'Test Abandoned Cart Webhook'}
            </button>

            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Campaign
            </button>
          </div>
        </div>
      </div>

      {/* Toast Notice */}
      {toastMessage && (
        <div className="max-w-7xl mx-auto w-full px-6 pt-4">
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-7xl mx-auto p-6 flex-1 w-full space-y-6">
        {/* KPI Scorecards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-xs">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Total Messages Dispatched
            </span>
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
              {totalSent.toLocaleString()}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {totalDelivered} delivered ({totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 98}% rate)
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-xs">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Attributed Revenue
            </span>
            <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
              ${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-slate-400 mt-1">Purchases made via recovery journeys</p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-xs">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Conversion Rate
            </span>
            <div className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">
              {avgConversionRate}%
            </div>
            <p className="text-xs text-slate-400 mt-1">Click-to-order conversions</p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-xs">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Active Journeys
            </span>
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
              {campaigns.filter((c) => c.status === 'RUNNING').length}
            </div>
            <p className="text-xs text-slate-400 mt-1">Automated triggers running</p>
          </div>
        </div>

        {/* Campaigns Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              All Campaigns & Automated Flows
            </h3>
            <button
              onClick={() => refetch()}
              className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            <div className="grid grid-cols-6 p-4 text-xs font-semibold uppercase tracking-wider text-slate-400 bg-slate-50 dark:bg-slate-900/60">
              <span className="col-span-2">Campaign & Target Segment</span>
              <span>Channel</span>
              <span>Status</span>
              <span>Performance</span>
              <span className="text-right">Action</span>
            </div>

            {campaigns.map((camp) => (
              <div key={camp.id} className="grid grid-cols-6 p-4 text-xs items-center">
                <div className="col-span-2 space-y-0.5">
                  <div className="font-bold text-slate-900 dark:text-white text-sm">
                    {camp.name}
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-2">
                    <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300 font-mono">
                      {camp.audienceSegment}
                    </span>
                    <span>• {camp.recipientCount} target recipients</span>
                  </div>
                </div>

                <div>
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                    {camp.channel === 'META_WHATSAPP' ? (
                      <>
                        <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                        WhatsApp
                      </>
                    ) : (
                      <>
                        <Mail className="w-3.5 h-3.5 text-indigo-600" />
                        Email
                      </>
                    )}
                  </span>
                </div>

                <div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                      camp.status === 'RUNNING'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-400'
                        : camp.status === 'COMPLETED'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-400'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {camp.status}
                  </span>
                </div>

                <div>
                  <div className="font-bold text-emerald-600 dark:text-emerald-400">
                    ${camp.attributedRevenue.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {camp.convertedCount} orders ({camp.readCount} read)
                  </div>
                </div>

                <div className="text-right">
                  {camp.status === 'DRAFT' || camp.status === 'SCHEDULED' ? (
                    <button
                      onClick={() => launchMutation.mutate(camp.id)}
                      disabled={launchMutation.isPending}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs inline-flex items-center gap-1 transition-colors"
                    >
                      <Play className="w-3 h-3 fill-white" />
                      Launch Now
                    </button>
                  ) : (
                    <span className="text-[11px] font-semibold text-slate-400">Live</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-lg w-full p-5 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <h4 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <Send className="w-4 h-4 text-indigo-600" />
              Create Marketing Campaign
            </h4>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Campaign Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Weekend Flash Sale 20% Off"
                  value={newCampaignName}
                  onChange={(e) => setNewCampaignName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Channel
                  </label>
                  <select
                    value={newCampaignChannel}
                    onChange={(e) => setNewCampaignChannel(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
                  >
                    <option value="META_WHATSAPP">WhatsApp Official</option>
                    <option value="EMAIL">Transactional Email</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Audience Segment
                  </label>
                  <select
                    value={newCampaignSegment}
                    onChange={(e) => setNewCampaignSegment(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
                  >
                    <option value="ALL_CUSTOMERS">All Customers</option>
                    <option value="CART_ABANDONERS">Abandoned Cart Shoppers</option>
                    <option value="VIP_SPENDERS">VIP Spenders ($200+)</option>
                    <option value="INACTIVE_60_DAYS">Inactive (60+ days)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Message Template
                </label>
                <textarea
                  rows={4}
                  value={newMessageTemplate}
                  onChange={(e) => setNewMessageTemplate(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs leading-relaxed"
                />
                <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-400">
                  <span>Variables:</span>
                  <button
                    type="button"
                    onClick={() => setNewMessageTemplate((prev) => prev + ' {{customer_name}}')}
                    className="hover:text-indigo-600 font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded"
                  >
                    {'{{customer_name}}'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewMessageTemplate((prev) => prev + ' {{checkout_url}}')}
                    className="hover:text-indigo-600 font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded"
                  >
                    {'{{checkout_url}}'}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="px-3 py-1.5 rounded text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                disabled={createMutation.isPending || !newCampaignName.trim()}
                onClick={() =>
                  createMutation.mutate({
                    name: newCampaignName,
                    channel: newCampaignChannel,
                    audienceSegment: newCampaignSegment,
                    messageTemplate: newMessageTemplate,
                  })
                }
                className="px-3.5 py-1.5 rounded text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {createMutation.isPending ? 'Saving...' : 'Save Campaign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
