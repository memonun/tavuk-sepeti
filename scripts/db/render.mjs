// Builds the Markdown people actually read: the PR comment ("DB Kontrol") and the issue
// opened when a deploy stops ("DB Yayın"). Pure functions, tested.
//
// Tone rule: the reader may never have seen SQL. Say what happens, whether it can be
// undone, and what to do next — in that order, in plain Turkish.

import {
  DANGER_EXPLANATIONS,
  ERROR_TITLES,
  WARNING_TITLES,
  claudePrompt,
} from "./explain.mjs";

/**
 * Issue bodies are readable by every collaborator and persist forever. CLI/driver errors can echo
 * a connection string, so scrub every secret (and the password inside a URL) before writing text.
 */
export function redact(text, secrets) {
  let out = String(text ?? "");
  const candidates = new Set();
  for (const secret of secrets) {
    if (!secret) continue;
    candidates.add(secret);
    try {
      const url = new URL(secret);
      if (url.password) candidates.add(decodeURIComponent(url.password));
      if (url.password) candidates.add(url.password);
    } catch {
      // not a URL: the raw value above is all there is to hide
    }
  }
  // Longest first so a URL is replaced whole before its password fragment is.
  for (const value of [...candidates].sort((a, b) => b.length - a.length)) {
    if (value.length >= 4) out = out.split(value).join("***");
  }
  return out;
}

export const COMMENT_MARKER = "<!-- db-kontrol -->";
export const APPROVAL_LABEL = "db-onayli";

function tail(text, n) {
  return text.split("\n").filter((l) => l.trim() !== "").slice(-n).join("\n");
}

function where(f) {
  return f.file ? `\`${f.file}\`${f.line ? `, satır ${f.line}` : ""}` : "";
}

function dangerBlock(f) {
  const e = DANGER_EXPLANATIONS[f.code];
  if (!e) return `- **${f.code}** — ${where(f)}`;
  return [
    `#### ⚠️ ${e.baslik}`,
    `${where(f)}`,
    "",
    `- **Ne olur:** ${e.ne}`,
    `- **Geri dönüş:** ${e.geri}`,
    `- **Canlı siteye etkisi:** ${e.site}`,
    `- **Daha güvenli yol:** ${e.guvenli}`,
    ...(f.snippet ? ["", "```sql", f.snippet, "```"] : []),
  ].join("\n");
}

/**
 * @param {object} p
 * @param {number|null} p.prNumber
 * @param {{ errors: any[], dangers: any[], warnings: any[], added: string[], changed: number }} p.lint
 * @param {'success'|'failure'|'skipped'|'cancelled'} p.replay        fresh-database replay outcome
 * @param {{ pending: string[], orphans: string[] } | null} p.prod     null = not available
 * @param {boolean} p.approved                                          db-onayli label present
 * @param {string} [p.runUrl]
 */
