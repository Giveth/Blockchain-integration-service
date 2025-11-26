# Blockchain Integration Service

A comprehensive TypeScript service for blockchain transaction verification and multi-chain support. This service provides a unified interface for interacting with multiple blockchain networks including EVM chains, Solana, Stellar, and Cardano.

## Features

- 🔗 **Multi-Chain Support**: EVM (Ethereum, Polygon, Optimism, Arbitrum, etc.), Solana, Stellar, and Cardano
- ✅ **Transaction Verification**: Comprehensive validation of on-chain transactions
- 🔒 **Safe/Gnosis Safe Support**: Handle multisig transactions
- 🔄 **Swap Transaction Support**: Validate DEX swap transactions
- 📊 **Type-Safe**: Full TypeScript support with detailed type definitions
- 🚀 **Production Ready**: Error handling, logging, and robust validation

## Installation

```bash
npm install @giveth/blockchain-integration-service
```

## Quick Start

```typescript
import { transactionVerificationService, TransactionDetailInput } from '@giveth/blockchain-integration-service';

// Verify an Ethereum transaction
const input: TransactionDetailInput = {
  txHash: '0x...',
  networkId: 1, // Ethereum Mainnet
  symbol: 'ETH',
  fromAddress: '0x...',
  toAddress: '0x...',
  amount: 1.5,
  timestamp: Math.floor(Date.now() / 1000),
};

const result = await transactionVerificationService.verifyTransaction(input);

if (result.isValid) {
  console.log('Transaction verified!', result.transaction);
} else {
  console.error('Verification failed:', result.error);
}
```

## Configuration

Create a `.env` file based on `.env.example`:

```env
# EVM Networks
MAINNET_RPC_URL=https://eth-mainnet.alchemyapi.io/v2/YOUR_API_KEY
POLYGON_RPC_URL=https://polygon-rpc.com
OPTIMISM_RPC_URL=https://mainnet.optimism.io

# Solana
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_CHAIN_ID=101

# Stellar
STELLAR_NETWORK_URL=https://horizon.stellar.org

# Cardano
BLOCKFROST_PROJECT_ID=your_blockfrost_project_id

# Validation
TRANSACTION_AMOUNT_DELTA=0.001
TRANSACTION_TIME_THRESHOLD=3600
```

## Supported Networks

### EVM Networks
- Ethereum Mainnet (1)
- Polygon (137)
- Optimism (10)
- Arbitrum (42161)
- Gnosis Chain (100)
- Base (8453)
- Celo (42220)
- BSC (56)
- Avalanche (43114)

### Non-EVM Networks
- Solana Mainnet (101)
- Stellar Mainnet (200)
- Cardano Mainnet (300)

## API Reference

### Transaction Verification Service

#### `verifyTransaction(input: TransactionDetailInput): Promise<TransactionValidationResult>`

Verify a single transaction against expected parameters.

**Parameters:**
- `txHash`: Transaction hash
- `networkId`: Network ID
- `symbol`: Token symbol (e.g., 'ETH', 'SOL', 'ADA')
- `fromAddress`: Expected sender address
- `toAddress`: Expected recipient address
- `amount`: Expected amount
- `timestamp`: Transaction timestamp
- `chainType` (optional): Chain type override
- `isSwap` (optional): Whether this is a swap transaction
- `safeTxHash` (optional): Safe transaction hash for multisig
- `importedFromDraftOrBackupService` (optional): Skip timestamp validation

**Returns:**
```typescript
{
  isValid: boolean;
  transaction?: NetworkTransactionInfo;
  error?: string;
  errorCode?: BlockchainErrorCode;
}
```

#### `verifyTransactions(inputs: TransactionDetailInput[]): Promise<TransactionValidationResult[]>`

Verify multiple transactions in parallel.

#### `getTransactionTimestamp(txHash: string, networkId: number): Promise<number>`

Get the timestamp of a transaction.

### Safe Transaction Service

#### `fetchSafeTransactionHash(safeMessageHash: string, networkId: number): Promise<string | null>`

Fetch the actual transaction hash from a Safe multisig transaction.

#### `isSafeTransactionExecuted(safeMessageHash: string, networkId: number): Promise<boolean>`

Check if a Safe transaction has been executed.

#### `getSafeTransactionDetails(safeMessageHash: string, networkId: number): Promise<Record<string, unknown>>`

Get detailed information about a Safe transaction.

### Chain-Specific Services

#### EVM Transaction Service

```typescript
import { evmTransactionService } from '@giveth/blockchain-integration-service';

// Get transaction info
const txInfo = await evmTransactionService.getTransactionInfo(input);

// Get transaction timestamp
const timestamp = await evmTransactionService.getTransactionTimestamp(txHash, networkId);

// Validate swap transaction
const isValid = await evmTransactionService.isSwapTransactionToAddress(networkId, txHash, toAddress);
```

#### Solana Transaction Service

