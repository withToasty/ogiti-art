#!/usr/bin/env node
// Wikimedia Commons からパブリックドメイン画像を検索・取得するツール。
// Node.js 18+（組み込み fetch を使用、追加の依存関係なし）。
//
// 使い方:
//   node scripts/fetch-images.mjs search              # 全作品の候補ファイルを検索して表示
//   node scripts/fetch-images.mjs search <id>          # 特定の作品だけ検索
//   node scripts/fetch-images.mjs download              # manifest.json に確定した全作品を取得
//   node scripts/fetch-images.mjs download <id>         # 特定の作品だけ取得
//
// 流れ:
//   1. `search` で各作品の候補ファイル名（Commons の File: タイトル）を確認する
//   2. scripts/image-manifest.json の該当エントリに正しいファイル名を書き込む（"file": "..."）
//   3. `download` を実行すると images/<id>.jpg に保存され、
//      images/CREDITS.md にライセンス・クレジット表記が自動生成される
//
// ライセンス確認: extmetadata の LicenseShortName / UsageTerms を出力するので、
// PD-old-70 / CC0 など著作権の切れたものであることを目視確認してから使うこと。

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(__dirname, 'image-manifest.json');
const IMAGES_DIR = path.join(ROOT, 'images');
const CREDITS_PATH = path.join(IMAGES_DIR, 'CREDITS.md');
const API = 'https://commons.wikimedia.org/w/api.php';

async function loadManifest() {
  const raw = await fs.readFile(MANIFEST_PATH, 'utf8');
  return JSON.parse(raw);
}

async function saveManifest(manifest) {
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function apiGet(params, retries = 3) {
  const url = new URL(API);
  url.search = new URLSearchParams({ format: 'json', origin: '*', ...params });
  const res = await fetch(url, { headers: { 'User-Agent': 'ogiti-art-image-fetcher/1.0 (educational quiz project)' } });
  if (res.status === 429 && retries > 0) {
    const retryAfter = Number(res.headers.get('retry-after')) || 5;
    console.log(`  (rate limited, waiting ${retryAfter}s...)`);
    await sleep(retryAfter * 1000);
    return apiGet(params, retries - 1);
  }
  if (!res.ok) throw new Error(`Commons API error ${res.status} ${res.statusText}`);
  await sleep(300); // avoid tripping Commons' rate limit on rapid sequential calls
  return res.json();
}

async function searchCommons(query, limit = 5) {
  const data = await apiGet({ action: 'query', list: 'search', srnamespace: '6', srsearch: query, srlimit: String(limit) });
  return (data.query?.search ?? []).map(r => r.title);
}

async function getImageInfo(fileTitle) {
  const data = await apiGet({
    action: 'query', titles: fileTitle, prop: 'imageinfo',
    iiprop: 'url|extmetadata|size|mime',
  });
  const pages = data.query?.pages ?? {};
  const page = Object.values(pages)[0];
  if (!page || page.missing !== undefined) return null;
  return page.imageinfo?.[0] ?? null;
}

function plain(html) {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, '').trim();
}

async function cmdSearch(onlyId) {
  const manifest = await loadManifest();
  for (const entry of manifest.works) {
    if (onlyId && entry.id !== onlyId) continue;
    console.log(`\n=== ${entry.id} — ${entry.query} ===`);
    if (entry.file) console.log(`  (manifest already set to: File:${entry.file})`);
    const titles = await searchCommons(entry.query);
    if (titles.length === 0) {
      console.log('  候補が見つかりませんでした。検索語を調整してください。');
      continue;
    }
    for (const title of titles) {
      const info = await getImageInfo(title);
      if (!info) continue;
      const license = plain(info.extmetadata?.LicenseShortName?.value) || '(license unknown)';
      const artist = plain(info.extmetadata?.Artist?.value) || '';
      console.log(`  - ${title}`);
      console.log(`      license: ${license}  size: ${info.width}x${info.height}`);
      if (artist) console.log(`      artist: ${artist}`);
      console.log(`      url: ${info.url}`);
    }
  }
  console.log('\n候補の中から正しいものを選び、scripts/image-manifest.json の "file" に');
  console.log('File: を除いたファイル名（例: "The Angelus, Jean-Francois Millet.jpg"）を設定してください。');
}