export function renderPrComment({ prNumber, lint, replay, prod, approved, runUrl, replayLog = "" }) {
  const touchesDb = lint.changed > 0;
  const hasErrors = lint.errors.length > 0 || replay === "failure";
  const needsApproval = lint.dangers.length > 0 && !approved;

  let status;
  if (!touchesDb) status = "✅ Bu PR veritabanına dokunmuyor";
  else if (hasErrors) status = "❌ Düzeltilmesi gereken şeyler var";
  else if (needsApproval) status = "⛔ Tehlikeli değişiklik — onay bekliyor";
  else status = "✅ Veritabanı değişikliği güvenli görünüyor";

  const lines = [COMMENT_MARKER, `## 🗄️ DB Kontrol — ${status}`, ""];

  if (!touchesDb) {
    lines.push("Yapılacak bir şey yok. Merge edince site normal şekilde yayınlanır.");
  } else {
    lines.push(
      `Bu PR **${lint.added.length} yeni migration** ekliyor: ${lint.added.map((f) => `\`${f}\``).join(", ")}.`,
      "",
    );
  }

  if (lint.errors.length > 0) {
    lines.push("### ❌ Düzeltilmeli", "");
    for (const f of lint.errors) {
      lines.push(`- **${ERROR_TITLES[f.code] ?? f.code}** — ${where(f)}`, `  ${f.detail ?? ""}`);
    }
    lines.push(
      "",
      `> Claude'a şunu söylemen yeterli: *"${prNumber ? `#${prNumber} ` : ""}PR'ındaki DB Kontrol hatalarını düzelt."*`,
      "",
    );
  }

  if (lint.dangers.length > 0) {
    lines.push("### ⚠️ Tehlikeli değişiklikler", "");
    lines.push(
      approved
        ? `✅ \`${APPROVAL_LABEL}\` etiketi var: bu değişiklikler **onaylanmış**, yayın devam edebilir.`
        : "Bu değişiklikler yanlış giderse veri kaybı ya da kesinti yaratabilir, bu yüzden **kendiliğinden yayınlanmaz**. Önce neyin değiştiğini anla, sonra onay ver.",
      "",
    );
    for (const f of lint.dangers) lines.push(dangerBlock(f), "");
    if (!approved) {
      lines.push(
        "**Ne yapmalı?** Aşağıdaki cümleyi olduğu gibi Claude'a yapıştır. Sana sade Türkçeyle anlatacak, güvenli bir yol varsa önerecek. Sen *“onaylıyorum”* dersen etiketi o ekler:",
        "",
        "```text",
        claudePrompt({ prNumber }),
        "```",
        "",
      );
    }
  }

  if (touchesDb) {
    lines.push("### 🧪 Sıfırdan kurulum testi", "");
    lines.push(
      replay === "success"
        ? "✅ Bütün migration'lar boş bir veritabanına sorunsuz uygulandı ve her tabloda satır güvenliği (RLS) açık."
        : replay === "failure"
          ? `❌ Migration zinciri boş veritabanında çalışmadı veya bir tabloda güvenlik (RLS) açık değil.${runUrl ? ` Tam kayıt: [çalıştırma kaydı](${runUrl}).` : ""}`
          : "⏭️ Atlandı.",
      "",
    );
    if (replay === "failure" && replayLog.trim() !== "") {
      lines.push("<details><summary>Hatanın son satırları</summary>", "", "```text", tail(replayLog, 25), "```", "", "</details>", "");
    }

    if (prod && (hasErrors || needsApproval)) {
      lines.push(
        "### 🌐 Yayında ne olacak?",
        "",
        "Bu haliyle merge edilirse **“DB Yayın” migration kontrolünde durur**: veritabanı değişmez ve **site eski sürümde kalır** (müşteri etkilenmez), ama bu PR'ın yeni kodu da çıkmaz. Önce yukarıdakileri çöz.",
        "",
      );
    } else if (prod) {
      lines.push("### 🌐 Yayında ne olacak?", "");
      const mine = prod.pending.filter((f) => lint.added.includes(f));
      if (mine.length > 0) {
        lines.push(`Merge edilince **“DB Yayın”** otomatik çalışıp bunları canlı veritabanına uygular, **sonra** siteyi yayınlar:`, "");
        for (const f of mine) lines.push(`- \`${f}\``);
      } else {
        lines.push("Canlı veritabanında bekleyen bir şey görünmüyor.");
      }
      const strangers = prod.pending.filter((f) => !lint.added.includes(f));
      if (strangers.length > 0) {
        lines.push("", `ℹ️ Ayrıca başka yerden gelen ve henüz uygulanmamış migration'lar da var: ${strangers.map((f) => `\`${f}\``).join(", ")}.`);
      }
      if (prod.orphans.length > 0) {
        lines.push(
          "",
          `⚠️ Canlı veritabanında kayıtlı ama repoda dosyası olmayan sürümler var: ${prod.orphans.map((v) => `\`${v}\``).join(", ")}. Biri elle SQL çalıştırmış olabilir; geçmişle gerçek şema ayrışmış olabilir.`,
        );
      }
      lines.push("");
    }
  }

  if (lint.warnings.length > 0) {
    lines.push("<details><summary>Uyarılar (" + lint.warnings.length + ") — yayını engellemez</summary>", "");
    for (const f of lint.warnings) {
      lines.push(`- **${WARNING_TITLES[f.code] ?? f.code}** — ${where(f)}: ${f.detail ?? ""}`);
    }
    lines.push("", "</details>", "");
  }

  lines.push(
    "---",
    `<sub>Bu yorum her güncellemede kendini yeniler.${runUrl ? ` [Kayıt](${runUrl})` : ""}</sub>`,
  );
  return lines.join("\n");
}

const STAGE_TEXT = {
  lint: {
    ad: "Migration kontrolü",
    db: false,
    site: "Veritabanına dokunulmadı, site yayınlanmadı. Site eski sürümde çalışıyor; müşteriler etkilenmedi.",
    yap: "Migration'daki sorunu düzelt (ya da tehlikeli değişikliği onayla) ve yeni bir PR ile yolla; ya da aşağıdaki cümleyi Claude'a ver.",
  },
  durum: {
    ad: "Veritabanı durumu okunamadı",
    db: false,
    site: "Veritabanına dokunulmadı, site yayınlanmadı. Site eski sürümde çalışıyor.",
    yap: "Genellikle geçici bir bağlantı sorunu. 'Run workflow' ile yeniden dene; sürerse SUPABASE_DB_URL secret'ını kontrol et.",
  },
  "tekrar-oynatma": {
    ad: "Sıfırdan kurulum testi",
    db: false,
    site: "Veritabanına dokunulmadı, site yayınlanmadı. Site eski sürümde çalışıyor.",
    yap: "Birleşen değişiklikler birbirini bozmuş olabilir. Hata kaydını Claude'a ver, düzeltsin.",
  },
  "on-deneme": {
    ad: "Canlı veritabanında ön-deneme",
    db: false,
    site: "Ön-deneme tamamen geri alındı: veritabanında HİÇBİR değişiklik yok, site yayınlanmadı. Site eski sürümde çalışıyor.",
    yap: "Migration canlı şemaya uymuyor. Hata kaydını Claude'a ver, düzeltsin.",
  },
  uygula: {
    ad: "Migration'ı uygulama",
    db: "belirsiz",
    site: "Site yayınlanmadı; eski sürümde çalışıyor. Veritabanında kısmen değişiklik olmuş olabilir (her dosya kendi içinde bütündür, yarım kalmaz).",
    yap: "ÖNCE hangi migration'ların uygulandığını kontrol et. Hata kaydını Claude'a ver ve 'veritabanı durumunu önce kontrol et' de.",
  },
  dogrula: {
    ad: "Uygulama sonrası doğrulama",
    db: true,
    site: "Migration uygulandı ama doğrulama başarısız; site yayınlanmadı (eski sürümde çalışıyor).",
    yap: "Hata kaydını Claude'a ver. Yeni şema ile eski kod uyumluysa 'Run workflow' ile yayını tekrar dene.",
  },
  yayinla: {
    ad: "Siteyi yayınlama",
    db: true,
    site: "Veritabanı GÜNCELLENDİ ama yeni kod yayınlanamadı; site eski kodla yeni şemada çalışıyor.",
    yap: "Çoğu zaman 'Run workflow' ile tekrar denemek yeter. Olmazsa Vercel panelinden son commit'i elle yayınla.",
  },
};

export function renderFailureIssue({ stage, sha, runUrl, message, prNumbers = [], secrets = [] }) {
  const s = STAGE_TEXT[stage] ?? {
    ad: stage,
    db: "belirsiz",
    site: "Site durumu belirsiz; Vercel panelinden bakın.",
    yap: "Hata kaydını Claude'a ver.",
  };
  const dbText = s.db === true ? "**Evet**, veritabanı güncellendi." : s.db === false ? "**Hayır**, veritabanı değişmedi." : "**Belirsiz** — kontrol edilmeli.";
  return [
    `## 🚨 Yayın durdu: ${s.ad}`,
    "",
    `- **Commit:** \`${(sha ?? "").slice(0, 7)}\`${prNumbers.length ? ` (PR ${prNumbers.map((n) => `#${n}`).join(", ")})` : ""}`,
    `- **Veritabanı değişti mi?** ${dbText}`,
    `- **Site şu an:** ${s.site}`,
    "",
    "### Ne oldu",
    "```text",
    redact(message ?? "Ayrıntı için çalıştırma kaydına bakın.", secrets).slice(0, 3000),
    "```",
    "",
    "### Ne yapmalı",
    s.yap,
    "",
    "Claude'a yapıştır:",
    "```text",
    `GitHub'daki "DB Yayın" hatasını incele (${runUrl}). Ne olduğunu hiç teknik bilmeyen birine anlatır gibi sade Türkçe açıkla, veritabanının ve sitenin şu anki durumunu doğrula, sonra düzeltmeyi öner. Benden onay almadan canlı veritabanında değişiklik yapma.`,
    "```",
    "",
    `[Çalıştırma kaydı](${runUrl}) · Düzelince "Actions → DB Yayın → Run workflow" ile tekrar dene.`,
  ].join("\n");
}

export function renderSuccessComment({ applied, sha, siteUrl }) {
  return [
    "## ✅ Yayınlandı",
    "",
    applied.length > 0
      ? `Veritabanına uygulandı:\n${applied.map((f) => `- \`${f}\``).join("\n")}\n\nArdından site yayınlandı.`
      : "Veritabanında uygulanacak değişiklik yoktu; site yayınlandı.",
    "",
    `<sub>Commit \`${(sha ?? "").slice(0, 7)}\`${siteUrl ? ` · ${siteUrl}` : ""}</sub>`,
  ].join("\n");
}
