import { createSign } from "node:crypto";
import { appendFileSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// Sends the extension to the Chrome Web Store.
//
// Run by .github/workflows/extension.yml after `yarn zip` has written
// .output/5stack-extension-<version>-chrome.zip. It uploads that zip and
// submits it for review only when package.json names a version the store has
// neither published nor been sent -- so it is safe to run on every push and on
// a timer, and bumping `version` is the whole of releasing one.
//
// ## One submission at a time
//
// A version sent while another is still in review waits rather than cancelling
// it, since cancelling puts it at the back of the queue again. The workflow's
// timer runs this again, and the newest version goes in once the one ahead of
// it clears.
//
// ## Auth
//
// A service account's JSON key, signed into a token here with node:crypto --
// the "JSON Web Token" route in
// https://developer.chrome.com/docs/webstore/service-accounts. The account has
// no roles in Google Cloud; the only thing it can do is what the Chrome Web
// Store developer dashboard lets it, which is publish this publisher's items.
//
//   CWS_SERVICE_ACCOUNT  the key file's JSON          (secret)
//   CWS_PUBLISHER_ID     from the dashboard's Settings (variable)
//   CWS_EXTENSION_ID     the listing's item id         (variable)

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, ".output");
const API = "https://chromewebstore.googleapis.com";
const SCOPE = "https://www.googleapis.com/auth/chromewebstore";

const { CWS_SERVICE_ACCOUNT, CWS_PUBLISHER_ID, CWS_EXTENSION_ID, GITHUB_STEP_SUMMARY } = process.env;

/** A line in the log and, on Actions, in the run's summary. */
function report(line) {
  console.log(`[extension] ${line}`);
  if (GITHUB_STEP_SUMMARY) appendFileSync(GITHUB_STEP_SUMMARY, `${line}\n`);
}

function fail(line) {
  report(line);
  process.exit(1);
}

/** Whether dotted version `a` is later than `b`. A missing `b` is older than anything. */
function newer(a, b) {
  if (!b) return true;
  const left = String(a).split(".").map(Number);
  const right = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff) return diff > 0;
  }
  return false;
}

/** The highest version a revision is rolling out, or null when there is no revision. */
function versionOf(revision) {
  const versions = (revision?.distributionChannels ?? []).map((channel) => channel.crxVersion).filter(Boolean);
  return versions.reduce((best, version) => (newer(version, best) ? version : best), null);
}

async function accessToken(key) {
  const audience = key.token_uri ?? "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const part = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${part({ alg: "RS256", typ: "JWT" })}.${part({ iss: key.client_email, scope: SCOPE, aud: audience, iat: now, exp: now + 3600 })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key.private_key, "base64url");
  const response = await fetch(audience, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) fail(`Google would not sign the service account in: ${response.status} ${JSON.stringify(body)}`);
  return body.access_token;
}

if (!CWS_SERVICE_ACCOUNT || !CWS_PUBLISHER_ID || !CWS_EXTENSION_ID) {
  fail("CWS_SERVICE_ACCOUNT, CWS_PUBLISHER_ID and CWS_EXTENSION_ID must all be set.");
}

const version = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
const zipName = readdirSync(OUTPUT).find((name) => name.endsWith(`-${version}-chrome.zip`));
if (!zipName) fail(`No .output/*-${version}-chrome.zip. Run \`yarn zip\` first.`);
const ZIP = path.join(OUTPUT, zipName);
const token = await accessToken(JSON.parse(CWS_SERVICE_ACCOUNT));
const item = `publishers/${CWS_PUBLISHER_ID}/items/${CWS_EXTENSION_ID}`;

async function call(url, init = {}) {
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
  const text = await response.text();
  if (!response.ok) fail(`${init.method ?? "GET"} ${url.replace(API, "")} answered ${response.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

const status = await call(`${API}/v2/${item}:fetchStatus`);
if (status.takenDown) fail("The store has taken the extension down. See the developer dashboard.");

const published = versionOf(status.publishedItemRevisionStatus);
const submitted = status.submittedItemRevisionStatus ?? null;
const submittedVersion = versionOf(submitted);

if (!newer(version, published)) {
  report(`The store already publishes ${published}; package.json says ${version}. Nothing to send.`);
  process.exit(0);
}
if (submitted && !newer(version, submittedVersion)) {
  if (submitted.state === "REJECTED") {
    fail(`${submittedVersion} was rejected in review. Read why in the developer dashboard, fix it, and bump the version.`);
  }
  report(`${submittedVersion} is already with the store (${submitted.state}). Nothing to send.`);
  process.exit(0);
}
if (submitted?.state === "PENDING_REVIEW") {
  report(`${submittedVersion} is still in review, so ${version} waits for it. The next run sends it.`);
  process.exit(0);
}

let upload = await call(`${API}/upload/v2/${item}:upload`, { method: "POST", body: readFileSync(ZIP) });
// Large packages finish uploading after the answer. Ours is a few hundred
// kilobytes, so this is a formality with a two-minute ceiling.
for (let tries = 0; upload.uploadState === "IN_PROGRESS" && tries < 24; tries += 1) {
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const now = await call(`${API}/v2/${item}:fetchStatus`);
  upload = { ...upload, uploadState: now.lastAsyncUploadState };
}
if (upload.uploadState !== "SUCCEEDED") fail(`The upload of ${version} ended ${upload.uploadState}: ${JSON.stringify(upload)}`);

const sent = await call(`${API}/v2/${item}:publish`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ publishType: "DEFAULT_PUBLISH" }),
});
report(`Sent ${version} to the Chrome Web Store (was ${published ?? "unpublished"}): ${sent.state}.`);
if (sent.warningInfo) report(`Warnings: ${JSON.stringify(sent.warningInfo)}`);
