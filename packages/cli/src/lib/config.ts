import Conf from 'conf';

export interface CliState {
  apiUrl?: string;
  token?: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
  email?: string;
  serverMinCliVersion?: string;
}

const store = new Conf<CliState>({
  projectName: 'researchcrafters',
  defaults: {},
});

export function getState(): CliState {
  return store.store;
}

export function setState(patch: Partial<CliState>): void {
  for (const [k, v] of Object.entries(patch) as [keyof CliState, CliState[keyof CliState]][]) {
    if (v === undefined) {
      store.delete(k);
    } else {
      store.set(k, v);
    }
  }
}

export function clearAuth(): void {
  store.delete('token');
  store.delete('refreshToken');
  store.delete('tokenExpiresAt');
  store.delete('email');
}

export function isLoggedIn(): boolean {
  const s = store.store;
  if (!s.token) return false;
  if (s.tokenExpiresAt && Date.now() >= s.tokenExpiresAt) return false;
  return true;
}

export interface LocalProjectConfig {
  apiUrl: string;
  packageSlug: string;
  packageVersionId: string;
  stageRef: string;
  lastRunId?: string;
  smokeCommand?: string;
}

export const PROJECT_CONFIG_PATH = '.researchcrafters/config.json';
