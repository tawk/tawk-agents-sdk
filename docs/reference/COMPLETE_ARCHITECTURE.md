# 🏗️ Complete SDK Architecture & Flow

**Comprehensive end-to-end architecture aligned with source code v3.0.0**

---

## 📋 Table of Contents

- [System Overview](#system-overview)
- [Directory Structure](#directory-structure)
- [Core Architecture](#core-architecture)
- [Execution Flow](#execution-flow)
- [Multi-Agent Flow](#multi-agent-flow)
- [Guardrails Flow](#guardrails-flow)
- [Tracing & Observability](#tracing--observability)
- [Tool Execution](#tool-execution)
- [Complete End-to-End Flow](#complete-end-to-end-flow)
- [Component Details](#component-details)

---

## 🎯 System Overview

```mermaid
graph TB
    subgraph "User Layer"
        User[👤 User/Developer]
    end
    
    subgraph "SDK Core"
        Agent[🤖 Agent Class]
        Runner[⚡ AgenticRunner]
        Tools[🔧 Tool System]
        Guards[🛡️ Guardrails]
    end
    
    subgraph "State Management"
        RunState[📊 RunState]
        Usage[📈 Usage Tracking]
    end

    subgraph "Execution Layer"
        Exec[🔄 Execution Engine]
        Transfer[🔀 Transfer System]
    end
    
    subgraph "Observability"
        Trace[📊 Tracing Context]
        Langfuse[🔍 Langfuse]
    end
    
    subgraph "External"
        LLM[🧠 LLM Provider]
    end

    User -->|run/runStream| Agent
    Agent --> Runner
    Runner --> Guards
    Guards --> Exec
    Exec --> Tools
    Exec --> Transfer

    Runner <--> RunState
    RunState --> Usage

    Runner --> Trace
    Trace --> Langfuse

    Exec <--> LLM

    style Agent fill:#4a90e2
    style Runner fill:#e74c3c
    style Guards fill:#9b59b6
    style Trace fill:#f39c12
```

---

## 📁 Directory Structure

### Source Code Organization

```
src/
├── core/                       # Core execution engine
│   ├── agent/                 # Modular agent (types, class, run, tools)
│   ├── runner.ts              # AgenticRunner (main executor)
│   ├── execution.ts           # Single-step execution
│   ├── transfers.ts           # Multi-agent transfer system
│   ├── runstate.ts            # State management
│   ├── usage.ts               # Token tracking
│   └── result.ts              # Result types
│
├── guardrails/                # Safety & validation
│   └── index.ts               # All guardrails
│
├── tracing/                   # Observability
│   ├── context.ts             # Tracing context
│   ├── tracing.ts             # Tracing logic
│   └── tracing-utils.ts       # Utilities
│
├── lifecycle/                 # Event system
│   ├── events.ts              # Hook definitions
│   └── langfuse/              # Langfuse integration
│       └── index.ts
│
├── tools/                     # Built-in tools
│   ├── audio/                 # Speech & transcription
│   ├── embeddings/            # Vector embeddings
│   ├── image/                 # Image generation
│   ├── rag/                   # RAG with Pinecone
│   └── rerank/                # Result reranking
│
├── helpers/                   # Utilities
│   ├── message.ts             # Message helpers
│   ├── safe-execute.ts        # Safe tool execution
│   ├── safe-fetch.ts          # SSRF-safe HTTP client
│   ├── sanitize.ts            # Error sanitization
│   └── toon.ts                # Token optimization
│
├── mcp/                       # Model Context Protocol
│   └── enhanced.ts            # MCP server manager
│
├── types/                     # TypeScript types
│   ├── types.ts               # Core types
│   └── helpers.ts             # Type utilities
│
└── index.ts                   # Main exports
```

---

## 🏛️ Core Architecture

### Component Relationships

```mermaid
classDiagram
    class Agent {
        +name: string
        +instructions: string
        +model: LanguageModel
        +tools: ToolSet
        +subagents: Agent[]
        +guardrails: Guardrail[]
        +run(input) RunResult
    }
    
    class AgenticRunner {
        -agent: Agent
        -state: RunState
        +execute() Promise~Result~
        +executeAgentLoop() Promise
        +executeStep() Promise
    }
    
    class RunState {
        +messages: ModelMessage[]
        +context: any
        +steps: StepResult[]
        +currentAgent: Agent
        +usage: Usage
        +trace: Trace
    }
    
    class Execution {
        +executeStep() Promise
        +executeTools() Promise
        +detectTransfer() boolean
    }
    
    class Transfers {
        +createTransferTools()
        +detectTransfer()
        +createTransferContext()
    }
    
    class Guardrails {
        +runInputGuardrails()
        +runOutputGuardrails()
    }
    
    class Tracing {
        +createTrace()
        +createSpan()
        +createGeneration()
    }
    
    Agent --> AgenticRunner : creates
    AgenticRunner --> RunState : manages
    AgenticRunner --> Execution : uses
    AgenticRunner --> Guardrails : validates
    AgenticRunner --> Tracing : observes
    Execution --> Transfers : handles
    Agent --> Agent : subagents
```

---

## ⚡ Execution Flow

### Main Execution Pipeline

```mermaid
sequenceDiagram
    participant U as User
    participant A as Agent
    participant R as AgenticRunner
    participant G as Guardrails
    participant E as Execution
    participant L as LLM
    participant T as Tracing
    
    U->>A: run(input, options)
    A->>R: execute()
    
    Note over R: Create RunState
    R->>T: Create trace
    T-->>R: trace object
    
    loop For each turn (max turns)
        Note over R: Turn start
        
        R->>G: Run input guardrails
        alt Guardrail passes
            G-->>R: ✅ Pass
        else Guardrail fails
            G-->>R: ❌ Fail + feedback
            R->>E: Regenerate with feedback
        end
        
        R->>E: executeStep(messages)
        E->>L: generateText()
        L-->>E: response
        
        E->>R: step result
        R->>R: Update state
        
        alt Has tool calls
            R->>E: Execute tools
            E-->>R: tool results
            Note over R: Continue to next turn
        else Transfer detected
            R->>R: Switch agent
            Note over R: Continue to next turn
        else No tools
            R->>G: Run output guardrails
            alt Guardrail passes
                G-->>R: ✅ Pass
                Note over R: Exit loop
            else Guardrail fails
                G-->>R: ❌ Fail + feedback
                Note over R: Continue to next turn
            end
        end
    end
    
    R->>T: End trace
    R-->>A: Result
    A-->>U: RunResult
```

---

## 🔀 Multi-Agent Flow

### Agent Transfer & Coordination

```mermaid
sequenceDiagram
    participant C as Coordinator
    participant R as Runner
    participant A1 as Agent A
    participant A2 as Agent B
    participant T as Tracing
    
    Note over C: User request
    
    C->>R: run(Coordinator, input)
    R->>T: Create trace "Agent Run"
    
    R->>T: Create span "Agent: Coordinator"
    R->>A1: Execute turn
    A1-->>R: transfer_to_B(reason, query)
    
    Note over R: Detect transfer
    R->>T: End span "Agent: Coordinator"
    
    R->>R: Switch to Agent B
    R->>R: Create isolated context
    
    R->>T: Create span "Agent: B" (sibling)
    R->>A2: Execute turn
    A2-->>R: Final response
    
    R->>T: End span "Agent: B"
    R->>T: End trace
    
    R-->>C: Result with path: A → B
```

### Context Isolation

```mermaid
graph LR
    subgraph "Agent A Context"
        A1[Messages A]
        A2[Tools A]
        A3[Context A]
    end
    
    subgraph "Transfer"
        T1[Transfer Tool]
        T2[Transfer Context]
        T3[Isolated State]
    end
    
    subgraph "Agent B Context"
        B1[Messages B]
        B2[Tools B]
        B3[Context B]
    end
    
    A1 --> T1
    A3 --> T2
    T2 --> B1
    T3 --> B3
    
    style T1 fill:#f39c12
    style T2 fill:#f39c12
    style T3 fill:#f39c12
```

---

## 🛡️ Guardrails Flow

### Input & Output Validation

```mermaid
flowchart TD
    Start([User Input]) --> IG{Input<br/>Guardrails?}
    
    IG -->|Yes| RunIG[Run Input Guardrails]
    IG -->|No| LLM
    
    RunIG --> IGPass{Pass?}
    IGPass -->|✅ Yes| LLM[Generate with LLM]
    IGPass -->|❌ No| IGFeed[Generate Feedback]
    IGFeed --> LLM
    
    LLM --> OG{Output<br/>Guardrails?}
    
    OG -->|Yes| RunOG[Run Output Guardrails]
    OG -->|No| Success
    
    RunOG --> OGPass{Pass?}
    OGPass -->|✅ Yes| Success([Return Result])
    OGPass -->|❌ No| OGFeed[Generate Feedback]
    
    OGFeed --> Check{Max<br/>Turns?}
    Check -->|No| LLM
    Check -->|Yes| Error([Max Turns Exceeded])
    
    style IG fill:#9b59b6
    style RunIG fill:#9b59b6
    style OG fill:#9b59b6
    style RunOG fill:#9b59b6
    style Success fill:#27ae60
    style Error fill:#e74c3c
```

### Available Guardrails

```mermaid
graph TB
    subgraph "Core Guardrails"
        LG[Length Guardrail]
        PII[PII Detection]
        Custom[Custom Guardrail]
    end
    
    subgraph "Advanced Guardrails"
        CS[Content Safety]
        TR[Topic Relevance]
        Sent[Sentiment]
        Tox[Toxicity]
        Lang[Language]
        Rate[Rate Limit]
    end
    
    Input[📝 Input] --> LG
    Input --> PII
    Input --> Custom
    
    Output[📤 Output] --> CS
    Output --> TR
    Output --> Sent
    Output --> Tox
    Output --> Lang
    Output --> Rate
    
    style LG fill:#9b59b6
    style PII fill:#9b59b6
    style CS fill:#e74c3c
    style TR fill:#e74c3c
```

---

## 📊 Tracing & Observability

### Langfuse Integration

```mermaid
sequenceDiagram
    participant R as Runner
    participant TC as Tracing Context
    participant LF as Langfuse
    
    Note over R: Start execution
    
    R->>TC: runWithTraceContext()
    TC->>LF: Create trace "Agent Run"
    LF-->>TC: trace object
    
    loop For each agent
        R->>TC: createContextualSpan()
        TC->>LF: Create span "Agent: X"
        
        loop For each LLM call
            R->>TC: createContextualGeneration()
            TC->>LF: Create generation
            Note over LF: Log tokens, latency
        end
        
        loop For each tool
            R->>TC: createContextualSpan()
            TC->>LF: Create span "Tool: X"
        end
        
        loop For each guardrail
            R->>TC: createContextualSpan()
            TC->>LF: Create span "Guardrail: X"
        end
        
        R->>TC: End agent span
    end
    
    R->>TC: End trace with metadata
    TC->>LF: flushAsync()
```

### Trace Hierarchy

```mermaid
graph TB
    Trace[🔍 Trace: Agent Run]
    
    Trace --> IG[📥 SPAN: Input Guardrail]
    Trace --> A1[🤖 SPAN: Agent A]
    Trace --> A2[🤖 SPAN: Agent B]
    Trace --> OG[📤 SPAN: Output Guardrail]
    
    A1 --> G1[🧠 GENERATION: LLM Call 1]
    A1 --> T1[🔧 SPAN: Tool 1]
    A1 --> T2[🔧 SPAN: Tool 2]
    
    A2 --> G2[🧠 GENERATION: LLM Call 2]
    A2 --> T3[🔧 SPAN: Tool 3]
    
    style Trace fill:#f39c12
    style IG fill:#9b59b6
    style OG fill:#9b59b6
    style A1 fill:#4a90e2
    style A2 fill:#4a90e2
    style G1 fill:#e74c3c
    style G2 fill:#e74c3c
```

---

## 🔧 Tool Execution

### Tool Call Flow

```mermaid
flowchart TD
    Start([LLM Response]) --> HasTools{Has Tool<br/>Calls?}
    
    HasTools -->|No| End([Continue])
    HasTools -->|Yes| Parse[Parse Tool Calls]
    
    Parse --> Parallel{Parallel<br/>Enabled?}
    
    Parallel -->|Yes| ExecPar[Execute in Parallel]
    Parallel -->|No| ExecSeq[Execute Sequentially]
    
    ExecPar --> Collect[Collect Results]
    ExecSeq --> Collect
    
    Collect --> Trace[Trace Each Tool]
    Trace --> AddMsg[Add Tool Results to Messages]
    AddMsg --> Next([Next Turn])
    
    style Start fill:#50c878
    style ExecPar fill:#4a90e2
    style ExecSeq fill:#f39c12
    style Next fill:#50c878
```

### Built-in Tools

```mermaid
graph TB
    subgraph "Audio Tools"
        TTS[Text-to-Speech]
        STT[Speech-to-Text]
    end
    
    subgraph "Vision Tools"
        IMG[Image Generation]
    end
    
    subgraph "Knowledge Tools"
        EMB[Embeddings]
        RAG[RAG Search]
        RANK[Rerank]
    end
    
    subgraph "Integration"
        MCP[MCP Tools]
    end
    
    Agent[🤖 Agent] --> TTS
    Agent --> STT
    Agent --> IMG
    Agent --> EMB
    Agent --> RAG
    Agent --> RANK
    Agent --> MCP
    
    style Agent fill:#4a90e2
    style TTS fill:#27ae60
    style IMG fill:#27ae60
    style RAG fill:#27ae60
```

---

## 🎯 Complete End-to-End Flow

### Full System Flow with All Features

```mermaid
flowchart TD
    Start([👤 User Request]) --> Init[Initialize Agent]
    
    Init --> CreateRunner[Create AgenticRunner]
    CreateRunner --> CreateState[Create RunState]
    CreateState --> CreateTrace[🔍 Create Langfuse Trace]
    
    CreateTrace --> PrepMsg[Prepare Messages]
    
    PrepMsg --> InputGuard{Input<br/>Guardrails?}
    
    InputGuard -->|Yes| RunInputG[🛡️ Run Input Guardrails]
    InputGuard -->|No| StartLoop
    
    RunInputG --> IGPass{Pass?}
    IGPass -->|❌ No| GenFeedback1[Generate Feedback]
    IGPass -->|✅ Yes| StartLoop
    
    GenFeedback1 --> StartLoop
    
    StartLoop[📍 Start Turn Loop] --> CheckTurns{Max Turns<br/>Reached?}
    CheckTurns -->|Yes| MaxTurnsError([❌ Max Turns Error])
    CheckTurns -->|No| CreateSpan[📊 Create Agent Span]
    
    CreateSpan --> LLMCall[🧠 LLM Generation]
    LLMCall --> TraceGen[📊 Trace Generation]
    
    TraceGen --> CheckResp{Response<br/>Type?}
    
    CheckResp -->|Text Only| OutputGuard
    CheckResp -->|Tool Calls| ExecTools[🔧 Execute Tools]
    CheckResp -->|Transfer| HandleTransfer
    
    ExecTools --> TraceTools[📊 Trace Each Tool]
    TraceTools --> RunTools[Run Tools]

    RunTools --> AddResults[Add Tool Results]
    
    AddResults --> EndSpan1[End Agent Span]
    EndSpan1 --> StartLoop
    
    HandleTransfer[🔀 Handle Transfer] --> EndCurrentSpan[End Current Agent Span]
    EndCurrentSpan --> SwitchAgent[Switch to New Agent]
    SwitchAgent --> IsolateCtx[Isolate Context]
    IsolateCtx --> StartLoop
    
    OutputGuard{Output<br/>Guardrails?} -->|Yes| RunOutputG[🛡️ Run Output Guardrails]
    OutputGuard -->|No| EndTrace

    RunOutputG --> OGPass{Pass?}
    OGPass -->|❌ No| GenFeedback2[Generate Feedback]
    OGPass -->|✅ Yes| EndTrace

    GenFeedback2 --> CheckTurns2{Max Turns?}
    CheckTurns2 -->|Yes| MaxTurnsError
    CheckTurns2 -->|No| StartLoop

    EndTrace[End Trace] --> FlushTrace[🔍 Flush to Langfuse]
    FlushTrace --> ReturnResult([✅ Return Result])

    style Start fill:#50c878
    style LLMCall fill:#e74c3c
    style ExecTools fill:#27ae60
    style HandleTransfer fill:#f39c12
    style FlushTrace fill:#f39c12
    style ReturnResult fill:#ffd700
    style MaxTurnsError fill:#e74c3c
    style RunInputG fill:#9b59b6
    style RunOutputG fill:#9b59b6
```

---

## 🔍 Component Details

### 1. Agent Class (`core/agent/agent-class.ts`)

**Purpose**: Main interface for creating and running agents

**Key Methods**:
- `run(input, options)` - Execute agent
- `runStream(input, options)` - Execute with streaming
- `tool(config)` - Create tool definition

**Key Properties**:
- `name` - Agent identifier
- `instructions` - System prompt
- `model` - LLM model
- `tools` - Tool definitions
- `subagents` - Child agents for transfers
- `guardrails` - Validation rules

### 2. AgenticRunner (`core/runner.ts`)

**Purpose**: Core execution engine

**Key Methods**:
- `execute()` - Main execution loop
- `executeAgentLoop()` - Agent turn loop
- `executeStep()` - Single LLM call
- `runInputGuardrails()` - Input validation
- `runOutputGuardrails()` - Output validation

**Features**:
- Turn-based execution
- Guardrail integration
- Transfer handling
- Tracing integration
- Token tracking

### 3. Execution Engine (`core/execution.ts`)

**Purpose**: Single-step execution logic

**Key Functions**:
- `executeStep()` - Execute one LLM call
- `executeToolCalls()` - Execute tools
- `detectTransfer()` - Check for transfers

### 4. Transfer System (`core/transfers.ts`)

**Purpose**: Multi-agent coordination

**Key Functions**:
- `createTransferTools()` - Generate transfer tools
- `detectTransfer()` - Detect transfer in response
- `createTransferContext()` - Isolate context

**Features**:
- Context isolation
- Transfer detection
- Query/reason passing

### 5. RunState (`core/runstate.ts`)

**Purpose**: State management during execution

**Properties**:
- `messages` - Conversation history
- `steps` - Execution steps
- `usage` - Token usage
- `currentAgent` - Active agent
- `handoffChain` - Agent path
- `agentMetrics` - Per-agent stats

### 6. Guardrails (`guardrails/index.ts`)

**Available Guardrails**:
- `lengthGuardrail` - Text length validation
- `piiDetectionGuardrail` - PII detection
- `contentSafetyGuardrail` - Content safety (LLM-based)
- `topicRelevanceGuardrail` - Topic validation
- `sentimentGuardrail` - Sentiment analysis
- `toxicityGuardrail` - Toxicity check
- `languageGuardrail` - Language validation
- `rateLimitGuardrail` - Rate limiting

### 7. Tracing Context (`tracing/context.ts`)

**Purpose**: Langfuse integration

**Key Functions**:
- `withTrace()` - Create trace scope
- `createContextualSpan()` - Create span
- `createContextualGeneration()` - Create generation
- `runWithTraceContext()` - Execute with tracing

**Features**:
- Async context tracking
- Hierarchical spans
- Token tracking
- Error tracking

### 8. Tool System (`tools/`)

**Built-in Tools**:
- Audio: Text-to-speech, transcription
- Embeddings: Vector generation
- Image: Image generation
- RAG: Pinecone search
- Rerank: Result reranking

### 9. Lifecycle Hooks (`lifecycle/`)

**Hook Events**:
- Agent hooks: `onStart`, `onEnd`, `onError`
- Run hooks: `agent_start`, `agent_end`, `agent_handoff`, `agent_tool_start`, `agent_tool_end`

---

## 📊 Data Flow Summary

```mermaid
graph LR
    Input[User Input] --> Agent
    Agent --> Runner
    Runner --> State
    State --> Execution
    Execution --> LLM
    LLM --> Response
    Response --> Tools
    Tools --> State
    State --> Guardrails
    Guardrails --> Output
    
    State -.-> Usage
    Runner -.-> Tracing
    
    style Input fill:#50c878
    style Output fill:#ffd700
    style LLM fill:#e74c3c
```

---

## ✅ Key Takeaways

1. **Agent** - User-facing interface
2. **AgenticRunner** - Core execution engine
3. **RunState** - Centralized state management
4. **Execution** - LLM interaction logic
5. **Transfers** - Multi-agent coordination
6. **Guardrails** - Safety & validation
7. **Tracing** - Observability via Langfuse
8. **Tools** - Extensible functionality
9. **Lifecycle** - Event-driven hooks

---

**This architecture ensures:**
- ✅ Clear separation of concerns
- ✅ True agentic patterns
- ✅ Comprehensive observability
- ✅ Production-ready reliability
- ✅ Extensible design

---

**Made with ❤️ by [Tawk.to](https://www.tawk.to)**

