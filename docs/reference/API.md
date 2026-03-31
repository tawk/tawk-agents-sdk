# 📖 API Reference

Complete API documentation for the Tawk Agents SDK.

## Table of Contents

- [Core Classes](#core-classes)
  - [Agent](#agent)
- [Execution Functions](#execution-functions)
  - [run](#run)
  - [runStream](#runstream)
- [Guardrails](#guardrails)
- [Tools](#tools)
- [MCP Integration](#mcp-integration)
- [Tracing](#tracing)
- [Types](#types)

---

## Core Classes

### Agent

The main agent class.

```typescript
class Agent<TContext = any, TOutput = string>
```

#### Constructor

```typescript
constructor(config: AgentConfig<TContext, TOutput>)
```

**AgentConfig**:

```typescript
interface AgentConfig<TContext = any, TOutput = string> {
  // Required
  name: string;
  model: LanguageModel;
  instructions: string | ((context: RunContextWrapper<TContext>) => string | Promise<string>);

  // Capabilities
  tools?: Record<string, CoreTool>;
  subagents?: Agent<TContext, any>[];
  transferDescription?: string;
  guardrails?: Guardrail<TContext>[];

  // Configuration groups
  output?: AgentOutputConfig<TOutput>;
  modelSettings?: ModelSettings;
  execution?: ExecutionConfig;
  hooks?: AgentHooksConfig<TContext>;
}

interface AgentOutputConfig<TOutput = string> {
  schema?: z.ZodSchema<TOutput>;
  toon?: boolean;
}

interface ModelSettings {
  temperature?: number;
  topP?: number;
  responseTokens?: number;
  maxTokens?: number;
  maxInputTokens?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
}

interface ExecutionConfig {
  maxSteps?: number;
  stopWhen?: StopCondition | StopCondition[];
  activeTools?: string[];
  prepareStep?: PrepareStepFunction;
  toolCallRepair?: ToolCallRepairFunction;
  tokenizer?: (text: string) => number | Promise<number>;
}

interface AgentHooksConfig<TContext = any> {
  onStepFinish?: (step: StepResult) => void | Promise<void>;
  shouldFinish?: (context: TContext, toolResults: any[]) => boolean;
}
```

#### Instance Methods

```typescript
// Convert agent to a tool
asTool(options?: {
  toolName?: string;
  toolDescription?: string;
}): CoreTool

// Clone agent with overrides
clone(overrides: Partial<AgentConfig<TContext, TOutput>>): Agent<TContext, TOutput>

// Dispose (close MCP connections, etc.)
async dispose(): Promise<void>
```

#### Properties

```typescript
readonly name: string
readonly transferDescription?: string
subagents: Agent<TContext, any>[] // Getter/setter
```

---

## Execution Functions

### run

Execute an agent and return the final result.

```typescript
async function run<TContext = any, TOutput = string>(
  agent: Agent<TContext, TOutput>,
  input: string | ModelMessage[] | RunState<TContext, any>,
  options?: RunOptions<TContext>
): Promise<RunResult<TOutput>>
```

**RunOptions**:

```typescript
interface RunOptions<TContext = any> {
  context?: TContext;
  maxTurns?: number;
  stream?: boolean;
}
```

**RunResult**:

```typescript
interface RunResult<TOutput = string> {
  finalOutput: TOutput;
  messages: ModelMessage[];
  steps: StepResult[];
  metadata: {
    totalTokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    finishReason?: string;
    totalToolCalls?: number;
    handoffChain?: string[];
    agentMetrics?: AgentMetric[];
    raceParticipants?: string[];
    raceWinners?: string[];
  };
  state?: RunState<any, any>;
}
```

### runStream

Execute an agent with streaming output.

```typescript
async function runStream<TContext = any, TOutput = string>(
  agent: Agent<TContext, TOutput>,
  input: string | ModelMessage[],
  options?: RunOptions<TContext>
): Promise<StreamResult<TOutput>>
```

**StreamResult**:

```typescript
interface StreamResult<TOutput = string> {
  textStream: AsyncIterable<string>;
  fullStream: AsyncIterable<StreamEvent>;
  completed: Promise<RunResult<TOutput>>;
}
```

**StreamEvent**:

```typescript
type StreamEvent =
  | { type: 'text-delta'; textDelta: string }
  | { type: 'tool-call-start'; toolName: string; toolCallId: string }
  | { type: 'tool-call'; toolName: string; args: any; toolCallId: string }
  | { type: 'tool-result'; toolName: string; result: any; toolCallId: string }
  | { type: 'agent-start'; agentName: string }
  | { type: 'agent-end'; agentName: string }
  | { type: 'transfer'; from: string; to: string; reason: string }
  | { type: 'guardrail-check'; guardrailName: string; passed: boolean }
  | { type: 'step-start'; stepNumber: number }
  | { type: 'step-complete'; stepNumber: number }
  | { type: 'finish'; finishReason?: string };
```

---

## Guardrails

### Guardrail Interface

```typescript
interface Guardrail<TContext = any> {
  name: string;
  type: 'input' | 'output';
  validate(
    content: string,
    context: RunContextWrapper<TContext>
  ): Promise<GuardrailResult> | GuardrailResult;
}

interface GuardrailResult {
  passed: boolean;
  message?: string;
  metadata?: Record<string, any>;
}
```

### Built-in Guardrails

#### contentSafetyGuardrail

AI-powered content moderation.

```typescript
function contentSafetyGuardrail<TContext>(config: {
  name?: string;
  type: 'input' | 'output';
  model: LanguageModel;
  categories?: string[];
  threshold?: number;
}): Guardrail<TContext>
```

#### piiDetectionGuardrail

PII detection and blocking.

```typescript
function piiDetectionGuardrail<TContext>(config: {
  name?: string;
  type: 'input' | 'output';
  block?: boolean;
  categories?: string[];
}): Guardrail<TContext>
```

#### lengthGuardrail

Length validation.

```typescript
function lengthGuardrail<TContext>(config: {
  name?: string;
  type: 'input' | 'output';
  minLength?: number;
  maxLength?: number;
  unit?: 'characters' | 'words' | 'tokens';
}): Guardrail<TContext>
```

#### Other Guardrails

#### topicRelevanceGuardrail

Ensure content is relevant to specific topics.

```typescript
function topicRelevanceGuardrail<TContext>(config: {
  name?: string;
  type: 'input' | 'output';
  model: LanguageModel;
  allowedTopics: string[];
  threshold?: number; // 0-10
}): Guardrail<TContext>
```

#### rateLimitGuardrail

Enforce rate limits based on context key.

```typescript
function rateLimitGuardrail<TContext>(config: {
  name?: string;
  storage: Map<string, { count: number; resetAt: number }>;
  maxRequests: number;
  windowMs: number;
  keyExtractor: (context: RunContextWrapper<TContext>) => string;
}): Guardrail<TContext>
```

#### languageGuardrail

Enforce allowed languages.

```typescript
function languageGuardrail<TContext>(config: {
  name?: string;
  type: 'input' | 'output';
  model: LanguageModel;
  allowedLanguages: string[]; // ISO 639-1 codes
}): Guardrail<TContext>
```

#### sentimentGuardrail

Control response sentiment.

```typescript
function sentimentGuardrail<TContext>(config: {
  name?: string;
  type: 'input' | 'output';
  model: LanguageModel;
  blockedSentiments?: ('positive' | 'negative' | 'neutral')[];
  allowedSentiments?: ('positive' | 'negative' | 'neutral')[];
}): Guardrail<TContext>
```

#### toxicityGuardrail

Detect and block toxic content.

```typescript
function toxicityGuardrail<TContext>(config: {
  name?: string;
  type: 'input' | 'output';
  model: LanguageModel;
  threshold?: number; // 0-10 (default: 5)
}): Guardrail<TContext>
```

#### customGuardrail

Create custom validation logic.

```typescript
function customGuardrail<TContext>(config: {
  name: string;
  type: 'input' | 'output';
  validate: (
    content: string, 
    context: RunContextWrapper<TContext>
  ) => Promise<GuardrailResult> | GuardrailResult;
}): Guardrail<TContext>
```

See full documentation in [Guardrails Guide](../guides/FEATURES.md#guardrails).

---

## Tools

### tool

Create a tool definition.

```typescript
function tool<TArgs = any, TResult = any>(config: {
  description: string;
  inputSchema: z.ZodSchema<TArgs>;
  execute: (args: TArgs, context?: any) => Promise<TResult> | TResult;
  enabled?: boolean | ((context: any) => boolean | Promise<boolean>);
}): CoreTool
```

---

## MCP Integration

### MCPServerManager

Manage MCP servers.

```typescript
class MCPServerManager {
  registerServer(config: MCPServerConfig): Promise<void>
  getAllTools(): Promise<Record<string, CoreTool>>
  getServerTools(serverName: string): Promise<Record<string, CoreTool>>
  getServer(name: string): MCPServer | undefined
  refreshAll(): Promise<void>
  getServerCount(): number
  getServerNames(): string[]
  shutdown(): Promise<void>
}
```

**MCPServerConfig**:

```typescript
interface MCPServerConfig {
  name: string;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}
```

---

## Tracing

### Langfuse Integration

```typescript
// Initialize Langfuse (explicit config required)
function initLangfuse(config: {
  publicKey: string;
  secretKey: string;
  baseUrl?: string;
}): Langfuse | null

// Check if tracing is enabled
function isLangfuseEnabled(): boolean

// Flush pending traces
async function flushLangfuse(): Promise<void>

// Shutdown Langfuse
async function shutdownLangfuse(): Promise<void>
```

### Tracing Utilities

```typescript
// Create a trace wrapper
async function withTrace<T>(
  name: string,
  fn: (trace: any) => Promise<T>,
  options?: {
    input?: any;
    metadata?: Record<string, any>;
    tags?: string[];
    sessionId?: string;
    userId?: string;
  }
): Promise<T>

// Wrap function with tracing span
async function withFunctionSpan<T>(
  trace: any,
  name: string,
  input: any,
  fn: () => Promise<T>,
  metadata?: Record<string, any>
): Promise<T>
```

---

## Types

### Core Message Types

```typescript
// ModelMessage is re-exported from the 'ai' package
type ModelMessage = import('ai').ModelMessage;
```

### Run State

```typescript
class RunState<TContext = any, TAgent = Agent<TContext, any>> {
  originalInput: string | ModelMessage[];
  currentAgent: TAgent;
  messages: ModelMessage[];
  stepNumber: number;
  currentTurn: number;
  maxTurns: number;
  trace?: any;
  context?: TContext;
  handoffChain: string[];

  static async create(config): Promise<RunState>;
  recordStep(step: StepResult): void;
  incrementTurn(): void;
  isMaxTurnsExceeded(): boolean;
  trackHandoff(agentName: string): void;
  updateAgentMetrics(metric: AgentMetric): void;
  getDuration(): number;
  toJSON(): object;
}
```

### Agent Metric

```typescript
interface AgentMetric {
  agentName: string;
  turns: number;
  toolCalls: number;
  duration: number;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
}
```

---

## Additional Type Exports

### Streaming Types

```typescript
// Event name types for run item stream events
type RunItemStreamEventName =
  | 'message_output_created'
  | 'handoff_requested'
  | 'handoff_occurred'
  | 'tool_called'
  | 'tool_output'
  | 'reasoning_item_created';

// Union of all streaming events
type RunStreamEvent =
  | RunRawModelStreamEvent
  | RunItemStreamEvent
  | RunAgentUpdatedStreamEvent;
```

### Safe Execution Types

```typescript
// Result type for safe execution
// Index 0: error (null on success, Error or unknown on failure)
// Index 1: result (value on success, null on failure)
type SafeExecuteResult<T> = [Error | unknown | null, T | null];
```

### Background Result Types

```typescript
interface BackgroundResult<T> {
  type: 'background';
  promise: Promise<T>;
  onComplete?: (result: T) => void;
  onError?: (error: Error) => void;
}

function isBackgroundResult<T>(value: any): value is BackgroundResult<T>;
```

### MCP Types

```typescript
// MCPServerConfig and CoreTool types are used for MCP tool integration
// See MCP Integration section above for full type definitions
```

---

## Advanced Functions

### Tracing Context Functions

```typescript
// Set the current active span
function setCurrentSpan(span: Span | null): void;

// Create a contextual generation (advanced)
function createContextualGeneration(options: {
  name: string;
  input: any;
  model?: string;
  modelParameters?: Record<string, any>;
}): Generation;
```

### AI Generation Functions (Low-level)

```typescript
// Generate speech from text (low-level)
async function generateSpeechAI(options: {
  text: string;
  model: any;
  voice?: string;
}): Promise<{ audio: Buffer; format: string }>;

// Transcribe audio to text (low-level)
async function transcribeAudioAI(options: {
  audio: Buffer | string;
  model: any;
  language?: string;
}): Promise<{ text: string; language?: string }>;

// Generate image from text (low-level)
async function generateImageAI(options: {
  prompt: string;
  model: any;
  size?: string;
  n?: number;
}): Promise<{ images: string[]; revised_prompt?: string }>;
```

**Note**: These are low-level functions. Prefer using the tool wrappers:
- Use `createTextToSpeechTool()` instead of `generateSpeechAI()`
- Use `createTranscriptionTool()` instead of `transcribeAudioAI()`
- Use `createImageGenerationTool()` instead of `generateImageAI()`

---

For more details and examples, see:
- [Getting Started Guide](../getting-started/GETTING_STARTED.md)
- [Features Guide](../guides/FEATURES.md)
- [Examples](../../examples)
