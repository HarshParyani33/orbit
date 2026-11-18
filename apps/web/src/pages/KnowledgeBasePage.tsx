import React, { useState } from 'react';
import { useAuth } from '../context/auth-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listKnowledgeDocuments,
  getKnowledgeDocument,
  createKnowledgeDocument,
  deleteKnowledgeDocument,
  searchKnowledge,
  KnowledgeDocumentSummary,
  KnowledgeDocumentDetail,
  KnowledgeSearchResult,
} from '../api/knowledge';
import {
  BookOpen,
  Plus,
  Search,
  Trash2,
  FileText,
  Sparkles,
  Layers,
  CheckCircle2,
  X,
  AlertCircle,
} from 'lucide-react';

export const KnowledgeBasePage: React.FC = () => {
  const { activeOrg } = useAuth();
  const queryClient = useQueryClient();

  // Navigation tab inside Knowledge page
  const [activeSubTab, setActiveSubTab] = useState<'documents' | 'search'>('documents');
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  // New Document Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSourceType, setNewSourceType] = useState('FAQ');
  const [newContent, setNewContent] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Test Semantic Search State
  const [testQuery, setTestQuery] = useState('');
  const [minSimilarity, setMinSimilarity] = useState(0.7);
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Query: List Documents
  const {
    data: docResponse,
    isLoading: isLoadingDocs,
    refetch: refetchDocs,
  } = useQuery({
    queryKey: ['knowledge_documents', activeOrg?.id, searchFilter],
    queryFn: () => listKnowledgeDocuments({ search: searchFilter }),
    enabled: !!activeOrg?.id,
  });

  const documents: KnowledgeDocumentSummary[] = docResponse?.data || [];

  // Query: Selected Document Details with Chunks
  const { data: detailResponse, isLoading: isLoadingDetail } = useQuery({
    queryKey: ['knowledge_document', selectedDocId],
    queryFn: () => (selectedDocId ? getKnowledgeDocument(selectedDocId) : null),
    enabled: !!selectedDocId,
  });

  const selectedDoc: KnowledgeDocumentDetail | null = detailResponse || null;

  // Mutation: Create Document
  const createMutation = useMutation({
    mutationFn: (data: { title: string; sourceType: string; content: string }) =>
      createKnowledgeDocument(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge_documents', activeOrg?.id] });
      setIsModalOpen(false);
      setNewTitle('');
      setNewContent('');
      setNewSourceType('FAQ');
      setFormError(null);
    },
    onError: (err: any) => {
      setFormError(err.message || 'Failed to create knowledge document');
    },
  });

  // Mutation: Delete Document
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteKnowledgeDocument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge_documents', activeOrg?.id] });
      if (selectedDocId) setSelectedDocId(null);
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      setFormError('Title is required');
      return;
    }
    if (!newContent.trim()) {
      setFormError('Content is required');
      return;
    }
    createMutation.mutate({
      title: newTitle.trim(),
      sourceType: newSourceType,
      content: newContent.trim(),
    });
  };

  const handleSemanticSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testQuery.trim()) return;

    setIsSearching(true);
    setSearchError(null);
    try {
      const res = await searchKnowledge(testQuery.trim(), 5, minSimilarity);
      setSearchResults(res || null);
    } catch (err: any) {
      setSearchError(err.message || 'Semantic search failed');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center space-x-2">
            <BookOpen className="w-6 h-6 text-indigo-600" />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Knowledge Base & AI Grounding
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Segment business policies and FAQs into pgvector chunks to ground AI suggestions with citations.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setActiveSubTab('documents')}
            className={`px-3.5 py-2 text-sm font-semibold rounded-lg transition-colors ${
              activeSubTab === 'documents'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Documents ({documents.length})
          </button>
          <button
            onClick={() => setActiveSubTab('search')}
            className={`px-3.5 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center space-x-1.5 ${
              activeSubTab === 'search'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Semantic Sandbox</span>
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Document</span>
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      {activeSubTab === 'documents' ? (
        <div className="mt-6 space-y-6">
          {/* Search Filter Bar */}
          <div className="flex items-center justify-between">
            <div className="relative w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filter documents..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <button
              onClick={() => refetchDocs()}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              Refresh
            </button>
          </div>

          {/* Documents Grid / Empty State */}
          {isLoadingDocs ? (
            <div className="py-12 flex justify-center text-slate-400 text-sm">
              Loading knowledge documents...
            </div>
          ) : documents.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-xl border border-dashed border-slate-300">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-800">No knowledge documents yet</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-4">
                Add return policies, product specifications, or FAQ answers to empower your AI assistant to cite verified sources.
              </p>
              <button
                onClick={() => setIsModalOpen(true)}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Create First Document</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-shadow hover:shadow-sm flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                        {doc.sourceType}
                      </span>
                      <span className="inline-flex items-center space-x-1 text-xs text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded-md">
                        <Layers className="w-3 h-3" />
                        <span>{doc.chunkCount} {doc.chunkCount === 1 ? 'chunk' : 'chunks'}</span>
                      </span>
                    </div>

                    <h3 className="font-semibold text-slate-900 text-base line-clamp-1">{doc.title}</h3>
                    <p className="text-slate-500 text-xs mt-1 line-clamp-3 leading-relaxed">
                      {doc.content}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                    <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setSelectedDocId(doc.id)}
                        className="text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        Inspect Chunks
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete document "${doc.title}" and its vector chunks?`)) {
                            deleteMutation.mutate(doc.id);
                          }
                        }}
                        className="text-red-500 hover:text-red-700"
                        title="Delete document"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Semantic Sandbox Tab */
        <div className="mt-6 bg-white border border-slate-200 rounded-xl p-6">
          <div className="max-w-2xl">
            <h2 className="text-base font-semibold text-slate-900 flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Interactive pgvector Semantic Search Sandbox</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Test queries against your organization's vector embeddings using pgvector's cosine distance operator (&lt;=&gt;).
            </p>

            <form onSubmit={handleSemanticSearch} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Query or Customer Question
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={testQuery}
                    onChange={(e) => setTestQuery(e.target.value)}
                    placeholder="e.g. What is our refund window or enterprise response time?"
                    className="flex-1 px-3.5 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={isSearching || !testQuery.trim()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg shadow-sm"
                  >
                    {isSearching ? 'Searching...' : 'Search'}
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                  <span>Minimum Similarity Threshold</span>
                  <span className="font-semibold text-indigo-600">{(minSimilarity * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="0.95"
                  step="0.05"
                  value={minSimilarity}
                  onChange={(e) => setMinSimilarity(parseFloat(e.target.value))}
                  className="w-full accent-indigo-600"
                />
              </div>
            </form>

            {searchError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <span>{searchError}</span>
              </div>
            )}

            {/* Results */}
            {searchResults && (
              <div className="mt-6 pt-6 border-t border-slate-200">
                <h3 className="text-sm font-semibold text-slate-800">
                  Search Results ({searchResults.totalMatched} matched)
                </h3>

                {searchResults.results.length === 0 ? (
                  <p className="text-xs text-slate-500 mt-2">
                    No chunks exceeded the {(minSimilarity * 100).toFixed(0)}% threshold. The AI assistant would abstain with <code className="bg-slate-100 px-1 py-0.5 rounded text-amber-700 font-mono">LOW_RELEVANCE</code>.
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {searchResults.results.map((res) => (
                      <div
                        key={res.id}
                        className="p-4 border border-slate-200 rounded-lg bg-slate-50 text-xs space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800">
                            {res.documentTitle} (Chunk #{res.chunkIndex})
                          </span>
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>{(res.similarity * 100).toFixed(1)}% match</span>
                          </span>
                        </div>
                        <p className="text-slate-600 font-mono bg-white p-2.5 rounded border border-slate-200 leading-relaxed">
                          {res.chunkText}
                        </p>
                        <div className="text-[11px] text-slate-400">
                          Source Token: <code className="text-indigo-600">[Source: {res.id}]</code> • {res.tokenCount} tokens
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Inspect Document Modal / Drawer */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-base">{selectedDoc.title}</h3>
                <span className="text-xs text-slate-500">
                  {selectedDoc.sourceType} • {selectedDoc.chunks.length} segmented chunks
                </span>
              </div>
              <button
                onClick={() => setSelectedDocId(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Segmented Vector Chunks
              </h4>
              {selectedDoc.chunks.map((chunk) => (
                <div key={chunk.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5">
                  <div className="flex items-center justify-between text-slate-500 font-medium">
                    <span>Chunk Index #{chunk.chunkIndex}</span>
                    <span className="font-mono text-indigo-600">[Source: {chunk.id}]</span>
                    <span>~{chunk.tokenCount} tokens</span>
                  </div>
                  <p className="text-slate-700 bg-white p-2.5 rounded border border-slate-200 font-mono text-[12px] leading-relaxed">
                    {chunk.chunkText}
                  </p>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedDocId(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Document Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-slate-900 text-base">Add Knowledge Document</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="mt-4 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Document Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Return Policy, Pricing Guide, Support SLAs"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Source Type
                </label>
                <select
                  value={newSourceType}
                  onChange={(e) => setNewSourceType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                >
                  <option value="FAQ">FAQ (Frequently Asked Questions)</option>
                  <option value="POLICY">POLICY (Business Rules & SLAs)</option>
                  <option value="MANUAL_ENTRY">MANUAL_ENTRY (Standard Text)</option>
                  <option value="DOCUMENT_UPLOAD">DOCUMENT_UPLOAD (Manuals & Docs)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Document Content
                </label>
                <textarea
                  rows={6}
                  placeholder="Paste policies, answers, or documentation text here. The chunking engine will automatically segment this into pgvector embeddings..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono text-xs"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-sm"
                >
                  {createMutation.isPending ? 'Chunking & Ingesting...' : 'Ingest Document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
