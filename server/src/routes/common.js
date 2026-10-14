import { readJson } from '../http.js'

// Reads the JSON body into ctx.body (default limit 100 KB).
export const json = (maxBytes = 100 * 1024) => async (ctx) => {
  ctx.body = await readJson(ctx.req, maxBytes)
}
