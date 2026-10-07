// Tiny CLI around render.mjs so workflows never build Markdown in shell.
//   node scripts/db/run-render.mjs pr-comment --lint lint.json --replay success --status status.json --pr 12 --run-url URL --approved true
//   node scripts/db/run-render.mjs failure --stage uygula --sha $SHA --run-url URL --message-file err.txt --prs 12,13
//   node scripts/db/run-render.mjs success --applied a.sql,b.sql --sha $SHA
import fs from "node:fs";

import { renderFailureIssue, renderPrComment, renderSuccessComment } from "./render.mjs";

const [kind] = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const json = (file) => (file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null);

if (kind === "pr-comment") {
  const lint = json(arg("lint")) ?? { errors: [], dangers: [], warnings: [], added: [], changed: 0 };
  process.stdout.write(
    renderPrComment({
      prNumber: arg("pr") ? Number(arg("pr")) : null,
      lint,
      replay: arg("replay", "skipped"),
      prod: json(arg("status")),
      approved: arg("approved") === "true",
      runUrl: arg("run-url") ?? undefined,
      replayLog: arg("replay-log") && fs.existsSync(arg("replay-log")) ? fs.readFileSync(arg("replay-log"), "utf8") : "",
    }),
  );
} else if (kind === "failure") {
  const messageFile = arg("message-file");
  process.stdout.write(
    renderFailureIssue({
      stage: arg("stage", "durum"),
      sha: arg("sha", ""),
      runUrl: arg("run-url", ""),
      message: messageFile && fs.existsSync(messageFile) ? fs.readFileSync(messageFile, "utf8") : arg("message"),
      prNumbers: (arg("prs", "") ?? "").split(",").filter(Boolean).map(Number),
      secrets: [process.env.SUPABASE_DB_URL, process.env.VERCEL_DEPLOY_HOOK_URL],
    }),
  );
} else if (kind === "success") {
  process.stdout.write(
    renderSuccessComment({
      applied: (arg("applied", "") ?? "").split(",").filter(Boolean),
      sha: arg("sha", ""),
      siteUrl: arg("site-url") ?? undefined,
    }),
  );
} else {
  process.stderr.write("Kullanım: run-render.mjs pr-comment|failure|success …\n");
  process.exit(2);
}
