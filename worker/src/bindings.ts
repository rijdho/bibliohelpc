export interface Env {
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  AI: Ai;
  APP_NAME: string;
  APP_DOMAIN: string;
  API_MAILTO: string;
  MAX_BODY_SIZE: string;
  MAX_REFERENCES: string;
  PAGES_DOMAIN?: string;
  ISBNDB_API_KEY?: string;
}
