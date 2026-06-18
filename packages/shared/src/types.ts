export type VerificationStatus = 'verified' | 'partial' | 'not_found' | 'likely_fake';

export interface ParsedReference {
  raw: string;
  authors: string[];
  title: string;
  year: number | null;
  doi: string | null;
  isbn: string | null;
  journal: string | null;
  publisher: string | null;
  edition: string | null;
  format: 'apa' | 'mla' | 'chicago' | 'vancouver' | 'unknown';
}

export interface VerificationMatch {
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
  isbn: string | null;
  journal: string | null;
  publisher: string | null;
  source: 'crossref' | 'openalex' | 'openlibrary' | 'openaire' | 'internetarchive' | 'isbndb' | 'd1cache';
  similarity: number;
  url: string | null;
}

export interface FieldSuggestion {
  field: 'year' | 'doi' | 'title' | 'authors';
  userValue: string;
  suggestedValue: string;
  message: string;
}

export interface VerificationResult {
  reference: ParsedReference;
  status: VerificationStatus;
  score: number;
  matches: VerificationMatch[];
  message: string;
  suggestions: FieldSuggestion[];
}

export interface VerifyRequest {
  text: string;
}

export interface DuplicateGroup {
  indices: number[];  // 0-based indices of duplicate references in the results array
  title: string;      // Representative title of the group
  similarity: number; // How similar the duplicates are to each other
}

export interface VerifyResponse {
  results: VerificationResult[];
  totalReferences: number;
  verified: number;
  partial: number;
  notFound: number;
  likelyFake: number;
  duplicates: DuplicateGroup[];
}

export const APP_VERSION = '0.1.0';
