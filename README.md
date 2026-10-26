# igotu
Final Year Project


Development review and local testing
----------------------------------

The application is in `igotu_v2/`. See the [system audit](docs/system-audit.md)
for fixes, module coverage, screenshots, database dependencies and readiness,
and the [source inventory](docs/system-inventory.md) for page/API mappings.
Security and mandatory-verification migrations remain review-only; local tests
are not proof of deployed RLS or Storage authorization. Do not follow historical
setup scripts as an automatic migration sequence.

Synthetic browser tests use no real accounts, emails, documents or payments:

```sh
npm ci --prefix tests --ignore-scripts
python -m pip install -r tests/requirements.txt
# Install Chromium or set CHROMIUM_PATH to your installed executable.
npm test --prefix tests
```

The runner starts its own loopback server and writes logs/results/screenshots
under ignored `work/system-audit/final/`. See the audit for actual-backend test
prerequisites and blocked acceptance groups. No deployment or live Supabase
operation is part of this test command.
