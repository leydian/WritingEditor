const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const indexPath = path.join(root, 'index.html');
const appPath = path.join(root, 'app.js');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
}

function warn(msg) {
  console.warn(`WARN: ${msg}`);
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

function run() {
  const indexHtml = read(indexPath);
  const appJs = read(appPath);

  if (!/Content-Security-Policy/i.test(indexHtml)) {
    fail('index.html에 CSP가 없습니다.');
  } else {
    ok('CSP 존재 확인');
  }

  const dynamicDocumentWrite = /document\.write\s*\(\s*`[^`]*\$\{/.test(appJs);
  if (dynamicDocumentWrite) {
    fail('동적 document.write 템플릿 문자열이 감지되었습니다.');
  } else {
    ok('동적 document.write 미사용 확인');
  }

  const dangerousInnerHtml = [...appJs.matchAll(/\.innerHTML\s*=\s*`([^`]*\$\{[^`]*`)/g)];
  if (dangerousInnerHtml.length > 0) {
    warn(`템플릿 기반 innerHTML 할당 ${dangerousInnerHtml.length}건 감지됨. textContent/DOM API 전환 권장.`);
  } else {
    ok('템플릿 기반 innerHTML 미감지');
  }

  if (process.exitCode && process.exitCode !== 0) {
    console.error('Security preflight check failed');
    return;
  }
  console.log('Security preflight check passed');
}

run();
