/** A member is in the Growth Program once a sponsor is bound, or they are an
 * admin/root who historically sits at the top of the matrix without one. */
export function isGrowthParticipant(member: {
  sponsor_user_id: string | null;
  role: string;
} | null | undefined): boolean {
  if (!member) return false;
  return Boolean(member.sponsor_user_id) || member.role === "admin";
}

export const GROWTH_PROGRAM_PATH = "/growth-program";

/** Only this internal path is accepted as a post-auth return destination. */
export function safeGrowthReturn(next: unknown): typeof GROWTH_PROGRAM_PATH | undefined {
  return next === GROWTH_PROGRAM_PATH ? GROWTH_PROGRAM_PATH : undefined;
}
