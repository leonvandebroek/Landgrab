import type {
  MapTemplate,
  MapTemplateDetail,
  CreateMapTemplateRequest,
  UpdateMapTemplateRequest,
} from '../types/game';

const BASE = '/api/map-templates';

function authHeaders(token: string): Record<string, string> {
  const normalizedToken = token.trim();
  return normalizedToken ? { Authorization: `Bearer ${normalizedToken}` } : {};
}

function jsonHeaders(token: string): Record<string, string> {
  return { ...authHeaders(token), 'Content-Type': 'application/json' };
}

async function ensureOk(res: Response): Promise<void> {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Request failed with status ${res.status}`);
  }
}

export async function listMapTemplates(token: string): Promise<MapTemplate[]> {
  const res = await fetch(BASE, {
    credentials: 'include',
    headers: authHeaders(token),
  });
  await ensureOk(res);
  return res.json() as Promise<MapTemplate[]>;
}

export async function getMapTemplate(token: string, id: string): Promise<MapTemplateDetail> {
  const res = await fetch(`${BASE}/${id}`, {
    credentials: 'include',
    headers: authHeaders(token),
  });
  await ensureOk(res);
  return res.json() as Promise<MapTemplateDetail>;
}

export async function createMapTemplate(
  token: string,
  data: CreateMapTemplateRequest,
): Promise<MapTemplateDetail> {
  const res = await fetch(BASE, {
    method: 'POST',
    credentials: 'include',
    headers: jsonHeaders(token),
    body: JSON.stringify(data),
  });
  await ensureOk(res);
  return res.json() as Promise<MapTemplateDetail>;
}

export async function updateMapTemplate(
  token: string,
  id: string,
  data: UpdateMapTemplateRequest,
): Promise<MapTemplateDetail> {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: jsonHeaders(token),
    body: JSON.stringify(data),
  });
  await ensureOk(res);
  return res.json() as Promise<MapTemplateDetail>;
}

export async function deleteMapTemplate(token: string, id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: authHeaders(token),
  });
  await ensureOk(res);
}

export async function duplicateMapTemplate(
  token: string,
  id: string,
): Promise<MapTemplateDetail> {
  const res = await fetch(`${BASE}/${id}/duplicate`, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders(token),
  });
  await ensureOk(res);
  return res.json() as Promise<MapTemplateDetail>;
}
