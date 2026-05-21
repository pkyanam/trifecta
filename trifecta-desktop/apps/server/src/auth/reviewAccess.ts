import type { ServerConfigShape } from "../config.ts";
import type { AuthenticatedSession } from "./Services/ServerAuth.ts";

export const REVIEW_BOOTSTRAP_SUBJECT = "review-bootstrap";
export const REVIEW_ACCESS_DENIED_MESSAGE =
  "This app-review session cannot use administrative server capabilities.";

export function isReviewSession(
  session: Pick<AuthenticatedSession, "subject">,
  config: Pick<ServerConfigShape, "reviewPairingToken">,
): boolean {
  return config.reviewPairingToken !== undefined && session.subject === REVIEW_BOOTSTRAP_SUBJECT;
}
