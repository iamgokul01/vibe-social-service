export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pageCount: number;
}

export const paginate = <T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> => ({
  items,
  total,
  page,
  limit,
  pageCount: Math.max(1, Math.ceil(total / limit)),
});
