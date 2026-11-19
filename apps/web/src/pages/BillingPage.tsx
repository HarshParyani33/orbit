import React, { useState } from 'react';
import { useAuth } from '../context/auth-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../api/client';
import {
  CreditCard,
  Zap,
  CheckCircle2,
  AlertCircle,
  Plus,
  ArrowUpRight,
  ShieldCheck,
  Sparkles,
  Layers,
  X,
} from 'lucide-react';

interface WalletData {
  organizationId: string;
  planTier: string;
  status: string;
  aiTokenAllowance: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  isExhausted: boolean;
}

export const BillingPage: React.FC = () => {
  const { activeOrg } = useAuth();
  const queryClient = useQueryClient();

  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
  const [selectedTopUpCredits, setSelectedTopUpCredits] = useState<number>(50000);
  const [notice, setNotice] = useState<string | null>(null);

  // 1. Fetch wallet & subscription data
  const { data: wallet, isLoading } = useQuery<WalletData>({
    queryKey: ['wallet', activeOrg?.id],
    queryFn: () => apiRequest<WalletData>('/api/billing/wallet'),
    enabled: !!activeOrg?.id,
  });

  // 2. Top-Up Mutation
  const topUpMutation = useMutation({
    mutationFn: (credits: number) =>
      apiRequest('/api/billing/top-up', {
        method: 'POST',
        body: JSON.stringify({ credits }),
      }),
    onSuccess: () => {
      setIsTopUpModalOpen(false);
      setNotice('Credits added to your wallet successfully! Non-expiring balance updated.');
      setTimeout(() => setNotice(null), 4000);
      queryClient.invalidateQueries({ queryKey: ['wallet', activeOrg?.id] });
    },
    onError: (err: any) => {
      setNotice(err?.message || 'Failed to process top-up.');
      setTimeout(() => setNotice(null), 4000);
    },
  });

  // 3. Plan Change Mutation
  const changePlanMutation = useMutation({
    mutationFn: (planTier: string) =>
      apiRequest('/api/billing/subscription/plan', {
        method: 'POST',
        body: JSON.stringify({ planTier }),
      }),
    onSuccess: () => {
      setNotice('Subscription tier updated successfully.');
      setTimeout(() => setNotice(null), 4000);
      queryClient.invalidateQueries({ queryKey: ['wallet', activeOrg?.id] });
    },
  });

  const allowance = wallet?.aiTokenAllowance || 0;
  // Assumed base allowance based on tier
  const maxAllowance = wallet?.planTier === 'PRO' ? 500000 : wallet?.planTier === 'STARTER' ? 100000 : 25000;
  const pctRemaining = Math.min(100, Math.max(0, Math.round((allowance / maxAllowance) * 100)));

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <CreditCard className="w-6 h-6 text-indigo-600" />
            <span>Billing, Subscription & AI Credit Wallet</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Monitor real-time AI credit consumption, upgrade plans, or purchase non-expiring credit top-ups.
          </p>
        </div>

        <button
          onClick={() => setIsTopUpModalOpen(true)}
          className="inline-flex items-center space-x-2 px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Buy Top-Up Credits</span>
        </button>
      </div>

      {notice && (
        <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-semibold flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Wallet Meter Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Live Wallet Balance
            </span>
            <div className="text-3xl font-extrabold text-slate-900 mt-1">
              {allowance.toLocaleString()} <span className="text-sm font-semibold text-slate-500">Credits Remaining</span>
            </div>
          </div>

          <div className="text-right">
            <span
              className={`inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-bold border ${
                wallet?.isExhausted
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              <span>{wallet?.isExhausted ? 'Wallet Exhausted' : 'Active & Solvent'}</span>
            </span>
            <div className="text-xs text-slate-400 mt-1">
              Plan Tier: <strong className="text-slate-700 uppercase">{wallet?.planTier || 'FREE'}</strong>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                pctRemaining < 20 ? 'bg-rose-500' : pctRemaining < 50 ? 'bg-amber-500' : 'bg-indigo-600'
              }`}
              style={{ width: `${pctRemaining}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-400">
            <span>0 Credits</span>
            <span>{pctRemaining}% remaining of base monthly allowance</span>
            <span>{maxAllowance.toLocaleString()} Credits</span>
          </div>
        </div>
      </div>

      {/* Plan Tiers Grid */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-slate-900">Subscription Plans</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Starter */}
          <div
            className={`p-6 rounded-2xl bg-white border transition-all ${
              wallet?.planTier === 'STARTER' ? 'border-2 border-indigo-600 shadow-md' : 'border-slate-200'
            }`}
          >
            <h4 className="text-base font-bold text-slate-900">Starter</h4>
            <div className="text-2xl font-extrabold text-slate-900 mt-2">$29 <span className="text-xs font-normal text-slate-400">/mo</span></div>
            <p className="text-xs text-slate-500 mt-1">For single store owners starting with AI customer support.</p>
            <ul className="my-4 space-y-2 text-xs text-slate-600">
              <li className="flex items-center space-x-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /><span>100,000 monthly credits</span></li>
              <li className="flex items-center space-x-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /><span>5 agent seats</span></li>
              <li className="flex items-center space-x-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /><span>WhatsApp & Web Chat</span></li>
            </ul>
            <button
              onClick={() => changePlanMutation.mutate('STARTER')}
              disabled={wallet?.planTier === 'STARTER'}
              className="w-full py-2 text-xs font-semibold rounded-lg border border-slate-300 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400"
            >
              {wallet?.planTier === 'STARTER' ? 'Current Plan' : 'Switch to Starter'}
            </button>
          </div>

          {/* Growth / Pro */}
          <div
            className={`p-6 rounded-2xl bg-white border relative transition-all ${
              wallet?.planTier === 'PRO' ? 'border-2 border-indigo-600 shadow-md' : 'border-slate-200'
            }`}
          >
            <div className="absolute -top-3 right-4 px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold">
              MOST POPULAR
            </div>
            <h4 className="text-base font-bold text-slate-900">Growth Pro</h4>
            <div className="text-2xl font-extrabold text-slate-900 mt-2">$99.99 <span className="text-xs font-normal text-slate-400">/mo</span></div>
            <p className="text-xs text-slate-500 mt-1">For scaling brands needing omnichannel inbox, Voice and RAG.</p>
            <ul className="my-4 space-y-2 text-xs text-slate-600">
              <li className="flex items-center space-x-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /><span>500,000 monthly credits</span></li>
              <li className="flex items-center space-x-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /><span>15 agent seats</span></li>
              <li className="flex items-center space-x-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /><span>Response Guard & CRM merge</span></li>
            </ul>
            <button
              onClick={() => changePlanMutation.mutate('PRO')}
              disabled={wallet?.planTier === 'PRO'}
              className="w-full py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400"
            >
              {wallet?.planTier === 'PRO' ? 'Current Plan' : 'Upgrade to Growth'}
            </button>
          </div>

          {/* Enterprise */}
          <div
            className={`p-6 rounded-2xl bg-white border transition-all ${
              wallet?.planTier === 'ENTERPRISE' ? 'border-2 border-indigo-600 shadow-md' : 'border-slate-200'
            }`}
          >
            <h4 className="text-base font-bold text-slate-900">Enterprise</h4>
            <div className="text-2xl font-extrabold text-slate-900 mt-2">Custom</div>
            <p className="text-xs text-slate-500 mt-1">Bespoke SLA, dedicated AI fine-tuning, and unlimited seats.</p>
            <ul className="my-4 space-y-2 text-xs text-slate-600">
              <li className="flex items-center space-x-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /><span>5,000,000+ monthly credits</span></li>
              <li className="flex items-center space-x-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /><span>Unlimited agent seats</span></li>
              <li className="flex items-center space-x-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /><span>24/7 dedicated support</span></li>
            </ul>
            <button
              onClick={() => changePlanMutation.mutate('ENTERPRISE')}
              disabled={wallet?.planTier === 'ENTERPRISE'}
              className="w-full py-2 text-xs font-semibold rounded-lg border border-slate-300 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400"
            >
              {wallet?.planTier === 'ENTERPRISE' ? 'Current Plan' : 'Contact Sales'}
            </button>
          </div>
        </div>
      </div>

      {/* Top-Up Credits Modal */}
      {isTopUpModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Zap className="w-5 h-5 text-indigo-600" />
                <span>Buy Non-Expiring Top-Up Credits</span>
              </h3>
              <button
                onClick={() => setIsTopUpModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Top-up credits are added immediately to your wallet balance and <strong>never expire</strong>, even at billing cycle resets.
            </p>

            <div className="space-y-3">
              {[
                { credits: 25000, price: '$5' },
                { credits: 50000, price: '$10' },
                { credits: 150000, price: '$25' },
              ].map((pack) => (
                <div
                  key={pack.credits}
                  onClick={() => setSelectedTopUpCredits(pack.credits)}
                  className={`p-3.5 rounded-xl border-2 cursor-pointer flex items-center justify-between text-xs transition-colors ${
                    selectedTopUpCredits === pack.credits
                      ? 'border-indigo-600 bg-indigo-50/60 font-semibold'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="text-slate-900 font-bold">+{pack.credits.toLocaleString()} Credits</div>
                    <div className="text-slate-400 text-[11px]">Never expires</div>
                  </div>
                  <div className="text-base font-bold text-indigo-600">{pack.price}</div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsTopUpModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => topUpMutation.mutate(selectedTopUpCredits)}
                disabled={topUpMutation.isPending}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm disabled:opacity-50"
              >
                {topUpMutation.isPending ? 'Processing...' : `Purchase +${selectedTopUpCredits.toLocaleString()}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
