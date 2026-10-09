import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { chromium } from "@playwright/test";

if (!ffmpegPath) throw new Error("ffmpeg-static did not provide a binary");

const outputDir = path.resolve("public/tutorial");
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "central-ops-tutorial-"));
fs.mkdirSync(outputDir, { recursive: true });

const scenes = [
  {
    kicker: "Central Ops Travel",
    title: "Plan customer visits together",
    narration: "Central Ops Travel helps verified ShipHero employees coordinate customer onsite visits. Sign in with your ShipHero Google account to submit requests, view the map, or join a trip.",
    caption: "Sign in with a verified @shiphero.com Google account.",
    visual: `<div class="access-card"><span>ACCESS REQUIRED</span><strong>@shiphero.com</strong><p>Submit requests<br>View Map View<br>Join and shadow</p><div class="mock-button">Sign in with Google</div></div>`,
  },
  {
    kicker: "Step 1",
    title: "Submit a complete request",
    narration: "Open Requests, choose the visit type and date confidence, then add the customer name, customer link, warehouse address, dates, point of contact, and warehouse start time.",
    caption: "Add the customer, warehouse, dates, contact, and start time.",
    visual: `<div class="form-card"><div class="field wide"><span>ACCOUNT NAME</span><strong>Example Customer</strong></div><div class="field"><span>VISIT TYPE</span><strong>Onboarding</strong></div><div class="field"><span>DATE CONFIDENCE</span><strong>High</strong></div><div class="field wide"><span>WAREHOUSE ADDRESS</span><strong>100 Example Street, Columbus, OH 43215</strong></div><div class="field"><span>POINT OF CONTACT</span><strong>Customer Contact</strong></div><div class="field"><span>START TIME</span><strong>9:00 AM</strong></div></div>`,
  },
  {
    kicker: "Onboarding visits",
    title: "Answer every readiness question",
    narration: "For an onboarding onsite, answer every readiness question. A No answer is allowed. The checklist helps the team understand what still needs attention before the visit.",
    caption: "Every readiness question is required. A No answer is allowed.",
    visual: `<div class="checklist-card"><div class="check-row"><span>Carriers added and tested</span><b class="yes">YES</b><b>NO</b></div><div class="check-row"><span>Locations validated in ShipHero</span><b>YES</b><b class="no">NO</b></div><div class="check-row"><span>Packstation hardware tested</span><b class="yes">YES</b><b>NO</b></div><div class="check-row"><span>Mobile hardware tested</span><b class="yes">YES</b><b>NO</b></div><div class="check-row"><span>Product barcodes scanned</span><b>YES</b><b class="no">NO</b></div></div>`,
  },
  {
    kicker: "After submission",
    title: "Approval happens behind the scenes",
    narration: "Submit the request. The approval and assignment steps happen behind the scenes. Once approved, the engagement appears in the upcoming travel list and on the shared C S Onsite Google Calendar.",
    caption: "Approved engagements appear in Upcoming Travel and Google Calendar.",
    visual: `<div class="flow-card"><div><span>1</span><strong>Request saved</strong><small>Verified requester</small></div><i></i><div><span>2</span><strong>Approved and assigned</strong><small>Traveler selected</small></div><i></i><div><span>3</span><strong>Calendar updated</strong><small>Invites sent</small></div></div>`,
  },
  {
    kicker: "Map View",
    title: "See visits and join a trip",
    narration: "Use Map View to see when and where approved engagements are happening. Open a visit and choose Join and shadow. The Calendar invitation updates with the right people.",
    caption: "Choose Join and shadow to be added to the Calendar invitation.",
    visual: `<div class="map-card"><div class="map-pane"><span class="pin p1"></span><span class="pin p2"></span><span class="pin p3"></span><div class="map-lines"></div></div><div class="visit-pane"><small>OCT 26 TO OCT 28</small><strong>Example Customer</strong><p>Columbus, Ohio</p><p>Traveler: Sam Armenia</p><div class="mock-button">Join and shadow</div></div></div>`,
  },
  {
    kicker: "When plans change",
    title: "Request a new date or cancellation",
    narration: "If plans change, the original requester can request new dates or cancellation. Those changes return for approval, then the Calendar and attendees update automatically.",
    caption: "Reschedules and cancellations go through approval again.",
    visual: `<div class="change-card"><div><small>ORIGINAL VISIT</small><strong>Oct 26 to Oct 28</strong></div><div class="change-arrow">→</div><div><small>REQUESTED CHANGE</small><strong>Nov 2 to Nov 4</strong><p>Waiting for approval</p></div><div class="calendar-chip">Calendar updates after approval</div></div>`,
  },
  {
    kicker: "Central Ops Travel",
    title: "Keep every visit aligned",
    narration: "Use Central Ops Travel to keep requests, travelers, and Calendar invitations aligned. Start your next request with a verified ShipHero email address.",
    caption: "Requests, travelers, and Calendar invitations stay aligned.",
    visual: `<div class="finish-card"><div>REQUEST</div><span>+</span><div>TRAVELER</div><span>+</span><div>CALENDAR</div></div>`,
  },
];

