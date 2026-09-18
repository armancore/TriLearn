const getPagination = (/** @type {Record<string, unknown>} */ query) => {
  const page = Math.max(1, parseInt(String(query.page), 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit), 10) || 20))
  if (typeof query.cursor === "string" && query.cursor) {
    return { cursor: query.cursor, take: limit }
  }

  const skip = (page - 1) * limit

  return { page, limit, skip }
}

const buildCursorMeta = (/** @type {{id: string}[]} */ items, /** @type {number} */ take) => ({
  nextCursor: items[items.length - 1]?.id ?? null,
  hasMore: items.length === take
})

module.exports = { getPagination, buildCursorMeta }
