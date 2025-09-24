# Contributing to Blockchain Freelancing Platform

Thank you for your interest in contributing to the Blockchain Freelancing Platform! We welcome contributions from developers, designers, and blockchain enthusiasts.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Contributing Guidelines](#contributing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing Requirements](#testing-requirements)
- [Security Guidelines](#security-guidelines)
- [Documentation](#documentation)

## 🤝 Code of Conduct

This project adheres to a code of conduct that we expect all contributors to follow. Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## 🚀 Getting Started

### Prerequisites

Before you begin contributing, ensure you have the following installed:

- **Node.js** >= 16.0.0
- **npm** >= 8.0.0
- **Git** >= 2.0.0
- **Docker** >= 20.0.0 (for local development)
- **MetaMask** or another Web3 wallet

### Development Environment

1. **Fork the Repository**
   ```bash
   # Fork the repo on GitHub, then clone your fork
   git clone https://github.com/YOUR_USERNAME/project-desc.git
   cd project-desc
   ```

2. **Install Dependencies**
   ```bash
   npm run setup
   ```

3. **Environment Configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start Development Environment**
   ```bash
   # Start all services
   npm run dev

   # Or start individual services
   npm run dev:frontend
   npm run dev:backend
   npm run dev:contracts
   ```

## 🛠️ Development Setup

### Local Blockchain Development

1. **Start Local Hardhat Network**
   ```bash
   cd contracts
   npx hardhat node
   ```

2. **Deploy Contracts Locally**
   ```bash
   npm run deploy:local
   ```

3. **Configure MetaMask**
   - Network Name: `Localhost 8545`
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `31337`
   - Currency Symbol: `ETH`

### Database Setup

1. **Start PostgreSQL with Docker**
   ```bash
   docker-compose up postgres redis -d
   ```

2. **Run Database Migrations**
   ```bash
   cd backend
   npm run migrate
   ```

3. **Seed Development Data**
   ```bash
   npm run seed:dev
   ```

## 📝 Contributing Guidelines

### Types of Contributions

We welcome the following types of contributions:

- **Bug Fixes**: Fix existing issues
- **Feature Development**: Implement new features
- **Documentation**: Improve or add documentation
- **Testing**: Add or improve tests
- **Performance**: Optimize existing code
- **Security**: Identify and fix security issues

### Issue Guidelines

Before creating a new issue, please:

1. Search existing issues to avoid duplicates
2. Use the appropriate issue template
3. Provide detailed information including:
   - Clear description of the issue
   - Steps to reproduce (for bugs)
   - Expected vs actual behavior
   - Environment details
   - Screenshots/logs when applicable

### Branch Naming Convention

Use descriptive branch names with the following format:

```
<type>/<short-description>

Examples:
- feature/multi-token-payments
- bugfix/escrow-release-issue
- docs/api-documentation-update
- test/smart-contract-coverage
```

### Commit Message Format

Follow the conventional commits specification:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Adding/updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(contracts): add multi-signature escrow release
fix(frontend): resolve wallet connection timeout
docs(api): update job creation endpoint documentation
test(backend): add integration tests for bid submission
```

## 🔄 Pull Request Process

### Before Submitting

1. **Update your fork**
   ```bash
   git remote add upstream https://github.com/yatharth-tripathi/project-desc.git
   git fetch upstream
   git rebase upstream/main
   ```

2. **Run Tests**
   ```bash
   npm run test
   npm run lint
   ```

3. **Build Project**
   ```bash
   npm run build
   ```

### Submission Checklist

- [ ] Code follows project coding standards
- [ ] All tests pass
- [ ] New tests added for new functionality
- [ ] Documentation updated if necessary
- [ ] Commit messages follow conventional format
- [ ] No sensitive information committed
- [ ] Smart contracts are properly documented
- [ ] Gas optimization considered for contract changes

### Pull Request Template

```markdown
## Description
Brief description of the changes made.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
Describe the tests you ran and how to run them.

## Smart Contract Changes
If applicable, describe any smart contract changes and gas impact.

## Screenshots
Add screenshots for UI changes.

## Checklist
- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review of my code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
```

## 📊 Coding Standards

### TypeScript/JavaScript

- Use **TypeScript** for all new code
- Follow **ESLint** and **Prettier** configurations
- Use **functional programming** patterns where appropriate
- Implement proper **error handling**
- Add comprehensive **JSDoc comments**

```typescript
/**
 * Calculates the platform fee for a given amount
 * @param amount - The base amount in wei
 * @param feePercentage - Fee percentage in basis points (100 = 1%)
 * @returns The calculated fee amount in wei
 */
function calculatePlatformFee(amount: BigNumber, feePercentage: number): BigNumber {
  return amount.mul(feePercentage).div(10000);
}
```

### Solidity

- Use **Solidity 0.8.19+**
- Follow **OpenZeppelin** standards and patterns
- Implement comprehensive **NatSpec documentation**
- Use **custom errors** instead of require strings
- Optimize for **gas efficiency**

```solidity
/// @title JobContract
/// @notice Manages individual job instances and bidding
/// @dev Uses proxy pattern for gas-efficient deployment
contract JobContract is Initializable, ReentrancyGuard {
    /// @notice Emitted when a new bid is submitted
    /// @param jobId The unique identifier for the job
    /// @param freelancer Address of the bidding freelancer
    /// @param proposedBudget Proposed budget in wei
    event BidSubmitted(
        uint256 indexed jobId,
        address indexed freelancer,
        uint256 indexed proposedBudget
    );

    /// @notice Submit a bid for this job
    /// @param proposedBudget The proposed budget in wei
    /// @param proposedTimeline Timeline in days
    /// @param proposalHash IPFS hash of detailed proposal
    function submitBid(
        uint256 proposedBudget,
        uint256 proposedTimeline,
        string memory proposalHash
    ) external nonReentrant {
        // Implementation
    }
}
```

### React Components

- Use **functional components** with hooks
- Implement **TypeScript interfaces** for props
- Follow **component composition** patterns
- Use **custom hooks** for business logic

```tsx
interface JobCardProps {
  job: Job;
  onBidClick: (jobId: string) => void;
  isLoading?: boolean;
}

export const JobCard: React.FC<JobCardProps> = ({ job, onBidClick, isLoading = false }) => {
  const { formatCurrency, formatDate } = useFormatters();

  return (
    <div className="job-card">
      {/* Component implementation */}
    </div>
  );
};
```

## 🧪 Testing Requirements

### Smart Contract Tests

- **Unit Tests**: Test individual contract functions
- **Integration Tests**: Test contract interactions
- **Gas Tests**: Verify gas usage within limits
- **Security Tests**: Test for common vulnerabilities

```javascript
describe("JobContract", function () {
  it("should allow freelancers to submit bids", async function () {
    const { jobContract, freelancer } = await loadFixture(deployJobFixture);

    await expect(
      jobContract.connect(freelancer).submitBid(
        ethers.utils.parseEther("1"),
        30,
        "ipfs-hash"
      )
    ).to.emit(jobContract, "BidSubmitted");
  });
});
```

### Backend Tests

- **Unit Tests**: Test individual functions and classes
- **Integration Tests**: Test API endpoints
- **Database Tests**: Test data persistence
- **Authentication Tests**: Test security middleware

```typescript
describe('JobService', () => {
  it('should create a job successfully', async () => {
    const jobData = {
      title: 'Test Job',
      budget: '1000',
      // ... other properties
    };

    const result = await jobService.createJob(jobData);
    expect(result.id).toBeDefined();
    expect(result.title).toBe('Test Job');
  });
});
```

### Frontend Tests

- **Component Tests**: Test React components
- **Hook Tests**: Test custom hooks
- **Integration Tests**: Test user workflows
- **E2E Tests**: Test complete user journeys

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { JobCard } from './JobCard';

test('renders job card with correct information', () => {
  const mockJob = {
    id: '1',
    title: 'Test Job',
    budget: '1000',
    // ... other properties
  };

  render(<JobCard job={mockJob} onBidClick={jest.fn()} />);

  expect(screen.getByText('Test Job')).toBeInTheDocument();
  expect(screen.getByText('$1,000')).toBeInTheDocument();
});
```

## 🔒 Security Guidelines

### Smart Contract Security

- **Reentrancy Protection**: Use `nonReentrant` modifier
- **Access Control**: Implement proper role-based permissions
- **Input Validation**: Validate all external inputs
- **Integer Overflow**: Use SafeMath or Solidity 0.8+
- **External Calls**: Be cautious with external contract calls

### Backend Security

- **Authentication**: Implement JWT with proper expiration
- **Authorization**: Check permissions for all endpoints
- **Input Validation**: Validate and sanitize all inputs
- **Rate Limiting**: Implement rate limiting for API endpoints
- **SQL Injection**: Use parameterized queries
- **CORS**: Configure appropriate CORS settings

### Frontend Security

- **XSS Prevention**: Sanitize user inputs
- **CSRF Protection**: Implement CSRF tokens
- **Secure Storage**: Use secure methods for sensitive data
- **Input Validation**: Validate all user inputs
- **Content Security Policy**: Implement appropriate CSP headers

### Reporting Security Issues

If you discover a security vulnerability, please:

1. **DO NOT** create a public issue
2. Email us at security@yourdomain.com
3. Include detailed information about the vulnerability
4. Allow us time to address the issue before disclosure

## 📚 Documentation

### Types of Documentation

1. **Code Comments**: Inline documentation for complex logic
2. **API Documentation**: OpenAPI/Swagger documentation
3. **Smart Contract Documentation**: NatSpec comments
4. **User Guides**: End-user documentation
5. **Developer Guides**: Technical implementation guides

### Documentation Standards

- Use **clear, concise language**
- Include **code examples** where appropriate
- Keep documentation **up-to-date** with code changes
- Use **diagrams and flowcharts** for complex processes
- Provide **troubleshooting guides** for common issues

## 🎯 Issue Labels

We use the following labels to categorize issues:

- `bug`: Something isn't working
- `enhancement`: New feature or request
- `documentation`: Improvements or additions to documentation
- `good first issue`: Good for newcomers
- `help wanted`: Extra attention is needed
- `question`: Further information is requested
- `security`: Security-related issue
- `performance`: Performance optimization
- `smart-contracts`: Smart contract related
- `frontend`: Frontend application related
- `backend`: Backend API related

## 💡 Getting Help

If you need help with contributing:

1. **Check Documentation**: Review existing documentation
2. **Search Issues**: Look for similar questions/issues
3. **Ask Questions**: Create a discussion or issue
4. **Join Community**: Join our Discord/Telegram for real-time help

## 🙏 Recognition

Contributors will be recognized in the following ways:

- Added to the project's contributors list
- Mentioned in release notes for significant contributions
- Invited to join the core contributor team for exceptional contributions

Thank you for contributing to the Blockchain Freelancing Platform! 🚀