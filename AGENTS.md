# Repository Guidelines

## Project Structure & Module Organization

Source lives in `src/`. `src/server.ts` boots the HTTP service, while `src/index.ts` exposes the library entrypoint. `src/api/` contains the Express app, route handlers, and middleware. `src/services/` holds transaction verification, price lookups, chain-specific integrations, and Safe support. Shared configuration is under `src/config/`, reusable helpers under `src/utils/`, and domain types under `src/types/`. Tests are colocated with code as `*.test.ts` files, for example `src/api/routes/transaction.routes.test.ts`. Reference material lives in `docs/`, and `dist/` is the TypeScript build output.

## Build, Test, and Development Commands

Run `npm ci` first to install the locked dependency set. Use `npm run dev` to start the API with hot reload from `src/server.ts`. Use `npm run build` to compile TypeScript into `dist/`, then `npm start` to run the compiled server. Run `npm test` for the Mocha suite, `npm run test:coverage` for NYC coverage output, and `npm run test:watch` while iterating. Use `npm run lint`, `npm run lint:fix`, and `npm run prettify` for style checks and formatting. For containerized local runs, copy `.env.example` to `.env` and use `docker-compose up -d`.

## Coding Style & Naming Conventions

This project uses TypeScript with ESLint and Prettier. Follow formatter settings: 2-space indentation, semicolons, single quotes, trailing commas, and an 80-character print width. Use `PascalCase` for classes and error types, `camelCase` for functions, services, and variables, and keep file names descriptive and consistent with patterns such as `transactionVerificationService.ts`, `chains.routes.ts`, and `*.test.ts`.

## Testing Guidelines

Tests run with Mocha, Chai, Sinon, and Supertest through `ts-node/register`. Add tests beside the code you change and name them `*.test.ts`. Prefer stubbing external RPC or service calls rather than hitting live networks. There is no enforced coverage gate in the repo today, so new features and bug fixes should include focused route or service tests to prevent regressions.

## Commit & Pull Request Guidelines

Recent history favors short, descriptive commit subjects such as `Add AA donation verification`, `fix service name`, and `Update healthcheck commands...`. Keep commits small and scoped to one change. Pull requests should describe the behavior change, note any required `.env` or deployment updates, link the related issue, and include sample requests or responses when API contracts change.

## Security & Configuration Tips

Start from `.env.example` and never commit secrets, RPC keys, or deployment credentials. Verify changes to Docker, health checks, or ports against the GitHub Actions workflows in `.github/workflows/`, since `staging` and `main` trigger image build and deploy pipelines.

## Architecture & External Services

If your task involves understanding how this service connects to other Giveth services, what external APIs or RPC providers it depends on, or how giveth-v6-core consumes it, read [docs/EXTERNAL-SERVICES.md](docs/EXTERNAL-SERVICES.md).
