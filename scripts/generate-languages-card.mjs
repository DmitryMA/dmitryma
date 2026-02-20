import fs from "node:fs";
import path from "node:path";
import { ICONS as FA_ICONS } from "./icons.fa.vendored.js";

const GH_USER = process.env.GH_USER || "DmitryMA";
const OUT_FILE = process.env.OUT_FILE || "assets/languages-card.svg";
const TOP_N = Number(process.env.TOP_N || 8);

const MIN_PCT = Number(process.env.MIN_PCT || 2);
const MIN_BYTES = Number(process.env.MIN_BYTES || 5000);
const DENY = new Set(
  (process.env.DENY_LANGS || "Dockerfile,Shell,Makefile,HCL,Terraform")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

const GH_TOKEN = process.env.GITHUB_TOKEN || "";

// Stable palette under your control
const COLOR_FALLBACK = {
  Rust: "#DEA584",
  TypeScript: "#3178C6",
  JavaScript: "#F7DF1E",
  Go: "#00ADD8",
  Java: "#ED8B00",
  Python: "#3776AB",
  HTML: "#E34F26",
  CSS: "#1572B6",
};

function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function ghFetch(url) {
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "github-actions languages-card",
  };
  if (GH_TOKEN) headers.authorization = `Bearer ${GH_TOKEN}`;

  // small timeout to avoid hanging
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);

  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${url}`);
    return res.json();
  } finally {
    clearTimeout(t);
  }
}

async function listReposAllPages(user) {
  const repos = [];
  let page = 1;

  while (true) {
    const batch = await ghFetch(
      `https://api.github.com/users/${encodeURIComponent(
        user
      )}/repos?per_page=100&page=${page}&sort=updated`
    );
    if (!Array.isArray(batch) || batch.length === 0) break;
    repos.push(...batch);
    page += 1;
    if (page > 20) break;
  }
  return repos;
}

async function getRepoLanguages(owner, repo) {
  return ghFetch(
    `https://api.github.com/repos/${encodeURIComponent(
      owner
    )}/${encodeURIComponent(repo)}/languages`
  );
}

function abbrFor(name) {
  const map = {
    Rust: "RS",
    JavaScript: "JS",
    TypeScript: "TS",
    Python: "PY",
    "C#": "C#",
    "C++": "C++",
  };
  if (map[name]) return map[name];
  if (name.length <= 3) return name.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function colorForLanguage(lang, faIcon) {
  return faIcon?.color || COLOR_FALLBACK[lang] || "#111827";
}

function renderFAIcon({ icon, x, y, size, fill }) {
  if (!icon) return "";
  const w = icon.width;
  const h = icon.height;
  const scale = size / Math.max(w, h);

  const tx = x + (size - w * scale) / 2;
  const ty = y + (size - h * scale) / 2;

  const paths = icon.paths
    .map((d) => `<path d="${d}" fill="${fill}"></path>`)
    .join("");

  return `<g transform="translate(${tx}, ${ty}) scale(${scale})" aria-hidden="true">${paths}</g>`;
}

function renderMonogram({ label, x, y, size, bg, fg }) {
  const r = size / 2;
  const cx = x + r;
  const cy = y + r;

  const fontSize = Math.round(size * 0.55);
  const textY = cy + Math.round(fontSize * 0.35);

  return `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${bg}"/>
    <text x="${cx}" y="${textY}" text-anchor="middle" class="mono" fill="${fg}" style="font-size:${fontSize}px">${esc(
    label
  )}</text>`;
}

function buildSvg({ items, updatedISO }) {
  const pad = 18;
  const tileW = 120;
  const tileH = 96;
  const gap = 12;
  const perRow = 6;

  const rows = Math.max(1, Math.ceil(items.length / perRow));
  const W = pad * 2 + perRow * tileW + (perRow - 1) * gap; // 792
  const H = 64 + rows * tileH + (rows - 1) * gap + 34;

  const startX = pad;
  const startY = 64;

  const iconSize = 24;
  const barTrackW = tileW - 28;

  const tiles = items
    .map((it, idx) => {
      const row = Math.floor(idx / perRow);
      const col = idx % perRow;
      const x = startX + col * (tileW + gap);
      const y = startY + row * (tileH + gap);

      const iconX = x + 14;
      const iconY = y + 14;

      const accent = it.accent;
      const barFillW = Math.max(
        0,
        Math.min(barTrackW, Math.round((barTrackW * it.pct) / 100))
      );

      const iconSvg = it.faIcon
        ? renderFAIcon({ icon: it.faIcon, x: iconX, y: iconY, size: iconSize, fill: accent })
        : renderMonogram({
            label: it.abbr,
            x: iconX,
            y: iconY,
            size: iconSize,
            bg: accent,
            fg: it.abbr === "JS" ? "#111827" : "#ffffff",
          });

      return `
    <g>
      <rect x="${x}" y="${y}" width="${tileW}" height="${tileH}" rx="14" fill="#ffffff" stroke="#e5e7eb"/>
      ${iconSvg}
      <text x="${x + 44}" y="${y + 32}" class="name">${esc(it.name)}</text>
      <text x="${x + 44}" y="${y + 56}" class="pct">${it.pct}%</text>
      <rect x="${x + 14}" y="${y + 72}" width="${barTrackW}" height="8" rx="4" fill="#eef2f7"/>
      <rect x="${x + 14}" y="${y + 72}" width="${barFillW}" height="8" rx="4" fill="${accent}"/>
    </g>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Languages used across GitHub repos">
  <defs>
    <style>
      .h1 { font: 800 16px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; fill: #111827; }
      .sub { font: 500 12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; fill: #6b7280; }
      .mono { font: 900 12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; }
      .name { font: 700 12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; fill: #111827; }
      .pct { font: 800 16px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; fill: #111827; }
      .foot { font: 500 12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; fill: #6b7280; }
    </style>
  </defs>

  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="16" fill="#ffffff" stroke="#e5e7eb"/>
  <text x="${pad}" y="30" class="h1">Languages used</text>
  <text x="${pad}" y="48" class="sub">Across public repos • Updated: ${esc(updatedISO)}</text>

  ${tiles}

  <text x="${pad}" y="${H - 14}" class="foot">Source: GitHub Linguist (repo languages API) • Icons: Font Awesome Free (CC BY 4.0)</text>
</svg>`;
}

async function main() {
  const repos = await listReposAllPages(GH_USER);

  const filteredRepos = repos.filter((r) => !r.fork && !r.archived);
  if (!filteredRepos.length) {
    throw new Error("No repos found (or all filtered). Refusing to overwrite SVG.");
  }

  const totals = new Map();

  for (const r of filteredRepos) {
    const langs = await getRepoLanguages(GH_USER, r.name); // if fails -> throw -> no overwrite
    for (const [lang, bytes] of Object.entries(langs)) {
      if (DENY.has(lang)) continue;
      const b = Number(bytes || 0);
      if (b <= 0) continue;
      totals.set(lang, (totals.get(lang) || 0) + b);
    }
  }

  const entries = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    throw new Error("No language bytes computed. Refusing to overwrite SVG.");
  }

  const topRaw = entries.filter(([, bytes]) => bytes >= MIN_BYTES).slice(0, TOP_N);
  const chosen = topRaw.length ? topRaw : entries.slice(0, TOP_N);

  const sum = chosen.reduce((acc, [, v]) => acc + v, 0);
  if (!Number.isFinite(sum) || sum <= 0) {
    throw new Error("Invalid language sum. Refusing to overwrite SVG.");
  }

  let items = chosen
    .map(([name, bytes]) => {
      const pct = Math.round((bytes * 100) / sum);
      const faIcon = FA_ICONS[name] || null; // JS/Java/Go
      const abbr = abbrFor(name);
      const accent = colorForLanguage(name, faIcon);
      return { name, pct, faIcon, abbr, accent };
    })
    .filter((it) => it.pct >= MIN_PCT);

  if (!items.length) {
    throw new Error("No language items after filters. Refusing to overwrite SVG.");
  }

  const pctSum = items.reduce((a, x) => a + x.pct, 0);
  if (pctSum !== 100) items[0].pct += 100 - pctSum;

  const updatedISO = new Date().toISOString().slice(0, 10);
  const svg = buildSvg({ items, updatedISO });

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  const tmp = `${OUT_FILE}.tmp`;
  fs.writeFileSync(tmp, svg, "utf8");
  fs.renameSync(tmp, OUT_FILE);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
