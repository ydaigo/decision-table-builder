// 表の見出し・左端の列がスクロールしても固定されているかを、ヘッドレスブラウザで確かめる。
// 実際の測定は test-sticky.html の中で行い、その結果をここで取り出して表示する。
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const browser = CANDIDATES.find(p => existsSync(p));
if (!browser) {
  console.log('Chrome / Edge が見つからないので飛ばします（CHROME_PATH で指定できます）');
  process.exit(0);
}

const page = fileURLToPath(new URL('./test-sticky.html', import.meta.url));
const dom = execFileSync(browser, [
  '--headless=new', '--disable-gpu', '--allow-file-access-from-files',
  '--virtual-time-budget=6000', '--window-size=1400,900', '--dump-dom',
  'file:///' + page.replace(/\\/g, '/'),
], { encoding:'utf8', stdio:['ignore', 'pipe', 'ignore'], maxBuffer:64 * 1024 * 1024 });

const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
if (!m) { console.error('測定結果を取り出せませんでした'); process.exit(1); }
const out = m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
console.log(out);
process.exit(/失敗/.test(out) ? 1 : 0);
