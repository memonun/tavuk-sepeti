-- DENEME: proje kurallarını çiğniyor.
create table drill_bad (
  id uuid primary key default gen_random_uuid(),
  parent uuid references customers(id),
  at timestamp
);
