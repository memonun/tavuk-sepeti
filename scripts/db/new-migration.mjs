// Create the next migration file with a version that is guaranteed to sort last.
//
//   pnpm db:new <kisa_isim>        e.g.  pnpm db:new musteri_notlari
//
// Why a generator: two branches cut on the same day pick the same timestamp by hand, and the
// history table keys on the version alone — the second file is then silently never applied
// (agenda_tasks, 7 Ekim). The version here is max(existing)+1 second, or "now", whichever is later.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DIR = "supabase/migrations";

const TR = { ç: "c", ğ: "g", ı: "i", i̇: "i", ö: "o", ş: "s", ü: "u", Ç: "c", Ğ: "g", İ: "i", I: "i", Ö: "o", Ş: "s", Ü: "u" };

export function slugify(name) {
  return name
    .replace(/[çğıöşüÇĞİIÖŞÜ]/g, (c) => TR[c] ?? c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function format(date) {
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return (
    `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}`
  );
}

function parse(version) {
  const [, y, mo, d, h, mi, s] = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(version) ?? [];
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
}

export function nextVersion(existingVersions, now = new Date()) {
  const latest = existingVersions.filter((v) => /^\d{14}$/.test(v)).sort().pop();
  const nowVersion = format(now);
  if (!latest || nowVersion > latest) return nowVersion;
  return format(new Date(parse(latest).getTime() + 1000));
}

export function template(slug) {
  return `-- ${slug}
--
-- Ne yapıyor ve NEDEN? (Bir sonraki kişi için 2-3 cümle yaz.)
--
-- Kurallar (CLAUDE.md §7) — bu dosyayı bitirmeden kontrol et:
--   * Yeni tablo: alttaki RLS + grant satırlarının yorumunu aç, <tablo> yerine adı yaz.
--   * Para: kuruş, bigint/numeric (float yok).  Tarih/saat: timestamptz.
--   * Foreign key: on delete cascade | restrict | set null — AÇIKÇA yaz.
--   * Mevcut bir fonksiyonun imzasını değiştirme; yeni parametreyi "default null" ile ekle.
--   * Mevcut bir tabloyu/kolonu silme veya yeniden adlandırma: önce kodu geçir, silmeyi sonraki PR'da yap.

-- create table <tablo> (
--   id uuid primary key default gen_random_uuid(),
--   created_at timestamptz not null default now()
-- );
--
-- alter table <tablo> enable row level security;
-- create policy <tablo>_admin_all on <tablo>
--   for all to authenticated
--   using ((select is_admin()))
--   with check ((select is_admin()));
-- grant select, insert, update, delete on table public.<tablo> to authenticated;
`;
}

function main() {
  const raw = process.argv.slice(2).join(" ").trim();
  const slug = slugify(raw);
  if (!slug) {
    process.stderr.write("Kullanım: pnpm db:new <kisa_isim>   (örn. pnpm db:new musteri_notlari)\n");
    process.exit(1);
  }
  const versions = fs
    .readdirSync(DIR)
    .map((f) => /^(\d{14})_/.exec(f)?.[1])
    .filter(Boolean);
  const version = nextVersion(versions);
  const file = `${version}_${slug}.sql`;
  fs.writeFileSync(path.join(DIR, file), template(slug), { flag: "wx" });
  process.stdout.write(`Oluşturuldu: ${DIR}/${file}\nİçini doldur, sonra PR aç; "DB Kontrol" otomatik çalışır.\n`);
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] ?? "")).href) main();
