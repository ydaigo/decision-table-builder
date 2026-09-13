// 「ルールをまとめる」(simplifyRows) の検証。index.html から関数本体を抜き出してそのまま実行する
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

function extractFn(name){
  const start = html.indexOf(`function ${name}(){`);
  if (start < 0) throw new Error(`${name} not found`);
  let i = html.indexOf('{', start), depth = 0;
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}' && --depth === 0) break;
  }
  return html.slice(start, i + 1);
}

// ---- index.html と同じ最小限のヘルパー ----
const MAX_ROWS = 4096, DASH = '-', YES = '○', NO = '×';
let uid = 1;
const nid = () => uid++;
const cartesian = arrs => arrs.reduce((acc, cur) => acc.flatMap(a => cur.map(c => [...a, c])), [[]]);
const rowData = r => ({ cond:{ ...r.cond }, act:{ ...r.act }, na:!!r.na, note:r.note || '' });
const cloneRow = r => ({ id:nid(), ...rowData(r) });

let state, toasts, undos;
const condVal = (r, c) => r.cond[c.id] ?? DASH;
const actVal = (r, a) => r.act[a.id] || '';
const comboTotal = () => state.conditions.length ? state.conditions.reduce((n, c) => n * c.values.length, 1) : 0;
const toast = msg => toasts.push(msg);
const pushUndo = j => undos.push(j);
const commit = () => {};
const selected = new Set();

const simplifyRows = new Function(
  'state','toast','pushUndo','commit','selected','condVal','actVal','comboTotal','cartesian','cloneRow','MAX_ROWS','DASH',
  `return (${extractFn('simplifyRows').replace(/^function simplifyRows/, 'function ')})();`
);
const run = () => simplifyRows(state, toast, pushUndo, commit, selected, condVal, actVal, comboTotal, cartesian, cloneRow, MAX_ROWS, DASH);

// ---- テスト用の組み立て ----
function setup(condDefs, rowSpecs){
  const conditions = condDefs.map(values => ({ id:nid(), name:`c${nid()}`, values, group:'' }));
  const act = { id:nid(), name:'動作' };
  state = { title:'', conditions, actions:[act], rows:[], layout:'v' };
  state.rows = rowSpecs.map(([vals, out, extra]) => ({
    id:nid(),
    cond:Object.fromEntries(conditions.map((c, i) => [c.id, vals[i]])),
    act:{ [act.id]: out }, na:false, note:'', ...(extra || {}),
  }));
  toasts = []; undos = [];
  return { conditions, act };
}
const rowVals = r => state.conditions.map(c => condVal(r, c));
// 表全体のカバー状況（動作ごと）。まとめの前後で意味が変わっていないかの確認に使う
function coverageMap(){
  const m = new Map();
  for (const combo of cartesian(state.conditions.map(c => c.values))) {
    const hits = state.rows.filter(r => state.conditions.every((c, i) => { const v = condVal(r, c); return v === DASH || v === combo[i]; }));
    m.set(JSON.stringify(combo), [...new Set(hits.map(r => JSON.stringify([r.na, r.note, Object.values(r.act)])))].sort().join('|'));
  }
  return m;
}

