import fs from "node:fs";
import path from "node:path";

const USERNAME = process.env.LEETCODE_USERNAME || "dmitry_ma";
const OUT_FILE = process.env.OUT_FILE || "assets/leetcode-card-direct.svg";

const query = `
query getUserProfile($username: String!) {
  matchedUser(username: $username) {
    username
    submitStatsGlobal {
      acSubmissionNum {
        difficulty
        count
      }
    }
  }
}
`;

function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildSvg({ username, easy, medium, hard, updatedISO }) {
  const total = easy + medium + hard;

  // Чистый SVG без внешних шрифтов/ресурсов. Надежно в GitHub README.
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="420" height="140" viewBox="0 0 420 140" role="img" aria-label="LeetCode stats for ${esc(username)}">
  <defs>
    <style>
      .t1 { font: 700 16px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"; fill: #111827; }
      .t2 { font: 400 13px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"; fill: #374151; }
      .t3 { font: 400 12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"; fill: #6b7280; }
      .num { font: 700 20px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; fill: #111827; }
      .lbl { font: 600 12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; fill: #6b7280; letter-spacing: .2px; }
    </style>
  </defs>

  <rect x="0.5" y="0.5" width="419" height="139" rx="12" fill="#ffffff" stroke="#e5e7eb"/>

  <text x="18" y="28" class="t1">LeetCode — ${esc(username)}</text>

  <text x="18" y="58" class="lbl">TOTAL SOLVED</text>
  <text x="18" y="86" class="num">${total}</text>

  <text x="165" y="58" class="lbl">EASY</text>
  <text x="165" y="86" class="num">${easy}</text>

  <text x="245" y="58" class="lbl">MEDIUM</text>
  <text x="245" y="86" class="num">${medium}</text>

  <text x="345" y="58" class="lbl">HARD</text>
  <text x="345" y="86" class="num">${hard}</text>

  <text x="18" y="118" class="t3">Updated: ${esc(updatedISO)}</text>
</svg>`;
}

async function main() {
  const res = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // User-Agent иногда помогает пройти простые фильтры.
      "user-agent": "github-actions (leetcode-card-generator)"
    },
    body: JSON.stringify({ query, variables: { username: USERNAME } }),
  });

  if (!res.ok) {
    throw new Error(`LeetCode GraphQL HTTP ${res.status}`);
  }

  const json = await res.json();
  const user = json?.data?.matchedUser;

  if (!user?.submitStatsGlobal?.acSubmissionNum) {
    throw new Error(`Unexpected response structure: ${JSON.stringify(json).slice(0, 400)}...`);
  }

  const nums = user.submitStatsGlobal.acSubmissionNum;
  const map = Object.fromEntries(nums.map((x) => [x.difficulty, x.count]));

  const easy = Number(map.Easy ?? 0);
  const medium = Number(map.Medium ?? 0);
  const hard = Number(map.Hard ?? 0);

  const updatedISO = new Date().toISOString().slice(0, 10);

  const svg = buildSvg({
    username: user.username || USERNAME,
    easy,
    medium,
    hard,
    updatedISO,
  });

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, svg, "utf8");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
