import { useEffect, useMemo, useState } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { Monitor, MonitorSmartphone, Smartphone } from 'lucide-react';
import { AppProvider } from './context/AppContext';
import Layout from './components/Layout';
import ChatFabs from './components/ChatFabs';
import GuideFab from './components/GuideFab';
import Store from './pages/Store';
import B2B from './pages/B2B';
import Admin from './pages/Admin';
import OrderHistory from './pages/OrderHistory';
import { captureRefFromHash } from './lib/ref';
import { getViewMode, setViewMode } from './lib/view';
import type { ViewMode } from './lib/view';

/**
 * Forced-view shell. Renders the whole app inside an iframe whose width acts as a
 * real CSS viewport, so every responsive breakpoint re-evaluates natively (no
 * changes to any existing responsive classes). In PC mode the viewport <meta> is
 * also widened so phones lay out the frame at true desktop width (pinch to zoom).
 */
function ViewShell({ mode }: { mode: 'mobile' | 'pc' }) {
  const src = useMemo(
    () => `${window.location.pathname}?framed=1${window.location.hash || ''}`,
    []
  );
  const width = mode === 'mobile' ? 430 : 1190;

  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    const original = meta.getAttribute('content') || '';
    if (mode === 'pc') {
      meta.setAttribute('content', 'width=1190');
    }
    return () => {
      meta.setAttribute('content', original);
    };
  }, [mode]);

  return (
    <div className="min-h-[100dvh] w-full bg-slate-950 flex flex-col items-center">
      <div className="w-full h-[46px] shrink-0 flex items-center justify-center gap-2 px-3 bg-slate-900 border-b border-white/10">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-slate-300 uppercase tracking-widest">
          {mode === 'mobile' ? <Smartphone size={13} className="text-emerald-400" /> : <Monitor size={13} className="text-emerald-400" />}
          {mode === 'mobile' ? 'Mobile Version' : 'PC Version'}
        </span>
        <button
          onClick={() => setViewMode('auto')}
          className="ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500 text-white text-[11px] font-extrabold active:scale-95 transition"
        >
          <MonitorSmartphone size={12} />
          Back to Auto View
        </button>
      </div>
      <iframe
        title="SamStore DZ"
        src={src}
        style={{ width: `min(${width}px, 100%)`, height: 'calc(100dvh - 46px)' }}
        className="border-0 bg-[#0b1120] shadow-2xl"
      />
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<ViewMode>(() => getViewMode());
  const framed = useMemo(
    () => new URLSearchParams(window.location.search).get('framed') === '1',
    []
  );

  useEffect(() => {
    const sync = () => setView(getViewMode());
    window.addEventListener('dz-view-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('dz-view-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    captureRefFromHash();
  }, []);
  if (!framed && view !== 'auto') {
    return <ViewShell mode={view} />;
  }

  return (
    <AppProvider>
      <HashRouter>
        <ChatFabs />
        <GuideFab />
        <Layout>
          <Routes>
            <Route path="/" element={<Store />} />
            <Route path="/b2b" element={<B2B />} />
            <Route path="/orders" element={<OrderHistory />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<Store />} />
          </Routes>
        </Layout>
      </HashRouter>
    </AppProvider>
  );
}
