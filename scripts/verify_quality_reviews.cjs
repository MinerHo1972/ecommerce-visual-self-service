// Verify image_quality_reviews table readiness and optional sample write.
const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");

function loadLocalEnv() {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(filePath)) continue;

    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index <= 0) continue;

      const key = trimmed.slice(0, index).trim();
      const rawValue = trimmed.slice(index + 1).trim();
      if (process.env[key] !== undefined) continue;
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
  }
}

loadLocalEnv();

const args = process.argv.slice(2);
const shouldWriteSample = args.includes("--write-sample");
const imageIdArg = args.find((arg) => arg.startsWith("--image-id="));
const imageId = Number(imageIdArg ? imageIdArg.split("=")[1] : 0);

async function tableExists(pool) {
  const [rows] = await pool.query("SHOW TABLES LIKE 'image_quality_reviews'");
  return Array.isArray(rows) && rows.length > 0;
}

async function listIndexes(pool) {
  const [rows] = await pool.query("SHOW INDEX FROM image_quality_reviews");
  return rows.map((row) => row.Key_name).filter(Boolean);
}

async function writeSample(pool) {
  if (!imageId || Number.isNaN(imageId)) {
    throw new Error("--image-id=<id> is required when using --write-sample");
  }

  const workflowRunId = `manual_verify_${Date.now()}`;
  const now = new Date();
  const [result] = await pool.execute(
    `INSERT INTO image_quality_reviews (image_id, workflow_run_id, workflow_type, workflow_step, review_source, review_status, quality_status, confidence, vlm_scores, reject_reasons, suggested_action, candidate_image_url, inputs_snapshot, started_at, finished_at, created_at)
     VALUES (?, ?, 'manual_verify', 'quality_review_verify', 'mock', 'succeeded', 'review', 0.7777, ?, ?, 'manual_review', '', ?, ?, ?, ?)`,
    [
      imageId,
      workflowRunId,
      JSON.stringify({ productFidelity: 0.77, brandCompliance: 0.77, templateFidelity: 0.77, visualQuality: 0.77, productCount: 1 }),
      JSON.stringify(["low_confidence"]),
      JSON.stringify({ verification: "manual_sample", writeSample: true }),
      now,
      now,
      now,
    ]
  );

  const [rows] = await pool.query(
    `SELECT id, image_id, workflow_run_id, review_status, quality_status, confidence, suggested_action
     FROM image_quality_reviews WHERE id = ? LIMIT 1`,
    [result.insertId]
  );

  return rows[0] ?? null;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log(JSON.stringify({ ok: true, databaseConfigured: false, skipped: true, message: "DATABASE_URL is not configured; quality review table check skipped" }, null, 2));
    return;
  }

  const pool = mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 2 });

  try {
    const exists = await tableExists(pool);
    if (!exists) {
      console.log(JSON.stringify({ ok: true, tableExists: false, message: "image_quality_reviews table is not migrated yet" }, null, 2));
      return;
    }

    const indexes = [...new Set(await listIndexes(pool))].sort();
    const output = { ok: true, tableExists: true, indexes };

    if (shouldWriteSample) {
      output.sample = await writeSample(pool);
    }

    console.log(JSON.stringify(output, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
});
