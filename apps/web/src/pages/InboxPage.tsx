import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/auth-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../api/client';
import {
  MessageSquare,
  Search,
  Filter,
  Send,
  Plus,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  User,
  Bot,
  Sparkles,
  Smartphone,
  Globe,
  ChevronDown,
  X,
  Lock,
  Flag,
  Inbox,
  AlertTriangle,
  FileText,
  UserCheck,
} from 'lucide-react';
import { ConversationSummary, MessageSummary, ChannelSummary } from '@orbit/shared';
import { CustomerProfilePane } from '../components/CustomerProfilePane';

type TicketStatusFilter =
  | 'ALL'
  | 'IN_QUEUE'
  | 'OPEN'
  | 'REOPENED'
  | 'SNOOZED'
  | 'AWAITING'
  | 'INVESTIGATING'
  | 'ESCALATED'
  | 'RESOLVED'
  | 'CLOSED';

export const InboxPage: React.FC = () => {
  const { user, activeOrg } = useAuth();
  const queryClient = useQueryClient();

  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TicketStatusFilter>('ALL');
  const [selectedChannelId, setSelectedChannelId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [replyContent, setReplyContent] = useState('');
  const [composerMode, setComposerMode] = useState<'PUBLIC' | 'NOTE'>('PUBLIC');
  const [isProfilePaneOpen, setIsProfilePaneOpen] = useState(true);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [isNewConvModalOpen, setIsNewConvModalOpen] = useState(false);
  const [newConvChannelId, setNewConvChannelId] = useState('');
  const [newConvTitle, setNewConvTitle] = useState('');
  const [newConvInitialMsg, setNewConvInitialMsg] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Fetch channels
  const { data: channels = [] } = useQuery<ChannelSummary[]>({
    queryKey: ['channels', activeOrg?.id],
    queryFn: () => apiRequest<ChannelSummary[]>('/api/channels'),
    enabled: !!activeOrg?.id,
  });

  // 2. Fetch conversations
  const {
    data: conversations = [],
    isLoading: isLoadingConversations,
    isRefetching: isRefetchingConversations,
    refetch: refetchConversations,
  } = useQuery<ConversationSummary[]>({
    queryKey: ['conversations', activeOrg?.id, statusFilter, selectedChannelId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (selectedChannelId !== 'ALL') params.append('channelId', selectedChannelId);
      const qs = params.toString() ? `?${params.toString()}` : '';
      return apiRequest<ConversationSummary[]>(`/api/conversations${qs}`);
    },
    enabled: !!activeOrg?.id,
  });

  // 3. Fetch active conversation detail
  const {
    data: activeConversation,
    isLoading: isLoadingThread,
    refetch: refetchThread,
  } = useQuery<ConversationSummary>({
    queryKey: ['conversation', activeOrg?.id, selectedConvId],
    queryFn: () => apiRequest<ConversationSummary>(`/api/conversations/${selectedConvId}`),
    enabled: !!activeOrg?.id && !!selectedConvId,
  });

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages]);

  // Keyboard shortcut listener for Note mode: toggle with Alt+N or Cmd+N
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.altKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setComposerMode((prev) => (prev === 'PUBLIC' ? 'NOTE' : 'PUBLIC'));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 4. Send Message Mutation (handles both public message and internal note)
  const sendMessageMutation = useMutation({
    mutationFn: (payload: { content: string; senderType: 'AGENT' | 'NOTE' }) =>
      apiRequest<MessageSummary>(`/api/conversations/${selectedConvId}/messages`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setReplyContent('');
      queryClient.invalidateQueries({ queryKey: ['conversation', activeOrg?.id, selectedConvId] });
      queryClient.invalidateQueries({ queryKey: ['conversations', activeOrg?.id] });
    },
  });

  // AI Suggestion Mutation
  const aiSuggestionMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ bypassed: boolean; reason?: string; message?: string; suggestion?: string }>(
        `/api/ai/conversations/${selectedConvId}/suggest`,
        { method: 'POST' }
      ),
    onSuccess: (data) => {
      if (data.bypassed) {
        setAiNotice(data.message || 'AI generation skipped due to human takeover.');
        setTimeout(() => setAiNotice(null), 4000);
      } else if (data.suggestion) {
        setReplyContent(data.suggestion);
        setComposerMode('PUBLIC');
        setAiNotice('AI suggestion drafted! Review and edit before sending.');
        setTimeout(() => setAiNotice(null), 4000);
      }
    },
    onError: (err: any) => {
      setAiNotice(err?.message || 'Failed to generate AI suggestion.');
      setTimeout(() => setAiNotice(null), 4000);
    },
  });

  // 5. Update Status Mutation
  const updateStatusMutation = useMutation({
    mutationFn: (newStatus: string) =>
      apiRequest<ConversationSummary>(`/api/conversations/${selectedConvId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', activeOrg?.id, selectedConvId] });
      queryClient.invalidateQueries({ queryKey: ['conversations', activeOrg?.id] });
    },
  });

  // 6. Create Outbound Conversation Mutation
  const createConversationMutation = useMutation({
    mutationFn: (data: { channelId: string; title?: string; initialMessage?: string }) =>
      apiRequest<ConversationSummary>('/api/conversations', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: (newConv) => {
      setIsNewConvModalOpen(false);
      setNewConvChannelId('');
      setNewConvTitle('');
      setNewConvInitialMsg('');
      queryClient.invalidateQueries({ queryKey: ['conversations', activeOrg?.id] });
      setSelectedConvId(newConv.id);
    },
  });

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim() || sendMessageMutation.isPending) return;
    sendMessageMutation.mutate({
      content: replyContent.trim(),
      senderType: composerMode === 'NOTE' ? 'NOTE' : 'AGENT',
    });
  };

  const handleCreateConversation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConvChannelId) return;
    createConversationMutation.mutate({
      channelId: newConvChannelId,
      title: newConvTitle.trim() || undefined,
      initialMessage: newConvInitialMsg.trim() || undefined,
    });
  };

  // Filter conversations locally
  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const titleMatch = c.title?.toLowerCase().includes(query);
    const lastMsgMatch = c.lastMessage?.content.toLowerCase().includes(query);
    const channelMatch = c.channel?.name.toLowerCase().includes(query);
    const customerMatch = c.customer?.name.toLowerCase().includes(query);
    return titleMatch || lastMsgMatch || channelMatch || customerMatch;
  });

  const getProviderIcon = (provider?: string) => {
    switch (provider) {
      case 'META_WHATSAPP':
        return <Smartphone className="w-3.5 h-3.5 text-emerald-600" />;
      case 'META_INSTAGRAM':
        return <Globe className="w-3.5 h-3.5 text-pink-600" />;
      case 'WEB_CHAT':
        return <Globe className="w-3.5 h-3.5 text-blue-600" />;
      default:
        return <MessageSquare className="w-3.5 h-3.5 text-slate-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Open</span>
          </span>
        );
      case 'IN_QUEUE':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Inbox className="w-3 h-3 text-blue-500" />
            <span>In Queue</span>
          </span>
        );
      case 'REOPENED':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <RefreshCw className="w-3 h-3 text-indigo-500" />
            <span>Reopened</span>
          </span>
        );
      case 'SNOOZED':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-500" />
            <span>Snoozed</span>
          </span>
        );
      case 'AWAITING':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
            <UserCheck className="w-3 h-3 text-sky-500" />
            <span>Awaiting</span>
          </span>
        );
      case 'INVESTIGATING':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200">
            <Search className="w-3 h-3 text-violet-500" />
            <span>Investigating</span>
          </span>
        );
      case 'ESCALATED':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertTriangle className="w-3 h-3 text-rose-500" />
            <span>Escalated</span>
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            <CheckCircle2 className="w-3 h-3 text-slate-500" />
            <span>Resolved</span>
          </span>
        );
      case 'CLOSED':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-200 text-slate-700 border border-slate-300">
            <CheckCircle2 className="w-3 h-3 text-slate-600" />
            <span>Closed</span>
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
            {status}
          </span>
        );
    }
  };

  const queueNavTabs: { key: TicketStatusFilter; label: string; count?: number }[] = [
    { key: 'ALL', label: 'All Tickets' },
    { key: 'IN_QUEUE', label: 'In Queue' },
    { key: 'OPEN', label: 'Open' },
    { key: 'REOPENED', label: 'Reopened' },
    { key: 'SNOOZED', label: 'Snoozed' },
    { key: 'AWAITING', label: 'Awaiting' },
    { key: 'ESCALATED', label: 'Escalated' },
    { key: 'RESOLVED', label: 'Resolved' },
  ];

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-slate-50">
      {/* Inbox Split Pane Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* ========================================================================= */}
        {/* LEFT PANE: 3-Column Ticket Navigation & Filters                            */}
        {/* ========================================================================= */}
        <div className="w-full md:w-96 lg:w-[26rem] flex flex-col bg-white border-r border-slate-200 shrink-0">
          {/* Header & New Conversation */}
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-bold text-slate-900">Shared Inbox</h1>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                {filteredConversations.length}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => refetchConversations()}
                disabled={isRefetchingConversations}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                title="Refresh conversations"
              >
                <RefreshCw className={`w-4 h-4 ${isRefetchingConversations ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setIsNewConvModalOpen(true)}
                className="inline-flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Ticket</span>
              </button>
            </div>
          </div>

          {/* Ticket Queue Status Pills */}
          <div className="px-3 pt-3 pb-2 border-b border-slate-100 flex items-center space-x-1 overflow-x-auto no-scrollbar">
            {queueNavTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                  statusFilter === tab.key
                    ? 'bg-indigo-600 text-white font-semibold'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search & Channel Filter */}
          <div className="p-3 border-b border-slate-100 space-y-2 bg-slate-50/50">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tickets, customers, messages..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 placeholder-slate-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <div className="flex-1 relative">
                <select
                  value={selectedChannelId}
                  onChange={(e) => setSelectedChannelId(e.target.value)}
                  className="w-full text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg py-1 px-2.5 appearance-none pr-7 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="ALL">All Channels</option>
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.name} ({ch.provider})
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {isLoadingConversations ? (
              <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center justify-center space-y-2">
                <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <span>Loading tickets...</span>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 space-y-1">
                <Inbox className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-600">No tickets found</p>
                <p>No conversations match your active filters.</p>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isSelected = conv.id === selectedConvId;
                const isResolved = conv.status === 'RESOLVED' || conv.status === 'CLOSED';

                return (
                  <div
                    key={conv.id}
                    onClick={() => setSelectedConvId(conv.id)}
                    className={`p-3.5 cursor-pointer transition-all border-l-3 ${
                      isSelected
                        ? 'bg-indigo-50/70 border-indigo-600 shadow-2xs'
                        : 'hover:bg-slate-50 border-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex items-center space-x-1.5 min-w-0 pr-2">
                        {getProviderIcon(conv.channel?.provider)}
                        <h3 className={`text-xs font-semibold truncate ${isSelected ? 'text-indigo-900' : 'text-slate-800'}`}>
                          {conv.customer?.name || conv.title || 'Inquiry Ticket'}
                        </h3>
                      </div>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">
                        {new Date(conv.updatedAt).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 line-clamp-1 mb-2 font-normal">
                      {conv.lastMessage?.content || <span className="italic text-slate-400">No messages yet</span>}
                    </p>

                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-slate-400 truncate max-w-[120px]">
                        {conv.channel?.name || 'Channel'}
                      </span>
                      {getStatusBadge(conv.status)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* CENTER PANE: Active Conversation Thread & Composer                        */}
        {/* ========================================================================= */}
        <div className="flex-1 flex flex-col bg-white overflow-hidden">
          {!selectedConvId ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3 bg-slate-50/40">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-xs">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div className="max-w-sm space-y-1">
                <h3 className="text-base font-bold text-slate-800">Select a Ticket</h3>
                <p className="text-xs text-slate-500">
                  Choose a ticket from the left queue to view messages, customer identities, add private notes, or reply.
                </p>
              </div>
            </div>
          ) : isLoadingThread ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-3">
              <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-slate-500">Loading ticket thread...</p>
            </div>
          ) : !activeConversation ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-2">
              <AlertCircle className="w-8 h-8 text-rose-500" />
              <p className="text-sm font-medium text-slate-800">Conversation not found</p>
            </div>
          ) : (
            <div className="flex-1 flex h-full overflow-hidden bg-white">
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                {/* Thread Header */}
                <div className="px-6 py-3.5 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <h2 className="text-base font-bold text-slate-900">
                        {activeConversation.title || `Ticket #${activeConversation.id.slice(0, 8)}`}
                      </h2>
                      {getStatusBadge(activeConversation.status)}
                    </div>
                    <div className="flex items-center space-x-3 text-xs text-slate-500">
                      <span className="flex items-center space-x-1">
                        {getProviderIcon(activeConversation.channel?.provider)}
                        <span>{activeConversation.channel?.name}</span>
                      </span>
                      <span>•</span>
                      <span className="font-mono text-[11px] text-slate-400">
                        ID: {activeConversation.id}
                      </span>
                    </div>
                  </div>

                  {/* Header Actions */}
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => setIsProfilePaneOpen(!isProfilePaneOpen)}
                      className={`inline-flex items-center space-x-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                        isProfilePaneOpen
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                      title="Toggle Context Drawer"
                    >
                      <User className="w-3.5 h-3.5" />
                      <span>{activeConversation.customer?.name || 'Customer Profile'}</span>
                    </button>

                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-medium text-slate-500">Status:</span>
                      <select
                        value={activeConversation.status}
                        onChange={(e) => updateStatusMutation.mutate(e.target.value)}
                        disabled={updateStatusMutation.isPending}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer disabled:opacity-50"
                      >
                        <option value="IN_QUEUE">In Queue</option>
                        <option value="OPEN">Open</option>
                        <option value="REOPENED">Reopened</option>
                        <option value="SNOOZED">Snoozed</option>
                        <option value="AWAITING">Awaiting Customer</option>
                        <option value="INVESTIGATING">Investigating</option>
                        <option value="ESCALATED">Escalated</option>
                        <option value="RESOLVED">Resolved</option>
                        <option value="CLOSED">Closed</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Message History Thread */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/60">
                  {activeConversation.messages && activeConversation.messages.length > 0 ? (
                    activeConversation.messages.map((msg) => {
                      const isAgent = msg.senderType === 'AGENT';
                      const isCustomer = msg.senderType === 'CUSTOMER';
                      const isAi = msg.senderType === 'AI';
                      const isNote = msg.senderType === 'NOTE';

                      // Render Private Team Note
                      if (isNote) {
                        return (
                          <div
                            key={msg.id}
                            className="max-w-xl mx-auto my-3 bg-amber-50 border-2 border-amber-200 rounded-xl p-3.5 text-xs shadow-xs text-amber-900 space-y-1.5"
                          >
                            <div className="flex items-center justify-between text-amber-700 font-semibold border-b border-amber-200/60 pb-1.5">
                              <span className="flex items-center space-x-1.5">
                                <Lock className="w-3.5 h-3.5 text-amber-600" />
                                <span>Internal Team Note (Private)</span>
                              </span>
                              <span className="text-[10px] text-amber-600 font-normal">
                                {new Date(msg.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                            <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${
                            isAgent ? 'items-end' : 'items-start'
                          } space-y-1`}
                        >
                          {/* Sender Label & Avatar */}
                          <div className="flex items-center space-x-1.5 text-[11px] text-slate-400 px-1">
                            {isAgent ? (
                              <>
                                <span className="font-semibold text-indigo-600">You (Agent)</span>
                                <User className="w-3 h-3 text-indigo-500" />
                              </>
                            ) : isCustomer ? (
                              <>
                                <User className="w-3 h-3 text-slate-500" />
                                <span className="font-semibold text-slate-700">
                                  {activeConversation.customer?.name || 'Customer'}
                                </span>
                              </>
                            ) : isAi ? (
                              <>
                                <Sparkles className="w-3 h-3 text-purple-600" />
                                <span className="font-semibold text-purple-700">Orbit AI Assistant</span>
                              </>
                            ) : (
                              <span>System</span>
                            )}
                            <span>•</span>
                            <span>
                              {new Date(msg.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>

                          {/* Bubble Content */}
                          <div
                            className={`max-w-lg rounded-2xl px-4 py-2.5 text-sm shadow-xs leading-relaxed ${
                              isAgent
                                ? 'bg-indigo-600 text-white rounded-tr-none'
                                : isAi
                                ? 'bg-purple-50 text-purple-900 border border-purple-200 rounded-tl-none'
                                : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none'
                            }`}
                          >
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-12 text-center text-xs text-slate-400">
                      No messages in this conversation yet. Send the first reply below.
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Composer Tabs & Textarea */}
                <div className={`p-4 border-t transition-colors ${composerMode === 'NOTE' ? 'bg-amber-50/40 border-amber-200' : 'bg-white border-slate-200'}`}>
                  {/* Mode Selector Tabs */}
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setComposerMode('PUBLIC')}
                        className={`px-3 py-1 rounded-md transition-colors ${
                          composerMode === 'PUBLIC'
                            ? 'bg-white text-indigo-700 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Public Reply
                      </button>
                      <button
                        type="button"
                        onClick={() => setComposerMode('NOTE')}
                        className={`inline-flex items-center space-x-1 px-3 py-1 rounded-md transition-colors ${
                          composerMode === 'NOTE'
                            ? 'bg-amber-400 text-amber-950 font-bold shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Lock className="w-3 h-3" />
                        <span>Private Note (N)</span>
                      </button>
                    </div>

                    <div className="text-xs text-slate-400">
                      {composerMode === 'NOTE' ? (
                        <span className="text-amber-700 font-medium">Internal Note — Not visible to customer</span>
                      ) : (
                        <span>Replying to customer via {activeConversation.channel?.provider}</span>
                      )}
                    </div>
                  </div>

                  <form onSubmit={handleSendMessage} className="space-y-3">
                    <div className="relative">
                      <textarea
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage(e);
                          }
                        }}
                        placeholder={
                          composerMode === 'NOTE'
                            ? 'Add a private internal note for your team... (Press Enter to save, Shift+Enter for newline)'
                            : 'Write an agent reply to customer... (Press Enter to send, Shift+Enter for newline)'
                        }
                        rows={3}
                        disabled={sendMessageMutation.isPending}
                        className={`w-full px-3.5 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 resize-none disabled:bg-slate-50 transition-colors ${
                          composerMode === 'NOTE'
                            ? 'border-amber-300 bg-amber-50/60 text-amber-950 focus:ring-amber-500 placeholder-amber-400'
                            : 'border-slate-300 bg-white text-slate-900 focus:ring-indigo-500'
                        }`}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 text-xs text-slate-400">
                        {aiNotice && (
                          <span className="text-indigo-600 font-semibold">{aiNotice}</span>
                        )}
                      </div>

                      <div className="flex items-center space-x-2">
                        {composerMode === 'PUBLIC' && (
                          <button
                            type="button"
                            onClick={() => aiSuggestionMutation.mutate()}
                            disabled={aiSuggestionMutation.isPending || sendMessageMutation.isPending}
                            className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg shadow-2xs transition-colors disabled:opacity-50"
                            title="Draft grounded response using tenant-approved AI instructions"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                            <span>{aiSuggestionMutation.isPending ? 'Drafting...' : 'AI Assist'}</span>
                          </button>
                        )}

                        <button
                          type="submit"
                          disabled={!replyContent.trim() || sendMessageMutation.isPending}
                          className={`inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                            composerMode === 'NOTE'
                              ? 'bg-amber-600 hover:bg-amber-700 text-white'
                              : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                          }`}
                        >
                          {composerMode === 'NOTE' ? <Lock className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
                          <span>
                            {sendMessageMutation.isPending
                              ? 'Saving...'
                              : composerMode === 'NOTE'
                              ? 'Add Note'
                              : 'Send Reply'}
                          </span>
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              </div>

              {/* Customer Profile Side Pane */}
              {isProfilePaneOpen && (
                <CustomerProfilePane
                  customer={activeConversation.customer}
                  activeOrgId={activeOrg?.id}
                  onSelectConversation={(convId) => setSelectedConvId(convId)}
                  onClose={() => setIsProfilePaneOpen(false)}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* New Ticket Modal */}
      {isNewConvModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">New Ticket</h3>
              <button
                onClick={() => setIsNewConvModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateConversation} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Select Channel *
                </label>
                <select
                  value={newConvChannelId}
                  onChange={(e) => setNewConvChannelId(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                >
                  <option value="">-- Choose a Channel --</option>
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.name} ({ch.provider})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ticket Subject / Title
                </label>
                <input
                  type="text"
                  value={newConvTitle}
                  onChange={(e) => setNewConvTitle(e.target.value)}
                  placeholder="e.g. Order #4102 status inquiry"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Initial Message
                </label>
                <textarea
                  value={newConvInitialMsg}
                  onChange={(e) => setNewConvInitialMsg(e.target.value)}
                  placeholder="Customer inquiry details..."
                  rows={3}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewConvModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newConvChannelId || createConversationMutation.isPending}
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm disabled:opacity-50"
                >
                  {createConversationMutation.isPending ? 'Creating...' : 'Create Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
