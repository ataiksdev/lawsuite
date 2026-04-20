# E2E Tests (LegalOps)

This directory contains End-to-End tests for the Lawsuite platform, written in Python using Playwright.

## Running Tests

These tests are integrated into the backend project. To run them, ensure both the **backend** and **frontend** are running locally.

### Standard Run
From the `backend` directory:
```bash
make test-e2e
```

### Headed Run (Watch the browser)
```bash
make test-e2e-headed
```

## Integration with Backend Tests
Since these tests are in the `backend` project, you can easily use backend models or helper scripts to seed data before running your Playwright tests.
