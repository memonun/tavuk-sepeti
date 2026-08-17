import { EmailConfirmed } from "@/features/storefront/ui/email-confirmed";
import { safeNextPath } from "@/shared/utils/next-path";

export default async function EmailConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <EmailConfirmed next={safeNextPath(next)} />;
}
