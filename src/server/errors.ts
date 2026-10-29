/** Domain error whose message is safe to show to the user. */
export class UserError extends Error {}

export class NotFoundError extends UserError {
  constructor(what = "Eintrag") {
    super(`${what} wurde nicht gefunden.`);
  }
}
