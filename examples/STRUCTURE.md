# Examples Directory Structure

This document describes the production-standard organization of the examples directory.

## Directory Layout

```
examples/
├── README.md                         # Main documentation
├── STRUCTURE.md                      # This file
├── run.ts                            # Example runner script
├── all-features.ts                   # Comprehensive reference (20 examples)
│
├── 01-basic/                        # 4 beginner examples (01-04)
│   ├── 01-simple-agent.ts
│   ├── 02-agent-with-tools.ts
│   ├── 03-multi-agent.ts
│   └── 04-sessions.ts
│
├── 02-intermediate/                 # 4 intermediate examples (05-08)
│   ├── 05-guardrails.ts
│   ├── 06-streaming.ts
│   ├── 07-tracing.ts
│   └── 08-langfuse-tracing.ts
│
├── 03-advanced/                     # 5 advanced examples (09-14)
│   ├── 09-embeddings-rag.ts
│   ├── 10-vision.ts
│   ├── 11-toon-format.ts
│   ├── 12-mcp-integration.ts
│   └── 14-multi-agent-research.ts
│
├── 04-production/                   # 2 production examples (15-16)
│   ├── 15-ecommerce-system.ts
│   └── 16-complete-showcase.ts
│
├── 05-patterns/                     # 4 pattern examples (17-20)
│   ├── 17-agentic-patterns.ts
│   ├── 18-goal-planner-reflector.ts
│   ├── 19-multi-agent-coordination.ts
│   └── 20-real-coordination-demo.ts
│
└── utils/                           # Shared utilities
    ├── config.ts                    # Configuration management
    ├── errors.ts                    # Error handling
    ├── logger.ts                    # Logging utilities
    └── index.ts                     # Exports
```

## File Organization

### Naming Convention

- **All Examples**: Numbered format (01-04, 05-08, 09-14, 15-16, 17-20)
- **Root Files**: Descriptive names (all-features.ts, run.ts)
- **Utilities**: Descriptive names (config.ts, errors.ts, logger.ts)

### Import Paths

All examples use relative imports from their directory level:

```typescript
// SDK imports (from basic/)
import { Agent, run } from '../../src';

// SDK imports (from intermediate/)
import { Agent, run } from '../../src';

// SDK imports (from patterns/)
import { Agent, run } from '../../src';

// Utility imports (from any directory)
import { logger, handleError } from '../utils';
```

## Utilities

### Configuration (`utils/config.ts`)

Centralized configuration management:

```typescript
import { getExampleConfig, validateConfig } from '../utils';

const config = getExampleConfig();
validateConfig(config, ['openai']);
```

### Error Handling (`utils/errors.ts`)

Consistent error handling:

```typescript
import { handleError, isAPIKeyError } from '../utils/errors';

try {
  // code
} catch (error) {
  if (isAPIKeyError(error)) {
    handleError(error, 'Context');
  }
}
```

### Logging (`utils/logger.ts`)

Structured logging:

```typescript
import { logger } from '../utils/logger';

logger.section('Title');
logger.step(1, 'Step Title');
logger.info('Message');
logger.success('Success');
logger.warn('Warning');
logger.error('Error');
```

## Example Template

All examples should follow this structure:

```typescript
/**
 * Example: [Title]
 * 
 * [Description]
 */

import 'dotenv/config';
import { Agent, run } from '../../src';
import { logger, handleError } from '../utils';
import { openai } from '@ai-sdk/openai';

async function main() {
  logger.section('Example: [Title]');
  
  try {
    // Example code here
    
    logger.success('Example completed successfully!');
  } catch (error) {
    handleError(error, 'Example');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { main };
```

## Running Examples

### Using the Runner

The runner automatically discovers examples from the filesystem:

```bash
# Run all examples
npx tsx examples/run.ts

# Run by category
npx tsx examples/run.ts --category basic
npx tsx examples/run.ts --category intermediate
npx tsx examples/run.ts --category advanced
npx tsx examples/run.ts --category production
npx tsx examples/run.ts --category patterns

# Run specific example
npx tsx examples/run.ts --example 01-simple-agent
npx tsx examples/run.ts --example 15-ecommerce-system
npx tsx examples/run.ts --example 20-real-coordination-demo

# Verbose logging
npx tsx examples/run.ts --verbose
```

### Direct Execution

```bash
# Run individual examples
npx tsx examples/01-basic/01-simple-agent.ts
npx tsx examples/02-intermediate/05-guardrails.ts
npx tsx examples/03-advanced/09-embeddings-rag.ts
npx tsx examples/04-production/15-ecommerce-system.ts
npx tsx examples/05-patterns/17-agentic-patterns.ts

# Run comprehensive reference
npx tsx examples/all-features.ts
```

## Best Practices

1. **Use Utilities** - Always use utilities for config, errors, and logging
2. **Handle Errors** - Wrap all API calls in try-catch
3. **Export main** - Export main function for runner compatibility
4. **Document** - Add JSDoc comments
5. **Test** - Verify examples work before committing
6. **Consistent** - Follow the template structure
