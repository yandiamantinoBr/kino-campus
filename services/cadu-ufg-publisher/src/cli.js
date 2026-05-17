#!/usr/bin/env node
'use strict';

const { runCadu } = require('./runner');

function parseArgs(argv) {
  const options = { mode: 'quick', dryRun: true, publish: false, sources: [] };
  argv.forEach((arg) => {
    if (arg === '--publish') {
      options.publish = true;
      options.dryRun = false;
      return;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      options.publish = false;
      return;
    }
    if (arg === '--notify-dry-run') {
      options.notifyDryRun = true;
      return;
    }
    if (arg.startsWith('--mode=')) options.mode = arg.split('=')[1] || 'quick';
    if (arg.startsWith('--source=')) options.sources.push(arg.split('=')[1]);
    if (arg.startsWith('--state=')) options.statePath = arg.slice('--state='.length);
  });
  return options;
}

if (require.main === module) {
  runCadu(parseArgs(process.argv.slice(2)))
    .then(({ digest }) => {
      console.log(digest);
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}

module.exports = {
  parseArgs,
};
