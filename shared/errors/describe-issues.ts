/**
 * Every validation message, not just the first.
 *
 * A form that answers "Ad gerekli." fixes one field per submit, so a customer
 * with three empty fields learned about them one refusal at a time. Joining the
 * schema's own messages — already written for the customer, one sentence each —
 * names everything at once. Duplicates (two paths with the same rule) collapse.
 */
export function describeIssues(
  issues: ReadonlyArray<{ readonly message: string }>,
  fallback: string,
): string {
  const messages = [...new Set(issues.map((issue) => issue.message.trim()))].filter(
    (message) => message !== "",
  );
  return messages.length > 0 ? messages.join(" ") : fallback;
}
