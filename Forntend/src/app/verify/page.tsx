'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Crosshair, Search, CheckCircle, AlertTriangle, HelpCircle } from 'lucide-react';
import api from '@/lib/api';
import { useScanStore } from '@/store/useScanStore';

interface ClaimEvidence {
  claim: string;
  status: 'SUPPORTED' | 'CONTRADICTED' | 'UNVERIFIED';
  summary: string;
  sources: any[];
}

interface ClaimCheckResponse {
  overall_assessment: string;
  claims_checked: number;
  supported: number;
  contradicted: number;
  unverified: number;
  results: ClaimEvidence[];
}

export default function VerifyPage() {
  const [claimsInput, setClaimsInput] = useState('');
  const [result, setResult] = useState<ClaimCheckResponse | null>(null);
  const { setScanning, isScanning } = useScanStore();

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimsInput.trim()) return;

    setScanning(true, 'text');
    setResult(null);

    const claimsArray = claimsInput.split('\n').filter(c => c.trim().length > 0);

    try {
      const { data } = await api.post<ClaimCheckResponse>('/verify-claims', { claims: claimsArray });
      setResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setScanning(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUPPORTED': return <CheckCircle className="text-green-500 w-6 h-6" />;
      case 'CONTRADICTED': return <AlertTriangle className="text-destructive w-6 h-6" />;
      default: return <HelpCircle className="text-yellow-500 w-6 h-6" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SUPPORTED': return 'text-green-500';
      case 'CONTRADICTED': return 'text-destructive';
      default: return 'text-yellow-500';
    }
  };

  return (
    <div className="h-full flex flex-col gap-6">
      <header className="flex items-center gap-4 border-b border-primary/20 pb-4">
        <div className="p-3 bg-primary/10 rounded-lg text-primary">
          <ShieldAlert size={28} />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-wider text-glow uppercase">Claim Cross-Check Engine</h2>
          <p className="text-muted-foreground text-sm">Automated web intelligence search to verify or debunk factual claims.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* Input Terminal */}
        <div className="lg:col-span-4 glass-panel rounded-xl p-6 flex flex-col">
          <h3 className="text-lg font-semibold mb-4 text-primary uppercase tracking-wider flex items-center gap-2">
            <Crosshair size={18} /> Target Claims
          </h3>
          <form onSubmit={handleVerify} className="flex-1 flex flex-col gap-4">
            <textarea
              value={claimsInput}
              onChange={(e) => setClaimsInput(e.target.value)}
              placeholder="Enter claims (one per line)...&#10;e.g., The Eiffel Tower was built in 1999."
              className="flex-1 bg-black/50 border border-primary/30 rounded-lg p-4 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-none font-mono text-sm custom-scrollbar"
            />
            <button
              disabled={isScanning || !claimsInput.trim()}
              type="submit"
              className="bg-primary/20 hover:bg-primary/40 border border-primary text-primary font-bold py-4 rounded-lg uppercase tracking-wider transition-all disabled:opacity-50 flex justify-center items-center gap-3"
            >
              {isScanning ? (
                <>
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
                    <Search size={20} />
                  </motion.div>
                  Querying Global DB...
                </>
              ) : (
                'Cross-Check Intelligence'
              )}
            </button>
          </form>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-8 relative h-full">
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
                  <Search size={48} className="mx-auto mb-4 opacity-20" />
                  <p className="uppercase tracking-widest text-sm">Awaiting Claims for Verification</p>
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
                <motion.div animate={{ rotate: -180 }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }}>
                  <Search size={80} className="mb-8" />
                </motion.div>
                <h3 className="text-2xl font-bold tracking-widest text-glow uppercase mb-2">Cross-Referencing</h3>
                <p className="font-mono text-sm opacity-80">Searching global knowledge bases...</p>
                <div className="w-full max-w-md h-1 bg-black/50 mt-8 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ x: '-100%' }}
                    animate={{ x: '100%' }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="h-full bg-primary w-1/4 shadow-[0_0_10px_rgba(59,130,246,0.8)]"
                  />
                </div>
              </motion.div>
            )}

            {result && !isScanning && (
              <motion.div
                key="result"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="absolute inset-0 glass-panel rounded-xl overflow-y-auto custom-scrollbar p-6 space-y-6"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-sm text-muted-foreground uppercase tracking-widest mb-1">Assessment Complete</h3>
                    <h2 className="text-2xl font-bold uppercase text-primary text-glow">
                      {result.overall_assessment}
                    </h2>
                  </div>
                  <div className="flex gap-4 text-center">
                    <div>
                       <div className="text-2xl font-bold text-green-500">{result.supported}</div>
                       <div className="text-xs text-muted-foreground uppercase">Supported</div>
                    </div>
                    <div>
                       <div className="text-2xl font-bold text-destructive">{result.contradicted}</div>
                       <div className="text-xs text-muted-foreground uppercase">Debunked</div>
                    </div>
                    <div>
                       <div className="text-2xl font-bold text-yellow-500">{result.unverified}</div>
                       <div className="text-xs text-muted-foreground uppercase">Unverified</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-primary uppercase tracking-wider text-sm font-semibold border-b border-primary/20 pb-2">Verified Claims Breakdown</h4>
                  {result.results.map((r, i) => (
                    <div key={i} className="p-4 bg-black/40 border border-primary/20 rounded-lg space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-1">{getStatusIcon(r.status)}</div>
                        <div>
                           <h5 className={`font-bold uppercase tracking-wider text-sm mb-1 ${getStatusColor(r.status)}`}>{r.status}</h5>
                           <p className="font-mono text-sm opacity-90 border-l-2 border-primary/30 pl-3">"{r.claim}"</p>
                        </div>
                      </div>
                      <div className="pl-9 space-y-2">
                        <p className="text-sm text-muted-foreground">{r.summary}</p>
                        {r.sources && r.sources.length > 0 && (
                          <div className="pt-2 border-t border-primary/10">
                            <span className="text-xs text-primary uppercase mr-2">Sources:</span>
                            {r.sources.map((src, j) => (
                              <a key={j} href={src.href} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline mr-3">
                                [{j + 1}] {src.title?.substring(0, 30)}...
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
