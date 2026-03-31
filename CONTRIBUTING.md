# Contributing to Tawk Agents SDK

Thank you for your interest in contributing to the Tawk Agents SDK! This document provides guidelines and instructions for contributing.

## Code of Conduct

Be respectful, inclusive, and constructive in all interactions.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/tawk-agents-sdk.git`
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b feature/your-feature-name`

## Development Setup

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run specific test
npm run test:core
```

## Code Style

- **TypeScript**: All code must be written in TypeScript
- **Formatting**: We use Prettier (run `npm run format`)
- **Linting**: We use ESLint (run `npm run lint`)
- **Types**: Prefer explicit types, avoid `any` when possible

## Testing

All new features must include tests:

```typescript
// tests/your-feature.test.ts
import { Agent, run } from '../src';

describe('Your Feature', () => {
  it('should work correctly', async () => {
    const agent = new Agent({
      name: 'Test',
      instructions: 'Test instructions'
    });
    
    const result = await run(agent, 'test input');
    expect(result.finalOutput).toBeDefined();
  });
});
```

## Commit Messages

Use clear, descriptive commit messages:

```
feat: add new transfer feature
fix: resolve session memory leak
docs: update README with examples
perf: optimize tool result extraction
test: add tests for guardrails
```

## Pull Request Process

1. Update README.md with details of changes if needed
2. Add tests for new functionality
3. Ensure all tests pass: `npm test`
4. Ensure build succeeds: `npm run build`
5. Update documentation if needed
6. Submit PR with clear description

## Areas for Contribution

- 🐛 Bug fixes
- ✨ New features
- 📚 Documentation improvements
- ⚡ Performance optimizations
- 🧪 Additional tests
- 🌐 Examples and tutorials

## Questions?

Open an issue or reach out to support@tawk.to

Thank you for contributing!
