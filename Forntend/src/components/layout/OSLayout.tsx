'use client';
import { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import { useScanStore } from '@/store/useScanStore';
import Link from 'next/link';

const AICore = dynamic(() => import('../3d/AICore'), { 
  ssr: false, 
  loading: () => <div className="fixed inset-0 z-0 bg-background/50 pointer-events-none transition-all duration-1000" />
});
import { usePathname } from 'next/navigation';
import { Home, ShieldAlert, FileText, Link as LinkIcon, Image, Mic, History, Settings } from 'lucide-react';

const NavItem = ({ href, icon: Icon, label }: { href: string; icon: any; label: string }) => {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link href={href} className={`flex items-center gap-3 p-3 rounded-lg transition-all ${isActive ? 'bg-primary/20 text-primary border-glow' : 'hover:bg-white/5 text-muted-foreground hover:text-white'}`}>
      <Icon className="w-5 h-5" />
      <span className="hidden md:block font-medium tracking-wider text-sm uppercase">{label}</span>
    </Link>
  );
};

export default function OSLayout({ children }: { children: ReactNode }) {
  const { isScanning } = useScanStore();
  const pathname = usePathname();

  // Don't wrap layout on auth pages
  if (pathname === '/login' || pathname === '/register') {
    return (
      <>
        <AICore />
        {children}
      </>
    );
  }

  return (
    <div className="relative min-h-screen bg-background text-foreground overflow-hidden flex">
      {/* 3D Background */}
      <AICore />

      {/* Holographic Overlays */}
      <div className="fixed inset-0 pointer-events-none z-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-transparent via-background/50 to-background" />
      {isScanning && <div className="scan-line" />}

      {/* Sidebar Navigation */}
      <nav className="relative z-20 w-16 md:w-64 glass-panel border-r border-primary/20 flex flex-col justify-between p-4 h-screen">
        <div>
          <div className="flex items-center gap-3 mb-10 text-primary px-2">
            <ShieldAlert className="w-8 h-8" />
            <h1 className="text-xl font-bold tracking-widest text-glow hidden md:block">TRUTHSHIELD</h1>
          </div>
          <div className="space-y-2">
            <NavItem href="/" icon={Home} label="Dashboard" />
            <NavItem href="/analyze/text" icon={FileText} label="Text Analysis" />
            <NavItem href="/analyze/url" icon={LinkIcon} label="URL Intel" />
            <NavItem href="/analyze/image" icon={Image} label="Image Forensics" />
            <NavItem href="/analyze/audio" icon={Mic} label="Audio Detection" />
            <NavItem href="/verify" icon={ShieldAlert} label="Claim Verification" />
          </div>
        </div>
        <div className="space-y-2">
          <NavItem href="/history" icon={History} label="Investigation Log" />
          <NavItem href="/admin" icon={Settings} label="System Admin" />
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="relative z-20 flex-1 h-screen overflow-y-auto p-6 md:p-10 custom-scrollbar">
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="max-w-7xl mx-auto h-full"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
