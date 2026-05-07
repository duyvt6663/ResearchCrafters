#!/usr/bin/env node
import('../dist/index.js')
  .then((mod) => mod.run(process.argv))
  .catch((err) => {
     
    console.error(err?.stack ?? err);
    process.exit(1);
  });