let failed = 0;
function check(name, cond, detail){
  if (cond) console.log(`ok    ${name}`);
  else { failed++; console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
function snapshotCoverage(){ return JSON.stringify([...coverageMap()].sort()); }

// 1. 完全な重複行がまとまる
{
  setup([[YES, NO]], [[[YES], 'X'], [[YES], 'X']]);
  run();
  check('重複行が 1 行になる', state.rows.length === 1 && rowVals(state.rows[0])[0] === YES, JSON.stringify(state.rows.map(rowVals)));
}

// 2. 「-」行に包含される行がまとまる
{
  setup([[YES, NO]], [[[DASH], 'X'], [[YES], 'X']]);
  run();
  check('包含される行が消えて「-」1 行になる', state.rows.length === 1 && rowVals(state.rows[0])[0] === DASH, JSON.stringify(state.rows.map(rowVals)));
}

// 3. 「-」同士が重なった局所解がほどける（旧実装では 3 行のまま。実は全組み合わせをカバーしており 1 行が最小）
{
  setup([[YES, NO], [YES, NO]], [[[DASH, YES], 'X'], [[YES, NO], 'X'], [[NO, DASH], 'X']]);
  const covBefore = snapshotCoverage();
  run();
  check('重なった 3 行が 1 行に組み直される', state.rows.length === 1 && rowVals(state.rows[0]).every(v => v === DASH), JSON.stringify(state.rows.map(rowVals)));
  check('　└ カバーする組み合わせと動作は不変', snapshotCoverage() === covBefore);
}

// 4. 従来どおりの統合（全組み合わせ → 1 行）
{
  setup([[YES, NO], [YES, NO]], [[[YES, YES], 'X'], [[YES, NO], 'X'], [[NO, YES], 'X'], [[NO, NO], 'X']]);
  run();
  check('全組み合わせが同じ動作なら 1 行', state.rows.length === 1 && rowVals(state.rows[0]).every(v => v === DASH), JSON.stringify(state.rows.map(rowVals)));
}

// 5. サンプル相当（送料無料）: 4 行 → 3 行
{
  setup([['無料', '有料'], [YES, NO]], [
    [['無料', YES], YES], [['無料', NO], NO], [['有料', YES], YES], [['有料', NO], YES],
  ]);
  const covBefore = snapshotCoverage();
  run();
  check('サンプル表が 4 行 → 3 行', state.rows.length === 3, JSON.stringify(state.rows.map(rowVals)));
  check('　└ カバーする組み合わせは不変', snapshotCoverage() === covBefore);
}

// 6. 動作・備考・対象外が違う行はまとまらない
{
  setup([[YES, NO]], [[[YES], 'X'], [[NO], 'Y']]);
  run();
  check('動作が違う行はまとまらない', state.rows.length === 2);
  setup([[YES, NO]], [[[YES], 'X'], [[NO], 'X', { note:'メモ' }]]);
  run();
  check('備考が違う行はまとまらない', state.rows.length === 2);
  setup([[YES, NO]], [[[YES], 'X', { na:true }], [[NO], 'X']]);
  run();
  check('対象外の行は通常の行とまとまらない', state.rows.length === 2);
  setup([[YES, NO]], [[[YES], '', { na:true }], [[NO], '', { na:true }]]);
  run();
  check('対象外どうしはまとまる', state.rows.length === 1 && rowVals(state.rows[0])[0] === DASH);
}

// 7. 定義外の値を使う行はそのまま残り、理由がトーストに出る
{
  setup([[YES, NO]], [[['△'], 'X'], [['△'], 'X']]);
  run();
  check('定義外の値の行は触らない', state.rows.length === 2);
  check('　└ 理由がトーストに出る', toasts.some(m => m.includes('値の定義にない')), JSON.stringify(toasts));
}

// 8. まとめられないときは状態が変わらず undo も積まれない
{
  setup([[YES, NO]], [[[YES], 'X'], [[NO], 'Y']]);
  const before = JSON.stringify(state);
  run();
  check('変化なしなら state は不変', JSON.stringify(state) === before);
  check('　└ undo 履歴も積まれない', undos.length === 0);
  check('　└ トーストが出る', toasts.some(m => m.includes('まとめられるルールはありませんでした')));
}

// 9. まとまったときは undo が 1 回積まれる
{
  setup([[YES, NO]], [[[YES], 'X'], [[NO], 'X']]);
  run();
  check('まとまったら undo が積まれる', undos.length === 1 && state.rows.length === 1);
}

// 10. 組み合わせが MAX_ROWS 超でも重複・包含はまとまる（展開しない経路）
{
  const defs = Array.from({ length: 13 }, () => [YES, NO]);   // 2^13 = 8192 > 4096
  const v = i => defs.map((_, k) => (k === 0 ? [YES, NO, DASH][i] : YES));
  setup(defs, [[v(0), 'X'], [v(0), 'X'], [v(2), 'X'], [v(1), 'X']]);
  run();
  check('展開しない経路でも重複と包含がまとまる', state.rows.length === 1 && rowVals(state.rows[0])[0] === DASH, JSON.stringify(state.rows.map(rowVals)));
}

// 11. 行数が増えることはない（重なったままの 2 行は元のまま）
{
  setup([[YES, NO], [YES, NO]], [[[DASH, YES], 'X'], [[YES, DASH], 'X']]);
  const before = JSON.stringify(state.rows.map(rowVals));
  run();
  check('減らないグループは元のまま', JSON.stringify(state.rows.map(rowVals)) === before);
}

// 12. グループごとに独立して最小化される（違う動作が混ざっても正しい）
{
  setup([[YES, NO], [YES, NO]], [
    [[YES, YES], 'X'], [[YES, NO], 'X'],   // → (○,-) X
    [[NO, YES], 'Y'], [[NO, NO], 'Y'],     // → (×,-) Y
  ]);
  const covBefore = snapshotCoverage();
  run();
  check('動作ごとに別々にまとまる', state.rows.length === 2, JSON.stringify(state.rows.map(rowVals)));
  check('　└ カバーする組み合わせは不変', snapshotCoverage() === covBefore);
}

// 13. 3 値の条件でも全値がそろったときだけまとまる
{
  setup([['高', '中', '低']], [[['高'], 'X'], [['中'], 'X']]);
  run();
  check('値がそろわなければまとまらない', state.rows.length === 2);
  setup([['高', '中', '低']], [[['高'], 'X'], [['中'], 'X'], [['低'], 'X']]);
  run();
  check('3 値そろえば 1 行になる', state.rows.length === 1 && rowVals(state.rows[0])[0] === DASH);
}

console.log(failed ? `\n${failed} 件失敗` : '\nすべて成功');
process.exit(failed ? 1 : 0);
