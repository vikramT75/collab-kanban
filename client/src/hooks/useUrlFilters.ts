import { useEffect, useRef } from 'react';
import { getInitialFiltersFromUrl, useBoardStore } from '../store/useBoardStore';

export function useUrlFilters() {
  const searchQuery = useBoardStore((s) => s.searchQuery);
  const priorityFilter = useBoardStore((s) => s.priorityFilter);
  const assigneeFilter = useBoardStore((s) => s.assigneeFilter);
  const setFilters = useBoardStore((s) => s.setFilters);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSearchRef = useRef(searchQuery);

  // Listen to browser history navigation (popstate)
  useEffect(() => {
    const onPopState = () => {
      setFilters(getInitialFiltersFromUrl());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [setFilters]);

  // Sync filter state -> URL query params (debounced when typing search)
  useEffect(() => {
    const searchChanged = lastSearchRef.current !== searchQuery;
    lastSearchRef.current = searchQuery;

    const writeUrl = () => {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (priorityFilter) params.set('priority', priorityFilter);
      if (assigneeFilter) params.set('assignee', assigneeFilter);
      const qs = params.toString();
      const targetUrl = qs ? `?${qs}` : window.location.pathname;
      const currentUrl = window.location.search
        ? `${window.location.search}`
        : window.location.pathname;
      if ((qs ? `?${qs}` : window.location.pathname) !== currentUrl) {
        window.history.replaceState(null, '', targetUrl);
      }
    };

    clearTimeout(debounceRef.current);
    if (searchChanged) {
      debounceRef.current = setTimeout(writeUrl, 250);
    } else {
      writeUrl();
    }

    return () => clearTimeout(debounceRef.current);
  }, [searchQuery, priorityFilter, assigneeFilter]);
}
