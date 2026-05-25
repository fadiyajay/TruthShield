'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { History as HistoryIcon, Download, Trash2, Cpu, FileText, Globe, ImageIcon, Mic } from 'lucide-react';
import api from '@/lib/api';

interface HistoryItem {
  id: number;
  type: string;
  verdict: string;
  confidence: number;
  summary: string;
  input_preview: string;
  timestamp: string;
}

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const { data } = await api.get<HistoryItem[]>('/history?limit=50');
      setHistory(data);
    } catch (err) {
      console.error('Failed to fetch history', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (!confirm('Are you sure you want to clear all forensic logs?')) return;
    try {
      await api.delete('/history');
      setHistory([]);
    } catch (err) {
      console.error('Failed to clear history', err);
    }
  };

  const handleDownloadPdf = (id: number) => {
    // Navigate to the backend endpoint that triggers the PDF download
    window.open(`https://truthshield-6x52.onrender.com/report/${id}`, '_blank');
  };

  const getTypeIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'text': return <FileText className="w-5 h-5 text-blue-400" />;
      case 'url': return <Globe className="w-5 h-5 text-purple-400" />;
      case 'image': return <ImageIcon className="w-5 h-5 text-green-400" />;
      case 'audio': return <Mic className="w-5 h-5 text-yellow-400" />;
      default: return <Cpu className="w-5 h-5 text-primary" />;
    }
  };

  return (
    <div className="h-full flex flex-col gap-6">
      <header className="flex items-center justify-between border-b border-primary/20 pb-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 rounded-lg text-primary">
            <HistoryIcon size={28} />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-wider text-glow uppercase">Investigation Log</h2>
            <p className="text-muted-foreground text-sm">Archived forensic reports and past intelligence scans.</p>
          </div>
        </div>
        
        <button 
          onClick={handleClearHistory}
          className="flex items-center gap-2 text-destructive hover:bg-destructive/10 px-4 py-2 rounded-lg transition-colors border border-transparent hover:border-destructive/30"
        >
          <Trash2 size={16} />
          <span className="text-sm font-bold uppercase tracking-widest hidden md:block">Purge Logs</span>
        </button>
      </header>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} className="text-primary">
            <Cpu size={48} />
          </motion.div>
        </div>
      ) : (
        <div className="glass-panel rounded-xl overflow-hidden flex flex-col flex-1">
          <div className="grid grid-cols-12 gap-4 p-4 border-b border-primary/20 bg-black/60 text-xs text-primary font-bold uppercase tracking-widest">
            <div className="col-span-1">Type</div>
            <div className="col-span-4">Target / Preview</div>
            <div className="col-span-2">Verdict</div>
            <div className="col-span-1">Conf.</div>
            <div className="col-span-2">Date</div>
            <div className="col-span-2 text-right">Action</div>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {history.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground uppercase tracking-widest">
                No logs found. Database empty.
              </div>
            ) : (
              history.map((item, i) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  key={item.id} 
                  className="grid grid-cols-12 gap-4 p-4 border-b border-primary/10 hover:bg-primary/5 transition-colors items-center"
                >
                  <div className="col-span-1 flex justify-center md:justify-start">
                    {getTypeIcon(item.type)}
                  </div>
                  <div className="col-span-4 font-mono text-sm truncate opacity-80" title={item.input_preview}>
                    {item.input_preview || `${item.type} Target`}
                  </div>
                  <div className={`col-span-2 text-xs font-bold uppercase tracking-wider ${item.verdict.toLowerCase().includes('fake') ? 'text-destructive text-glow' : 'text-green-500 text-glow'}`}>
                    {item.verdict}
                  </div>
                  <div className="col-span-1 text-sm font-mono text-primary">
                    {item.confidence}%
                  </div>
                  <div className="col-span-2 text-xs text-muted-foreground font-mono">
                    {new Date(item.timestamp).toLocaleString()}
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <button 
                      onClick={() => handleDownloadPdf(item.id)}
                      className="flex items-center gap-2 text-primary hover:bg-primary/20 px-3 py-1.5 rounded border border-primary/30 transition-all text-xs uppercase tracking-widest"
                    >
                      <Download size={14} />
                      <span className="hidden md:inline">PDF</span>
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
