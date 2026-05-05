interface PlaceholderPageProps {
  title: string;
  description: string;
  sprint: string;
}

/**
 * Generic placeholder for admin sub-pages whose real implementation lives
 * in a later sprint. Keeps sidebar nav links resolving (no 404s) while
 * making the deferred state explicit.
 */
export function PlaceholderPage({ title, description, sprint }: PlaceholderPageProps) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
        {`${sprint}'da gelecek.`}
      </div>
    </div>
  );
}
