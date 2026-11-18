import React, { useState } from 'react';
import { CustomerSummary, ConversationSummary } from '@orbit/shared';
import {
  User,
  Mail,
  Phone,
  ShieldCheck,
  ShieldAlert,
  MessageSquare,
  ExternalLink,
  Plus,
  X,
  Clock,
  Sparkles,
  Link as LinkIcon,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../api/client';

interface CustomerProfilePaneProps {
  customer?: CustomerSummary | null;
  activeOrgId?: string;
  onSelectConversation?: (conversationId: string) => void;
  onClose?: () => void;
}

export const CustomerProfilePane: React.FC<CustomerProfilePaneProps> = ({
  customer,
  activeOrgId,
  onSelectConversation,
  onClose,
}) => {
  const queryClient = useQueryClient();
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkChannelId, setLinkChannelId] = useState('');
  const [linkProvider, setLinkProvider] = useState<'META_WHATSAPP' | 'META_INSTAGRAM' | 'WEB_CHAT'>('META_WHATSAPP');
  const [linkExternalId, setLinkExternalId] = useState('');
  const [linkVerified, setLinkVerified] = useState(true);

  const linkMutation = useMutation({
    mutationFn: (data: { channelId: string; provider: string; externalId: string; verified: boolean }) =>
      apiRequest(`/api/customers/${customer?.id}/identities`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      setIsLinkModalOpen(false);
      setLinkExternalId('');
      queryClient.invalidateQueries({ queryKey: ['conversation', activeOrgId] });
      queryClient.invalidateQueries({ queryKey: ['customer', activeOrgId, customer?.id] });
    },
  });

  if (!customer) {
    return (
      <div className="w-80 border-l border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-6 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
          <User className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
          No Customer Assigned
        </h4>
        <p className="text-xs text-slate-500 max-w-[200px]">
          This conversation is not linked to an identified customer profile yet.
        </p>
      </div>
    );
  }

  return (
    <div className="w-80 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col h-full overflow-y-auto">
      {/* Pane Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <User className="w-4 h-4 text-indigo-600" />
          Customer Profile
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Profile Overview */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-950/60 border-2 border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-700 dark:text-indigo-400 font-bold text-xl mb-2">
          {customer.name.slice(0, 2).toUpperCase()}
        </div>
        <h4 className="text-base font-semibold text-slate-900 dark:text-white">
          {customer.name}
        </h4>
        <p className="text-xs text-slate-500 mt-0.5">
          Customer ID: {customer.id.slice(0, 8)}…
        </p>
      </div>

      {/* Contact Details */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
        <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
          Contact Details
        </h5>

        <div className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300">
          <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="truncate">
            {customer.email || <span className="text-slate-400 italic">No email provided</span>}
          </span>
        </div>

        <div className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300">
          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="truncate">
            {customer.phone || <span className="text-slate-400 italic">No phone provided</span>}
          </span>
        </div>
      </div>

      {/* Linked Channel Identities */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-2.5">
          <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Linked Channels
          </h5>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-medium">
            {customer.channelIdentities?.length || 0}
          </span>
        </div>

        <div className="space-y-2">
          {customer.channelIdentities && customer.channelIdentities.length > 0 ? (
            customer.channelIdentities.map((identity) => (
              <div
                key={identity.id}
                className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between text-xs"
              >
                <div className="min-w-0 pr-2">
                  <div className="font-medium text-slate-800 dark:text-slate-200 truncate flex items-center gap-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-tight bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-400">
                      {identity.provider === 'META_WHATSAPP'
                        ? 'WhatsApp'
                        : identity.provider === 'META_INSTAGRAM'
                        ? 'Instagram'
                        : 'Web Chat'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 truncate mt-1 font-mono">
                    {identity.externalId}
                  </div>
                </div>

                <div className="shrink-0">
                  {identity.verified ? (
                    <span
                      title="Verified Identity"
                      className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Verified
                    </span>
                  ) : (
                    <span
                      title="Unverified Channel Claim"
                      className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-semibold"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      Unverified
                    </span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-400 italic">No channels linked</p>
          )}
        </div>
      </div>

      {/* Conversation History */}
      <div className="p-4 flex-1">
        <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
          Conversation History
        </h5>

        <div className="space-y-2">
          {customer.conversations && customer.conversations.length > 0 ? (
            customer.conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => onSelectConversation?.(conv.id)}
                className="w-full text-left p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 bg-white dark:bg-slate-800/30 transition-all text-xs group"
              >
                <div className="flex items-center justify-between font-medium text-slate-800 dark:text-slate-200 mb-1">
                  <span className="truncate pr-2 group-hover:text-indigo-600 transition-colors">
                    {conv.title || 'Inquiry Thread'}
                  </span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                      conv.status === 'OPEN'
                        ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400'
                        : conv.status === 'RESOLVED'
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-600'
                        : 'bg-amber-50 dark:bg-amber-950/80 text-amber-700'
                    }`}
                  >
                    {conv.status}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  {new Date(conv.updatedAt).toLocaleDateString()}
                  {conv.channel?.name && ` • ${conv.channel.name}`}
                </div>
              </button>
            ))
          ) : (
            <p className="text-xs text-slate-400 italic">No prior conversation history</p>
          )}
        </div>
      </div>
    </div>
  );
};
