# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VibSDK is an official Cloudflare product - an AI-powered webapp generation platform that creates complete web applications from natural language prompts. The system features a React+Vite frontend with a Cloudflare Workers backend using Durable Objects for stateful, long-running code generation sessions.

**Core Capabilities:**
- Natural language to working webapp generation
- Real-time code streaming via WebSocket connections
- Phase-wise incremental code generation with automated review cycles
- Live preview via sandbox containers
- Permanent deployment to Cloudflare Workers
- GitHub export functionality

**Tech Stack:**
- **Frontend**: React 19, Vite (Rolldown), Tailwind CSS 4, Radix UI
- **Backend**: Cloudflare Workers, Hono framework, Durable Objects
- **Database**: D1 (SQLite) with Drizzle ORM
- **Storage**: R2 for templates, KV for caching
- **AI**: Multi-provider support via AI Gateway (Gemini, Claude, GPT, etc.)
- **Containers**: @cloudflare/sandbox for isolated code execution

## Project Structure

```
vibesdk/
├── src/                          # Frontend React application
│   ├── App.tsx                   # Root component with providers
│   ├── routes/                   # Route components
│   │   ├── chat/                 # Main code generation interface
│   │   │   ├── chat.tsx          # Chat page component
│   │   │   ├── hooks/use-chat.ts # Core WebSocket & state management
│   │   │   ├── components/       # Chat-specific components
│   │   │   └── utils/            # Message handling utilities
│   │   ├── apps/                 # User's app listing
│   │   ├── discover/             # Public app discovery
│   │   └── home.tsx              # Landing page
│   ├── components/               # Shared UI components
│   │   ├── ui/                   # Radix-based primitives (shadcn/ui)
│   │   ├── auth/                 # Authentication components
│   │   └── layout/               # App layout components
│   ├── contexts/                 # React contexts (auth, theme)
│   ├── lib/                      # Utilities (api-client, events)
│   └── api-types.ts              # Shared API types
├── worker/                       # Cloudflare Worker backend
│   ├── index.ts                  # Worker entry point & routing
│   ├── app.ts                    # Hono app setup with middleware
│   ├── agents/                   # AI code generation system
│   │   ├── core/                 # Agent implementations
│   │   │   ├── simpleGeneratorAgent.ts  # Main Durable Object
│   │   │   ├── smartGeneratorAgent.ts   # Extended agent (WIP)
│   │   │   ├── state.ts          # Generation state types
│   │   │   └── websocket.ts      # WebSocket handling
│   │   ├── operations/           # Generation operations
│   │   ├── planning/             # Blueprint generation
│   │   ├── inferutils/           # AI model configuration
│   │   │   ├── config.ts         # Model configs per action
│   │   │   └── config.types.ts   # AIModels enum & types
│   │   ├── output-formats/       # SCOF & diff formats
│   │   └── prompts.ts            # System prompts
│   ├── api/                      # REST API layer
│   │   ├── routes/               # Route definitions
│   │   │   └── index.ts          # Route setup
│   │   └── controllers/          # Request handlers
│   ├── services/                 # Business logic services
│   │   ├── sandbox/              # Code execution environment
│   │   ├── deployer/             # Worker deployment
│   │   ├── code-fixer/           # Automated code fixing
│   │   ├── github/               # GitHub integration
│   │   ├── analytics/            # AI Gateway analytics
│   │   └── rate-limit/           # Rate limiting
│   ├── database/                 # Database layer
│   │   ├── schema.ts             # Drizzle schema definitions
│   │   └── services/             # DB service classes
│   ├── middleware/               # Hono middleware
│   │   ├── auth/                 # Authentication
│   │   └── security/             # Security headers
│   └── config/                   # Configuration
├── shared/                       # Shared code between frontend/worker
│   └── types/                    # Shared type definitions
├── container/                    # Sandbox container code
├── migrations/                   # D1 database migrations
├── scripts/                      # Setup and deployment scripts
│   ├── setup.ts                  # Interactive project setup
│   └── deploy.ts                 # Production deployment
├── wrangler.jsonc                # Cloudflare Worker configuration
├── vite.config.ts                # Vite configuration
└── drizzle.config.*.ts           # Drizzle ORM configs
```

