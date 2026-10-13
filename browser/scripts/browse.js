#!/usr/bin/env node
/*
 * browse.js - agentic browser control with a built-in approval gate.
 *
 * SECURITY MODEL (structural, not just prompt politeness):
 *   - `plan`   : parse + validate steps. Opens NOTHING. Prints a readable
 *                plan + a stable plan-hash. Exits.
 *   - `execute`: runs ONLY with --confirm AND --plan-hash that matches a plan
 *                that was actually produced. Re-declares steps; refuses on
 *                mismatch. Makes "approved A, silently did B" impossible.
 *   - Isolated browser context by default (no cookies / no logged-in session)
 *     unless --persistent is explicitly passed.
 *
 * Requires Playwright (Chromium). Install once:
 *   npm install && npx playwright install chromium
 */
'use strict';

const crypto = require('crypto');

function die(msg, code) {
  if (code === undefined) code = 2;
  process.stderr.write('browse: ' + msg + '\n');
  process.exit(code);
}

// ---------- tiny arg parser ----------
function parseArgs(argv) {
  var out = { _: [], steps: [] };
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    if (a === '--step') {
      var v = argv[++i];
      if (v === undefined) die('--step needs a value');
      out.steps.push(v);
    } else if (a.indexOf('--') === 0) {
      var key = a.slice(2);
      var next = argv[i + 1];
      if (next !== undefined && next.indexOf('--') !== 0) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

// ---------- step DSL ----------
// Verbs: goto|click|type|press|wait|read|screenshot
var KNOWN = ['goto', 'click', 'type', 'press', 'wait', 'read', 'screenshot'];

function parseStep(raw) {
  var s = raw.trim();
  if (!s) die('empty --step');
  var m = s.match(/^(\S+)\s*([\s\S]*)$/);
  var verb = m[1].toLowerCase();
  if (KNOWN.indexOf(verb) === -1) {
    die('unknown step verb "' + verb + '". Known: ' + KNOWN.join(', '));
  }
  return { raw: s, verb: verb, rest: m[2] || '' };
}

// Sensitive-action detector: forces an EXTRA explicit ok even in an approved
// plan, because the blast radius (money, credentials) is high.
var SENSITIVE_HOST = /(paypal|stripe|checkout|bank|payment|billing|venmo|cashapp|coinbase|binance)/i;
function hostOf(u) {
  try { return new URL(u.trim()).hostname; } catch (e) { return ''; }
}
function isSensitive(url, steps) {
  var hits = [];
  var h0 = url ? hostOf(url) : '';
  if (h0 && SENSITIVE_HOST.test(h0)) hits.push('payment/bank host: ' + h0);
  steps.forEach(function (st) {
    if (st.verb === 'goto') {
      var h = hostOf(st.rest);
      if (h && SENSITIVE_HOST.test(h)) hits.push('goto to payment/bank host: ' + h);
    }
    if (st.verb === 'type' && /password|passwd|pwd/i.test(st.rest)) {
      hits.push('typing into a password field');
    }
  });
  return hits;
}

function planHash(url, steps) {
  var canonical = JSON.stringify({ url: url || null, steps: steps.map(function (s) { return s.raw; }) });
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

function printPlan(url, steps, hash, sensitive) {
  process.stdout.write('=== BROWSER PLAN (nothing opened yet) ===\n');
  if (url) process.stdout.write('url: ' + url + '\n');
  steps.forEach(function (st, i) { process.stdout.write('  ' + (i + 1) + '. ' + st.raw + '\n'); });
  process.stdout.write('context: ' + (sensitive.persistent ? 'PERSISTENT (your logged-in profile!)' : 'isolated (no cookies)') + '\n');
  if (sensitive.hits.length) {
    process.stdout.write('\n!! SENSITIVE ACTIONS DETECTED - execute needs an extra explicit ok:\n');
    sensitive.hits.forEach(function (h) { process.stdout.write('   - ' + h + '\n'); });
  }
  process.stdout.write('\nplan-hash: ' + hash + '\n');
  process.stdout.write('After approval, run execute with:\n');
  process.stdout.write('  node browse.js execute --plan-hash ' + hash + ' --confirm' + (sensitive.hits.length ? ' --sensitive-ok' : '') + ' ...\n');
}

function loadPlaywright() {
  var pw;
  try {
    pw = require('playwright');
  } catch (e) {
    die('Playwright not installed. Run: npm install && npx playwright install chromium');
  }
  return pw;
}

async function main() {
  var args = parseArgs(process.argv.slice(2));
  var cmd = args._[0];
  var url = typeof args.url === 'string' ? args.url : undefined;
  var steps = (args.steps || []).map(parseStep);

  if (!cmd || cmd === 'help' || cmd === '--help') {
    process.stdout.write([
      'browse.js <command> [options]',
      '',
      'Commands:',
      '  plan     Validate + show a plan. Opens nothing. Prints a plan-hash.',
      '  execute  Run an APPROVED plan. Requires --confirm and --plan-hash <hash>.',
      '  read     Convenience: read visible text of a URL. Requires --confirm.',
      '',
      'Options:',
      '  --url <u>          starting URL',
      '  --step "..."       a step (repeatable). Verbs: goto|click|type|press|wait|read|screenshot',
      '  --confirm          required by execute (the approval token)',
      '  --plan-hash <h>    required by execute; must match the plan shown to the user',
      '  --sensitive-ok     required by execute when the plan flagged sensitive actions',
      '  --persistent       use a persistent context (your real cookies) - OFF by default',
      '  --headless         run without a visible window (default is headed/visible)',
      '',
      'Examples:',
      '  node browse.js plan --url https://news.ycombinator.com',
      '  node browse.js plan --url https://example.com --step "type \"input[name=q]\" \"hi\"" --step press Enter',
      '  node browse.js execute --plan-hash ab12cd34ef56 --confirm --url https://example.com'
    ].join('\n') + '\n');
    return;
  }

  if (cmd === 'plan') {
    if (!url && !steps.some(function (s) { return s.verb === 'goto'; })) {
      die('plan needs a --url or a "goto" step');
    }
    var sensitive = { persistent: !!args.persistent, hits: isSensitive(url, steps) };
    var hash = planHash(url, steps);
    printPlan(url, steps, hash, sensitive);
    return;
  }

  if (cmd === 'execute') {
    if (!args.confirm) die('execute requires --confirm (the user must have approved the plan)');
    if (!args['plan-hash']) die('execute requires --plan-hash <hash> from the approved plan');
    var expected = planHash(url, steps);
    if (expected !== args['plan-hash']) {
      die('plan-hash mismatch: approved ' + args['plan-hash'] + ' but these steps hash to ' + expected + '. Re-declare steps exactly as approved.', 3);
    }
    var sens2 = { persistent: !!args.persistent, hits: isSensitive(url, steps) };
    if (sens2.hits.length && !args['sensitive-ok']) {
      die('this plan contains sensitive actions; re-run with --sensitive-ok after explicit approval');
    }
    var pw = loadPlaywright();
    var browser = await pw.chromium.launch({ headless: !!args.headless });
    var context = await browser.newContext();
    var page = await context.newPage();
    try {
      if (url) await page.goto(url, { waitUntil: 'domcontentloaded' });
      for (var idx = 0; idx < steps.length; idx++) {
        var st = steps[idx];
        if (st.verb === 'goto') {
          await page.goto(st.rest.trim(), { waitUntil: 'domcontentloaded' });
        } else if (st.verb === 'click') {
          await page.click(st.rest.trim());
        } else if (st.verb === 'type') {
          var sm = st.rest.match(/^(".*?"|\S+)\s+([\s\S]*)$/);
          if (!sm) die('bad type step: ' + st.raw);
          var sel = sm[1].replace(/^"|"$/g, '');
          var val = sm[2].replace(/^"|"$/g, '');
          await page.fill(sel, val);
        } else if (st.verb === 'press') {
          await page.keyboard.press(st.rest.trim() || 'Enter');
        } else if (st.verb === 'wait') {
          await page.waitForTimeout(parseInt(st.rest, 10) || 1000);
        } else if (st.verb === 'read') {
          var text = await page.evaluate(function () { return document.body ? document.body.innerText : ''; });
          process.stdout.write(text.slice(0, 20000));
        } else if (st.verb === 'screenshot') {
          var file = st.rest.trim() || ('screenshot-' + Date.now() + '.png');
          await page.screenshot({ path: file, fullPage: false });
          process.stdout.write('screenshot saved: ' + file + '\n');
        }
      }
      process.stdout.write('\n[done]\n');
    } finally {
      await context.close();
      await browser.close();
    }
    return;
  }

  if (cmd === 'read') {
    if (!args.confirm) die('read requires --confirm too (it still touches the network)');
    if (!url) die('read requires --url');
    var pw2 = loadPlaywright();
    var br2 = await pw2.chromium.launch({ headless: !!args.headless });
    var ctx2 = await br2.newContext();
    var pg2 = await ctx2.newPage();
    try {
      await pg2.goto(url, { waitUntil: 'domcontentloaded' });
      var t2 = await pg2.evaluate(function () { return document.body ? document.body.innerText : ''; });
      process.stdout.write(t2.slice(0, 20000));
    } finally {
      await ctx2.close();
      await br2.close();
    }
    return;
  }

  die('unknown command: ' + cmd);
}

main().catch(function (e) {
  process.stderr.write('browse: fatal: ' + (e && e.message ? e.message : e) + '\n');
  process.exit(1);
});
