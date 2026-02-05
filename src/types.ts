export interface CommandAGIConfig {
  apiKey: string;
  baseUrl?: string;
}

/** A taste profile returned by the API. */
export interface Profile {
  id: string;
  projectId: string;
  name: string;
  seed: string | null;
  version?: number;
  constraints?: unknown[];
  exemplars?: unknown[];
  comparisons?: unknown[];
  promptSummary?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

/** Parameters for creating a new profile. */
export interface ProfileCreateParams {
  projectId: string;
  name: string;
  seed?: string;
}

/** Parameters for updating a profile. */
export interface ProfileUpdateParams {
  name?: string;
  seed?: string;
  constraints?: unknown[];
  exemplars?: unknown[];
  comparisons?: unknown[];
  promptSummary?: string;
}

/** Parameters for evaluating content against a profile. */
export interface EvalParams {
  frameUrl: string;
  embedding?: number[];
}

/** The result of an evaluation. */
export interface EvalResult {
  score: number;
  confidence: number;
  details: {
    latentScore: number | null;
    constraintMatch: number;
    exemplarSimilarity: number | null;
  };
}

/** Full profile export format. */
export interface ExportFullResult {
  id: string;
  projectId: string;
  name: string;
  seed: string | null;
  version: number;
  constraints: unknown[];
  exemplars: unknown[];
  comparisons: unknown[];
  promptSummary: string | null;
  metadata: {
    createdAt: string | null;
    updatedAt: string | null;
    exportedAt: string;
    version: string;
  };
}

/** Minimal profile export format (for inference). */
export interface ExportMinimalResult {
  id: string;
  name: string;
  seed: string | null;
  snapshot: {
    promptSummary: string | null;
    exemplarCount: number;
    comparisonCount: number;
    constraintCount: number;
  };
  exportedAt: string;
}

export type ExportFormat = 'json' | 'minimal';

export interface ProfileListResponse {
  profiles: Profile[];
}

export interface APIError {
  error: string;
  message: string;
}
