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

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ratio = (v) => (total > 0 ? v / total : 0);

  // Геометрия баров
  const barW = 86;
  const barH = 8;
  const r = 4;

  const wEasy = Math.round(barW * clamp(ratio(easy), 0, 1));
  const wMed  = Math.round(barW * clamp(ratio(medium), 0, 1));
  const wHard = Math.round(barW * clamp(ratio(hard), 0, 1));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="480" height="160" viewBox="0 0 480 160" role="img" aria-label="LeetCode stats for ${esc(username)}">
  <defs>
    <style>
      .h1 { font: 700 16px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; fill: #111827; }
      .muted { font: 600 11px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; fill: #6b7280; letter-spacing: .6px; }
      .num { font: 750 22px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; fill: #111827; }
      .small { font: 500 12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; fill: #6b7280; }

      /* Индикаторы */
      .track { fill: #eef2f7; }
      .easy { fill: #22c55e; }
      .med  { fill: #f59e0b; }
      .hard { fill: #ef4444; }
    </style>
  </defs>

  <rect x="0.5" y="0.5" width="479" height="159" rx="14" fill="#ffffff" stroke="#e5e7eb"/>

  <text x="18" y="30" class="h1">LeetCode — ${esc(username)}</text>

  <rect x="372" y="14" width="92" height="22" rx="11" fill="#f3f4f6" stroke="#e5e7eb"/>
  <text x="418" y="29" text-anchor="middle" class="small">Open profile</text>

  <line x1="18" y1="44" x2="462" y2="44" stroke="#e5e7eb"/>

  <!-- TOTAL -->
  <text x="18" y="70" class="muted">TOTAL SOLVED</text>
  <text x="18" y="104" class="num">${total}</text>

  <!-- separators -->
  <line x1="150" y1="58" x2="150" y2="116" stroke="#e5e7eb"/>
  <line x1="276" y1="58" x2="276" y2="116" stroke="#e5e7eb"/>
  <line x1="372" y1="58" x2="372" y2="116" stroke="#e5e7eb"/>

  <!-- EASY -->
  <text x="168" y="70" class="muted">EASY</text>
  <text x="168" y="104" class="num">${easy}</text>
  <rect x="168" y="112" width="${barW}" height="${barH}" rx="${r}" class="track"/>
  <rect x="168" y="112" width="${wEasy}" height="${barH}" rx="${r}" class="easy"/>

  <!-- MEDIUM -->
  <text x="294" y="70" class="muted">MEDIUM</text>
  <text x="294" y="104" class="num">${medium}</text>
  <rect x="294" y="112" width="${barW}" height="${barH}" rx="${r}" class="track"/>
  <rect x="294" y="112" width="${wMed}" height="${barH}" rx="${r}" class="med"/>

  <!-- HARD -->
  <text x="390" y="70" class="muted">HARD</text>
  <text x="390" y="104" class="num">${hard}</text>
  <rect x="390" y="112" width="${barW}" height="${barH}" rx="${r}" class="track"/>
  <rect x="390" y="112" width="${wHard}" height="${barH}" rx="${r}" class="hard"/>

  <text x="18" y="140" class="small">Updated: ${esc(updatedISO)} • Source: leetcode.com</text>
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
