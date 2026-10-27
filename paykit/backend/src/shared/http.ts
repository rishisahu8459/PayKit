import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

export const json = (statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export const parse = (body?: string | null): Record<string, any> => {
  try { return JSON.parse(body ?? '{}'); } catch { return {}; }
};

/** HTTP API lowercases header names, so look up in lowercase. */
export const header = (e: APIGatewayProxyEventV2, name: string): string | undefined =>
  e.headers?.[name.toLowerCase()];

/** Structured logs. Never log secrets or card data. */
export const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ msg, ...extra }));
