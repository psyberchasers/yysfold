const normalizeBase = (value?: string | null): string | null => {
  if (!value) return null;
  return value.replace(/\/+$/, '');
};

export function getServerDataApiBase(): string | null {
  return normalizeBase(process.env.DATA_API_URL ?? process.env.NEXT_PUBLIC_DATA_API_URL ?? null);
}

export function getClientDataApiBase(): string | null {
  return normalizeBase(process.env.NEXT_PUBLIC_DATA_API_URL ?? null);
}

export function isRemoteDataEnabled(): boolean {
  return Boolean(getServerDataApiBase());
}

export async function fetchFromDataApi<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getServerDataApiBase();
  if (!base) {
    throw new Error('Data API base URL is not configured');
  }
  const url = buildUrl(base, path);
  const response = await fetch(url, {
    cache: 'no-store',
    ...init,
  });
  if (!response.ok) {
    throw new Error(`Data API request failed (${response.status} ${response.statusText})`);
  }
  return (await response.json()) as T;
}

export function buildDataApiUrl(path: string): string {
  const base = getServerDataApiBase();
  if (!base) {
    throw new Error('Data API base URL is not configured');
  }
  return buildUrl(base, path);
}

function buildUrl(base: string, path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}



