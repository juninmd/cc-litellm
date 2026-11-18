import type { Session } from './session'
import type { Ports } from './ports'
import { feed, newMeter, settle } from './speed'

/** What the plugin reads of a piece of a model step: its kind and the text or json it carries, or the stop's usage. */
type Piece = { kind?: unknown; text?: unknown; json?: unknown; usage?: unknown }

const sizeOf = (piece: Piece): number => {
  const body = piece.kind === 'text' || piece.kind === 'thinking' ? piece.text : piece.kind === 'input' ? piece.json : undefined

  return typeof body === 'string' ? body.length : 0
}

/**
 * Stands in the stream of a model step and times it as it flows: every piece goes on unchanged, and the speed it
 * implies reaches the status line while the answer is still coming. A failure of the meter never touches the stream.
 */
export async function* liveSpeed<Step, Chunk>(
  session: Session,
  ports: Ports,
  step: Step,
  next: (step: Step) => AsyncIterable<Chunk>,
): AsyncGenerator<Chunk> {
  let meter = newMeter()
  const startedAt = await ports.now()
  // While the model is silent nothing else redraws the status line, so a timer counts the wait out loud.
  let timer: { cancel: () => void } | undefined

  try {
    await session.beginStep(ports)
    timer = ports.every?.(1000, () => void session.tickWait(ports).catch(() => undefined))
  } catch {
    // The status line is a courtesy; the answer is what matters.
  }

  try {
    for await (const chunk of next(step)) {
      try {
        const piece = chunk as Piece
        const size = sizeOf(piece)

        if (size > 0) {
          const now = await ports.now()

          if (meter.firstAt === null) {
            timer?.cancel()
            await session.endWait(ports, Math.max(0, now - startedAt))
          }
          const fed = feed(meter, now, size)

          meter = fed.meter
          if (fed.rate !== null) {
            await session.showSpeed(ports, fed.rate)
          }
        } else if (piece.kind === 'stop') {
          const usage = typeof piece.usage === 'object' && piece.usage !== null ? (piece.usage as { output_tokens?: unknown }) : {}

          await session.noteContext(ports, piece.usage)
          const done = settle(meter, usage.output_tokens)

          if (done) {
            await session.endStep(ports, done)
          }
        }
      } catch {
        // The status line is a courtesy; the answer is what matters.
      }
      yield chunk
    }
  } finally {
    // A step that ended or failed without a first piece is no longer waited for.
    timer?.cancel()
    await session.endWait(ports).catch(() => undefined)
  }
}