## Development Commands

### Primary Development
```bash
npm run setup            # Interactive setup wizard (run first!)
npm run dev              # Start Vite dev server + Worker locally
npm run build            # Build production frontend
npm run deploy           # Deploy to Cloudflare Workers
```

### Frontend
```bash
npm run lint             # Run ESLint
npm run preview          # Preview production build locally
```

### Worker
```bash
npm run cf-typegen       # Generate TypeScript types for CF bindings
```

### Database
```bash
npm run db:generate      # Generate migrations from schema changes
npm run db:migrate:local # Apply migrations locally
npm run db:migrate:remote # Apply migrations to production D1
npm run db:studio        # Open Drizzle Studio (local DB browser)
```

### Testing
```bash
npm run test             # Run Vitest tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Run tests with coverage
```

### Code Quality
```bash
npm run knip             # Find unused exports/dependencies
npm run knip:fix         # Auto-fix unused exports
```

## Core Architecture

### Code Generation Flow

1. **User Input** → Frontend captures prompt and optional images
2. **Blueprint Generation** → AI analyzes requirements, creates project plan
3. **Template Selection** → System selects appropriate starter template
4. **Phase-wise Generation** → Code generated incrementally by feature/phase
5. **Review Cycles** → Automated linting, type checking, runtime validation
6. **Live Preview** → Sandbox container runs generated code in real-time
7. **Deployment** → User can deploy to permanent Cloudflare Worker

### Key Components

#### Durable Objects
- **CodeGeneratorAgent** (`worker/agents/core/simpleGeneratorAgent.ts`): Stateful code generation sessions with WebSocket support
- **UserAppSandboxService**: Isolated container for running generated code
- **DORateLimitStore**: Distributed rate limiting

#### Generation State (`worker/agents/core/state.ts`)
```typescript
interface CodeGenState {
  blueprint: Blueprint;           // Project plan
  generatedFilesMap: Record<string, FileState>;
  generatedPhases: PhaseState[];
  currentDevState: CurrentDevState;
  agentMode: 'deterministic' | 'smart';
  // ... more state
}
```

#### WebSocket Protocol
Frontend connects via `/api/agent/:agentId/ws` for real-time updates:
- `file_update`: New/modified file content
- `phase_complete`: Generation phase finished
- `preview_ready`: Live preview URL available
- `deployment_complete`: Permanent URL ready

### AI Model Configuration

Models are configured in `worker/agents/inferutils/config.ts`:

```typescript
export const AGENT_CONFIG: AgentConfig = {
  blueprint: { name: AIModels.GEMINI_2_5_PRO, ... },
  phaseImplementation: { name: AIModels.GEMINI_2_5_PRO, ... },
  codeReview: { name: AIModels.GEMINI_2_5_PRO, ... },
  // ... per-operation configs
};
```

**Supported Providers** (via AI Gateway):
- Google AI Studio (Gemini models) - Default
- Anthropic (Claude models)
- OpenAI (GPT models)
- Cerebras (fast inference)
- OpenRouter (multiple providers)

### Frontend State Management

The main chat interface uses `useChat` hook (`src/routes/chat/hooks/use-chat.ts`):
- WebSocket connection with automatic reconnection
- File state management
- Phase timeline tracking
- Deployment controls

### Authentication

Dual authentication support:
- **OAuth**: Google, GitHub providers
- **Email/Password**: Traditional login

Auth context in `src/contexts/auth-context.tsx` handles session management.

## API Routes

| Route | Description |
|-------|-------------|
| `POST /api/agent` | Create new generation session |
| `GET /api/agent/:id/ws` | WebSocket connection |
| `GET /api/apps` | List user's apps |
| `GET /api/apps/:id` | Get app details |
| `POST /api/auth/oauth/:provider` | OAuth login |
| `POST /api/auth/login` | Email login |
| `GET /api/user/profile` | User profile |
| `POST /api/github/export` | Export to GitHub |

## Environment Configuration

