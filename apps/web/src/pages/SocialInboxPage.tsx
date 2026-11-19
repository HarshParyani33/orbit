import React, { useState } from 'react';
import { useAuth } from '../context/auth-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../api/client';
import {
  Share2,
  Instagram,
  Filter,
  Search,
  MessageCircle,
  EyeOff,
  Eye,
  Trash2,
  Send,
  Sparkles,
  Bot,
  User,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';
import { SocialComment } from '@orbit/shared';

export const SocialInboxPage: React.FC = () => {
  const { activeOrg } = useAuth();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sentimentFilter, setSentimentFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Reply modal
  const [activeReplyComment, setActiveReplyComment] = useState<SocialComment | null>(null);
  const [replyText, setReplyText] = useState('');

  // DM escalation modal
  const [activeDmComment, setActiveDmComment] = useState<SocialComment | null>(null);
  const [dmInitialMessage, setDmInitialMessage] = useState('');

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Fetch comments
  const {
    data: comments = [],
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<SocialComment[]>({
    queryKey: ['social-comments', activeOrg?.id, statusFilter, sentimentFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (sentimentFilter !== 'ALL') params.append('sentiment', sentimentFilter);
      const res = await apiRequest<{ success: boolean; data: SocialComment[] }>(
        `/api/social/comments?${params.toString()}`
      );
      return res.data;
    },
    enabled: !!activeOrg?.id,
  });

  // Public Reply Mutation
  const replyMutation = useMutation({
    mutationFn: (data: { commentId: string; content: string }) =>
      apiRequest(`/api/social/comments/${data.commentId}/reply`, {
        method: 'POST',
        body: JSON.stringify({ content: data.content }),
      }),
    onSuccess: () => {
      setActiveReplyComment(null);
      setReplyText('');
      setToastMessage('Public reply published to Instagram');
      queryClient.invalidateQueries({ queryKey: ['social-comments'] });
      setTimeout(() => setToastMessage(null), 4000);
    },
  });

  // Initiate DM Mutation
  const initiateDmMutation = useMutation({
    mutationFn: (data: { commentId: string; initialMessage: string }) =>
      apiRequest<{ success: boolean; data: { conversationId: string } }>(
        `/api/social/comments/${data.commentId}/initiate-dm`,
        {
          method: 'POST',
          body: JSON.stringify({ initialMessage: data.initialMessage }),
        }
      ),
    onSuccess: (res) => {
      setActiveDmComment(null);
      setDmInitialMessage('');
      setToastMessage(`Converted to private ticket in Master Inbox`);
      queryClient.invalidateQueries({ queryKey: ['social-comments'] });
      setTimeout(() => setToastMessage(null), 4000);
    },
  });

  // Moderation Mutation
  const moderateMutation = useMutation({
    mutationFn: (data: { commentId: string; action: 'HIDE' | 'UNHIDE' | 'DELETE' }) =>
      apiRequest(`/api/social/comments/${data.commentId}/moderate`, {
        method: 'POST',
        body: JSON.stringify({ action: data.action }),
      }),
    onSuccess: (_, vars) => {
      setToastMessage(
        vars.action === 'HIDE'
          ? 'Comment hidden from public view'
          : vars.action === 'DELETE'
          ? 'Comment deleted from post'
          : 'Comment unhidden'
      );
      queryClient.invalidateQueries({ queryKey: ['social-comments'] });
      setTimeout(() => setToastMessage(null), 4000);
    },
  });

  const filteredComments = comments.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.authorUsername.toLowerCase().includes(q) ||
      c.content.toLowerCase().includes(q) ||
      c.postTitle.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-y-auto">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-pink-50 dark:bg-pink-950/80 text-pink-700 dark:text-pink-400 flex items-center gap-1.5">
                <Instagram className="w-3.5 h-3.5" />
                Meta Graph API Live
              </span>
              <span className="text-xs text-slate-400">Feed & Ad Comments Listening</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              Social Media Engagement & Moderation
            </h1>
          </div>

          <button
            onClick={() => refetch()}
            className="self-start md:self-auto px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
            Refresh Feed
          </button>
        </div>

        {/* Filter bar */}
        <div className="max-w-7xl mx-auto mt-6 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            {/* Status Filter */}
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Filter className="w-3.5 h-3.5" />
              <span>Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 border-none rounded-md px-2 py-1 font-semibold text-slate-800 dark:text-slate-200"
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING">Pending Reply</option>
                <option value="REPLIED">Publicly Replied</option>
                <option value="ESCALATED_TO_DM">Escalated to DM</option>
                <option value="HIDDEN">Hidden / Moderated</option>
              </select>
            </div>

            {/* Sentiment Filter */}
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span>Sentiment:</span>
              <select
                value={sentimentFilter}
                onChange={(e) => setSentimentFilter(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 border-none rounded-md px-2 py-1 font-semibold text-slate-800 dark:text-slate-200"
              >
                <option value="ALL">All Sentiments</option>
                <option value="POSITIVE">Positive</option>
                <option value="NEUTRAL">Neutral</option>
                <option value="NEGATIVE">Negative</option>
                <option value="TOXIC">Toxic / Spam</option>
              </select>
            </div>
          </div>

          {/* Search Input */}
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search comments or users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            />
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

      {/* Comment List */}
      <div className="max-w-7xl mx-auto p-6 flex-1 w-full space-y-4">
        {isLoading ? (
          <div className="text-center py-16 text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-pink-500" />
            <p className="text-xs">Fetching social comments...</p>
          </div>
        ) : filteredComments.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
            <Share2 className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              No matching comments found
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Try adjusting your status or sentiment filters.
            </p>
          </div>
        ) : (
          filteredComments.map((comment) => (
            <div
              key={comment.id}
              className={`bg-white dark:bg-slate-900 rounded-xl border p-5 shadow-xs transition-all space-y-3.5 ${
                comment.status === 'HIDDEN'
                  ? 'border-slate-200 dark:border-slate-800 opacity-60 bg-slate-50/50 dark:bg-slate-900/50'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              {/* Post origin & sentiment badge */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-pink-600 dark:text-pink-400 flex items-center gap-1">
                    <Instagram className="w-3.5 h-3.5" />
                    Post:
                  </span>
                  <span className="text-slate-600 dark:text-slate-400 font-medium truncate max-w-md">
                    {comment.postTitle}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                      comment.sentiment === 'POSITIVE'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-400'
                        : comment.sentiment === 'NEGATIVE'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-400'
                        : comment.sentiment === 'TOXIC'
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-400'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {comment.sentiment}
                  </span>

                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                      comment.status === 'REPLIED'
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                        : comment.status === 'ESCALATED_TO_DM'
                        ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                        : comment.status === 'HIDDEN'
                        ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                        : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                    }`}
                  >
                    {comment.status}
                  </span>
                </div>
              </div>

              {/* Author & Comment Body */}
              <div className="flex items-start gap-3">
                {comment.authorAvatarUrl ? (
                  <img
                    src={comment.authorAvatarUrl}
                    alt={comment.authorUsername}
                    className="w-10 h-10 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-800"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-500 font-bold shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-white text-xs">
                      @{comment.authorUsername}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-800 dark:text-slate-200 mt-1 leading-relaxed">
                    {comment.content}
                  </p>
                </div>
              </div>

              {/* Public Reply Card (if already answered) */}
              {comment.publicReply && (
                <div className="ml-13 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300 text-[11px]">
                    {comment.publicReply.repliedBy === 'AI_AGENT' ? (
                      <Bot className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <User className="w-3.5 h-3.5 text-indigo-500" />
                    )}
                    <span>Public Reply ({comment.publicReply.repliedBy})</span>
                    <span className="text-slate-400 font-normal">
                      • {new Date(comment.publicReply.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-slate-800 dark:text-slate-200 pl-5">
                    {comment.publicReply.content}
                  </p>
                </div>
              )}

              {/* Action Buttons Toolbar */}
              <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-3 text-xs">
                <div className="flex items-center gap-2">
                  {/* Public Reply Button */}
                  <button
                    onClick={() => {
                      setActiveReplyComment(comment);
                      setReplyText(`Hi @${comment.authorUsername}, `);
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-colors"
                  >
                    <Send className="w-3.5 h-3.5 text-indigo-600" />
                    Reply Publicly
                  </button>

                  {/* Initiate DM Button */}
                  <button
                    onClick={() => {
                      setActiveDmComment(comment);
                      setDmInitialMessage(
                        `Hi @${comment.authorUsername}! We saw your question regarding "${comment.postTitle}" and wanted to assist you right away.`
                      );
                    }}
                    className="px-3 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Initiate Private DM
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  {/* Moderation Actions */}
                  {comment.status === 'HIDDEN' ? (
                    <button
                      onClick={() =>
                        moderateMutation.mutate({ commentId: comment.id, action: 'UNHIDE' })
                      }
                      title="Unhide comment"
                      className="p-1.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() =>
                        moderateMutation.mutate({ commentId: comment.id, action: 'HIDE' })
                      }
                      title="Hide comment from public"
                      className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                    >
                      <EyeOff className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    onClick={() =>
                      moderateMutation.mutate({ commentId: comment.id, action: 'DELETE' })
                    }
                    title="Delete comment permanently"
                    className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Reply Modal */}
      {activeReplyComment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-lg w-full p-5 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <Send className="w-4 h-4 text-indigo-600" />
              Post Public Instagram Reply
            </h4>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-xs text-slate-600 dark:text-slate-400">
              <span className="font-semibold text-slate-900 dark:text-white">
                @{activeReplyComment.authorUsername}:
              </span>{' '}
              {activeReplyComment.content}
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Your Public Reply
              </label>
              <textarea
                rows={3}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setActiveReplyComment(null)}
                className="px-3 py-1.5 rounded text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                disabled={replyMutation.isPending}
                onClick={() =>
                  replyMutation.mutate({
                    commentId: activeReplyComment.id,
                    content: replyText,
                  })
                }
                className="px-3.5 py-1.5 rounded text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {replyMutation.isPending ? 'Publishing...' : 'Publish Reply'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DM Modal */}
      {activeDmComment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-lg w-full p-5 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-purple-600" />
              Initiate Private 1-on-1 Instagram DM
            </h4>
            <p className="text-xs text-slate-500">
              This will create a customer profile for{' '}
              <span className="font-semibold text-purple-600">
                @{activeDmComment.authorUsername}
              </span>{' '}
              and route a private ticket into your Master Inbox.
            </p>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Initial Outreach Message
              </label>
              <textarea
                rows={3}
                value={dmInitialMessage}
                onChange={(e) => setDmInitialMessage(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setActiveDmComment(null)}
                className="px-3 py-1.5 rounded text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                disabled={initiateDmMutation.isPending}
                onClick={() =>
                  initiateDmMutation.mutate({
                    commentId: activeDmComment.id,
                    initialMessage: dmInitialMessage,
                  })
                }
                className="px-3.5 py-1.5 rounded text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white"
              >
                {initiateDmMutation.isPending ? 'Initiating DM...' : 'Start DM Conversation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
