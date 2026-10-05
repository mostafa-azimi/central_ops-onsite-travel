import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
const sql = neon(databaseUrl);
await sql.query(schema);

const rows = await sql`
  SELECT
    to_regclass('public.visit_requests') IS NOT NULL AS visit_requests,
    to_regclass('public.visit_request_audit') IS NOT NULL AS visit_request_audit
`;
if (!rows[0]?.visit_requests || !rows[0]?.visit_request_audit) {
  throw new Error("Database schema verification failed");
}

console.log("Central Ops Travel database schema is ready.");