```typescript
import { solanaTransactionService } from '@giveth/blockchain-integration-service';

const txInfo = await solanaTransactionService.getTransactionInfo(input);
```

#### Stellar Transaction Service

```typescript
import { stellarTransactionService } from '@giveth/blockchain-integration-service';

const txInfo = await stellarTransactionService.getTransactionInfo(input);
```

#### Cardano Transaction Service

```typescript
import { cardanoTransactionService } from '@giveth/blockchain-integration-service';

const txInfo = await cardanoTransactionService.getTransactionInfo(input);
```

## Error Handling

The service uses custom error types for better error handling:

```typescript
import { BlockchainError, BlockchainErrorCode } from '@giveth/blockchain-integration-service';

try {
  await transactionVerificationService.verifyTransaction(input);
} catch (error) {
  if (error instanceof BlockchainError) {
    switch (error.code) {
      case BlockchainErrorCode.TRANSACTION_NOT_FOUND:
        console.log('Transaction not found on blockchain');
        break;
      case BlockchainErrorCode.AMOUNT_MISMATCH:
        console.log('Amount does not match:', error.details);
        break;
      // ... handle other error codes
    }
  }
}
```

### Error Codes

- `TRANSACTION_NOT_FOUND`: Transaction hash not found on blockchain
- `TRANSACTION_FAILED`: Transaction failed on blockchain
- `INVALID_NETWORK_ID`: Unsupported or invalid network ID
- `FROM_ADDRESS_MISMATCH`: Sender address doesn't match
- `TO_ADDRESS_MISMATCH`: Recipient address doesn't match
- `AMOUNT_MISMATCH`: Amount doesn't match expected value
- `TIMESTAMP_TOO_OLD`: Transaction timestamp is too old
- `SWAP_VALIDATION_FAILED`: Swap transaction validation failed
- `SAFE_TRANSACTION_NOT_FOUND`: Safe transaction not executed yet
- `NETWORK_ERROR`: Network or RPC error
- `PROVIDER_ERROR`: Provider configuration error

## Usage Examples

### Verify an EVM Transaction

```typescript
import { transactionVerificationService } from '@giveth/blockchain-integration-service';

const result = await transactionVerificationService.verifyTransaction({
  txHash: '0xabc123...',
  networkId: 1, // Ethereum Mainnet
  symbol: 'ETH',
  fromAddress: '0x1234...',
  toAddress: '0x5678...',
  amount: 1.5,
  timestamp: Math.floor(Date.now() / 1000),
});
```

### Verify a Swap Transaction

```typescript
const result = await transactionVerificationService.verifyTransaction({
  txHash: '0xabc123...',
  networkId: 1,
  symbol: 'USDC',
  fromAddress: '0x1234...',
  toAddress: '0x5678...',
  amount: 100,
  timestamp: Math.floor(Date.now() / 1000),
  isSwap: true, // Enable swap validation
});
```

### Verify a Safe Transaction

```typescript
const result = await transactionVerificationService.verifyTransaction({
  safeTxHash: '0xsafe123...',
  txHash: '', // Will be fetched automatically
  networkId: 1,
  symbol: 'ETH',
  fromAddress: '0x1234...',
  toAddress: '0x5678...',
  amount: 10,
  timestamp: Math.floor(Date.now() / 1000),
});
```

### Verify Solana Transaction

```typescript
const result = await transactionVerificationService.verifyTransaction({
  txHash: '5J7Qu...',
  networkId: 101, // Solana Mainnet
  symbol: 'SOL',
  fromAddress: 'Donor123...',
  toAddress: 'Project456...',
  amount: 5,
  timestamp: Math.floor(Date.now() / 1000),
  chainType: ChainType.SOLANA,
});
```

### Batch Verification

```typescript
const transactions = [
  { txHash: '0x123...', networkId: 1, ... },
  { txHash: '0x456...', networkId: 137, ... },
  { txHash: '0x789...', networkId: 10, ... },
];

const results = await transactionVerificationService.verifyTransactions(transactions);

results.forEach((result, index) => {
  if (result.isValid) {
    console.log(`Transaction ${index + 1} verified`);
  } else {
    console.error(`Transaction ${index + 1} failed: ${result.error}`);
  }
});
```

## Development

### Setup

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your API keys
```

### Build

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

### Testing

```bash
npm test
```

### Linting

```bash
npm run lint
npm run lint:fix
```

## Architecture

```
src/
├── config/           # Configuration and network definitions
├── services/         # Core services
│   ├── chains/       # Chain-specific implementations
│   │   ├── evm/      # EVM blockchain support
│   │   ├── solana/   # Solana support
│   │   ├── stellar/  # Stellar support
│   │   └── cardano/  # Cardano support
│   ├── safe/         # Safe/Gnosis Safe integration
│   └── transactionVerificationService.ts  # Main service
├── types/            # TypeScript type definitions
├── utils/            # Utility functions
└── index.ts          # Main entry point
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Support

For issues and questions, please open an issue on GitHub.

