// Identity seam: "who am I right now".
//
// Previously this resolved from a demo persona cookie (jw_actor). It is now a tiny
// synchronous shim over the real signed session cookie (lib/auth). Keeping the
// function name and sync signature means every page / route handler that calls
// getActorId() keeps compiling untouched — the whole trust model lives in auth.ts.
//
// Returns "" when there is no valid session. Callers that need a logged-in user
// treat "" as "not authenticated" and redirect / 401.
import { getSessionUserId } from './auth'

export function getActorId(): string {
  return getSessionUserId() || ''
}
