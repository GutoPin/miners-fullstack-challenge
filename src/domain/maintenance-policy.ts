/**
 * Maintenance threshold policy (rule 2).
 *
 * The next cycle is anchored to the previous threshold, not to the hourmeter reading at
 * service time. Counting from the real reading would push the window forward on every
 * delay, so a year of small delays would silently cost the machine whole services.
 * Anchoring keeps a delay an isolated, measurable event instead of accumulated debt.
 */

export interface NextThreshold {
  /** absolute hourmeter value that blocks the equipment again */
  next: number;
  /** hours past the threshold on arrival, 0 when serviced on time */
  overdue: number;
  /** true when the delay ate a whole cycle and the anchor had to skip forward */
  reAnchored: boolean;
}

export function nextThreshold(
  previousThreshold: number, // threshold that was due, e.g. 250
  hoursAtService: number, // real hourmeter at service, e.g. 280
  interval: number, // 250
): NextThreshold {
  const overdue = Math.max(0, hoursAtService - previousThreshold);
  let next = previousThreshold + interval; // 500, not 530

  // guard: a delay past a full cycle would leave the workshop already blocked
  const reAnchored = next <= hoursAtService;
  if (reAnchored) {
    next =
      previousThreshold +
      Math.ceil((hoursAtService - previousThreshold + 1) / interval) * interval;
  }

  return { next, overdue, reAnchored };
}
