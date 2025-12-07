# API Documentation

## Table of Contents

- [REST API Endpoints](#rest-api-endpoints)
  - [Health Check](#health-check)
  - [Get Supported Chains](#get-supported-chains)
  - [Get Chain by ID](#get-chain-by-id)
  - [Get Transaction URL](#get-transaction-url)
  - [Verify Transaction](#verify-transaction)
  - [Batch Verify Transactions](#batch-verify-transactions)
  - [Get Transaction Timestamp](#get-transaction-timestamp)
  - [Get Token Price](#get-token-price)
- [Transaction Verification Service](#transaction-verification-service)
- [Chain-Specific Services](#chain-specific-services)
- [Safe Transaction Service](#safe-transaction-service)
- [Types](#types)
- [Utilities](#utilities)

## REST API Endpoints

### Health Check

**GET** `/api/health`

Check the health status of the service.

**Response:**
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "environment": "production",
  "version": "1.0.0"
}
```

---

### Get Supported Chains

**GET** `/api/chains`

Returns all supported blockchain networks.

**Response:**
```json
{
  "success": true,
  "data": {
    "chains": [
      {
        "id": 1,
        "name": "Ethereum Mainnet",
        "nativeCurrency": {
          "name": "Ethereum",
          "symbol": "ETH",
          "decimals": 18
        },
        "blockExplorerUrl": "https://etherscan.io",
        "isActive": true
      },
      {
        "id": 137,
        "name": "Polygon",
        "nativeCurrency": {
          "name": "MATIC",
          "symbol": "MATIC",
          "decimals": 18
        },
        "blockExplorerUrl": "https://polygonscan.com",
        "isActive": true
      }
    ]
  }
}
```

---

### Get Chain by ID

**GET** `/api/chains/:networkId`

Returns configuration for a specific chain.

**Parameters:**
- `networkId` (path): The chain/network ID

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Ethereum Mainnet",
    "nativeCurrency": {
      "name": "Ethereum",
      "symbol": "ETH",
      "decimals": 18
    },
    "blockExplorerUrl": "https://etherscan.io",
    "isActive": true
  }
}
```

**Response (Not Found):**
```json
{
  "success": false,
  "error": "Chain not found: 999999",
  "code": "CHAIN_NOT_FOUND"
}
```

---

### Get Transaction URL

**GET** `/api/chains/:networkId/transaction-url/:txHash`

Returns the block explorer URL for a transaction.

**Parameters:**
- `networkId` (path): The chain/network ID
- `txHash` (path): Transaction hash

**Response:**
```json
{
  "success": true,
  "data": {
    "url": "https://etherscan.io/tx/0xabc123..."
  }
}
```

---

### Verify Transaction

**POST** `/api/verify`

Verify a single transaction against expected parameters.

Verify a single transaction against expected parameters.

**Request Body:**
```json
{
  "txHash": "0xabc123...",
  "networkId": 1,
  "symbol": "ETH",
  "fromAddress": "0x1234...",
  "toAddress": "0x5678...",
  "amount": 1.5,
  "timestamp": 1234567890,
  "isSwap": false,
  "safeTxHash": "",
  "nonce": 0,
  "chainType": "EVM",
  "importedFromDraftOrBackupService": false
}
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "status": "SUCCESS",
    "transaction": {
      "hash": "0xabc123...",
      "from": "0x1234...",
      "to": "0x5678...",
      "amount": 1.5,
      "timestamp": 1234567890
    }
  }
}
```

**Response (Validation Failed):**
```json
{
  "success": true,
  "data": {
    "status": "FAILED",
    "error": "Transaction amount does not match expected amount",
    "errorCode": "AMOUNT_MISMATCH"
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "txHash",
      "message": "txHash is required"
    }
  ]
}
```

---

### Batch Verify Transactions

**POST** `/api/verify-batch`

Verify multiple transactions in parallel (maximum 100 transactions).

**Request Body:**
```json
{
  "transactions": [
    {
      "txHash": "0xabc123...",
      "networkId": 1,
      "symbol": "ETH",
      "fromAddress": "0x1234...",
      "toAddress": "0x5678...",
      "amount": 1.5,
      "timestamp": 1234567890
    },
    {
      "txHash": "0xdef456...",
      "networkId": 137,
      "symbol": "MATIC",
      "fromAddress": "0x9abc...",
      "toAddress": "0xdef0...",
      "amount": 10.0,
      "timestamp": 1234567890
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 2,
    "successful": 2,
    "failed": 0,
    "results": [
      {
        "status": "SUCCESS",
        "transaction": {
          "hash": "0xabc123...",
          "from": "0x1234...",
          "to": "0x5678...",
          "amount": 1.5,
          "timestamp": 1234567890
        }
      },
      {
        "status": "SUCCESS",
        "transaction": {
          "hash": "0xdef456...",
          "from": "0x9abc...",
          "to": "0xdef0...",
          "amount": 10.0,
          "timestamp": 1234567890
        }
      }
    ]
  }
}
```

---

### Get Transaction Timestamp

**POST** `/api/timestamp`

Get the timestamp of a transaction from the blockchain.

**Request Body:**
```json
{
  "txHash": "0xabc123...",
  "networkId": 1
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "txHash": "0xabc123...",
    "networkId": 1,
    "timestamp": 1234567890,
    "date": "2009-02-13T23:31:30.000Z"
  }
}
```

---

### Get Token Price

**POST** `/api/price`

Get the current USD price of a token.

**Request Body:**
```json
{
  "networkId": 1,
  "symbol": "ETH",
  "tokenAddress": null
}
```

For ERC-20 tokens, provide the contract address:
```json
{
  "networkId": 1,
  "symbol": "USDC",
  "tokenAddress": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "networkId": 1,
    "symbol": "ETH",
    "tokenAddress": null,
    "priceUsd": 2345.67
  }
}
```

**Note:** If the price cannot be fetched, `priceUsd` returns `0` instead of an error.

---

## Transaction Verification Service

The main service for verifying blockchain transactions across multiple chains.

### Methods

#### `verifyTransaction(input: TransactionDetailInput): Promise<TransactionValidationResult>`

Verifies a transaction against expected parameters.

**Parameters:**
```typescript
interface TransactionDetailInput {
  txHash: string;                    // Transaction hash
  symbol: string;                    // Token symbol (ETH, SOL, etc.)
  networkId: number;                 // Network ID
  fromAddress: string;               // Expected sender address
  toAddress: string;                 // Expected recipient address
  amount: number;                    // Expected amount
  timestamp: number;                 // Transaction timestamp (Unix)
  safeTxHash?: string;              // Safe transaction hash (optional)
  nonce?: number;                   // Transaction nonce (optional)
  chainType?: ChainType;            // Chain type override (optional)
  isSwap?: boolean;                 // Is swap transaction (optional)
  importedFromDraftOrBackupService?: boolean; // Skip timestamp validation
}
```

**Returns:**
```typescript
interface TransactionValidationResult {
  isValid: boolean;
  transaction?: NetworkTransactionInfo;
  error?: string;
  errorCode?: BlockchainErrorCode;
}
```

**Example:**
```typescript
const result = await transactionVerificationService.verifyTransaction({
  txHash: '0xabc123...',
  networkId: 1,
  symbol: 'ETH',
  fromAddress: '0x1234...',
  toAddress: '0x5678...',
  amount: 1.5,
  timestamp: Date.now() / 1000,
});

if (result.isValid) {
  console.log('Valid transaction:', result.transaction);
}
```

---

#### `verifyTransactions(inputs: TransactionDetailInput[]): Promise<TransactionValidationResult[]>`

Verifies multiple transactions in parallel.

**Parameters:**
- `inputs`: Array of transaction detail inputs

**Returns:**
- Array of validation results

**Example:**
```typescript
const results = await transactionVerificationService.verifyTransactions([
  { txHash: '0x123...', networkId: 1, ... },
  { txHash: '0x456...', networkId: 137, ... },
]);
```

---

#### `getTransactionTimestamp(txHash: string, networkId: number): Promise<number>`

Gets the Unix timestamp of a transaction.

**Parameters:**
- `txHash`: Transaction hash
- `networkId`: Network ID

**Returns:**
- Unix timestamp (seconds)

---

## Donation Handler Support

The service supports verifying donations made through donation handler contracts (batch donation contracts). When a transaction is made to a known donation handler contract, the service automatically:

1. Detects that the transaction is to a donation handler
2. Parses event logs from the transaction (Transfer events for ERC-20, DonationMade events for native tokens)
3. Finds the specific transfer matching the expected recipient address
4. Extracts the correct amount for that specific donation

### Supported Methods

| Method | Description |
|--------|-------------|
| `donateManyERC20` | Batch ERC-20 token donations to multiple recipients |
| `donateManyEth` | Batch native token (ETH/MATIC/etc.) donations to multiple recipients |

### Supported Donation Handlers

| Network | Contract Address |
|---------|-----------------|
| Polygon | `0x6e349C56F512cB4250276BF36335c8dd618944A1` |

### How It Works

#### ERC-20 Donations (donateManyERC20)

For transactions like [this Polygon example](https://polygonscan.com/tx/0xc03e14920a8e27a9c791682f58bd8fcd1a67f00fdc47f12f7c0838ce1c3a1bda), where a single transaction distributes tokens to multiple recipients:

1. The `donateManyERC20` function is called on the donation handler contract
2. The handler distributes tokens to multiple recipients in one transaction
3. When verifying, the service parses all Transfer events
4. It finds the transfer matching the `toAddress` from the verification input
5. The amount and from address are extracted from that specific transfer

#### Native Token Donations (donateManyEth)

For native token batch donations:

1. The `donateManyEth` function is called with native value (ETH/MATIC)
2. The handler distributes native tokens to multiple recipients
3. When verifying, the service parses `DonationMade` events from the logs
4. It finds the donation matching the `toAddress` from the verification input
5. The amount is extracted and the network's native currency symbol is used

### Adding New Donation Handlers

To add support for new donation handler contracts, update the configuration in `src/config/donationHandlers.ts`:

```typescript
export const DONATION_HANDLER_ADDRESSES: Record<number, string[]> = {
  [NetworkId.POLYGON]: [
    '0x6e349C56F512cB4250276BF36335c8dd618944A1', // Existing handler
    '0xNEW_HANDLER_ADDRESS', // Add new handlers here
  ],
  [NetworkId.MAINNET]: [
    '0xMAINNET_HANDLER_ADDRESS', // Add mainnet handlers
  ],
};
```

---

## Chain-Specific Services

### EVM Transaction Service

Handles Ethereum Virtual Machine compatible blockchains.

#### Methods

##### `getTransactionInfo(input: TransactionDetailInput): Promise<NetworkTransactionInfo>`

Fetches transaction details from an EVM chain.

##### `getTransactionTimestamp(txHash: string, networkId: number): Promise<number>`

Gets transaction timestamp from block.

##### `isSwapTransactionToAddress(networkId: number, txHash: string, toAddress: string): Promise<boolean>`

Validates that a swap transaction transfers tokens to the target address.

**Example:**
```typescript
import { evmTransactionService } from '@giveth/blockchain-integration-service';

const txInfo = await evmTransactionService.getTransactionInfo({
  txHash: '0x123...',
  networkId: 1,
  symbol: 'ETH',
  fromAddress: '0xabc...',
  toAddress: '0xdef...',
  amount: 1.0,
  timestamp: Date.now() / 1000,
});
```

---

### Solana Transaction Service

Handles Solana blockchain transactions.

#### Methods

##### `getTransactionInfo(input: TransactionDetailInput): Promise<NetworkTransactionInfo>`

Fetches transaction details from Solana.

**Example:**
```typescript
import { solanaTransactionService } from '@giveth/blockchain-integration-service';

const txInfo = await solanaTransactionService.getTransactionInfo({
  txHash: '5J7Qu...',
  networkId: 101,
  symbol: 'SOL',
  fromAddress: 'Donor123...',
  toAddress: 'Project456...',
  amount: 5.0,
  timestamp: Date.now() / 1000,
});
```

---

## Safe Transaction Service

Handles Gnosis Safe multisig transactions.

### Methods

#### `fetchSafeTransactionHash(safeMessageHash: string, networkId: number): Promise<string | null>`

Fetches the actual blockchain transaction hash from a Safe transaction.

**Parameters:**
- `safeMessageHash`: Safe transaction hash
- `networkId`: Network ID

**Returns:**
- Transaction hash or null if not executed

---

#### `isSafeTransactionExecuted(safeMessageHash: string, networkId: number): Promise<boolean>`

Checks if a Safe transaction has been executed.

---

#### `getSafeTransactionDetails(safeMessageHash: string, networkId: number): Promise<Record<string, unknown>>`

Gets detailed information about a Safe transaction.

**Example:**
```typescript
import { safeTransactionService } from '@giveth/blockchain-integration-service';

// Fetch actual tx hash from Safe
const txHash = await safeTransactionService.fetchSafeTransactionHash(
  '0xsafe123...',
  1
);

// Check execution status
const isExecuted = await safeTransactionService.isSafeTransactionExecuted(
  '0xsafe123...',
  1
);
```

---

## Types

### ChainConfig

Configuration for a supported chain, used in API responses:

```typescript
interface ChainConfig {
  id: number;
  name: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  blockExplorerUrl: string;
  isActive: boolean;
}
```

### ChainType

```typescript
enum ChainType {
  EVM = 'EVM',
  SOLANA = 'SOLANA',
}
```

### TransactionVerificationResult

Result format for transaction verification API responses:

```typescript
interface TransactionVerificationResult {
  status: TransactionStatus;
  transaction?: {
    hash: string;
    from: string;
    to: string;
    amount: number;
    timestamp: number;
  };
  error?: string;
  errorCode?: string;
}
```

### TransactionStatus

```typescript
enum TransactionStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  PENDING = 'PENDING',
  NOT_FOUND = 'NOT_FOUND',
}
```

### NetworkTransactionInfo

```typescript
interface NetworkTransactionInfo {
  hash: string;
  amount: number;
  nonce?: number;
  from: string;
  to: string;
  currency: string;
  timestamp: number;
  status: TransactionStatus;
  blockNumber?: number;
  gasUsed?: string;
  gasPrice?: string;
}
```

### BlockchainErrorCode

```typescript
enum BlockchainErrorCode {
  TRANSACTION_NOT_FOUND = 'TRANSACTION_NOT_FOUND',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  INVALID_NETWORK_ID = 'INVALID_NETWORK_ID',
  INVALID_TRANSACTION_HASH = 'INVALID_TRANSACTION_HASH',
  FROM_ADDRESS_MISMATCH = 'FROM_ADDRESS_MISMATCH',
  TO_ADDRESS_MISMATCH = 'TO_ADDRESS_MISMATCH',
  AMOUNT_MISMATCH = 'AMOUNT_MISMATCH',
  TIMESTAMP_TOO_OLD = 'TIMESTAMP_TOO_OLD',
  NONCE_ALREADY_USED = 'NONCE_ALREADY_USED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  SWAP_VALIDATION_FAILED = 'SWAP_VALIDATION_FAILED',
  SAFE_TRANSACTION_NOT_FOUND = 'SAFE_TRANSACTION_NOT_FOUND',
  UNSUPPORTED_CHAIN = 'UNSUPPORTED_CHAIN',
}
```

---

## Utilities

### Validation Utils

#### `closeTo(a: number, b: number, delta?: number): boolean`

Compares two numbers with a margin of error.

**Parameters:**
- `a`: First number
- `b`: Second number
- `delta`: Margin of error (default: 0.001)

---

#### `isValidEthereumAddress(address: string): boolean`

Validates Ethereum address format.

---

#### `isValidEvmTransactionHash(hash: string): boolean`

Validates EVM transaction hash format.

---

#### `isValidSolanaAddress(address: string): boolean`

Validates Solana address format.

---

#### `isValidSolanaSignature(signature: string): boolean`

Validates Solana transaction signature.

---

#### `normalizeAddress(address: string): string`

Normalizes address to lowercase for comparison.

---

#### `isTimestampValid(txTimestamp: number, donationTimestamp: number, thresholdSeconds?: number): boolean`

Checks if timestamp is within acceptable range.

---

### Logger

#### Methods

- `debug(message: string, meta?: unknown): void`
- `info(message: string, meta?: unknown): void`
- `warn(message: string, meta?: unknown): void`
- `error(message: string, meta?: unknown): void`
- `fatal(message: string, meta?: unknown): void`

**Example:**
```typescript
import { logger } from '@giveth/blockchain-integration-service';

logger.info('Transaction verified', { txHash: '0x123...' });
logger.error('Verification failed', { error: 'Amount mismatch' });
```



