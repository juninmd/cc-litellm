import { utcDay } from '../hooks/format'
import type { Reply } from '../hooks/litellm'
import { NOW, reply } from './support'

type Shares = Record<string, number>

/**
 * A `/user/daily/activity` answer: one day for each value, ending on the day of NOW, oldest first. A day that spent
 * nothing is left out, as the proxy does. The models split a day by `shares` (a function of the day's place, to let it
 * change over time).
 */
export const activity = (
  spends: readonly number[],
  shares: Shares | ((at: number) => Shares) = { 'claude-sonnet-4-5': 0.75, 'claude-opus-4-1': 0.25 },
): Reply =>
  reply(200, {
    results: spends.flatMap((spend, at) => {
      if (!(spend > 0)) {
        return []
      }
      const split = typeof shares === 'function' ? shares(at) : shares
      const requests = Math.round(spend * 10)

      return [
        {
          date: utcDay(NOW, spends.length - 1 - at),
          metrics: {
            spend,
            api_requests: requests,
            failed_requests: 0,
            total_tokens: spend * 1000,
            prompt_tokens: spend * 800,
            completion_tokens: spend * 200,
            cache_read_input_tokens: spend * 500,
          },
          breakdown: {
            models: Object.fromEntries(
              Object.entries(split).map(([model, share]) => [
                model,
                {
                  metrics: {
                    spend: spend * share,
                    api_requests: Math.round(requests * share),
                    total_tokens: spend * 1000 * share,
                  },
                },
              ]),
            ),
          },
        },
      ]
    }),
  })

/** What `/health/readiness` answers on a proxy that has a database. */
export const health = (version = '1.77.0', db = 'connected'): Reply =>
  reply(200, { status: 'healthy', db, cache: null, litellm_version: version, success_callbacks: [] })
