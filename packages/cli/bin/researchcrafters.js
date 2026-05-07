#!/usr/bin/env node
import('../dist/index.js')
  .then((mod) => mod.run(process.argv))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err?.stack ?? err);
    process.exit(1);
  });
