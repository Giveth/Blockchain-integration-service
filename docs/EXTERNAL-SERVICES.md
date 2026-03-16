# External Services — Blockchain Integration Service

> Every external service and internal consumer this repo connects to. For implementation details, read the source files referenced in each section.

---

## System Diagram

                    ┌──────────────────────────────────────┐
                    │   giveth-v6-core (NestJS · GraphQL)  │
                    └──────────────┬───────────────────────┘
                                   │  HTTP REST
                                   ▼
                    ┌──────────────────────────────────────┐
                    │   Blockchain Integration Service     │
                    │         Express · REST               │
                    └──┬───┬───┬───┬───────────────────────┘
                       │   │   │   │
       ┌───────────────┘   │   │   └────────────────────┐
       │         ┌─────────┘   └──────────┐             │
       ▼         ▼                        ▼             ▼
 ┌──────────┐ ┌──────────┐        ┌────────────┐ ┌───────────┐
 │ EVM RPC  │ │  Solana  │        │  CoinGecko │ │ Safe API  │
 │Providers │ │   RPC    │        │  (prices)  │ │ (multisig)│
 └────┬─────┘ └──────────┘        └────────────┘ └───────────┘
      │
      ▼
 ┌──────────────────────────────────────────────────────────┐
 │  DonationHandler.sol contracts + ERC-20 token contracts  │
 └──────────────────────────────────────────────────────────┘

---

## Consumer

### giveth-v6-core

The only direct consumer. v6-core proxies all blockchain interaction through this service via REST endpoints for transaction verification, token price lookups, and chain metadata queries.

- **Their client code:** `giveth-v6-core/src/integrations/blockchain/blockchain.service.ts`
- **Endpoints actively consumed:** `POST /api/verify`, `POST /api/timestamp`, `POST /api/price`, `GET /api/chains`, `GET /api/chains/:networkId/transaction-url/:txHash`
- **Endpoint wired but not yet called:** `POST /api/verify-batch` (client method exists in v6-core but no call site uses it)

---

## Dependencies

### EVM RPC Providers

JSON-RPC connections to 9 EVM networks (Ethereum, Polygon, Optimism, Arbitrum, Gnosis, Celo, Base, BSC, Avalanche) via ethers.js. Used for fetching transaction receipts, parsing event logs, and reading token metadata. Also supports `debug_traceTransaction` for Account Abstraction (EIP-4337) internal transfers, with graceful fallback.

- **Config:** `src/config/networks.ts` — each network has a `*_RPC_URL` env var.

### Solana RPC

Direct connection via `@solana/web3.js` for parsing Solana transactions and calculating SOL/SPL token balance changes.

- **Config:** `SOLANA_RPC_URL` env var.

### CoinGecko API

Token price lookups in USD by symbol or contract address. Results cached in-memory (1-min TTL).

- **Source:** `src/services/priceService.ts`

### Safe API (Gnosis Safe)

Resolves Safe multisig `safeTxHash` values to actual on-chain transaction hashes so the service can then verify the real transaction.

- **Package:** `@safe-global/api-kit`
- **Source:** `src/services/safe/safeTransactionService.ts`

### DonationHandler Smart Contracts

Giveth's upgradeable Solidity contracts (repo: `donation-handler-foundry`) deployed on 7 EVM networks. This service parses their `DonationMade` events to verify individual donations within batch transactions.

- **Address registry:** `src/config/donationHandlers.ts`

### ERC-20 Token Contracts

Interacts with ERC-20 contracts for `symbol()` validation, `decimals()` lookups (some paths fall back to 18), and `Transfer` event log parsing during donation verification.

---

## Infrastructure

Deployed via Docker Compose (repo: `giveth-v6-deploy`) alongside giveth-v6-core, Redis, and Caddy reverse proxy. This service is **stateless** — no database and no persistent business data. It does hold in-memory caches and connection pools (CoinGecko price cache, EVM provider instances, Solana connections, chain handler registry) that are rebuilt on restart.