async function downloadBinary(url, retries = 3) {
  const res = await fetch(url, { headers: { 'User-Agent': 'ogiti-art-image-fetcher/1.0 (educational quiz project)' } });
  if (res.status === 429 && retries > 0) {
    const retryAfter = Number(res.headers.get('retry-after')) || 5;
    console.log(`    (rate limited on download, waiting ${retryAfter}s...)`);
    await sleep(retryAfter * 1000);
    return downloadBinary(url, retries - 1);
  }
  if (!res.ok) throw new Error(`download failed ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await sleep(300);
  return buf;
}

async function downloadOne(entry) {
  if (!entry.file) {
    console.log(`  [skip] ${entry.id}: manifest に "file" が未設定です（先に search で確認してください）`);
    return null;
  }
  const fileTitle = `File:${entry.file}`;
  const info = await getImageInfo(fileTitle);
  if (!info) {
    console.log(`  [error] ${entry.id}: ${fileTitle} が見つかりませんでした`);
    return null;
  }
  const license = plain(info.extmetadata?.LicenseShortName?.value) || '(unknown)';
  const usageTerms = plain(info.extmetadata?.UsageTerms?.value) || '';
  console.log(`  ${entry.id}: license = ${license}${usageTerms ? ` (${usageTerms})` : ''}`);

  const buf = await downloadBinary(info.url);
  const ext = path.extname(new URL(info.url).pathname) || '.jpg';
  const outPath = path.join(IMAGES_DIR, `${entry.id}${ext}`);
  await fs.writeFile(outPath, buf);
  console.log(`  saved -> images/${entry.id}${ext} (${(buf.length / 1024).toFixed(0)} KB)`);

  return {
    id: entry.id,
    fileTitle,
    sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(fileTitle)}`,
    license,
    usageTerms,
    artist: plain(info.extmetadata?.Artist?.value),
    credit: plain(info.extmetadata?.Credit?.value),
  };
}

async function cmdDownload(onlyId) {
  await fs.mkdir(IMAGES_DIR, { recursive: true });
  const manifest = await loadManifest();
  const credits = [];
  for (const entry of manifest.works) {
    if (onlyId && entry.id !== onlyId) continue;
    try {
      const credit = await downloadOne(entry);
      if (credit) credits.push(credit);
    } catch (err) {
      console.error(`  [error] ${entry.id}: ${err.message}`);
    }
  }
  if (credits.length > 0) {
    await writeCredits(credits);
  }
}

async function writeCredits(newCredits) {
  let existing = '';
  try {
    existing = await fs.readFile(CREDITS_PATH, 'utf8');
  } catch {}
  const byId = new Map();
  for (const line of existing.split('\n\n')) {
    const m = line.match(/^### (\S+)/);
    if (m) byId.set(m[1], line);
  }
  for (const c of newCredits) {
    byId.set(c.id, [
      `### ${c.id}`,
      `- File: ${c.fileTitle}`,
      `- Source: ${c.sourceUrl}`,
      `- License: ${c.license}${c.usageTerms ? ` — ${c.usageTerms}` : ''}`,
      c.artist ? `- Artist metadata: ${c.artist}` : null,
      c.credit ? `- Credit: ${c.credit}` : null,
    ].filter(Boolean).join('\n'));
  }
  const header = '# 画像クレジット・ライセンス一覧\n\n`node scripts/fetch-images.mjs download` により自動生成。\n';
  const body = [...byId.values()].join('\n\n') + '\n';
  await fs.writeFile(CREDITS_PATH, header + '\n' + body, 'utf8');
  console.log(`\nimages/CREDITS.md を更新しました。`);
}

async function main() {
  const [, , cmd, arg] = process.argv;
  if (cmd === 'search') {
    await cmdSearch(arg);
  } else if (cmd === 'download') {
    await cmdDownload(arg);
  } else {
    console.log('Usage: node scripts/fetch-images.mjs <search|download> [id]');
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
