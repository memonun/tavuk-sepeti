// Rules about WHICH migration files a change touches (as opposed to what is inside them).
// Pure: callers pass lists of file names, so it is testable without git.

const VERSION_RE = /^(\d+)_/;

export function versionOf(file) {
  return VERSION_RE.exec(file)?.[1] ?? null;
}

/**
 * @param {{ added: string[], modified: string[], deleted: string[], renamed: Array<{from:string,to:string}>, existing: string[] }} change
 *   `existing` = migration file names that were already on the base branch.
 */
export function checkChangeset({ added, modified, deleted, renamed = [], existing }) {
  const findings = [];

  // Already-merged migrations are history. Editing one makes the repo disagree with
  // every database that already ran the old text — and the history table cannot tell.
  for (const file of modified) {
    findings.push({
      level: "error",
      code: "modified-existing",
      file,
      line: 1,
      detail: `"${file}" daha önce yayınlanmış bir migration. Eski dosya değiştirilmez; veritabanında zaten çalıştığı için yapılan değişiklik hiçbir yerde uygulanmaz. Değişikliği yeni bir migration olarak yaz (pnpm db:new).`,
    });
  }
  for (const file of deleted) {
    findings.push({
      level: "error",
      code: "deleted-existing",
      file,
      line: 1,
      detail: `"${file}" silinmiş. Yayınlanmış migration'lar silinmez; veritabanı geçmişi ile repo ayrışır. Geri almak istediğin şey için yeni bir migration yaz.`,
    });
  }
  for (const { from, to } of renamed) {
    findings.push({
      level: "error",
      code: "renamed-existing",
      file: to,
      line: 1,
      detail: `"${from}" → "${to}" yeniden adlandırılmış. Sürüm numarası veritabanı geçmişinin anahtarı; değişirse migration iki kez çalışmaya çalışır. Dosyayı eski adıyla bırak.`,
    });
  }

  // Versions are the primary key of the migration history: two files with one version
  // are ONE migration to it, and the second is silently never run (7 Ekim: agenda_tasks).
  const seen = new Map();
  for (const file of [...existing.filter((f) => !deleted.includes(f)), ...added]) {
    const v = versionOf(file);
    if (v === null) continue;
    seen.set(v, [...(seen.get(v) ?? []), file]);
  }
  for (const files of seen.values()) {
    if (files.length > 1 && files.some((f) => added.includes(f))) {
      findings.push({
        level: "error",
        code: "duplicate-version",
        file: files.find((f) => added.includes(f)) ?? files[0],
        line: 1,
        detail: `Aynı sürüm numarasını paylaşan dosyalar var: ${files.join(" ⇄ ")}. Sadece biri çalışır, diğeri sessizce atlanır. Yeni olanı pnpm db:new ile yeniden oluştur.`,
      });
    }
  }

  // A new migration must sort AFTER everything already merged. A parallel branch that
  // was cut earlier would otherwise slot "into the past", which `db push` refuses (or,
  // with --include-all, applies out of order).
  const maxExisting = existing
    .filter((f) => !deleted.includes(f))
    .map(versionOf)
    .filter(Boolean)
    .sort()
    .pop();
  if (maxExisting) {
    for (const file of added) {
      const v = versionOf(file);
      if (v && v <= maxExisting && !seen.get(v)?.some((f) => f !== file)) {
        findings.push({
          level: "error",
          code: "version-not-newer",
          file,
          line: 1,
          detail: `"${file}" main'deki en yeni migration'dan (${maxExisting}) eski bir tarihle başlıyor. Yeni migration'lar sona eklenir. Dosyayı pnpm db:new ile yeniden oluştur (içeriği kopyala).`,
        });
      }
    }
  }

  return findings;
}
