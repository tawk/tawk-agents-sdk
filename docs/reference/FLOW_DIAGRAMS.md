# 🔄 Complete Flow Documentation

**Understanding the tawk-agents-sdk execution flow with comprehensive sequence diagrams**

---

## Table of Contents

1. [Basic Agent Execution](#1-basic-agent-execution)
2. [Tool Calling Flow](#2-tool-calling-flow)
3. [Multi-Agent Transfer Flow](#3-multi-agent-transfer-flow)
4. [Guardrails Validation Flow](#4-guardrails-validation-flow)
5. [Langfuse Tracing Flow](#5-langfuse-tracing-flow)
6. [Session Management Flow](#6-session-management-flow)
7. [Complete End-to-End Flow](#7-complete-end-to-end-flow)

---

## 1. Basic Agent Execution

### Overview
The simplest agent execution - user input → model → response.

### Sequence Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant R as run()
    participant AR as AgenticRunner
    participant A as Agent
    participant M as LLM (Model)
    participant T as Trace

    U->>R: run(agent, "Hello!")
    R->>AR: new AgenticRunner(agent)
    R->>T: Create Trace "Agent Run"
    
    AR->>A: Get config (model, instructions)
    AR->>M: generateText(messages, tools)
    
    M-->>AR: Response with text
    
    AR->>T: End trace with usage
    AR-->>R: RunResult { finalOutput, messages, steps }
    R-->>U: "Hello! How can I help you?"
```

### Code Example

```typescript
import { Agent, run } from '@tawk.to/tawk-agents-sdk';
import { openai } from '@ai-sdk/openai';

const agent = new Agent({
  name: 'Assistant',
  model: openai('gpt-4o'),
  instructions: 'You are a helpful assistant.'
});

const result = await run(agent, 'Hello!');
console.log(result.finalOutput);
// Output: "Hello! How can I help you?"
```

---

## 2. Tool Calling Flow

### Overview
Agent decides to call a tool, executes it, and continues with the result.

### Sequence Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant AR as AgenticRunner
    participant A as Agent
    participant M as LLM
    participant T as Tool
    participant TS as Trace Span

    U->>AR: "What's 123 * 456?"
    AR->>M: generateText(messages, [calculator])
    
    M-->>AR: ToolCall: calculator({a: 123, b: 456})
    
    AR->>TS: Create Tool Span "calculator"
    AR->>T: Execute tool function
    T-->>AR: Result: 56088
    AR->>TS: End span with result
    
    AR->>M: Continue with tool result
    M-->>AR: "The answer is 56,088"
    
    AR-->>U: RunResult { finalOutput: "The answer is 56,088" }
```

### Parallel Tool Execution

```mermaid
sequenceDiagram
    participant AR as AgenticRunner
    participant M as LLM
    participant T1 as Tool 1
    participant T2 as Tool 2
    participant T3 as Tool 3

    AR->>M: generateText()
    M-->>AR: [ToolCall1, ToolCall2, ToolCall3]
    
    par Parallel Execution
        AR->>T1: Execute Tool 1
        AR->>T2: Execute Tool 2
        AR->>T3: Execute Tool 3
    and
        T1-->>AR: Result 1
    and
        T2-->>AR: Result 2
    and
        T3-->>AR: Result 3
    end
    
    AR->>M: Continue with all results
    M-->>AR: Final response
```

### Code Example

```typescript
import { Agent, run, tool } from '@tawk.to/tawk-agents-sdk';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const calculator = tool({
  description: 'Perform arithmetic operations',
  inputSchema: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number()
  }),
  execute: async ({ operation, a, b }) => {
    switch (operation) {
      case 'add': return a + b;
      case 'multiply': return a * b;
      // ... more operations
    }
  }
});

const agent = new Agent({
  name: 'Calculator',
  model: openai('gpt-4o'),
  tools: { calculator }
});

const result = await run(agent, 'What is 123 * 456?');
// Agent calls calculator tool, gets 56088, responds with formatted answer
```

---

## 3. Multi-Agent Transfer Flow

### Overview
Coordinator agent transfers work to specialist agents with context isolation.

### Sequence Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant C as Coordinator Agent
    participant M1 as LLM (Coordinator)
    participant TR as Transfer System
    participant S as Specialist Agent
    participant M2 as LLM (Specialist)
    participant T as Trace

    U->>C: "Analyze sales data"
    T->>T: Create Trace "Agent Run"
    
    T->>T: Create Span "Agent: Coordinator"
    C->>M1: generateText(messages, [transfer_to_analyst])
    M1-->>C: ToolCall: transfer_to_analyst()
    
    Note over TR: Context Isolation<br/>Only relevant messages passed
    
    TR->>S: Transfer with filtered context
    
    T->>T: Create Span "Agent: Specialist" (child of Coordinator)
    S->>M2: generateText(filtered_messages, specialist_tools)
    M2-->>S: Perform analysis
    S-->>TR: Analysis complete
    
    T->>T: End Specialist Span
    
    TR-->>C: Transfer result
    C->>M1: Continue with specialist result
    M1-->>C: Final response
    
    T->>T: End Coordinator Span
    T->>T: End Trace
    
    C-->>U: Complete analysis report
```

### Transfer Flow Details

```mermaid
flowchart TD
    A[Coordinator receives query] --> B{Needs specialist?}
    B -->|Yes| C[Call transfer_to_X tool]
    B -->|No| D[Handle directly]
    
    C --> E[Filter messages for context isolation]
    E --> F[Create new agent span]
    F --> G[Execute specialist agent]
    
    G --> H{Specialist needs tools?}
    H -->|Yes| I[Execute specialist tools]
    H -->|No| J[Generate response]
    
    I --> J
    J --> K[End specialist span]
    K --> L[Return to coordinator]
    L --> M[Coordinator synthesizes result]
    M --> N[Final response to user]
    
    D --> N
```

### Code Example

```typescript
import { Agent, run } from '@tawk.to/tawk-agents-sdk';
import { openai } from '@ai-sdk/openai';

// Specialist agent
const dataAnalyst = new Agent({
  name: 'DataAnalyst',
  model: openai('gpt-4o'),
  instructions: 'You analyze data and provide insights.',
  tools: { analyzeData: /* ... */ }
});

// Coordinator agent
const coordinator = new Agent({
  name: 'Coordinator',
  model: openai('gpt-4o'),
  instructions: 'Route tasks to specialist agents.',
  subagents: [dataAnalyst]  // Creates transfer_to_dataanalyst tool
});

const result = await run(coordinator, 'Analyze Q4 sales data');
// Flow: Coordinator → transfer_to_dataanalyst → Analyst analyzes → Back to Coordinator → Final response
```

---

## 4. Guardrails Validation Flow

### Overview
Input and output guardrails validate content before and after LLM generation.

### Sequence Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant AR as AgenticRunner
    participant IG as Input Guardrails
    participant M as LLM
    participant OG as Output Guardrails
    participant T as Trace

    U->>AR: "User input with potential PII"
    
    T->>T: Create Span "Agent: Main"
    
    Note over IG: Input Validation
    T->>T: Create Span "Input Guardrails"
    AR->>IG: Validate input
    
    par Parallel Guardrail Checks
        IG->>IG: length_check (SPAN)
        IG->>IG: pii_detection (SPAN)
    end
    
    alt Input Valid
        IG-->>AR: All passed ✓
        T->>T: End Input Guardrails Span
        
        AR->>M: generateText()
        T->>T: Create GENERATION "LLM: Main"
        M-->>AR: Response
        T->>T: End GENERATION (with tokens)
        
        Note over OG: Output Validation
        T->>T: Create Span "Output Guardrails"
        AR->>OG: Validate output
        
        par Parallel Output Checks
            OG->>OG: length_check (SPAN)
            OG->>OG: pii_detection (SPAN)
            OG->>M: content_safety (GENERATION with tokens)
        end
        
        alt Output Valid
            OG-->>AR: All passed ✓
            T->>T: End Output Guardrails Span
            AR-->>U: Final response
        else Output Invalid
            OG-->>AR: Failed with feedback
            Note over AR: Retry with feedback
            AR->>M: Regenerate with guidance
            AR->>OG: Validate again
        end
        
    else Input Invalid
        IG-->>AR: Blocked ✗
        T->>T: End Input Guardrails Span (ERROR)
        AR-->>U: Input validation error
    end
    
    T->>T: End Agent Span
```

### Guardrail Types and Tracing

```mermaid
flowchart TD
    A[Guardrail Execution] --> B{Uses LLM?}
    
    B -->|No| C[SPAN Trace]
    B -->|Yes| D[GENERATION Trace]
    
    C --> E[lengthGuardrail]
    C --> F[piiDetectionGuardrail]
    C --> G[formatValidationGuardrail]
    C --> H[rateLimitGuardrail]
    
    D --> I[contentSafetyGuardrail]
    D --> J[topicRelevanceGuardrail]
    D --> K[sentimentGuardrail]
    D --> L[toxicityGuardrail]
    D --> M[languageGuardrail]
    
    E --> N[No token usage]
    F --> N
    G --> N
    H --> N
    
    I --> O[Tracks tokens & cost]
    J --> O
    K --> O
    L --> O
    M --> O
```

### Code Example

```typescript
import { Agent, run, lengthGuardrail, piiDetectionGuardrail, contentSafetyGuardrail } from '@tawk.to/tawk-agents-sdk';
import { openai } from '@ai-sdk/openai';

const agent = new Agent({
  name: 'SafeAgent',
  model: openai('gpt-4o'),
  instructions: 'You are a helpful, safe assistant.',
  guardrails: [
    // Input guardrails
    lengthGuardrail({
      type: 'input',
      maxLength: 1000,
      unit: 'characters'
    }),
    piiDetectionGuardrail({
      type: 'input',
      block: true
    }),
    
    // Output guardrails
    lengthGuardrail({
      type: 'output',
      maxLength: 2000
    }),
    piiDetectionGuardrail({
      type: 'output',
      block: true
    }),
    contentSafetyGuardrail({
      type: 'output',
      model: openai('gpt-4o-mini'),
      categories: ['violence', 'hate-speech']
    })
  ]
});

const result = await run(agent, 'User query');
// Flow: Input validation → LLM → Output validation → Response
```

---

## 5. Langfuse Tracing Flow

### Overview
Complete observability with hierarchical tracing of all agent operations.

### Trace Hierarchy

```mermaid
graph TD
    A[Trace: Agent Run] --> B[Span: Agent: Coordinator]
    
    B --> C1[GENERATION: LLM: Coordinator]
    B --> C2[Span: Tool: calculator]
    B --> C3[Span: Agent: Specialist]
    
    C3 --> D1[Span: Input Guardrails]
    D1 --> D1a[Span: Guardrail: length_check]
    D1 --> D1b[Span: Guardrail: pii_detection]
    
    C3 --> D2[GENERATION: LLM: Specialist]
    
    C3 --> D3[Span: Tool: analyzeData]
    
    C3 --> D4[Span: Output Guardrails]
    D4 --> D4a[Span: Guardrail: length_check]
    D4 --> D4b[GENERATION: Guardrail: content_safety]
    
    style A fill:#e1f5ff
    style B fill:#fff4e6
    style C3 fill:#fff4e6
    style C1 fill:#e8f5e9
    style D2 fill:#e8f5e9
    style D4b fill:#e8f5e9
```

### Tracing Flow Sequence

```mermaid
sequenceDiagram
    participant U as User Code
    participant T as Trace
    participant AS as Agent Span
    participant GS as Generation Span
    participant TS as Tool Span
    participant L as Langfuse

    U->>T: run(agent, query)
    T->>T: initLangfuse()
    T->>L: Create Trace
    
    T->>AS: Create Span "Agent: Main"
    AS->>AS: Record input messages
    
    AS->>GS: Create GENERATION "LLM: Main"
    GS->>GS: Record model, temperature, etc.
    GS->>GS: Track inputTokens, outputTokens
    GS-->>AS: End with usage data
    
    AS->>TS: Create Span "Tool: calculator"
    TS->>TS: Record tool input/output
    TS-->>AS: End with latency
    
    AS-->>T: End with aggregated usage
    T->>L: Flush all data
    
    Note over L: View in Langfuse UI:<br/>- Complete trace hierarchy<br/>- Token usage per component<br/>- Costs calculated<br/>- Latency metrics
```

### Code Example

```typescript
import { initLangfuse, Agent, run } from '@tawk.to/tawk-agents-sdk';
import { openai } from '@ai-sdk/openai';

// Initialize Langfuse (reads from env vars)
initLangfuse();

const agent = new Agent({
  name: 'TracedAgent',
  model: openai('gpt-4o'),
  instructions: 'You are helpful.'
});

const result = await run(agent, 'Hello!');

// Trace automatically sent to Langfuse with:
// - Trace ID
// - Agent spans (hierarchical)
// - LLM generations (with tokens)
// - Tool executions
// - Guardrail validations
// - Complete usage metrics
```

---

## 6. Session Management Flow

### Overview
Persistent conversation history with automatic summarization.

### Sequence Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant R as run()
    participant S as Session
    participant D as Storage (Redis/Memory)
    participant A as Agent
    participant M as LLM

    U->>R: run(agent, "Hello", { session })
    R->>S: getHistory()
    S->>D: Load messages
    D-->>S: Previous messages (if any)
    
    alt First interaction
        S-->>R: Empty history
    else Subsequent interaction
        S-->>R: Previous conversation
    end
    
    R->>A: Execute with history
    A->>M: generateText(history + new message)
    M-->>A: Response
    
    A->>S: addMessage(user message)
    S->>D: Store message
    A->>S: addMessage(assistant response)
    S->>D: Store response
    
    alt History > maxMessages
        Note over S: Automatic Summarization
        S->>M: Summarize old messages
        M-->>S: Summary
        S->>D: Store summary, keep recent messages
    end
    
    S-->>R: Updated history
    R-->>U: Response
```

### Session Types

```mermaid
flowchart LR
    A[Session Types] --> B[MemorySession]
    A --> C[RedisSession]
    A --> D[MongoDBSession]
    
    B --> E[In-memory storage<br/>Fast, temporary<br/>Dev/testing]
    
    C --> F[Redis storage<br/>Persistent, fast<br/>Production]
    
    D --> G[MongoDB storage<br/>Persistent, scalable<br/>Enterprise]
    
    style B fill:#e3f2fd
    style C fill:#e8f5e9
    style D fill:#fff3e0
```

### Code Example

```typescript
import { Agent, run, MemorySession } from '@tawk.to/tawk-agents-sdk';
import { openai } from '@ai-sdk/openai';

const agent = new Agent({
  name: 'Assistant',
  model: openai('gpt-4o')
});

// Create session for user
const session = new MemorySession('user-123', 50);

// First interaction
const result1 = await run(agent, 'My name is Alice', { session });

// Second interaction - agent remembers
const result2 = await run(agent, 'What is my name?', { session });
// Response: "Your name is Alice"

// History automatically managed, summarized when needed
```

---

## 7. Complete End-to-End Flow

### Overview
All features working together in a production multi-agent system.

### Complete Sequence Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant S as Session
    participant T as Trace
    participant C as Coordinator
    participant IG as Input Guards
    participant M1 as LLM (Coordinator)
    participant TR as Transfer
    participant SP as Specialist
    participant IG2 as Specialist Input Guards
    participant M2 as LLM (Specialist)
    participant Tool as Tool
    participant OG2 as Specialist Output Guards
    participant OG as Output Guards
    participant L as Langfuse

    U->>S: Query with session
    S-->>U: Load history
    
    U->>T: run(coordinator, query)
    T->>L: Create Trace "Agent Run"
    T->>T: Create Span "Agent: Coordinator"
    
    T->>IG: Validate input
    IG->>IG: Run all input guardrails
    IG-->>T: Passed ✓
    
    T->>M1: Create GENERATION
    M1->>M1: generateText()
    M1-->>T: ToolCall: transfer_to_specialist
    T->>T: End GENERATION (with tokens)
    
    TR->>TR: Filter context for isolation
    
    T->>T: Create Span "Agent: Specialist" (nested)
    
    T->>IG2: Validate specialist input
    IG2-->>T: Passed ✓
    
    T->>M2: Create GENERATION
    M2->>M2: generateText()
    M2-->>T: ToolCall: analyzeData
    T->>T: End GENERATION (with tokens)
    
    T->>Tool: Create Tool Span
    Tool->>Tool: Execute tool
    Tool-->>T: Result
    T->>T: End Tool Span
    
    M2->>M2: Continue with tool result
    M2-->>T: Final specialist response
    
    T->>OG2: Validate specialist output
    
    par Specialist Output Guardrails
        OG2->>OG2: length_check (SPAN)
        OG2->>M2: content_safety (GENERATION)
    end
    
    OG2-->>T: Passed ✓
    T->>T: End Specialist Span (with aggregated usage)
    
    TR-->>C: Transfer result
    M1->>M1: Synthesize final response
    
    T->>OG: Validate coordinator output
    OG-->>T: Passed ✓
    
    T->>T: End Coordinator Span (with total usage)
    
    T->>S: Store messages
    S-->>T: History updated
    
    T->>L: Flush trace (complete hierarchy)
    T->>T: End Trace
    
    T-->>U: RunResult with complete data
```

### Complete System Architecture

```mermaid
flowchart TD
    Start([User Query]) --> Session[Session<br/>Load History]
    Session --> Trace[Create Trace]
    
    Trace --> Coord[Coordinator Agent]
    
    Coord --> IG1[Input Guardrails]
    IG1 -->|Valid| LLM1[LLM Generation]
    IG1 -->|Invalid| Error1[Return Error]
    
    LLM1 --> Decision{Decision}
    
    Decision -->|Use Tool| Tool1[Execute Tool]
    Decision -->|Transfer| Transfer[Transfer to Specialist]
    Decision -->|Direct| Response1[Generate Response]
    
    Tool1 --> LLM1
    
    Transfer --> SpecStart[Specialist Agent]
    
    SpecStart --> IG2[Input Guardrails]
    IG2 -->|Valid| LLM2[LLM Generation]
    IG2 -->|Invalid| Error2[Return Error]
    
    LLM2 --> Decision2{Decision}
    Decision2 -->|Use Tool| Tool2[Execute Specialist Tool]
    Decision2 -->|Direct| Response2[Generate Response]
    
    Tool2 --> LLM2
    
    Response2 --> OG2[Output Guardrails]
    OG2 -->|Valid| SpecEnd[End Specialist]
    OG2 -->|Invalid| Regen2[Regenerate]
    
    Regen2 --> LLM2
    
    SpecEnd --> BackCoord[Back to Coordinator]
    BackCoord --> Response1
    
    Response1 --> OG1[Output Guardrails]
    OG1 -->|Valid| Save[Save to Session]
    OG1 -->|Invalid| Regen1[Regenerate]
    
    Regen1 --> LLM1
    
    Save --> EndTrace[End Trace]
    EndTrace --> Langfuse[(Langfuse)]
    
    EndTrace --> Return([Return Result])
    
    Error1 --> Return
    Error2 --> BackCoord
    
    style Start fill:#e1f5ff
    style Return fill:#c8e6c9
    style Langfuse fill:#fff9c4
    style Error1 fill:#ffcdd2
    style Error2 fill:#ffcdd2
```

---

## Summary

### Key Flows

1. **Basic Execution**: User → Agent → LLM → Response
2. **Tool Calling**: Agent → Tool Call → Execute → Continue
3. **Multi-Agent**: Coordinator → Transfer → Specialist → Back → Final
4. **Guardrails**: Input Validation → Process → Output Validation
5. **Tracing**: Hierarchical spans tracking everything
6. **Sessions**: Persistent history with auto-summarization

### Tracing Hierarchy

```
Trace: Agent Run
└── Span: Agent: Coordinator
    ├── Span: Input Guardrails
    │   ├── Span: length_check
    │   └── Span: pii_detection
    ├── GENERATION: LLM: Coordinator (with tokens)
    ├── Span: Tool: calculator
    ├── Span: Agent: Specialist (nested)
    │   ├── Span: Input Guardrails
    │   ├── GENERATION: LLM: Specialist (with tokens)
    │   ├── Span: Tool: analyzeData
    │   └── Span: Output Guardrails
    │       ├── Span: length_check
    │       └── GENERATION: content_safety (with tokens)
    └── Span: Output Guardrails
```

### Production Ready

✅ **Complete observability** with Langfuse  
✅ **Safety** with guardrails  
✅ **Scalability** with multi-agent architecture  
✅ **Memory** with session management  
✅ **Performance** with parallel execution  
✅ **Reliability** with comprehensive error handling

---

**For more details, see:**
- [Getting Started](../getting-started/GETTING_STARTED.md)
- [Complete Architecture](./COMPLETE_ARCHITECTURE.md)
- [API Reference](./API.md)