function html(scene, index) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}html,body{margin:0;width:1280px;height:720px;overflow:hidden;background:#111315;color:#f8f3e8;font-family:Figtree,"Segoe UI","Helvetica Neue",sans-serif}.slide{position:relative;width:1280px;height:720px;padding:58px 72px;background:radial-gradient(circle at 84% 16%,rgba(159,29,32,.25),transparent 34%),linear-gradient(120deg,#0c0e0f,#17191b 60%,#211719)}.top{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #3d3c39;padding-bottom:20px}.brand{font-weight:900;letter-spacing:-.02em}.scene{color:#f1b94c;font-size:13px;font-weight:900;letter-spacing:.14em}.grid{display:grid;grid-template-columns:.88fr 1.12fr;gap:62px;align-items:center;height:515px}.kicker{color:#f1b94c;font-size:14px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.title{margin:16px 0 0;font-size:54px;line-height:1.02;letter-spacing:-.04em}.summary{margin:20px 0 0;color:#d6cdbf;font-size:20px;line-height:1.45}.caption{position:absolute;right:72px;bottom:24px;left:72px;padding:13px 20px;border-left:4px solid #d89116;background:rgba(0,0,0,.75);color:#fff;font-size:20px;font-weight:700;text-align:center}.visual{min-width:0}.access-card,.form-card,.checklist-card,.flow-card,.map-card,.change-card,.finish-card{border:1px solid #5b554d;background:#181a1c;box-shadow:0 24px 60px rgba(0,0,0,.28)}.access-card{padding:34px}.access-card>span{color:#d89116;font-size:12px;font-weight:900;letter-spacing:.12em}.access-card>strong{display:block;margin:12px 0;font-size:38px}.access-card p{color:#d6cdbf;line-height:1.7}.mock-button{display:inline-flex;margin-top:16px;padding:12px 18px;background:#9f1d20;color:#fff;font-weight:900}.form-card{display:grid;grid-template-columns:1fr 1fr;gap:1px;padding:1px;background:#403d38}.field{padding:18px;background:#181a1c}.field.wide{grid-column:1/-1}.field span,.visit-pane small,.change-card small{display:block;margin-bottom:8px;color:#c0b6a6;font-size:10px;font-weight:900;letter-spacing:.1em}.field strong{font-size:16px}.checklist-card{padding:8px}.check-row{display:grid;grid-template-columns:1fr 60px 60px;gap:8px;align-items:center;padding:13px;border-bottom:1px solid #383837}.check-row:last-child{border:0}.check-row span{font-weight:700}.check-row b{padding:8px;border:1px solid #5b554d;color:#a99f91;font-size:11px;text-align:center}.check-row b.yes{border-color:#d89116;background:#332812;color:#f1b94c}.check-row b.no{border-color:#9f1d20;background:#351a1c;color:#ef7779}.flow-card{display:flex;align-items:center;justify-content:space-between;padding:30px 20px}.flow-card>div{width:150px;text-align:center}.flow-card span{display:grid;place-items:center;width:38px;height:38px;margin:0 auto 14px;border-radius:50%;background:#d89116;color:#111315;font-weight:900}.flow-card strong,.flow-card small{display:block}.flow-card small{margin-top:7px;color:#c0b6a6}.flow-card i{width:44px;height:2px;background:#5b554d}.map-card{display:grid;grid-template-columns:1.15fr .85fr;min-height:330px}.map-pane{position:relative;overflow:hidden;background:#d8dfda}.map-lines{position:absolute;inset:0;background:linear-gradient(25deg,transparent 44%,rgba(76,106,116,.22) 45%,rgba(76,106,116,.22) 47%,transparent 48%),linear-gradient(-30deg,transparent 38%,rgba(76,106,116,.18) 39%,rgba(76,106,116,.18) 41%,transparent 42%)}.pin{position:absolute;z-index:2;width:31px;height:31px;border:4px solid #f8f3e8;border-radius:50% 50% 50% 0;background:#9f1d20;transform:rotate(-45deg)}.p1{top:72px;left:90px;background:#3281fd}.p2{top:182px;left:194px;background:#32b76c}.p3{top:232px;left:68px;background:#d89116}.visit-pane{padding:28px}.visit-pane>strong{display:block;font-size:26px}.visit-pane p{color:#c0b6a6}.change-card{position:relative;display:grid;grid-template-columns:1fr 54px 1fr;gap:10px;align-items:center;padding:34px}.change-card>div:not(.change-arrow):not(.calendar-chip){padding:22px;border:1px solid #494743}.change-card strong{font-size:20px}.change-card p{margin:10px 0 0;color:#f1b94c}.change-arrow{font-size:34px;text-align:center}.calendar-chip{position:absolute;right:34px;bottom:28px;padding:9px 12px;background:#332812;color:#f1b94c;font-size:12px;font-weight:850}.finish-card{display:flex;align-items:center;justify-content:center;gap:16px;padding:70px 26px}.finish-card div{padding:18px;border:1px solid #d89116;color:#f1b94c;font-weight:900;letter-spacing:.06em}.finish-card span{color:#d6cdbf;font-size:28px}
  </style></head><body><main class="slide"><div class="top"><span class="brand">Central Ops Travel</span><span class="scene">${String(index + 1).padStart(2, "0")} / ${String(scenes.length).padStart(2, "0")}</span></div><div class="grid"><div><div class="kicker">${scene.kicker}</div><h1 class="title">${scene.title}</h1><p class="summary">${scene.caption}</p></div><div class="visual">${scene.visual}</div></div><div class="caption">${scene.caption}</div></main></body></html>`;
}

function ffmpeg(args) {
  const result = spawnSync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "FFmpeg failed");
}

function audioDuration(file) {
  const result = spawnSync(ffmpegPath, ["-hide_banner", "-i", file], { encoding: "utf8" });
  const match = result.stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) throw new Error(`Could not read audio duration for ${file}`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function vttTime(seconds) {
  const millis = Math.round(seconds * 1000);
  const hours = Math.floor(millis / 3_600_000);
  const minutes = Math.floor((millis % 3_600_000) / 60_000);
  const secs = Math.floor((millis % 60_000) / 1000);
  const ms = millis % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const segmentPaths = [];
const timings = [];
let cursor = 0;

for (let index = 0; index < scenes.length; index += 1) {
  const scene = scenes[index];
  const basename = `scene-${String(index + 1).padStart(2, "0")}`;
  const png = path.join(workDir, `${basename}.png`);
  const audio = path.join(workDir, `${basename}.aiff`);
  const segment = path.join(workDir, `${basename}.mp4`);
  await page.setContent(html(scene, index), { waitUntil: "load" });
  await page.screenshot({ path: png });
  execFileSync("/usr/bin/say", ["-v", "Samantha", "-r", "184", "-o", audio, scene.narration]);
  const duration = audioDuration(audio) + 0.35;
  ffmpeg(["-loop", "1", "-framerate", "30", "-i", png, "-i", audio, "-vf", "scale=1280:720,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-tune", "stillimage", "-c:a", "aac", "-b:a", "128k", "-t", duration.toFixed(3), "-movflags", "+faststart", segment]);
  segmentPaths.push(segment);
  timings.push({ start: cursor, end: cursor + duration, text: scene.narration });
  cursor += duration;
}

await browser.close();

const concatFile = path.join(workDir, "concat.txt");
fs.writeFileSync(concatFile, segmentPaths.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n"));
ffmpeg(["-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", "-movflags", "+faststart", path.join(outputDir, "central-ops-travel.mp4")]);
ffmpeg(["-i", path.join(workDir, "scene-01.png"), "-q:v", "2", path.join(outputDir, "central-ops-travel-poster.jpg")]);

const vtt = ["WEBVTT", "", ...timings.flatMap((timing, index) => [String(index + 1), `${vttTime(timing.start)} --> ${vttTime(timing.end)}`, timing.text, ""])].join("\n");
fs.writeFileSync(path.join(outputDir, "central-ops-travel.vtt"), vtt);

const video = path.join(outputDir, "central-ops-travel.mp4");
console.log(JSON.stringify({ video, durationSeconds: Number(cursor.toFixed(2)), bytes: fs.statSync(video).size, captions: timings.length, temporaryWorkDir: workDir }, null, 2));
