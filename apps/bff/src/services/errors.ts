/**
 * Domain errors thrown by the service layer. Kept free of imports so route
 * tests can reference them without pulling in Knex or other side effects.
 */

/**
 * Thrown when a write targets an event id that already exists under a
 * different space. Event metadata is keyed on the calendar event id alone,
 * so without this check a member of one space could overwrite another
 * space's agenda simply by knowing the id.
 */
export class EventSpaceMismatchError extends Error {
  constructor(eventId: string) {
    super(`Event ${eventId} belongs to a different space`);
    this.name = "EventSpaceMismatchError";
  }
}
