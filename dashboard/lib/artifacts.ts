import path from 'node:path';
import { getServerDataApiBase } from './dataSource';

const ARTIFACTS_ROOT =
  process.env.DATA_DIR ?? path.resolve(process.cwd(), '..', 'artifacts');

export function buildArtifactUrl(fullPath: string | null | undefined) {
  if (!fullPath) return '#';
  const normalized = path.normalize(fullPath);
  const relative = path.relative(ARTIFACTS_ROOT, normalized);
  if (relative.startsWith('..')) {
    return '#';
  }
  const encoded = relative
    .split(path.sep)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const remoteBase = getServerDataApiBase();
  if (remoteBase) {
    return `${remoteBase}/artifacts/${encoded}`;
  }
  return `/api/artifacts/${encoded}`;
}
