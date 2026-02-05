import type {
  CommandAGIConfig,
  Profile,
  ProfileCreateParams,
  ProfileUpdateParams,
  EvalParams,
  EvalResult,
  ExportFormat,
  ExportResult,
  APIError,
} from './types';

const DEFAULT_BASE_URL = 'https://api.commandagi.com';

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
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      const error = data as APIError;
      throw new Error(error.message || `API error: ${response.status}`);
    }

    return data as T;
  }

  // Profiles
  profiles = {
    create: async (params: ProfileCreateParams): Promise<Profile> => {
      return this.request<Profile>('POST', '/v1/profiles', params);
    },

    get: async (id: string): Promise<Profile> => {
      return this.request<Profile>('GET', `/v1/profiles/${id}`);
    },

    update: async (id: string, params: ProfileUpdateParams): Promise<Profile> => {
      return this.request<Profile>('PATCH', `/v1/profiles/${id}`, params);
    },

    delete: async (id: string): Promise<void> => {
      await this.request<void>('DELETE', `/v1/profiles/${id}`);
    },

    list: async (): Promise<Profile[]> => {
      return this.request<Profile[]>('GET', '/v1/profiles');
    },

    eval: async (id: string, params: EvalParams): Promise<EvalResult> => {
      return this.request<EvalResult>('POST', `/v1/profiles/${id}/eval`, params);
    },

    export: async (
      id: string,
      format: ExportFormat = 'full'
    ): Promise<ExportResult> => {
      return this.request<ExportResult>(
        'GET',
        `/v1/profiles/${id}/export?format=${format}`
      );
    },
  };
}
