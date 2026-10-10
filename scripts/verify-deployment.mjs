const origin = String(process.argv[2] || process.env.APP_URL || "").trim().replace(/\/$/, "");
if (!/^https:\/\//.test(origin)) throw new Error("Pass an HTTPS deployment origin as the first argument or APP_URL.");

const checks = [
  { path: "/api/health", expect: '"status":"ok"' },
  { path: "/", expect: "Central Ops Travel" },
  { path: "/admin", expect: "Travel approvals" },
  { path: "/map", expect: "Map view" },
  { path: "/calendar", expect: "Calendar view" },
];

for (const check of checks) {
  const response = await fetch(`${origin}${check.path}`, { redirect: "follow", signal: AbortSignal.timeout(15_000) });
  const body = await response.text();
  if (!response.ok || !body.includes(check.expect)) throw new Error(`${check.path} failed with HTTP ${response.status}`);
  process.stdout.write(`PASS ${check.path}\n`);
}
