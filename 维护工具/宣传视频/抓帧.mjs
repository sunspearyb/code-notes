// 宣传片的逐帧抓取：打开 renderer page，按时间轴调用 window.renderFrame(t)，每帧存一张 PNG。
// 用法：node 抓帧.mjs <渲染.html 网址> <输出文件夹> <临时浏览器资料夹> [开始秒] [结束秒] [每秒帧数]
// 不读项目里的任何笔记或数据包；页面只带法名列表和宪法条文，都是公开文本。
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [url, outDir, profile, from = '0', to = '60', fpsArg = '30'] = process.argv.slice(2);
const start = Number(from), end = Number(to), fps = Number(fpsArg);
const chromePath = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Each run gets its own debugging port (渲染.py passes a free one), so several films can render at once.
const port = process.env.CDP_PORT || '9336';
const [VW, VH] = (process.env.FRAME_SIZE || '1920x1080').split('x').map(Number);

fs.mkdirSync(outDir, {recursive: true});
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
  '--no-first-run', '--hide-scrollbars', '--allow-file-access-from-files', '--force-device-scale-factor=1',
  '--window-size=' + VW + ',' + VH, 'about:blank'], {stdio: 'ignore'});

let tabs;
for (let i = 0; i < 80; i++) {
  try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (tabs.some(t => t.type === 'page')) break; } catch {}
  await sleep(200);
}
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0;
const pending = {}, pageErrors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({id: i, method, params})); });
const evaluate = async expression => {
  const r = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'page error');
  return r.result?.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {width: VW, height: VH, deviceScaleFactor: 1, mobile: false});
await send('Page.navigate', {url});
await sleep(1200);
const film = await evaluate('window.FILM');
if (!film) { console.error('页面没有加载完成：找不到 window.FILM'); process.exit(1); }

// Fonts must be ready before the first frame, or the type would shift halfway through the film.
await evaluate(`(async()=>{await document.fonts.ready;return true})()`);

const total = Math.min(end, film.duration);
const count = Math.round((total - start) * fps);
if (count <= 0) { console.error(`时间超出影片长度（${film.duration} 秒）：${start}`); chrome.kill(); process.exit(1); }
for (let i = 0; i < count; i++) {
  const t = start + i / fps;
  await evaluate(`window.renderFrame(${t.toFixed(5)})`);
  const shot = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false});
  fs.writeFileSync(path.join(outDir, `${String(i).padStart(5, '0')}.png`), Buffer.from(shot.result.data, 'base64'));
  if (i % 60 === 0) process.stdout.write(`\r抓帧 ${i}/${count}`);
}
process.stdout.write(`\r抓帧 ${count}/${count}\n`);
if (pageErrors.length) { console.error('页面错误：\n' + pageErrors.slice(0, 5).join('\n')); process.exitCode = 1; }
ws.close();
chrome.kill();
