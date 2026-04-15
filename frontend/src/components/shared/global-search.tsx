'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Briefcase,
  CheckSquare,
  FileText,
  Loader2,
  NotebookPen,
  Search,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { navigate } from '@/lib/router';
import { globalSearch, type SearchResult, type SearchResultKind } from '@/lib/api/search';

// ── Kind metadata ─────────────────────────────────────────────────────────────

const KIND_META: Record<SearchResultKind, { label: string; Icon: React.ElementType; color: string }> = {
  matter: { label: 'Matter',  Icon: Briefcase,    color: 'text-emerald-600' },
  client: { label: 'Client',  Icon: Users,        color: 'text-blue-600' },
  note:   { label: 'Note',    Icon: NotebookPen,  color: 'text-violet-600' },
  task:   { label: 'Task',    Icon: CheckSquare,  color: 'text-amber-600' },
};

// ── Component ─────────────────────────────────────────────────────────────────

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Open/close ────────────────────────────────────────────────────────

  const openSearch = useCallback(() => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const closeSearch = useCallback(() => {
    setOpen(false);
    setQuery('');
    setResults([]);
    setActiveIndex(0);
  }, []);

  // Keyboard shortcut: Cmd/Ctrl + K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        open ? closeSearch() : openSearch();
      }
      if (e.key === 'Escape' && open) closeSearch();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, openSearch, closeSearch]);

  // ── Search ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await globalSearch(query.trim());
        setResults(res.results);
        setActiveIndex(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // ── Keyboard navigation ───────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[activeIndex]) {
      handleSelect(results[activeIndex]);
    }
  };

  // ── Select result ─────────────────────────────────────────────────────

  const handleSelect = (result: SearchResult) => {
    closeSearch();
    if (result.kind === 'note') {
      navigate('/notes');
    } else {
      navigate(result.url);
    }
  };

  // ── Group results by kind ─────────────────────────────────────────────

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.kind]) acc[r.kind] = [];
    acc[r.kind].push(r);
    return acc;
  }, {});

  // Flat ordered list for keyboard nav (matches render order)
  const flat = (Object.keys(KIND_META) as SearchResultKind[])
    .flatMap((k) => grouped[k] ?? []);

  if (!open) {
    return (
      <button
        onClick={openSearch}
        className="hidden sm:flex items-center gap-2 h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-400 hover:text-slate-600 hover:border-slate-300 dark:hover:border-slate-600 transition-colors text-sm"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="text-xs">Search…</span>
        <kbd className="ml-1 hidden md:inline-flex h-5 select-none items-center gap-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1.5 text-[10px] text-slate-500">
          ⌘K
        </kbd>
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={closeSearch}
      />

      {/* Palette */}
      <div className="fixed left-1/2 top-[8vh] sm:top-[15vh] z-50 w-full max-w-xl -translate-x-1/2 px-3 sm:px-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">

          {/* Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            {loading
              ? <Loader2 className="h-4 w-4 shrink-0 text-emerald-600 animate-spin" />
              : <Search className="h-4 w-4 shrink-0 text-slate-400" />}
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search matters, clients, notes, tasks…"
              className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            )}
            <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1.5 text-[10px] text-slate-500 select-none">
              ESC
            </kbd>
          </div>

          {/* Results */}
          {query.trim().length >= 2 && (
            <div className="max-h-[50vh] sm:max-h-[60vh] overflow-y-auto py-2">
              {flat.length === 0 && !loading ? (
                <div className="px-4 py-8 text-center text-sm text-slate-400">
                  No results for &ldquo;{query}&rdquo;
                </div>
              ) : (
                (Object.keys(KIND_META) as SearchResultKind[]).map((kind) => {
                  const group = grouped[kind];
                  if (!group?.length) return null;
                  const { label, Icon, color } = KIND_META[kind];
                  return (
                    <div key={kind}>
                      <div className="px-4 pt-3 pb-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          {label}s
                        </span>
                      </div>
                      {group.map((result) => {
                        const flatIdx = flat.indexOf(result);
                        const isActive = flatIdx === activeIndex;
                        return (
                          <button
                            key={result.id}
                            className={cn(
                              'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                              isActive
                                ? 'bg-emerald-50 dark:bg-emerald-950/30'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                            )}
                            onMouseEnter={() => setActiveIndex(flatIdx)}
                            onClick={() => handleSelect(result)}
                          >
                            <Icon className={cn('h-4 w-4 shrink-0', color)} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                                {result.title}
                              </p>
                              {result.subtitle && (
                                <p className="text-xs text-slate-400 truncate">{result.subtitle}</p>
                              )}
                            </div>
                            <span className={cn(
                              'shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border',
                              result.status === 'open' || result.status === 'active'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : result.status === 'archived'
                                  ? 'border-slate-200 bg-slate-50 text-slate-400'
                                  : 'border-slate-200 bg-slate-50 text-slate-500'
                            )}>
                              {result.status}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {query.trim().length < 2 && (
            <div className="px-4 py-6 text-center text-xs text-slate-400">
              Type at least 2 characters to search
            </div>
          )}

          {/* Footer hint */}
          <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-2 flex items-center gap-4 text-[10px] text-slate-400">
            <span><kbd className="font-mono">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono">↵</kbd> open</span>
            <span><kbd className="font-mono">esc</kbd> close</span>
          </div>
        </div>
      </div>
    </>
  );
}

export default GlobalSearch;
