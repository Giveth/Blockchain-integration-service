# Blockchain Integration Service

A comprehensive REST API service for blockchain transaction verification and multi-chain support. This service provides a unified interface for interacting with multiple blockchain networks including EVM chains and Solana.

## Features

- 🔗 **Multi-Chain Support**: EVM (Ethereum, Polygon, Optimism, Arbitrum, etc.) and Solana
- ✅ **Transaction Verification**: Comprehensive validation of on-chain transactions
- 🔒 **Safe/Gnosis Safe Support**: Handle multisig transactions
- 🔄 **Swap Transaction Support**: Validate DEX swap transactions
- 🌐 **REST API**: Easy-to-use HTTP endpoints
- 🐳 **Docker Ready**: Containerized deployment with Docker Compose
- 📊 **Type-Safe**: Full TypeScript support with detailed type definitions
- 🚀 **Production Ready**: Error handling, logging, and robust validation

## Quick Start with Docker

```bash
# Clone the repository
git clone <repository-url>
cd blockchain-integration-service

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
nano .env

# Start with Docker Compose
docker-compose up -d

# Check health
curl http://localhost:3000/api/health
```

## Installation as Library

```bash
npm install @giveth/blockchain-integration-service
```

## REST API Usage

### Verify a Transaction

```bash
curl -X POST http://localhost:3000/api/transactions/verify \
  -H "Content-Type: application/json" \
  -d '{
    "txHash": "0x...",
    "networkId": 1,
    "symbol": "ETH",
    "fromAddress": "0x...",
    "toAddress": "0x...",
    "amount": 1.5,
    "timestamp": 1234567890
  }'
```

### Batch Verification

```bash
curl -X POST http://localhost:3000/api/transactions/verify-batch \
  -H "Content-Type: application/json" \
  -d '{
    "transactions": [
      {
        "txHash": "0x...",
        "networkId": 1,
        "symbol": "ETH",
        "fromAddress": "0x...",
        "toAddress": "0x...",
        "amount": 1.5,
        "timestamp": 1234567890
      }
    ]
  }'
```

### Get Transaction Timestamp

```bash
curl -X POST http://localhost:3000/api/transactions/timestamp \
  -H "Content-Type: application/json" \
  -d '{
    "txHash": "0x...",
    "networkId": 1
  }'
```

## Library Usage

```typescript
import { transactionVerificationService, TransactionDetailInput } from '@giveth/blockchain-integration-service';

const input: TransactionDetailInput = {
  txHash: '0x...',
  networkId: 1,
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

### Non-EVM
- Solana Mainnet (101)

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
  networkId: 101,
  symbol: 'SOL',
  fromAddress: 'Donor123...',
  toAddress: 'Project456...',
  amount: 5,
  timestamp: Math.floor(Date.now() / 1000),
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

## REST API Endpoints

### Health Check
- **GET** `/api/health`
- Returns service health status

### Transaction Verification
- **POST** `/api/transactions/verify`
- Verify a single transaction

### Batch Transaction Verification
- **POST** `/api/transactions/verify-batch`
- Verify multiple transactions (max 100)

### Get Transaction Timestamp
- **POST** `/api/transactions/timestamp`
- Get timestamp of a transaction

See [API Documentation](docs/API.md) for detailed endpoint specifications.

## Deployment

### Docker

```bash
# Build image
docker build -t blockchain-integration-service .

# Run container
docker run -p 3000:3000 --env-file .env blockchain-integration-service
```

### Docker Compose

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Production Deployment

1. Set environment variables for production
2. Use a reverse proxy (nginx) for SSL/TLS
3. Configure rate limiting and authentication as needed
4. Monitor logs and health endpoint
5. Set up auto-scaling based on load

## Development

### Setup

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your API keys
nano .env
```

### Run Development Server

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Run Production

```bash
npm start
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
├── api/              # REST API layer
│   ├── routes/       # API route handlers
│   ├── middleware/   # Express middleware
│   └── app.ts        # Express app setup
├── config/           # Configuration and network definitions
├── services/         # Core services
│   ├── chains/       # Chain-specific implementations
│   │   ├── evm/      # EVM blockchain support
│   │   ├── solana/   # Solana support
│   │   ├── IChainHandler.ts  # Chain interface
│   │   └── ChainRegistry.ts  # Plugin registry
│   ├── safe/         # Safe/Gnosis Safe integration
│   └── transactionVerificationService.ts  # Main service
├── types/            # TypeScript type definitions
├── utils/            # Utility functions
├── index.ts          # Library entry point
└── server.ts         # API server entry point
```

### Plugin Architecture

The service uses a plugin-based architecture for easy chain addition:

1. **IChainHandler Interface**: All chain services implement this interface
2. **ChainRegistry**: Central registry for chain handlers
3. **Easy Extension**: Add new chains by implementing IChainHandler and registering

To add a new blockchain:

```typescript
// 1. Create a new handler implementing IChainHandler
export class NewChainService implements IChainHandler {
  isSupported(networkId: number): boolean {
    // Implementation
  }
  
  async getTransactionInfo(input: TransactionDetailInput): Promise<NetworkTransactionInfo> {
    // Implementation
  }
}

// 2. Register in ChainRegistry
chainRegistry.registerHandler(ChainType.NEW_CHAIN, newChainService);
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Support

For issues and questions, please open an issue on GitHub.



