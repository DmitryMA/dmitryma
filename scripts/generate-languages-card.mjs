import fs from "node:fs";
import path from "node:path";

// Важно: используем этот импорт, чтобы получать иконки по ключу siXxx
import * as si from "simple-icons/icons";

const GH_USER = process.env.GH_USER || "DmitryMA";
const OUT_FILE = process.env.OUT_FILE || "assets/languages-card.svg";
const TOP_N = Number(process.env.TOP_N || 8);

const MIN_PCT = Number(process.env.MIN_PCT || 1); // скрывать < 2%
const MIN_BYTES = Number(process.env.MIN_BYTES || 1000); // скрывать < 5KB
const DENY = new Set(
  (process.env.DENY_LANGS || "Dockerfile,Shell,Makefile,HCL,Terraform")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

const GH_TOKEN = process.env.GITHUB_TOKEN || "";

function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pascalCase(s) {
  return s
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

// Маппинг GitHub Linguist language -> simple-icons export key
const ICON_MAP = {
  JavaScript: "siJavascript",
  TypeScript: "siTypescript",
  Go: "siGo",
  Java: "siJava",
  HTML: "siHtml5",
  CSS: "siCss3",
  "C#": "siCsharp",
  "C++": "siCplusplus",
  C: "siC",
  Python: "siPython",
  Ruby: "siRuby",
  PHP: "siPhp",
  Rust: "siRust",
  Kotlin: "siKotlin",
  Swift: "siSwift",
  "Jupyter Notebook": "siJupyter",
  Shell: "siGnubash",
  Dockerfile: "siDocker",
  Terraform: "siTerraform",
};

function iconForLanguage(lang) {
  const key = ICON_MAP[lang] || `si${pascalCase(lang)}`;
  return si[key] || null; // { title, hex, path, ... }
}

async function ghFetch(url) {
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "github-actions languages-card",
  };
  if (GH_TOKEN) headers.authorization = `Bearer ${GH_TOKEN}`;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${url}`);
  return res.json();
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
    if (page > 20) break; // safety guard
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

function buildSvg({ items, updatedISO }) {
  // Layout: 6 плиток в ряд, 2 ряда максимум
  const pad = 18;
  const tileW = 120;
  const tileH = 96;
  const gap = 12;
  const perRow = 6;

  const rows = Math.max(1, Math.ceil(items.length / perRow));
  const W = pad * 2 + perRow * tileW + (perRow - 1) * gap; // 792
  const H = 64 + rows * tileH + (rows - 1) * gap + 34; // header + tiles + footer

  const startX = pad;
  const startY = 64;

  const iconSize = 18;
  const iconScale = iconSize / 24; // simple-icons paths are 24x24
  const barTrackW = tileW - 28;

  const tiles = items
    .map((it, idx) => {
      const row = Math.floor(idx / perRow);
      const col = idx % perRow;
      const x = startX + col * (tileW + gap);
      const y = startY + row * (tileH + gap);

      const icon = it.icon;
      const accent = icon?.hex ? `#${icon.hex}` : "#111827";

      const iconX = x + 16;
      const iconY = y + 18;

      const barFillW = Math.max(
        0,
        Math.min(barTrackW, Math.round((barTrackW * it.pct) / 100))
      );

      const iconSvg = icon
        ? `
      <g transform="translate(${iconX}, ${iconY}) scale(${iconScale})" aria-hidden="true">
        <path d="${icon.path}" fill="${accent}"></path>
      </g>`
        : `
      <circle cx="${iconX + 9}" cy="${iconY + 9}" r="9" fill="#111827"/>
      <text x="${iconX + 9}" y="${iconY + 13}" text-anchor="middle" class="abbr" fill="#ffffff">${esc(
        it.abbr
      )}</text>`;

      return `
    <g>
      <rect x="${x}" y="${y}" width="${tileW}" height="${tileH}" rx="14" fill="#ffffff" stroke="#e5e7eb"/>
      ${iconSvg}
      <text x="${x + 40}" y="${y + 32}" class="name">${esc(it.name)}</text>
      <text x="${x + 40}" y="${y + 56}" class="pct">${it.pct}%</text>
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
      .abbr { font: 800 10px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; }
      .name { font: 700 12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; fill: #111827; }
      .pct { font: 800 16px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; fill: #111827; }
      .foot { font: 500 12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; fill: #6b7280; }
    </style>
  </defs>

  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="16" fill="#ffffff" stroke="#e5e7eb"/>
  <text x="${pad}" y="30" class="h1">Languages used</text>
  <text x="${pad}" y="48" class="sub">Across public repos • Updated: ${esc(updatedISO)}</text>

  ${tiles}

  <text x="${pad}" y="${H - 14}" class="foot">Source: GitHub Linguist (repo languages API) • Icons: simple-icons</text>
</svg>`;
}

async function main() {
  const repos = await listReposAllPages(GH_USER);

  // исключаем forks и archived
  const filteredRepos = repos.filter((r) => !r.fork && !r.archived);

  const totals = new Map(); // lang -> bytes

  for (const r of filteredRepos) {
    try {
      const langs = await getRepoLanguages(GH_USER, r.name);
      for (const [lang, bytes] of Object.entries(langs)) {
        if (DENY.has(lang)) continue;
        const b = Number(bytes || 0);
        if (b <= 0) continue;
        totals.set(lang, (totals.get(lang) || 0) + b);
      }
    } catch {
      // пропускаем отдельные ошибки / лимиты
    }
  }

  const entries = [...totals.entries()].sort((a, b) => b[1] - a[1]);

  // берём TOP_N, но сначала отсечём совсем мелкие по байтам
  const topRaw = entries.filter(([, bytes]) => bytes >= MIN_BYTES).slice(0, TOP_N);

  // Если после MIN_BYTES ничего не осталось — берём просто TOP_N как fallback
  const chosen = topRaw.length ? topRaw : entries.slice(0, TOP_N);

  const sum = chosen.reduce((acc, [, v]) => acc + v, 0) || 1;

  let items = chosen
    .map(([name, bytes]) => {
      const pct = Math.round((bytes * 100) / sum);
      const icon = iconForLanguage(name);
      return { name, pct, icon, abbr: abbrFor(name) };
    })
    .filter((it) => it.pct >= MIN_PCT); // скрыть “не используется”

  // корректируем сумму процентов до 100
  const pctSum = items.reduce((a, x) => a + x.pct, 0);
  if (items.length && pctSum !== 100) items[0].pct += 100 - pctSum;

  const updatedISO = new Date().toISOString().slice(0, 10);
  const svg = buildSvg({ items, updatedISO });

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, svg, "utf8");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
