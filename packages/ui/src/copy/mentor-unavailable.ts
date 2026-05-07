/**
 * Mentor-unavailable copy. Used when the mentor service is down or degraded.
 * Distinct from mentor-refusal (which is a policy decision, not a system fault).
 */

export interface MentorUnavailableCopy {
  title: string;
  body: string;
  degradeCta: string;
}

export function mentorUnavailable(): MentorUnavailableCopy {
  return {
    title: "Mentor is offline.",
    body: "We cannot reach the mentor service right now. Hint, clarify, review-draft, and explain-branch modes will return shortly. Your draft is saved.",
    degradeCta: "Continue without mentor",
  };
}
