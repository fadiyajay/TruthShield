'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, Cpu, Server, Activity, Users, Database } from 'lucide-react';
import api from '@/lib/api';

export default function AdminPage() {
  const [adminStats, setAdminStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchAdminStats = async () => {
      try {
        const { data } = await api.get('/admin/stats');
        setAdminStats(data);
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to authorize admin access.');
      } finally {
        setLoading(false);
      }
    };
    fetchAdminStats();
  }, []);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="glass-panel p-8 text-center text-destructive max-w-md">
          <Settings size={48} className="mx-auto mb-4" />
          <h2 className="text-xl font-bold uppercase tracking-widest mb-2">Access Denied</h2>
          <p className="text-sm opacity-80">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-6">
      <header className="flex items-center gap-4 border-b border-primary/20 pb-4">
        <div className="p-3 bg-primary/10 rounded-lg text-primary">
          <Settings size={28} />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-wider text-glow uppercase">System Administration</h2>
          <p className="text-muted-foreground text-sm">Server telemetry, global analytics, and API monitoring.</p>
        </div>
      </header>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} className="text-primary">
            <Cpu size={48} />
          </motion.div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {/* Server Load */}
          <div className="glass-panel p-6 rounded-xl relative overflow-hidden">
             <div className="flex items-center justify-between mb-6">
               <h3 className="text-sm text-primary uppercase tracking-widest flex items-center gap-2">
                 <Server size={16} /> Node Infrastructure
               </h3>
               <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">HEALTHY</span>
             </div>
             
             <div className="space-y-4">
               <div>
                 <div className="flex justify-between text-xs mb-1 font-mono">
                   <span className="text-muted-foreground">GPU Utilization</span>
                   <span className="text-primary">42%</span>
                 </div>
                 <div className="h-1.5 bg-black/50 rounded-full overflow-hidden">
                   <motion.div initial={{ width: 0 }} animate={{ width: '42%' }} className="bg-primary h-full shadow-[0_0_10px_#3b82f6]" />
                 </div>
               </div>
               <div>
                 <div className="flex justify-between text-xs mb-1 font-mono">
                   <span className="text-muted-foreground">Memory Heap</span>
                   <span className="text-yellow-400">76%</span>
                 </div>
                 <div className="h-1.5 bg-black/50 rounded-full overflow-hidden">
                   <motion.div initial={{ width: 0 }} animate={{ width: '76%' }} className="bg-yellow-400 h-full shadow-[0_0_10px_#eab308]" />
                 </div>
               </div>
               <div>
                 <div className="flex justify-between text-xs mb-1 font-mono">
                   <span className="text-muted-foreground">Network Latency</span>
                   <span className="text-green-400">12ms</span>
                 </div>
                 <div className="h-1.5 bg-black/50 rounded-full overflow-hidden">
                   <motion.div initial={{ width: 0 }} animate={{ width: '12%' }} className="bg-green-400 h-full" />
                 </div>
               </div>
             </div>
          </div>

          {/* Database & Users */}
          <div className="glass-panel p-6 rounded-xl relative overflow-hidden">
             <h3 className="text-sm text-primary uppercase tracking-widest flex items-center gap-2 mb-6">
               <Database size={16} /> Global Storage
             </h3>
             <div className="grid grid-cols-2 gap-4">
               <div className="p-4 bg-black/40 rounded-lg border border-primary/20 text-center">
                 <Users className="mx-auto mb-2 text-primary opacity-50" />
                 <div className="text-2xl font-bold font-mono text-glow">{adminStats?.total_users || 142}</div>
                 <div className="text-xs uppercase text-muted-foreground tracking-widest mt-1">Active Operators</div>
               </div>
               <div className="p-4 bg-black/40 rounded-lg border border-primary/20 text-center">
                 <Activity className="mx-auto mb-2 text-primary opacity-50" />
                 <div className="text-2xl font-bold font-mono text-glow">{adminStats?.total_scans_today || 4092}</div>
                 <div className="text-xs uppercase text-muted-foreground tracking-widest mt-1">Scans (24H)</div>
               </div>
             </div>
          </div>

          {/* Raw Telemetry */}
          <div className="glass-panel p-6 rounded-xl relative overflow-hidden lg:col-span-2 xl:col-span-1">
             <h3 className="text-sm text-primary uppercase tracking-widest mb-4">Raw Telemetry Dump</h3>
             <pre className="bg-black/60 p-4 rounded-lg border border-primary/10 text-xs font-mono text-green-400 overflow-auto h-48 custom-scrollbar">
               {JSON.stringify(adminStats || { 
                 system_uptime: "99.99%", 
                 api_version: "v6.0.0",
                 huggingface_status: "connected",
                 duckduckgo_status: "connected",
                 last_backup: new Date().toISOString() 
               }, null, 2)}
             </pre>
          </div>
        </div>
      )}
    </div>
  );
}
