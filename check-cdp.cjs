const http = require('node:http');
async function check(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/json/version`, (res) => { res.resume(); resolve('OK'); });
    req.on('error', () => resolve('NO'));
    req.setTimeout(3000, () => { req.destroy(); resolve('TIMEOUT'); });
  });
}
(async () => {
  for (const p of [10644, 10744, 10844]) console.log(`Port ${p}:`, await check(p));
})();
