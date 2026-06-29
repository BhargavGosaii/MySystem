import * as fs from 'fs';
import * as path from 'path';
import { inspectService } from '../services/inspect';
import { runAdvisor } from '../advisor/index';

async function run() {
  const benchmarksDir = path.join(__dirname, '../../benchmarks');
  if (!fs.existsSync(benchmarksDir)) {
    console.error(`Benchmarks directory not found at: ${benchmarksDir}`);
    process.exit(1);
  }

  const entries = fs.readdirSync(benchmarksDir);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('                 MYSYSTEM BENCHMARK SUITE RUNNER');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let passed = 0;
  let total = 0;

  for (const entry of entries) {
    const projectRoot = path.join(benchmarksDir, entry);
    if (!fs.statSync(projectRoot).isDirectory()) continue;

    const expectedPath = path.join(projectRoot, 'expected.json');
    if (!fs.existsSync(expectedPath)) continue;

    total++;
    const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));

    const backupEnv = { ...process.env };
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;
    delete process.env.SENTRY_DSN;

    try {
      const characteristics = await inspectService.inspect(projectRoot);
      const review = await runAdvisor(characteristics, projectRoot);
      
      process.env = backupEnv;

      // Extract decisions
      const actualHosting = review.decisions.find(d => d.component === 'hosting')?.value || 'ec2';
      const actualDatabase = review.decisions.find(d => d.component === 'database')?.value || 'none';
      const actualRedis = review.decisions.find(d => d.component === 'redis')?.value === 'true' || review.decisions.find(d => d.component === 'redis')?.value === true;
      const actualPgBouncer = review.decisions.find(d => d.component === 'pgBouncer')?.value === 'true' || review.decisions.find(d => d.component === 'pgBouncer')?.value === true;
      const actualWaf = review.decisions.find(d => d.component === 'waf')?.value === 'true' || review.decisions.find(d => d.component === 'waf')?.value === true;
      const actualCost = review.totalMonthlyCost;

      const hostingPass = actualHosting === expected.hosting;
      const databasePass = actualDatabase === expected.database;
      const redisPass = actualRedis === expected.redis;
      const pgBouncerPass = actualPgBouncer === expected.pgBouncer;
      const wafPass = actualWaf === expected.waf;
      const costPass = actualCost <= expected.maxMonthlyCost;

      const isPass = hostingPass && databasePass && redisPass && pgBouncerPass && wafPass && costPass;

      if (isPass) {
        passed++;
        console.log(`  ✅  \x1b[32mPASS\x1b[0m  ${entry.padEnd(20)} | Cost: $${actualCost.toFixed(2)} (Limit: $${expected.maxMonthlyCost.toFixed(2)})`);
      } else {
        console.log(`  ❌  \x1b[31mFAIL\x1b[0m  ${entry.padEnd(20)}`);
        if (!hostingPass) console.log(`       - Hosting: expected "${expected.hosting}", got "${actualHosting}"`);
        if (!databasePass) console.log(`       - Database: expected "${expected.database}", got "${actualDatabase}"`);
        if (!redisPass) console.log(`       - Redis: expected "${expected.redis}", got "${actualRedis}"`);
        if (!pgBouncerPass) console.log(`       - PgBouncer: expected "${expected.pgBouncer}", got "${actualPgBouncer}"`);
        if (!wafPass) console.log(`       - WAF: expected "${expected.waf}", got "${actualWaf}"`);
        if (!costPass) console.log(`       - Cost: actual $${actualCost.toFixed(2)} exceeds expected max $${expected.maxMonthlyCost.toFixed(2)}`);
      }
    } catch (err: any) {
      process.env = backupEnv;
      console.log(`  ❌  \x1b[31mFAIL\x1b[0m  ${entry.padEnd(20)} - Error: ${err.message}`);
    }
  }

  const accuracy = total > 0 ? (passed / total) * 100 : 0;
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Benchmark Accuracy: ${accuracy.toFixed(1)}% (${passed}/${total} passed)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (passed < total) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal benchmark runner error:', err);
  process.exit(1);
});
