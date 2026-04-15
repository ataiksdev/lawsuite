// frontend/src/lib/api/search.ts
import apiClient from '../api-client';

export type SearchResultKind = 'matter' | 'client' | 'note' | 'task';

export interface SearchResult {
  kind: SearchResultKind;
  id: string;
  title: string;
  subtitle: string;
  url: string;
  status: string;
  note_id?: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
}

export async function globalSearch(q: string): Promise<SearchResponse> {
  return apiClient.get<SearchResponse>('/search', { q });
}
