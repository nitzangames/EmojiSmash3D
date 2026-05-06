import { createRequire } from 'module';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const require = createRequire(import.meta.url);
const puppeteer = require('/usr/local/lib/node_modules/puppeteer');
const __dirname = dirname(fileURLToPath(import.meta.url));

(async () => {
  const server = spawn('python3', ['-m', 'http.server', '8081'], { cwd: __dirname, stdio: 'inherit' });
  await new Promise(r => setTimeout(r, 800));

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 512, height: 512, deviceScaleFactor: 2 });
  await page.goto('http://localhost:8081/thumbnail.html', { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__rendered === true);
  await new Promise(r => setTimeout(r, 200));
  await page.screenshot({ path: 'thumbnail.png', clip: { x: 0, y: 0, width: 512, height: 512 } });
  await browser.close();
  server.kill();
})();