### Required Variables (`.dev.vars`)
```bash
# Cloudflare
CLOUDFLARE_API_TOKEN="..."
CLOUDFLARE_ACCOUNT_ID="..."

# AI Gateway
CLOUDFLARE_AI_GATEWAY_URL="https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/"
CLOUDFLARE_AI_GATEWAY_TOKEN="..."

# AI Providers (at least one required)
GOOGLE_AI_STUDIO_API_KEY="..."  # Default provider
ANTHROPIC_API_KEY="..."
OPENAI_API_KEY="..."

# Security
JWT_SECRET="..."
CUSTOM_DOMAIN="localhost:5173"  # or your domain

# OAuth (optional)
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
GITHUB_CLIENT_ID="..."
GITHUB_CLIENT_SECRET="..."
```

### Wrangler Configuration (`wrangler.jsonc`)
Key bindings:
- `AI`: Cloudflare AI binding
- `DB`: D1 database
- `CodeGenObject`: Code generator Durable Object
- `Sandbox`: Container Durable Object
- `TEMPLATES_BUCKET`: R2 for templates
- `VibecoderStore`: KV namespace

## Database Schema

Main tables in `worker/database/schema.ts`:
- `users`: User accounts with OAuth support
- `sessions`: JWT session management
- `apps`: Generated applications
- `appViews`, `stars`, `favorites`: Social features
- `userSecrets`: Encrypted API keys storage
- `userModelConfigs`: Per-user AI model overrides

## Working with the Codebase

### Adding a New API Endpoint

1. Create controller in `worker/api/controllers/{feature}/controller.ts`
2. Add route in `worker/api/routes/{feature}Routes.ts`
3. Register in `worker/api/routes/index.ts`
4. Add types if needed

### Modifying Code Generation

1. Update prompts in `worker/agents/prompts.ts`
2. Modify operation logic in `worker/agents/operations/`
3. Update state types in `worker/agents/core/state.ts`
4. Handle new WebSocket messages in frontend

### Adding UI Components

1. Use existing components from `src/components/ui/`
2. Follow Radix UI patterns for new primitives
3. Use Tailwind CSS for styling
4. Handle dark/light themes via CSS variables

### Database Changes

1. Modify schema in `worker/database/schema.ts`
2. Run `npm run db:generate`
3. Run `npm run db:migrate:local`
4. Test locally before `npm run db:migrate:remote`

## Code Style Guidelines

### TypeScript
- **Never use `any` type** - find or create proper types
- **No dynamic imports** - use static imports only
- Use strict TypeScript configuration
- Export types alongside implementations

### React
- Functional components only
- Use hooks for state management
- Memoize callbacks with useCallback
- Keep components focused and small

### Cloudflare Workers
- Use Hono for routing
- Prefer Durable Objects for stateful operations
- Use D1 batch operations for performance
- Access bindings via `env` parameter

### General
- **Follow DRY principles strictly**
- No over-engineering - solve the current problem
- Don't add features beyond what's requested
- Keep solutions simple and focused
- No unnecessary comments explaining changes
- Professional, to-the-point comments only

## Testing

Tests use Vitest with `@cloudflare/vitest-pool-workers`:
- Unit tests for pure functions
- Integration tests for API endpoints
- Tests in same directory as source or `*.test.ts` files

## Debugging

### Local Development
1. `npm run dev` starts both Vite and Worker
2. Check browser DevTools for WebSocket messages
3. Worker logs appear in terminal
4. Use Drizzle Studio for database inspection

### Common Issues
- **WebSocket disconnects**: Check network, verify agent ID exists
- **AI errors**: Verify API keys and AI Gateway configuration
- **D1 errors**: Run migrations, check schema compatibility
- **Build errors**: Run `npm run cf-typegen` for binding types

## Security Considerations

- JWT tokens for session management
- CSRF protection via double-submit cookie
- Rate limiting on API and auth endpoints
- Encrypted storage for user secrets
- OAuth state validation
- Secure headers via Hono middleware

## Deployment

Production deployment checklist:
1. Configure `.prod.vars` with production secrets
2. Set `CUSTOM_DOMAIN` to production domain
3. Run `npm run deploy`
4. Verify D1 migrations with `npm run db:migrate:remote`
5. Deploy templates to R2 if not done

## Additional Resources

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Hono Documentation](https://hono.dev/)
- [Drizzle ORM Docs](https://orm.drizzle.team/)
- [Radix UI Primitives](https://www.radix-ui.com/)
