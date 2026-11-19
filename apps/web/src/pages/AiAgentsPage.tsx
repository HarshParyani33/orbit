import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/auth-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../api/client';
import {
  Bot,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Save,
  Sliders,
  Radio,
  Layers,
  Smartphone,
  Globe,
  Plus,
  Trash2,
  Lock,
  Eye,
  Check,
} from 'lucide-react';

interface AiConfig {
  id: string;
  name: string;
  systemInstructions: string;
  policyRules: any;
  provider: string;
  model: string;
  temperature: number;
  status: string;
  version: number;
}

export const AiAgentsPage: React.FC = () => {
  const { activeOrg } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'agents' | 'guard'>('agents');

  // Agent configuration form state
  const [agentName, setAgentName] = useState('Frontline Support Agent');
  const [instructions, setInstructions] = useState(
    'You are Orbit AI, a professional and helpful customer support specialist. Answer queries accurately based strictly on company knowledge and business policies.'
  );
  const [provider, setProvider] = useState<'OPENAI' | 'GROQ' | 'OPENROUTER' | 'MOCK'>('OPENAI');
  const [model, setModel] = useState('gpt-4o-mini');
  const [temperature, setTemperature] = useState(0.3);
  const [channelWhatsApp, setChannelWhatsApp] = useState(true);
  const [channelInstagram, setChannelInstagram] = useState(true);
  const [channelWebChat, setChannelWebChat] = useState(true);

  // Response Guard state
  const [supervisedReview, setSupervisedReview] = useState(true);
  const [confidenceThreshold, setConfidenceThreshold] = useState(85);
  const [piiMasking, setPiiMasking] = useState(true);
  const [competitors, setCompetitors] = useState<string[]>(['Zendesk', 'Intercom', 'Freshdesk']);
  const [newCompetitor, setNewCompetitor] = useState('');

  const [notice, setNotice] = useState<string | null>(null);

  // 1. Fetch active AI configuration
  const { data: activeConfig, isLoading } = useQuery<AiConfig>({
    queryKey: ['ai-config', activeOrg?.id],
    queryFn: () => apiRequest<AiConfig>('/api/ai/config'),
    enabled: !!activeOrg?.id,
  });

  useEffect(() => {
    if (activeConfig) {
      setAgentName(activeConfig.name || 'Frontline Support Agent');
      setInstructions(activeConfig.systemInstructions || '');
      setProvider(activeConfig.provider as any || 'OPENAI');
      setModel(activeConfig.model || 'gpt-4o-mini');
      setTemperature(Number(activeConfig.temperature) || 0.3);

      if (activeConfig.policyRules && typeof activeConfig.policyRules === 'object') {
        const rules = activeConfig.policyRules as any;
        if (Array.isArray(rules.competitors)) setCompetitors(rules.competitors);
        if (typeof rules.supervisedReview === 'boolean') setSupervisedReview(rules.supervisedReview);
        if (typeof rules.confidenceThreshold === 'number') setConfidenceThreshold(rules.confidenceThreshold);
        if (typeof rules.piiMasking === 'boolean') setPiiMasking(rules.piiMasking);
      }
    }
  }, [activeConfig]);

  // 2. Save Configuration Mutation
  const saveConfigMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: agentName,
        systemInstructions: instructions,
        provider,
        model,
        temperature,
        policyRules: {
          competitors,
          supervisedReview,
          confidenceThreshold,
          piiMasking,
        },
      };

      const created = await apiRequest<AiConfig>('/api/ai/config', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // Activate immediately
      return apiRequest<AiConfig>(`/api/ai/config/${created.id}/activate`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      setNotice('AI Workforce & Response Guard configurations saved and activated successfully.');
      setTimeout(() => setNotice(null), 4000);
      queryClient.invalidateQueries({ queryKey: ['ai-config', activeOrg?.id] });
    },
    onError: (err: any) => {
      setNotice(err?.message || 'Failed to save configuration.');
      setTimeout(() => setNotice(null), 4000);
    },
  });

  const handleAddCompetitor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompetitor.trim()) return;
    if (!competitors.includes(newCompetitor.trim())) {
      setCompetitors([...competitors, newCompetitor.trim()]);
    }
    setNewCompetitor('');
  };

  const handleRemoveCompetitor = (comp: string) => {
    setCompetitors(competitors.filter((c) => c !== comp));
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Bot className="w-6 h-6 text-purple-600" />
            <span>AI Workforce Studio & Guardrails</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Deploy autonomous support personas, configure multi-provider fallback routing, and enforce Response Guard safety.
          </p>
        </div>

        <button
          onClick={() => saveConfigMutation.mutate()}
          disabled={saveConfigMutation.isPending}
          className="inline-flex items-center space-x-2 px-5 py-2.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-sm transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          <span>{saveConfigMutation.isPending ? 'Activating...' : 'Deploy & Activate AI'}</span>
        </button>
      </div>

      {notice && (
        <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 text-xs font-semibold flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('agents')}
          className={`inline-flex items-center space-x-2 py-3 px-4 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'agents'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Bot className="w-4 h-4" />
          <span>Workforce Personas</span>
        </button>

        <button
          onClick={() => setActiveTab('guard')}
          className={`inline-flex items-center space-x-2 py-3 px-4 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'guard'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Response Guard & Trust Studio</span>
        </button>
      </div>

      {/* TAB 1: AI Personas */}
      {activeTab === 'agents' && (
        <div className="space-y-6">
          {/* Persona Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-white border-2 border-purple-500 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                  <Bot className="w-5 h-5" />
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  ACTIVE
                </span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Customer Support Agent</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Answers inquiries, drafts inbox replies, and checks order status across WhatsApp and Web Chat.
                </p>
              </div>
              <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
                <span>Model: {model}</span>
                <span className="text-purple-600 font-semibold">Primary</span>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3 opacity-90">
              <div className="flex items-center justify-between">
                <span className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  <Smartphone className="w-5 h-5" />
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  READY
                </span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Voice Telephony Agent</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Handles inbound phone calls via provider-neutral SIP audio pipeline with human handoff briefing.
                </p>
              </div>
              <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
                <span>Latency: ~450ms</span>
                <span className="text-blue-600 font-semibold">Telephony</span>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3 opacity-90">
              <div className="flex items-center justify-between">
                <span className="w-10 h-10 rounded-xl bg-pink-100 text-pink-700 flex items-center justify-center font-bold">
                  <Globe className="w-5 h-5" />
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-50 text-pink-700 border border-pink-200">
                  READY
                </span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Social Community Agent</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Monitors Instagram comments, filters troll spam, and initiates direct messages for support queries.
                </p>
              </div>
              <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
                <span>Auto-Hide Spam</span>
                <span className="text-pink-600 font-semibold">Social</span>
              </div>
            </div>
          </div>

          {/* Persona Editor Form */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-6">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-purple-600" />
              <span>Configure Active Support Persona</span>
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Persona Display Name
                </label>
                <input
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  className="w-full sm:w-80 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  System Instructions & Brand Voice
                </label>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={4}
                  className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-800"
                />
              </div>

              {/* Model & Provider Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Primary AI Provider
                  </label>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="OPENAI">OpenAI (Primary)</option>
                    <option value="GROQ">Groq Cloud (Fast Fallback)</option>
                    <option value="OPENROUTER">OpenRouter (Resilient Gateway)</option>
                    <option value="MOCK">Mock AI (Offline / Testing)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Base Foundation Model
                  </label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
                  >
                    <option value="gpt-4o-mini">gpt-4o-mini (Optimal Cost & Latency)</option>
                    <option value="gpt-4o">gpt-4o (High Reasoning)</option>
                    <option value="llama-3.1-70b-versatile">llama-3.1-70b-versatile (Groq)</option>
                    <option value="mistralai/mistral-large-2407">mistral-large-2407 (OpenRouter)</option>
                  </select>
                </div>
              </div>

              {/* Temperature Slider */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1.5">
                  <span>Creativity & Temperature: {temperature}</span>
                  <span className="text-slate-400 font-normal">
                    {temperature <= 0.2 ? 'Deterministic / Policy-strict' : temperature <= 0.5 ? 'Balanced Customer Service' : 'Creative'}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full accent-purple-600"
                />
              </div>

              {/* Channel Deployment Toggles */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Channel Deployments
                </h4>
                <div className="flex flex-wrap gap-3">
                  <label className="inline-flex items-center space-x-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={channelWhatsApp}
                      onChange={(e) => setChannelWhatsApp(e.target.checked)}
                      className="rounded border-slate-300 text-purple-600"
                    />
                    <span>WhatsApp Business</span>
                  </label>

                  <label className="inline-flex items-center space-x-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={channelInstagram}
                      onChange={(e) => setChannelInstagram(e.target.checked)}
                      className="rounded border-slate-300 text-purple-600"
                    />
                    <span>Instagram Direct</span>
                  </label>

                  <label className="inline-flex items-center space-x-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={channelWebChat}
                      onChange={(e) => setChannelWebChat(e.target.checked)}
                      className="rounded border-slate-300 text-purple-600"
                    />
                    <span>Website Chat Widget</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Response Guard & Safety */}
      {activeTab === 'guard' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-6">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-600" />
              <span>Response Guard Safety Policies</span>
            </h3>

            {/* Supervised Review Mode Toggle */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-900">Supervised Agent Review Mode</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  When enabled, AI suggestions will NOT send directly to the customer; they appear in the inbox for agent approval.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSupervisedReview(!supervisedReview)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  supervisedReview ? 'bg-purple-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition ${
                    supervisedReview ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* PII Masking Toggle */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-900">Automated PII Redaction</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Automatically masks credit cards, passwords, and sensitive tax numbers before prompt submission.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPiiMasking(!piiMasking)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  piiMasking ? 'bg-purple-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition ${
                    piiMasking ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Competitor Blacklist */}
            <div className="space-y-3">
              <div>
                <h4 className="text-xs font-bold text-slate-900">Competitor Mention Blacklist</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  If a customer query mentions any blacklisted competitor, the message immediately bypasses AI auto-reply and routes to human tier 2 escalations.
                </p>
              </div>

              <form onSubmit={handleAddCompetitor} className="flex items-center gap-2">
                <input
                  type="text"
                  value={newCompetitor}
                  onChange={(e) => setNewCompetitor(e.target.value)}
                  placeholder="e.g. CompetitorBrand"
                  className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 w-64"
                />
                <button
                  type="submit"
                  className="inline-flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg border border-purple-200"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Blacklist Keyword</span>
                </button>
              </form>

              <div className="flex flex-wrap gap-2 pt-2">
                {competitors.map((comp) => (
                  <span
                    key={comp}
                    className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200"
                  >
                    <span>{comp}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCompetitor(comp)}
                      className="text-rose-400 hover:text-rose-700"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
