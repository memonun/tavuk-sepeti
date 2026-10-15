/** "45 dk", "10 sa", "1 sa 30 dk": readable for long waits like yogurt. */
export function formatRecipeMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} sa` : `${hours} sa ${rest} dk`;
}
