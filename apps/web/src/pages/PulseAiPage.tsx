import React, { useState, useRef } from 'react';
import { useAuth } from '../context/auth-context';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '../api/client';
import {
  Sparkles,
  Send,
  Upload,
  Download,
  BarChart2,
  TrendingUp,
  PieChart,
  Table as TableIcon,
  Bot,
  User,
  Clock,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { PulseQueryResponse, PulseChartData } from '@orbit/shared';

interface ChatMessage {
  id: string;
  sender: 'USER' | 'PULSE';
  text: string;
  chart?: PulseChartData;
  executionTimeMs?: number;
  timestamp: string;
}

export const PulseAiPage: React.FC = () => {
  const { activeOrg } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [inputQuery, setInputQuery] = useState('');
  const [activeChart, setActiveChart] = useState<PulseChartData | null>({
    type: 'BAR',
    title: 'Open Tickets by Age (Backlog Aging)',
    labels: ['0-24h', '1-2d', '1w-1m', 'Over 1m'],
    series: [{ name: 'Open Tickets', data: [8, 10, 1, 1] }],
    rawTable: [
      { 'Age Bucket': '0-24h', 'Ticket Count': 8 },
      { 'Age Bucket': '1-2d', 'Ticket Count': 10 },
      { 'Age Bucket': '1w-1m', 'Ticket Count': 1 },
      { 'Age Bucket': 'Over 1m', 'Ticket Count': 1 },
    ],
  });

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'msg_welcome',
      sender: 'PULSE',
      text: 'Hello! I am Pulse AI, your support business intelligence assistant. Ask me anything about your tickets, team performance, channels, or upload a spreadsheet for immediate analysis.',
      chart: activeChart || undefined,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const queryMutation = useMutation({
    mutationFn: (prompt: string) =>
      apiRequest<{ success: boolean; data: PulseQueryResponse }>('/api/pulse/query', {
        method: 'POST',
        body: JSON.stringify({ prompt }),
      }),
    onSuccess: (res) => {
      const { answer, chart, executionTimeMs } = res.data;
      if (chart) {
        setActiveChart(chart);
      }
      setChatMessages((prev) => [
        ...prev,
        {
          id: `pulse_${Date.now()}`,
          sender: 'PULSE',
          text: answer,
          chart,
          executionTimeMs,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    },
  });

  const csvMutation = useMutation({
    mutationFn: (data: { csvContent: string; filename: string }) =>
      apiRequest<{ success: boolean; data: PulseQueryResponse }>('/api/pulse/analyze-csv', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: (res) => {
      const { answer, chart, executionTimeMs } = res.data;
      if (chart) {
        setActiveChart(chart);
      }
      setChatMessages((prev) => [
        ...prev,
        {
          id: `pulse_${Date.now()}`,
          sender: 'PULSE',
          text: answer,
          chart,
          executionTimeMs,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    },
  });

  const handleSendPrompt = (promptText: string) => {
    if (!promptText.trim()) return;

    setChatMessages((prev) => [
      ...prev,
      {
        id: `user_${Date.now()}`,
        sender: 'USER',
        text: promptText.trim(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);

    setInputQuery('');
    queryMutation.mutate(promptText.trim());
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setChatMessages((prev) => [
          ...prev,
          {
            id: `user_upload_${Date.now()}`,
            sender: 'USER',
            text: `Uploaded spreadsheet: "${file.name}" for analysis`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
        csvMutation.mutate({ csvContent: content, filename: file.name });
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownloadCsv = () => {
    if (!activeChart?.rawTable) return;
    const headers = Object.keys(activeChart.rawTable[0] || {});
    const rows = activeChart.rawTable.map((row) =>
      headers.map((h) => JSON.stringify(row[h] ?? '')).join(',')
    );
    const csvData = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${activeChart.title.replace(/\s+/g, '_').toLowerCase()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const promptChips = [
    'Break down open tickets by how long they have been open',
    'Which channels drove the most tickets this week?',
    'Show autonomous AI deflection rate',
    'What is our customer satisfaction rating?',
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                  Pulse AI — Conversational BI
                </h1>
                <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-purple-50 dark:bg-purple-950/80 text-purple-700 dark:text-purple-400">
                  Insights Assistant
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Natural language query engine over support data & uploaded spreadsheets
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Split-View Body */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden max-w-7xl mx-auto w-full p-4 gap-4">
        {/* Left Side: Conversational Chat Panel */}
        <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          {/* Messages Stream */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex items-start gap-3 text-xs ${
                  msg.sender === 'USER' ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.sender === 'PULSE' && (
                  <div className="w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-xl p-3.5 space-y-1.5 shadow-xs ${
                    msg.sender === 'USER'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <p className="leading-relaxed">{msg.text}</p>
                  <div
                    className={`text-[10px] flex items-center gap-2 pt-0.5 ${
                      msg.sender === 'USER' ? 'text-indigo-200' : 'text-slate-400'
                    }`}
                  >
                    <span>{msg.timestamp}</span>
                    {msg.executionTimeMs && (
                      <span>• Generated in {msg.executionTimeMs}ms</span>
                    )}
                  </div>
                </div>

                {msg.sender === 'USER' && (
                  <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-xs shrink-0">
                    U
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Prompt Chips */}
          <div className="p-3 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 overflow-x-auto scrollbar-none">
            {promptChips.map((chip) => (
              <button
                key={chip}
                onClick={() => handleSendPrompt(chip)}
                className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:border-purple-300 dark:hover:border-purple-600 hover:text-purple-600 transition-colors whitespace-nowrap shrink-0"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Input Composer */}
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendPrompt(inputQuery);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="file"
                ref={fileInputRef}
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Upload CSV / Spreadsheet"
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-purple-600 transition-colors"
              >
                <Upload className="w-4 h-4" />
              </button>

              <input
                type="text"
                placeholder="Ask Pulse AI about your tickets, deflections, or metrics..."
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white"
              />

              <button
                type="submit"
                disabled={queryMutation.isPending || csvMutation.isPending || !inputQuery.trim()}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                Ask
              </button>
            </form>
          </div>
        </div>

        {/* Right Side: Split-View Dynamic Live Chart Panel */}
        <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          {/* Chart Header */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-purple-600" />
              <h3 className="font-bold text-slate-900 dark:text-white text-xs truncate max-w-sm">
                {activeChart?.title || 'Interactive Visual Intelligence'}
              </h3>
            </div>

            {activeChart?.rawTable && (
              <button
                onClick={handleDownloadCsv}
                className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3 h-3 text-purple-600" />
                Download CSV
              </button>
            )}
          </div>

          {/* Chart Canvas */}
          <div className="flex-1 p-5 overflow-y-auto space-y-6 flex flex-col justify-center">
            {activeChart ? (
              <div className="space-y-6">
                {/* Visual Bar representation */}
                {activeChart.type === 'BAR' && (
                  <div className="space-y-3">
                    {activeChart.labels.map((lbl, idx) => {
                      const val = activeChart.series[0]?.data[idx] || 0;
                      const maxVal = Math.max(...(activeChart.series[0]?.data || [1]), 1);
                      const pct = Math.round((val / maxVal) * 100);
                      return (
                        <div key={lbl} className="space-y-1">
                          <div className="flex justify-between text-xs font-semibold text-slate-800 dark:text-slate-200">
                            <span>{lbl}</span>
                            <span className="font-mono text-purple-600">{val}</span>
                          </div>
                          <div className="h-4 rounded-md bg-slate-100 dark:bg-slate-800 overflow-hidden p-0.5">
                            <div
                              className="h-full bg-purple-600 rounded-sm transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Donut representation */}
                {activeChart.type === 'DONUT' && (
                  <div className="space-y-3">
                    {activeChart.labels.map((lbl, idx) => {
                      const val = activeChart.series[0]?.data[idx] || 0;
                      return (
                        <div key={lbl} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-xs">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{lbl}</span>
                          <span className="font-bold text-purple-600 font-mono">{val}%</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Line representation */}
                {activeChart.type === 'LINE' && (
                  <div className="h-48 flex items-end gap-3 pt-6 border-b border-slate-100 dark:border-slate-800">
                    {activeChart.labels.map((lbl, idx) => {
                      const val = activeChart.series[0]?.data[idx] || 0;
                      return (
                        <div key={lbl} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                          <span className="text-[10px] font-mono font-bold text-purple-600">{val}%</span>
                          <div
                            className="w-full bg-purple-600 rounded-t-sm transition-all"
                            style={{ height: `${val}%` }}
                          />
                          <span className="text-[10px] text-slate-400 font-mono">{lbl}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Raw Data Table */}
                {activeChart.rawTable && activeChart.rawTable.length > 0 && (
                  <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden text-xs">
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                      Underlying Data Table ({activeChart.rawTable.length} rows)
                    </div>
                    <div className="overflow-x-auto max-h-48">
                      <table className="w-full text-left">
                        <thead className="bg-slate-100 dark:bg-slate-800 text-[10px] uppercase font-bold text-slate-500">
                          <tr>
                            {Object.keys(activeChart.rawTable[0]).map((h) => (
                              <th key={h} className="p-2">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                          {activeChart.rawTable.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                              {Object.keys(row).map((k) => (
                                <td key={k} className="p-2">
                                  {row[k]}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400">
                <BarChart2 className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-700" />
                <p className="text-xs">Ask a question or upload a spreadsheet to render reports.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
