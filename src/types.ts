export interface CommandAGIConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface Profile {
  id: string;
  name: string;
  version: string;
  branch: string;
  createdAt: string;
  updatedAt: string;
  stats: {
    totalLabels: number;
    totalComparisons: number;
    dimensions: string[];
  };
  scoring: {
    model: string;
    confidence: number;
  };
}

export interface ProfileCreateParams {
  name: string;
  description?: string;
}

export interface ProfileUpdateParams {
  name?: string;
  description?: string;
}

export interface EvalParams {
  frameUrl: string;
  dimensions?: string[];
}

export interface EvalResult {
  score: number;
  confidence: number;
  dimensions?: Record<string, number>;
}

export interface Frame {
  id: string;
  url: string;
  projectId: string;
  createdAt: string;
}

export interface FrameUploadParams {
  url?: string;
  file?: Buffer;
  contentType?: string;
}

export type ExportFormat = 'full' | 'minimal' | 'bradley-terry';

export interface ExportResult {
  profile: Profile;
  labels?: Array<{
    frameId: string;
    label: 'good' | 'bad';
    timestamp: string;
  }>;
  comparisons?: Array<{
    winnerId: string;
    loserId: string;
    timestamp: string;
  }>;
  model?: {
    type: string;
    parameters: Record<string, number>;
  };
}

export interface APIError {
  error: string;
  message: string;
  status: number;
}
