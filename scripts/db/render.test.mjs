import { describe, expect, it } from "vitest";

import { APPROVAL_LABEL, COMMENT_MARKER, redact, renderFailureIssue, renderPrComment, renderSuccessComment } from "./render.mjs";

const clean = { errors: [], dangers: [], warnings: [], added: [], changed: 0 };
const base = { prNumber: 7, replay: "skipped", prod: null, approved: false };

describe("renderPrComment", () => {
  it("always carries the marker so the same comment can be updated in place", () => {
    expect(renderPrComment({ ...base, lint: clean })).toContain(COMMENT_MARKER);
  });

  it("says plainly when a PR does not touch the database", () => {
    const md = renderPrComment({ ...base, lint: clean });
    expect(md).toContain("veritabanına dokunmuyor");
  });

  it("explains a danger in plain language and hands over the Claude prompt", () => {
    const lint = {
      ...clean,
      changed: 1,
      added: ["20261015093000_x.sql"],
      dangers: [{ level: "danger", code: "drop-column", file: "20261015093000_x.sql", line: 3, snippet: "alter table t drop column c" }],
    };
    const md = renderPrComment({ ...base, lint, replay: "success" });
    expect(md).toContain("Tehlikeli değişiklik");
    expect(md).toContain("Geri dönüş YOK");
    expect(md).toContain("gh pr view 7 --comments");
    expect(md).toContain(`${APPROVAL_LABEL} etiketini EKLEME`);
    expect(md).toContain("alter table t drop column c");
  });

  it("stops nagging once the approval label is present", () => {
    const lint = { ...clean, changed: 1, added: ["a.sql"], dangers: [{ level: "danger", code: "truncate", file: "a.sql", line: 1 }] };
    const md = renderPrComment({ ...base, lint, approved: true, replay: "success" });
    expect(md).toContain("onaylanmış");
    expect(md).not.toContain("gh pr view");
    expect(md).toContain("Veritabanı değişikliği güvenli görünüyor");
  });

  it("reports errors with their explanation and a failed fresh-database replay", () => {
    const lint = { ...clean, changed: 1, added: ["a.sql"], errors: [{ level: "error", code: "no-rls", file: "a.sql", line: 2, detail: "RLS yok" }] };
    const md = renderPrComment({ ...base, lint, replay: "failure" });
    expect(md).toContain("Düzeltilmesi gereken");
    expect(md).toContain("Tabloda satır güvenliği (RLS) açılmamış");
    expect(md).toContain("boş veritabanında çalışmadı");
  });

  it("shows the tail of the replay log when the fresh-database test fails", () => {
    const lint = { ...clean, changed: 1, added: ["a.sql"] };
    const log = ["noise", ...Array.from({ length: 40 }, (_, i) => `line ${i}`), "RLS kapalı tablolar:", "  - drill_bad"].join("\n");
    const md = renderPrComment({ ...base, lint, replay: "failure", replayLog: log });
    expect(md).toContain("RLS kapalı tablolar:");
    expect(md).toContain("drill_bad");
    expect(md).not.toContain("noise"); // only the last lines
  });

  it("does not promise a deploy while the PR is red or waiting for approval", () => {
    const lint = { ...clean, changed: 1, added: ["a.sql"], errors: [{ level: "error", code: "no-rls", file: "a.sql", line: 1, detail: "x" }] };
    const md = renderPrComment({ ...base, lint, replay: "success", prod: { pending: ["a.sql"], orphans: [] } });
    expect(md).toContain("migration kontrolünde durur");
    expect(md).toContain("site eski sürümde kalır");
    expect(md).not.toContain("otomatik çalışıp bunları canlı veritabanına uygular");
  });

  it("tells what will be applied on merge and warns about drift", () => {
    const lint = { ...clean, changed: 1, added: ["20261015093000_x.sql"] };
    const md = renderPrComment({
      ...base,
      lint,
      replay: "success",
      prod: { pending: ["20261015093000_x.sql"], orphans: ["20269999000000"] },
    });
    expect(md).toContain("DB Yayın");
    expect(md).toContain("20261015093000_x.sql");
    expect(md).toContain("20269999000000");
  });
});

describe("renderFailureIssue", () => {
  it("says whether the database changed and what state the site is in, per stage", () => {
    const early = renderFailureIssue({ stage: "on-deneme", sha: "abcdef123", runUrl: "https://run", message: "boom" });
    expect(early).toContain("veritabanı değişmedi");
    expect(early).toContain("eski sürümde çalışıyor");

    const late = renderFailureIssue({ stage: "yayinla", sha: "abcdef123", runUrl: "https://run", message: "hook failed" });
    expect(late).toContain("veritabanı güncellendi");
    expect(late).toContain("Run workflow");
  });

  it("is honest when the state is unknown", () => {
    expect(renderFailureIssue({ stage: "uygula", sha: "a", runUrl: "u", message: "m" })).toContain("Belirsiz");
  });
});

describe("renderSuccessComment", () => {
  it("lists what was applied", () => {
    expect(renderSuccessComment({ applied: ["a.sql"], sha: "abcdef123" })).toContain("a.sql");
  });
});

describe("redact", () => {
  const url = "postgresql://postgres.abc:S3cr3t%21pass@aws-0.pooler.supabase.com:6543/postgres";

  it("removes a connection string and the password inside it", () => {
    const out = redact(`failed: ${url} (password S3cr3t!pass rejected)`, [url]);
    expect(out).not.toContain("S3cr3t");
    expect(out).not.toContain("aws-0.pooler");
    expect(out).toContain("***");
  });

  it("removes a bare secret such as the deploy hook URL", () => {
    const hook = "https://api.vercel.com/v1/integrations/deploy/prj_x/AbCdEf123456";
    expect(redact(`POST ${hook} -> 500`, [hook])).toBe("POST *** -> 500");
  });

  it("ignores empty or unset secrets", () => {
    expect(redact("nothing here", [undefined, "", null])).toBe("nothing here");
  });

  it("is applied to the text of a failure issue", () => {
    const issue = renderFailureIssue({ stage: "uygula", sha: "a", runUrl: "u", message: `error at ${url}`, secrets: [url] });
    expect(issue).not.toContain("S3cr3t");
  });
});
