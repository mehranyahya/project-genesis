export interface DataApiBudget {
  bytesRemaining: number;
  requestsRemaining: number;
}

export function createDataApiBudget(options?: {
  maxBytes?: number;
  maxRequests?: number;
}): DataApiBudget;

export function readPaginatedRows<T extends Record<string, unknown>>(
  requestPage: (headers: Readonly<Record<string, string>>) => Promise<Response>,
  columns: readonly string[],
  options?: {
    budget?: DataApiBudget;
    pageSize?: number;
    maxRows?: number;
    maxPageBytes?: number;
  },
): Promise<T[]>;
