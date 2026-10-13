export const RECIPIENT_RPC_PAGE_SIZE = 500

export interface CollectPagedRowsOptions {
  pageSize?: number
  /** Optional caller-owned safety ceiling. There is no default product row cap. */
  maxRows?: number
}

export async function collectPagedRows<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  options: CollectPagedRowsOptions = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? RECIPIENT_RPC_PAGE_SIZE
  const maxRows = options.maxRows

  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new Error('Recipient RPC page size must be an integer between 1 and 1000.')
  }
  if (maxRows !== undefined && (!Number.isInteger(maxRows) || maxRows < 1)) {
    throw new Error('Recipient RPC maximum row count must be a positive integer when provided.')
  }

  const rows: T[] = []
  let from = 0

  while (true) {
    const page = await fetchPage(from, from + pageSize - 1)
    if (!Array.isArray(page)) throw new Error('Recipient RPC page returned an invalid payload.')
    if (page.length > pageSize) throw new Error('Recipient RPC page exceeded the requested page size.')
    if (maxRows !== undefined && rows.length + page.length > maxRows) {
      throw new Error(`Recipient RPC returned more than the caller safety ceiling of ${maxRows.toLocaleString()} rows.`)
    }

    rows.push(...page)

    if (page.length < pageSize) return rows
    from += pageSize
  }
}
