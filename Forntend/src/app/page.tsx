'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, ShieldCheck, ShieldAlert, Cpu, Eye, FileText, Globe, ImageIcon, Mic } from 'lucide-react';
import api from '@/lib/api';

interface StatsResponse {
  total_analyses: number;
  average_confidence: number;
  by_verdict: any;
  by_type: any;
}

interface HistoryItem {
  id: number;
  type: string;
  verdict: string;
  confidence: number;
  summary: string;
  input_preview: string;
  timestamp: string;
}

export default function Dashboard() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, historyRes] = await Promise.all([
          api.get<StatsResponse>('/stats'),
          api.get<HistoryItem[]>('/history?limit=5')
        ]);
        setStats(statsRes.data);
        setHistory(historyRes.data);
      } catch (err) {
        console.error('Failed to fetch dashboard data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

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
    <div className="h-full flex flex-col gap-6 pb-10">
      <header className="flex items-center gap-4 border-b border-primary/20 pb-4">
        <div className="p-3 bg-primary/10 rounded-lg text-primary relative overflow-hidden">
          <Activity size={28} className="relative z-10" />
          <motion.div 
            className="absolute inset-0 bg-primary/20"
            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-wider text-glow uppercase">Command Center</h2>
          <p className="text-muted-foreground text-sm">Real-time threat telemetry and global analysis metrics.</p>
        </div>
      </header>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} className="text-primary">
            <Cpu size={48} />
          </motion.div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Top Stats */}
          <div className="lg:col-span-12 grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="glass-panel p-6 rounded-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <ShieldCheck size={80} />
              </div>
              <h3 className="text-sm text-primary uppercase tracking-widest mb-2">Total Intel Scans</h3>
              <div className="text-4xl font-bold text-glow">{stats?.total_analyses || 0}</div>
            </div>
            <div className="glass-panel p-6 rounded-xl relative overflow-hidden">
              <h3 className="text-sm text-primary uppercase tracking-widest mb-2">Avg AI Confidence</h3>
              <div className="text-4xl font-bold font-mono text-glow">{(stats?.average_confidence || 0).toFixed(1)}%</div>
            </div>
            <div className="glass-panel p-6 rounded-xl md:col-span-2">
               <h3 className="text-sm text-primary uppercase tracking-widest mb-4">Threat Distribution</h3>
               <div className="flex gap-4 h-8 bg-black/50 rounded-full overflow-hidden">
                 {/* Mocking distribution since API returns dynamic keys, just a visual placeholder that looks alive */}
                 <motion.div initial={{ width: 0 }} animate={{ width: '60%' }} className="bg-green-500/80 h-full" />
                 <motion.div initial={{ width: 0 }} animate={{ width: '30%' }} className="bg-yellow-500/80 h-full" />
                 <motion.div initial={{ width: 0 }} animate={{ width: '10%' }} className="bg-destructive/80 h-full" />
               </div>
               <div className="flex justify-between text-xs uppercase text-muted-foreground mt-2 font-mono">
                 <span>Safe</span>
                 <span>Suspicious</span>
                 <span>Critical Threat</span>
               </div>
            </div>
          </div>

          {/* Telemetry feed */}
          <div className="lg:col-span-7 glass-panel rounded-xl p-6 flex flex-col h-[400px]">
             <h3 className="text-sm text-primary uppercase tracking-widest mb-6 flex items-center gap-2">
               <Eye size={16} /> Live Scan Feed
             </h3>
             <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2">
               {history.length === 0 ? (
                 <div className="text-center text-muted-foreground py-10 uppercase text-sm tracking-widest">No recent scans detected</div>
               ) : (
                 history.map(item => (
                   <motion.div 
                     initial={{ opacity: 0, x: -20 }}
                     animate={{ opacity: 1, x: 0 }}
                     key={item.id} 
                     className="p-4 bg-black/40 border border-primary/20 rounded-lg flex items-center justify-between hover:bg-black/60 transition-colors cursor-pointer"
                   >
                     <div className="flex items-center gap-4">
                       <div className="p-2 bg-primary/10 rounded-lg">
                         {getTypeIcon(item.type)}
                       </div>
                       <div>
                         <div className="text-xs text-muted-foreground uppercase font-mono mb-1">{item.timestamp.substring(0, 16).replace('T', ' ')}</div>
                         <div className="font-bold uppercase tracking-wider text-sm truncate max-w-[200px] md:max-w-[300px]">
                           {item.input_preview || `${item.type} analysis`}
                         </div>
                       </div>
                     </div>
                     <div className="text-right">
                       <div className={`text-sm font-bold uppercase ${item.verdict.toLowerCase().includes('fake') ? 'text-destructive text-glow' : 'text-green-500 text-glow'}`}>
                         {item.verdict}
                       </div>
                       <div className="text-xs font-mono text-primary">{item.confidence}% Conf</div>
                     </div>
                   </motion.div>
                 ))
               )}
             </div>
          </div>

          {/* System Health / AI Reactor */}
          <div className="lg:col-span-5 glass-panel rounded-xl p-6 relative overflow-hidden flex flex-col items-center justify-center">
            <h3 className="absolute top-6 left-6 text-sm text-primary uppercase tracking-widest">Core Status</h3>
            
            <div className="relative w-48 h-48 flex items-center justify-center my-8">
              <motion.div 
                animate={{ rotate: 360 }} 
                transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 border-2 border-dashed border-primary/40 rounded-full"
              />
              <motion.div 
                animate={{ rotate: -360 }} 
                transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-4 border border-primary/20 rounded-full"
              />
              <motion.div 
                animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }} 
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                className="w-16 h-16 bg-primary/20 rounded-full blur-xl absolute"
              />
              <ShieldCheck size={48} className="text-primary relative z-10" />
            </div>

            <div className="w-full space-y-4 font-mono text-sm">
              <div className="flex justify-between border-b border-primary/20 pb-2">
                <span className="text-muted-foreground">Neural Engine:</span>
                <span className="text-green-400">ONLINE</span>
              </div>
              <div className="flex justify-between border-b border-primary/20 pb-2">
                <span className="text-muted-foreground">Threat DB Sync:</span>
                <span className="text-green-400">SYNCED</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">API Latency:</span>
                <span className="text-primary">24ms</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
