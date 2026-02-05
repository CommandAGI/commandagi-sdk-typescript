import type {
  CommandAGIConfig,
  Profile,
  ProfileCreateParams,
  ProfileUpdateParams,
  ProfileListResponse,
  EvalParams,
  EvalResult,
  ExportFormat,
  ExportFullResult,
  ExportMinimalResult,
  APIError,
} from './types';

const DEFAULT_BASE_URL = 'https://commandagi.com';

export class CommandAGI {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: CommandAGIConfig) {
    if (!config.apiKey) {
      throw new Error('API key is required');
    }
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'commandagi-node/0.1.0',
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      const error = data as APIError;
      throw new Error(error.message || error.error || `API error: ${response.status}`);
    }

    return data as T;
  }

  profiles = {
    /**
     * Create a new taste profile.
     * Requires a projectId and name.
     */
    create: async (params: ProfileCreateParams): Promise<Profile> => {
      return this.request<Profile>('POST', '/api/v1/profiles', params);
    },

    /**
     * Get a profile by ID.
     * Returns the full profile including constraints, exemplars, and comparisons.
     */
    get: async (id: string): Promise<Profile> => {
      return this.request<Profile>('GET', `/api/v1/profiles/${id}`);
    },

    /**
     * Update a profile. Only provided fields are updated.
     */
    update: async (id: string, params: ProfileUpdateParams): Promise<Profile> => {
      return this.request<Profile>('PATCH', `/api/v1/profiles/${id}`, params);
    },

    /**
     * Delete a profile.
     */
    delete: async (id: string): Promise<void> => {
      await this.request<{ success: boolean }>('DELETE', `/api/v1/profiles/${id}`);
    },

    /**
     * List all profiles. Optionally filter by projectId.
     */
    list: async (projectId?: string): Promise<Profile[]> => {
      const path = projectId
        ? `/api/v1/profiles?projectId=${projectId}`
        : '/api/v1/profiles';
      const resp = await this.request<ProfileListResponse>('GET', path);
      return resp.profiles;
    },

    /**
     * Evaluate content against a profile.
     * Returns a score (0-1), confidence (0-1), and scoring details.
     */
    eval: async (id: string, params: EvalParams): Promise<EvalResult> => {
      return this.request<EvalResult>('POST', `/api/v1/profiles/${id}/eval`, params);
    },

    /**
     * Export a profile in full JSON format.
     */
    export: async (id: string): Promise<ExportFullResult> => {
      return this.request<ExportFullResult>(
        'GET',
        `/api/v1/profiles/${id}/export?format=json`
      );
    },

    /**
     * Export a profile in minimal format (for inference).
     */
    exportMinimal: async (id: string): Promise<ExportMinimalResult> => {
      return this.request<ExportMinimalResult>(
        'GET',
        `/api/v1/profiles/${id}/export?format=minimal`
      );
    },
  };
}
