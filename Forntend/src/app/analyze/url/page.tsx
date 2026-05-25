'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link as LinkIcon, ShieldAlert, Globe, AlertTriangle, CheckCircle, Search } from 'lucide-react';
import api from '@/lib/api';
import { useScanStore } from '@/store/useScanStore';

interface AnalyzeResponse {
  verdict: string;
  confidence: number;
  summary: string;
  confidence_explanation: string;
  reasons: string[];
  claims: string[];
  bias_indicators: string[];
  source_credibility: any;
  language_detected: string;
}

export default function UrlAnalysisPage() {
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const { setScanning, setThreatLevel, isScanning } = useScanStore();

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setScanning(true, 'url');
    setResult(null);
    setThreatLevel('unknown');

    try {
      const { data } = await api.post<AnalyzeResponse>('/analyze-url', { url });
      setResult(data);
      if (data.verdict.toLowerCase().includes('fake') || data.verdict.toLowerCase().includes('manipulated')) {
        setThreatLevel('critical');
      } else if (data.confidence < 70) {
        setThreatLevel('warning');
      } else {
        setThreatLevel('safe');
      }
    } catch (err) {
      console.error(err);
      setThreatLevel('warning');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-6">
      <header className="flex items-center gap-4 border-b border-primary/20 pb-4">
        <div className="p-3 bg-primary/10 rounded-lg text-primary">
          <LinkIcon size={28} />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-wider text-glow uppercase">Domain Intel & URL Forensics</h2>
          <p className="text-muted-foreground text-sm">Deep scan domains for fake news, propaganda, and low-credibility networks.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* Input Terminal */}
        <div className="lg:col-span-12 glass-panel rounded-xl p-6">
          <form onSubmit={handleAnalyze} className="flex gap-4">
            <div className="relative flex-1">
              <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-primary w-6 h-6" />
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Enter target URL (e.g., https://suspicious-news.com/article)"
                className="w-full bg-black/50 border border-primary/30 rounded-lg py-5 pl-14 pr-6 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono text-lg"
              />
            </div>
            <button
              disabled={isScanning || !url.trim()}
              type="submit"
              className="bg-primary/20 hover:bg-primary/40 border border-primary text-primary font-bold px-10 rounded-lg uppercase tracking-wider transition-all disabled:opacity-50 flex items-center gap-3"
            >
              {isScanning ? (
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
                  <ShieldAlert size={24} />
                </motion.div>
              ) : (
                <Search size={24} />
              )}
              {isScanning ? 'Scanning' : 'Target'}
            </button>
          </form>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-12 relative h-full min-h-[500px]">
          <AnimatePresence mode="wait">
            {!result && !isScanning && (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center border border-dashed border-primary/20 rounded-xl"
              >
                <div className="text-center text-muted-foreground">
                  <Globe size={48} className="mx-auto mb-4 opacity-20" />
                  <p className="uppercase tracking-widest text-sm">Awaiting Target Coordinates</p>
                </div>
              </motion.div>
            )}

            {isScanning && (
              <motion.div
                key="scanning"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="absolute inset-0 glass-panel rounded-xl flex flex-col items-center justify-center p-8 text-primary overflow-hidden"
              >
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent opacity-50 animate-pulse" />
                <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}>
                  <Globe size={80} className="mb-8 opacity-80" />
                </motion.div>
                <h3 className="text-2xl font-bold tracking-widest text-glow uppercase mb-2">Establishing Secure Connection</h3>
                <div className="font-mono text-sm opacity-80 space-y-2 text-center mt-4 h-16">
                  <motion.div animate={{ opacity: [0, 1, 0] }} transition={{ duration: 2, repeat: Infinity, delay: 0 }}>&gt; Resolving target DNS records...</motion.div>
                  <motion.div animate={{ opacity: [0, 1, 0] }} transition={{ duration: 2, repeat: Infinity, delay: 0.6 }}>&gt; Analyzing SSL/TLS certificate...</motion.div>
                  <motion.div animate={{ opacity: [0, 1, 0] }} transition={{ duration: 2, repeat: Infinity, delay: 1.2 }}>&gt; Extracting DOM payload & metadata...</motion.div>
                </div>
                <div className="w-full max-w-md h-1 bg-black/50 mt-8 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ x: '-100%' }}
                    animate={{ x: '100%' }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    className="h-full bg-primary w-1/3 shadow-[0_0_15px_rgba(59,130,246,1)]"
                  />
                </div>
              </motion.div>
            )}

            {result && !isScanning && (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute inset-0 flex flex-col gap-6"
              >
                {/* Result Top Bar */}
                <div className="glass-panel rounded-xl p-6 flex justify-between items-center bg-gradient-to-r from-transparent to-black/40">
                  <div className="flex items-center gap-4">
                    {result.verdict.toLowerCase().includes('fake') ? (
                      <AlertTriangle className="text-destructive w-14 h-14" />
                    ) : result.verdict.toLowerCase().includes('mixed') || result.verdict.toLowerCase().includes('suspicious') ? (
                      <ShieldAlert className="text-yellow-500 w-14 h-14" />
                    ) : (
                      <CheckCircle className="text-green-500 w-14 h-14" />
                    )}
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="text-sm text-muted-foreground uppercase tracking-widest">Site Verification</h3>
                        {result.language_detected && (
                          <span className="px-2 py-0.5 text-[10px] font-mono border border-primary/30 rounded text-primary uppercase">
                            Lang: {result.language_detected}
                          </span>
                        )}
                      </div>
                      <h2 className={`text-4xl font-bold uppercase tracking-wider ${result.verdict.toLowerCase().includes('fake') ? 'text-destructive text-glow' : result.verdict.toLowerCase().includes('mixed') ? 'text-yellow-500 text-glow' : 'text-green-500 text-glow'}`}>
                        {result.verdict}
                      </h2>
                    </div>
                  </div>
                  <div className="text-right">
                    <h3 className="text-sm text-muted-foreground uppercase tracking-widest mb-1">Threat Confidence</h3>
                    <div className="text-5xl font-bold font-mono text-primary text-glow">{result.confidence}%</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
                  <div className="lg:col-span-2 glass-panel rounded-xl p-6 space-y-6 overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-primary uppercase tracking-wider text-sm mb-2 font-semibold">Executive Summary</h4>
                        <p className="text-sm leading-relaxed p-4 bg-black/40 border border-primary/20 rounded-lg h-full">{result.summary}</p>
                      </div>
                      <div>
                        <h4 className="text-primary uppercase tracking-wider text-sm mb-2 font-semibold">Confidence Explanation</h4>
                        <p className="text-sm leading-relaxed p-4 bg-black/40 border border-primary/20 rounded-lg h-full text-muted-foreground italic">"{result.confidence_explanation}"</p>
                      </div>
                    </div>
                    
                    {result.claims && result.claims.length > 0 && (
                      <div>
                         <h4 className="text-primary uppercase tracking-wider text-sm mb-2 font-semibold">Extracted Claims</h4>
                         <div className="flex flex-wrap gap-2">
                           {result.claims.map((claim, i) => (
                             <span key={i} className="text-xs px-3 py-1.5 bg-black/50 border border-primary/30 rounded-md text-gray-300">
                               "{claim}"
                             </span>
                           ))}
                         </div>
                      </div>
                    )}

                    <div>
                       <h4 className="text-primary uppercase tracking-wider text-sm mb-2 font-semibold">Forensic Breakdown</h4>
                       <ul className="space-y-3">
                        {result.reasons.map((r, i) => (
                          <li key={i} className="text-sm flex items-start gap-3 p-3 bg-black/30 rounded-lg border border-primary/10 hover:border-primary/40 transition-colors">
                            <span className="text-primary mt-0.5">▹</span>
                            <span className="text-gray-200">{r}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="glass-panel rounded-xl p-6 space-y-6 overflow-y-auto custom-scrollbar">
                    <div>
                      <h4 className="text-primary uppercase tracking-wider text-sm mb-3 font-semibold flex items-center gap-2">
                        <AlertTriangle size={16} className="text-destructive" /> Network Bias
                      </h4>
                      <ul className="space-y-2">
                        {result.bias_indicators && result.bias_indicators.length > 0 ? result.bias_indicators.map((b, i) => (
                          <li key={i} className="text-sm flex items-start gap-2 text-destructive/90 bg-destructive/10 p-2 rounded border border-destructive/20">
                            <span className="mt-0.5">•</span>
                            <span>{b}</span>
                          </li>
                        )) : (
                          <div className="text-green-400 text-sm p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                            Nominal bias detected in linguistic patterns.
                          </div>
                        )}
                      </ul>
                    </div>
                    
                    {result.source_credibility && (
                      <div className="mt-6 pt-6 border-t border-primary/20">
                         <h4 className="text-primary uppercase tracking-wider text-sm mb-3 font-semibold">Source Credibility Index</h4>
                         <div className="space-y-3">
                           {Object.entries(result.source_credibility).map(([key, value]) => (
                             <div key={key} className="flex justify-between items-center p-2 bg-black/40 rounded border border-white/5">
                               <span className="text-xs uppercase text-muted-foreground font-mono">{key.replace(/_/g, ' ')}</span>
                               <span className="text-sm font-bold text-white">
                                 {typeof value === 'boolean' ? (value ? 'YES' : 'NO') : String(value)}
                               </span>
                             </div>
                           ))}
                         </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
