export const RECIPIENT_RPC_PAGE_SIZE = 500
export const MAX_RECIPIENT_ROWS = 5000

export interface CollectPagedRowsOptions {
  pageSize?: number
  maxRows?: number
}

export async function collectPagedRows<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  options: CollectPagedRowsOptions = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? RECIPIENT_RPC_PAGE_SIZE
  const maxRows = options.maxRows ?? MAX_RECIPIENT_ROWS

  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new Error('Recipient RPC page size must be an integer between 1 and 1000.')
  }
  if (!Number.isInteger(maxRows) || maxRows < 1) {
    throw new Error('Recipient RPC maximum row count must be a positive integer.')
  }

  const rows: T[] = []
  let from = 0

  while (true) {
    const page = await fetchPage(from, from + pageSize - 1)
    if (!Array.isArray(page)) throw new Error('Recipient RPC page returned an invalid payload.')
    if (page.length > pageSize) throw new Error('Recipient RPC page exceeded the requested page size.')
    if (rows.length + page.length > maxRows) {
      throw new Error(`Recipient RPC returned more than the supported ${maxRows.toLocaleString()} rows.`)
    }

    rows.push(...page)

    if (page.length < pageSize) return rows
    from += pageSize
  }
}
