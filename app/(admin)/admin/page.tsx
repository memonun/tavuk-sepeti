export default function DashboardHome() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Panel</h2>
        <p className="text-sm text-muted-foreground">
          Hoş geldin. Müşteri, sipariş ve teslimat modülleri sıradaki sprintlerde gelecek.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[
          { title: "Bugünkü teslimat", value: "—" },
          { title: "Bekleyen sipariş", value: "—" },
          { title: "Aktif müşteri", value: "—" },
        ].map((card) => (
          <div
            key={card.title}
            className="rounded-lg border bg-card p-4 text-card-foreground"
          >
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {card.title}
            </p>
            <p className="mt-2 text-2xl font-semibold">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
