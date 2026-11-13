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

  for await (const chunk of next(step)) {
    try {
      const piece = chunk as Piece
      const size = sizeOf(piece)

      if (size > 0) {
        const fed = feed(meter, await ports.now(), size)

        meter = fed.meter
        if (fed.rate !== null) {
          await session.showSpeed(ports, fed.rate)
        }
      } else if (piece.kind === 'stop') {
        const usage = typeof piece.usage === 'object' && piece.usage !== null ? (piece.usage as { output_tokens?: unknown }) : {}
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
}
