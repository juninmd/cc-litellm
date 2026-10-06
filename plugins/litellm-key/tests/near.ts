import { expect } from 'claude-code/testing'

/** The test kit has no toBeCloseTo: a number is near another when it is within `tolerance` of it. */
export const near = (received: number | null | undefined, expected: number, tolerance = 1e-6): void => {
  expect(Math.abs((received ?? Number.NaN) - expected) <= tolerance, `${received} is not within ${tolerance} of ${expected}`).toBe(true)
}
