import { useEffect } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useBoardStore } from './store/useBoardStore';
import { useSSE } from './hooks/useSSE';
import { useUrlFilters } from './hooks/useUrlFilters';
import Header from './components/Header';
import Board from './components/Board';

export default function App() {
  const loadBoard = useBoardStore((s) => s.loadBoard);
  const isLoading = useBoardStore((s) => s.isLoading);
  const hasLoadedOnce = useBoardStore((s) => s.hasLoadedOnce);
  const error = useBoardStore((s) => s.error);

  useSSE();
  useUrlFilters();

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-slate-900 flex flex-col">
      <Header />

      {isLoading && !hasLoadedOnce ? (
        <main className="flex-1 px-4 lg:px-6 py-5 max-w-[1480px] w-full mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-slate-200/50 border border-slate-200/70 rounded-xl p-3 h-[520px] animate-pulse flex flex-col gap-2.5"
            >
              <div className="h-5 bg-slate-300/60 rounded-md w-1/3 mb-1" />
              <div className="h-24 bg-white/80 rounded-lg border border-slate-200/60" />
              <div className="h-24 bg-white/80 rounded-lg border border-slate-200/60" />
              <div className="h-20 bg-white/80 rounded-lg border border-slate-200/60" />
            </div>
          ))}
        </main>
      ) : error && !hasLoadedOnce ? (
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 max-w-md w-full text-center space-y-3">
            <AlertCircle className="mx-auto text-rose-500" size={28} />
            <h2 className="font-semibold text-slate-900 text-base">Unable to load board</h2>
            <p className="text-sm text-slate-500">{error}</p>
            <button
              onClick={() => void loadBoard()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        </main>
      ) : (
        <Board />
      )}
    </div>
  );
}
