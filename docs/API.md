# API Documentation

## Table of Contents

- [Transaction Verification Service](#transaction-verification-service)
- [Chain-Specific Services](#chain-specific-services)
- [Safe Transaction Service](#safe-transaction-service)
- [Types](#types)
- [Utilities](#utilities)

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

### Stellar Transaction Service

Handles Stellar blockchain transactions.

#### Methods

##### `getTransactionInfo(input: TransactionDetailInput): Promise<NetworkTransactionInfo>`

Fetches transaction details from Stellar.

**Example:**
```typescript
import { stellarTransactionService } from '@giveth/blockchain-integration-service';

const txInfo = await stellarTransactionService.getTransactionInfo({
  txHash: 'abc123...',
  networkId: 200,
  symbol: 'XLM',
  fromAddress: 'GABC...',
  toAddress: 'GDEF...',
  amount: 100,
  timestamp: Date.now() / 1000,
});
```

---

### Cardano Transaction Service

Handles Cardano blockchain transactions.

#### Methods

##### `getTransactionInfo(input: TransactionDetailInput): Promise<NetworkTransactionInfo>`

Fetches transaction details from Cardano using Blockfrost API.

**Example:**
```typescript
import { cardanoTransactionService } from '@giveth/blockchain-integration-service';

const txInfo = await cardanoTransactionService.getTransactionInfo({
  txHash: 'abc123...',
  networkId: 300,
  symbol: 'ADA',
  fromAddress: 'addr1...',
  toAddress: 'addr1...',
  amount: 50,
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

### ChainType

```typescript
enum ChainType {
  EVM = 'EVM',
  SOLANA = 'SOLANA',
  STELLAR = 'STELLAR',
  CARDANO = 'CARDANO',
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

#### `isValidStellarAddress(address: string): boolean`

Validates Stellar address format.

---

#### `isValidCardanoAddress(address: string): boolean`

Validates Cardano address format.

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

