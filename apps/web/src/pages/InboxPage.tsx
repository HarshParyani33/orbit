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
} from 'lucide-react';
import { ConversationSummary, MessageSummary, ChannelSummary } from '@orbit/shared';

export const InboxPage: React.FC = () => {
  const { user, activeOrg } = useAuth();
  const queryClient = useQueryClient();

  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'SNOOZED' | 'RESOLVED'>('ALL');
  const [selectedChannelId, setSelectedChannelId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [replyContent, setReplyContent] = useState('');
  const [isNewConvModalOpen, setIsNewConvModalOpen] = useState(false);
  const [newConvChannelId, setNewConvChannelId] = useState('');
  const [newConvTitle, setNewConvTitle] = useState('');
  const [newConvInitialMsg, setNewConvInitialMsg] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Fetch channels for channel filter dropdown
  const { data: channels = [] } = useQuery<ChannelSummary[]>({
    queryKey: ['channels', activeOrg?.id],
    queryFn: () => apiRequest<ChannelSummary[]>('/api/channels'),
    enabled: !!activeOrg?.id,
  });

  // 2. Fetch conversations list scoped to tenant and active filters
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

  // 3. Fetch active conversation detail and message history
  const {
    data: activeConversation,
    isLoading: isLoadingThread,
    refetch: refetchThread,
  } = useQuery<ConversationSummary>({
    queryKey: ['conversation', activeOrg?.id, selectedConvId],
    queryFn: () => apiRequest<ConversationSummary>(`/api/conversations/${selectedConvId}`),
    enabled: !!activeOrg?.id && !!selectedConvId,
  });

  // Auto-scroll to bottom of messages thread when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages]);

  // 4. Send Message Mutation
  const sendMessageMutation = useMutation({
    mutationFn: (content: string) =>
      apiRequest<MessageSummary>(`/api/conversations/${selectedConvId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content, senderType: 'AGENT' }),
      }),
    onSuccess: () => {
      setReplyContent('');
      queryClient.invalidateQueries({ queryKey: ['conversation', activeOrg?.id, selectedConvId] });
      queryClient.invalidateQueries({ queryKey: ['conversations', activeOrg?.id] });
    },
  });

  // 5. Update Status Mutation
  const updateStatusMutation = useMutation({
    mutationFn: (newStatus: 'OPEN' | 'RESOLVED' | 'SNOOZED') =>
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
    sendMessageMutation.mutate(replyContent.trim());
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

  // Filter conversations locally by search query
  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const titleMatch = c.title?.toLowerCase().includes(query);
    const lastMsgMatch = c.lastMessage?.content.toLowerCase().includes(query);
    const channelMatch = c.channel?.name.toLowerCase().includes(query);
    return titleMatch || lastMsgMatch || channelMatch;
  });

  const getProviderIcon = (provider?: string) => {
    switch (provider) {
      case 'META_WHATSAPP':
        return <Smartphone className="w-3.5 h-3.5 text-emerald-600" />;
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
      case 'SNOOZED':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-500" />
            <span>Snoozed</span>
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            <CheckCircle2 className="w-3 h-3 text-slate-500" />
            <span>Resolved</span>
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

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-slate-50">
      {/* Inbox Split Pane Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* ========================================================================= */}
        {/* LEFT PANE: Conversations List & Filters                                   */}
        {/* ========================================================================= */}
        <div className="w-full md:w-96 lg:w-[26rem] flex flex-col bg-white border-r border-slate-200 shrink-0">
          {/* Header & New Conversation */}
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-bold text-slate-900">Agent Inbox</h1>
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
                <span>New</span>
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search messages, titles, or channels..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-900"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Filter Pills (Status & Channel) */}
          <div className="px-3 py-2 border-b border-slate-100 space-y-2 bg-slate-50/50">
            {/* Status Pills */}
            <div className="flex items-center space-x-1">
              {(['ALL', 'OPEN', 'SNOOZED', 'RESOLVED'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                    statusFilter === status
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-200/60'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            {/* Channel Filter Selector */}
            {channels.length > 0 && (
              <div className="flex items-center space-x-2 text-xs">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={selectedChannelId}
                  onChange={(e) => setSelectedChannelId(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="ALL">All Channels ({channels.length})</option>
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.name} ({ch.provider})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Conversation Cards List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {isLoadingConversations ? (
              <div className="py-16 text-center space-y-2 text-slate-400">
                <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs">Loading conversations...</p>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="py-16 text-center px-4 space-y-2">
                <MessageSquare className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm font-medium text-slate-600">No conversations found</p>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  {searchQuery
                    ? 'Try adjusting your search query or status filter.'
                    : 'New customer inquiries on connected channels will arrive here in real-time.'}
                </p>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isSelected = conv.id === selectedConvId;
                return (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConvId(conv.id)}
                    className={`w-full text-left p-3.5 transition-colors flex flex-col space-y-1.5 ${
                      isSelected
                        ? 'bg-indigo-50/70 border-l-4 border-indigo-600'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    {/* Card Top: Title & Status */}
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-xs text-slate-900 truncate">
                        {conv.title || 'Conversation ' + conv.id.slice(0, 8)}
                      </span>
                      {getStatusBadge(conv.status)}
                    </div>

                    {/* Card Middle: Last Message Preview */}
                    <p className="text-xs text-slate-500 line-clamp-2">
                      {conv.lastMessage?.content || (
                        <span className="italic text-slate-400">No messages yet</span>
                      )}
                    </p>

                    {/* Card Bottom: Channel & Relative Time */}
                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                      <div className="flex items-center space-x-1.5 truncate">
                        {getProviderIcon(conv.channel?.provider)}
                        <span className="truncate">{conv.channel?.name || 'Channel'}</span>
                      </div>
                      <span className="shrink-0">
                        {new Date(conv.updatedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT PANE: Conversation Thread & Action Center                           */}
        {/* ========================================================================= */}
        <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
          {!selectedConvId ? (
            /* Empty Selection State */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
                <MessageSquare className="w-8 h-8" />
              </div>
              <div className="max-w-sm space-y-1">
                <h3 className="text-base font-bold text-slate-800">Select a Conversation</h3>
                <p className="text-xs text-slate-500">
                  Choose a ticket from the left inbox to view message history, update status, and reply as an agent.
                </p>
              </div>
            </div>
          ) : isLoadingThread ? (
            /* Loading Thread State */
            <div className="flex-1 flex flex-col items-center justify-center space-y-3">
              <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-slate-500">Loading conversation thread...</p>
            </div>
          ) : !activeConversation ? (
            /* Not Found State */
            <div className="flex-1 flex flex-col items-center justify-center space-y-2">
              <AlertCircle className="w-8 h-8 text-rose-500" />
              <p className="text-sm font-medium text-slate-800">Conversation not found</p>
              <p className="text-xs text-slate-500">It may have been deleted or belongs to another organization.</p>
            </div>
          ) : (
            /* Active Thread View */
            <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
              {/* Thread Header */}
              <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <h2 className="text-base font-bold text-slate-900">
                      {activeConversation.title || `Conversation ${activeConversation.id.slice(0, 8)}`}
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

                {/* Status Controls */}
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-medium text-slate-500">Status:</span>
                  <select
                    value={activeConversation.status}
                    onChange={(e) =>
                      updateStatusMutation.mutate(
                        e.target.value as 'OPEN' | 'RESOLVED' | 'SNOOZED'
                      )
                    }
                    disabled={updateStatusMutation.isPending}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer disabled:opacity-50"
                  >
                    <option value="OPEN">Open</option>
                    <option value="SNOOZED">Snooze</option>
                    <option value="RESOLVED">Resolve</option>
                  </select>
                </div>
              </div>

              {/* Message History Thread */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/60">
                {activeConversation.messages && activeConversation.messages.length > 0 ? (
                  activeConversation.messages.map((msg) => {
                    const isAgent = msg.senderType === 'AGENT';
                    const isCustomer = msg.senderType === 'CUSTOMER';
                    const isAi = msg.senderType === 'AI';

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
                              <span className="font-semibold text-slate-700">Customer</span>
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
                          className={`max-w-lg rounded-2xl px-4 py-2.5 text-sm shadow-sm leading-relaxed ${
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

              {/* Agent Reply Composer */}
              <div className="p-4 border-t border-slate-200 bg-white">
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
                      placeholder="Write an agent reply... (Press Enter to send, Shift+Enter for newline)"
                      rows={3}
                      disabled={sendMessageMutation.isPending}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none text-slate-900 disabled:bg-slate-50"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-xs text-slate-400">
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                      <span>Replying as agent to {activeConversation.channel?.name}</span>
                    </div>

                    <button
                      type="submit"
                      disabled={!replyContent.trim() || sendMessageMutation.isPending}
                      className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{sendMessageMutation.isPending ? 'Sending...' : 'Send Reply'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: New Conversation                                                   */}
      {/* ========================================================================= */}
      {isNewConvModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">New Conversation</h3>
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
                  Conversation Subject / Title
                </label>
                <input
                  type="text"
                  value={newConvTitle}
                  onChange={(e) => setNewConvTitle(e.target.value)}
                  placeholder="e.g. Customer support ticket #120"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Initial Message
                </label>
                <textarea
                  value={newConvInitialMsg}
                  onChange={(e) => setNewConvInitialMsg(e.target.value)}
                  placeholder="Initial message content from customer or agent..."
                  rows={3}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 resize-none"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewConvModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newConvChannelId || createConversationMutation.isPending}
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50"
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
