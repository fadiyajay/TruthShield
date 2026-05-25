'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, ShieldAlert, Cpu, AlertTriangle, CheckCircle } from 'lucide-react';
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

export default function TextAnalysisPage() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const { setScanning, setThreatLevel, isScanning } = useScanStore();

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    setScanning(true, 'text');
    setResult(null);
    setThreatLevel('unknown');

    try {
      const { data } = await api.post<AnalyzeResponse>('/analyze', { text });
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
          <FileText size={28} />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-wider text-glow uppercase">Text Intelligence Forensics</h2>
          <p className="text-muted-foreground text-sm">Analyze raw text for manipulation, AI generation, and narrative bias.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* Input Terminal */}
        <div className="lg:col-span-5 glass-panel rounded-xl p-6 flex flex-col">
          <h3 className="text-lg font-semibold mb-4 text-primary uppercase tracking-wider flex items-center gap-2">
            <Cpu size={18} /> Intercepted Data
          </h3>
          <form onSubmit={handleAnalyze} className="flex-1 flex flex-col gap-4">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste intercepted transmission or suspect text here..."
              className="flex-1 bg-black/50 border border-primary/30 rounded-lg p-4 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-none font-mono text-sm custom-scrollbar"
            />
            <button
              disabled={isScanning || !text.trim()}
              type="submit"
              className="bg-primary/20 hover:bg-primary/40 border border-primary text-primary font-bold py-4 rounded-lg uppercase tracking-wider transition-all disabled:opacity-50 flex justify-center items-center gap-3"
            >
              {isScanning ? (
                <>
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
                    <ShieldAlert size={20} />
                  </motion.div>
                  Running Neural Analysis...
                </>
              ) : (
                'Initiate Deep Scan'
              )}
            </button>
          </form>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-7 relative h-full">
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
                  <ShieldAlert size={48} className="mx-auto mb-4 opacity-20" />
                  <p className="uppercase tracking-widest text-sm">Awaiting Data Input</p>
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
                <motion.div animate={{ rotate: 180 }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }}>
                  <ShieldAlert size={80} className="mb-8" />
                </motion.div>
                <h3 className="text-2xl font-bold tracking-widest text-glow uppercase mb-2">Analyzing Patterns</h3>
                <p className="font-mono text-sm opacity-80">Extracting semantic fingerprints...</p>
                <div className="w-full max-w-md h-1 bg-black/50 mt-8 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ x: '-100%' }}
                    animate={{ x: '100%' }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    className="h-full bg-primary w-1/3 shadow-[0_0_10px_rgba(59,130,246,0.8)]"
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
                    <h3 className="text-sm text-muted-foreground uppercase tracking-widest mb-1">Final Verdict</h3>
                    <div className="flex items-center gap-3">
                      {result.verdict.toLowerCase().includes('fake') ? (
                        <AlertTriangle className="text-destructive w-8 h-8" />
                      ) : (
                        <CheckCircle className="text-green-500 w-8 h-8" />
                      )}
                      <h2 className={`text-3xl font-bold uppercase ${result.verdict.toLowerCase().includes('fake') ? 'text-destructive text-glow' : 'text-green-500 text-glow'}`}>
                        {result.verdict}
                      </h2>
                    </div>
                  </div>
                  <div className="text-right">
                    <h3 className="text-sm text-muted-foreground uppercase tracking-widest mb-1">Confidence</h3>
                    <div className="text-3xl font-bold font-mono text-primary">{result.confidence}%</div>
                  </div>
                </div>

                <div className="p-4 bg-black/40 border border-primary/20 rounded-lg">
                  <h4 className="text-primary uppercase tracking-wider text-sm mb-2 font-semibold">AI Summary</h4>
                  <p className="text-sm leading-relaxed">{result.summary}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-black/40 border border-primary/20 rounded-lg">
                    <h4 className="text-primary uppercase tracking-wider text-sm mb-3 font-semibold">Key Reasons</h4>
                    <ul className="space-y-2">
                      {result.reasons.map((r, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="text-primary mt-1">▹</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="p-4 bg-black/40 border border-primary/20 rounded-lg">
                    <h4 className="text-primary uppercase tracking-wider text-sm mb-3 font-semibold">Bias Indicators</h4>
                    <ul className="space-y-2">
                      {result.bias_indicators.length > 0 ? result.bias_indicators.map((b, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="text-destructive mt-1">▹</span>
                          <span>{b}</span>
                        </li>
                      )) : (
                        <span className="text-muted-foreground text-sm">No significant bias detected.</span>
                      )}
                    </ul>
                  </div>
                </div>

                {result.claims.length > 0 && (
                  <div className="p-4 bg-black/40 border border-primary/20 rounded-lg">
                    <h4 className="text-primary uppercase tracking-wider text-sm mb-3 font-semibold">Extracted Claims</h4>
                    <ul className="space-y-2">
                      {result.claims.map((c, i) => (
                        <li key={i} className="text-sm font-mono opacity-80 border-l-2 border-primary/50 pl-3 py-1">
                          "{c}"
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
