# 🎓 Core Concepts

**Understanding the fundamentals of Tawk Agents SDK**

This guide explains the core architecture and concepts that power the SDK. By the end, you'll understand how agents work, how they execute tools, and how to build complex systems.

---

## 📖 Table of Contents

1. [What is an Agent?](#what-is-an-agent)
2. [True Agentic Architecture](#true-agentic-architecture)
3. [Tool Execution](#tool-execution)
4. [Multi-Agent Systems](#multi-agent-systems)
5. [State Management](#state-management)
6. [Execution Lifecycle](#execution-lifecycle)

---

## 1. What is an Agent?

### Definition

An **Agent** is an autonomous AI entity with:
- **Intelligence**: Powered by LLMs (GPT-4, Claude, etc.)
- **Tools**: Functions it can call to take actions
- **Instructions**: System prompts defining its behavior
- **Context**: Access to application state and data
- **Safety**: Guardrails for validation and control

### Architecture Diagram

```mermaid
graph TB
    subgraph "Agent Core"
        Model[AI Model<br/>GPT-4, Claude, etc.]
        Instructions[System Instructions]
        Tools[Tool Set]
        Guardrails[Safety Guardrails]
        Context[Execution Context]
    end
    
    Input[User Input] --> Agent[Agent]
    Agent --> Model
    Agent --> Instructions
    Agent --> Tools
    Agent --> Guardrails
    Agent --> Context
    
    Model --> Output[Agent Output]
    Tools --> Output
    Guardrails --> Output
    
    style Agent fill:#4a90e2,stroke:#2c5aa0,stroke-width:3px
    style Model fill:#e74c3c
    style Tools fill:#f39c12
    style Guardrails fill:#27ae60
```

### Basic Example

```typescript
import { Agent, run, tool } from '@tawk.to/tawk-agents-sdk';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

// Define a tool
const calculator = tool({
  description: 'Perform math calculations',
  inputSchema: z.object({
    expression: z.string().describe('Math expression')
  }),
  execute: async ({ expression }) => {
    return { result: eval(expression) };
  }
});

// Create an agent
const agent = new Agent({
  name: 'MathAgent',
  model: openai('gpt-4o'),
  instructions: 'You are a math tutor. Use the calculator tool for calculations.',
  tools: {
    calculate: calculator
  }
});

// Run the agent
const result = await run(agent, 'What is 15 * 23?');
console.log(result.finalOutput); // "15 * 23 equals 345"
```

---

## 2. True Agentic Architecture

### Core Principles

The Tawk Agents SDK is built on agentic principles where agents autonomously make decisions:

```mermaid
graph TB
    Input[User Input]
    Agent[Agent Brain]
    
    subgraph "Autonomous Decision Making"
        Decide{Agent Decides<br/>Next Action}
        Tool1[Tool A]
        Tool2[Tool B]
        Tool3[Tool C]
        Parallel[Parallel<br/>Execution]
    end
    
    Input --> Agent
    Agent --> Decide
    Decide -->|Calls| Tool1
    Decide -->|Calls| Tool2
    Decide -->|Calls| Tool3
    Tool1 --> Parallel
    Tool2 --> Parallel
    Tool3 --> Parallel
    Parallel --> Agent
    Agent --> Decide
    Decide -->|Done| Output[Final Output]
    
    style Agent fill:#4a90e2
    style Decide fill:#f39c12
    style Parallel fill:#27ae60
```

### Key Characteristics

- **Agent-Driven**: Agent autonomously decides what to do next based on context
- **Parallel Execution**: Tools run simultaneously for maximum efficiency
- **Dynamic Adaptation**: Behavior adapts based on results and state
- **Autonomous Flow**: No predefined paths - agent chooses its journey


| Feature | Agentic Implementation |
|---------|------------------------|
| **Decision Making** | AI-driven and context-aware |
| **Tool Execution** | Parallel by default |
| **Flexibility** | Dynamic adaptation |
| **State** | Complex RunState tracking |
| **Transfers** | Autonomous delegation |

---

## 3. Tool Execution

### Tool Lifecycle

```mermaid
sequenceDiagram
    participant User
    participant Agent
    participant ToolEngine
    participant Tool1
    participant Tool2
    participant AI Model
    
    User->>Agent: "Get weather in Tokyo and New York"
    Agent->>AI Model: Process request
    AI Model->>Agent: Need getWeather(Tokyo), getWeather(New York)
    
    Agent->>ToolEngine: Execute tools
    
    par Parallel Execution
        ToolEngine->>Tool1: getWeather(Tokyo)
        Tool1-->>ToolEngine: {temp: 22, sunny}
        
        ToolEngine->>Tool2: getWeather(New York)
        Tool2-->>ToolEngine: {temp: 18, rainy}
    end
    
    ToolEngine-->>Agent: Both results
    Agent->>AI Model: Continue with results
    AI Model-->>Agent: Final response
    Agent-->>User: "Tokyo: 22°C sunny, NY: 18°C rainy"
```

### Tool Definition

```typescript
const myTool = tool({
  description: 'What the tool does',
  inputSchema: z.object({
    param: z.string()
  }),
  execute: async ({ param }, context) => {
    // Access context
    const userId = context.context.userId;
    const db = context.context.db;
    
    // Do work
    const data = await db.query('SELECT * FROM table WHERE id = ?', [userId]);
    
    return data;
  },
  
  // Optional: Enable/disable based on context
  enabled: (context) => context.context.isAdmin
});
```

### Parallel Execution

**Automatic Parallelization**:

```typescript
// Agent automatically parallelizes these
await run(agent, 'Get weather in Tokyo, London, and New York');

// Execution flow:
// 1. Agent calls all 3 getWeather tools simultaneously
// 2. All execute in parallel (fastest possible)
// 3. Agent receives all results at once
// 4. Agent synthesizes final response
```

**Performance Gain**:
```mermaid
gantt
    title Tool Execution Timeline
    dateFormat X
    axisFormat %L ms
    
    section Parallel Execution
    Tool 1 :0, 500
    Tool 2 :0, 500
    Tool 3 :0, 500
```

**Result**: All 3 tools complete in ~500ms through parallel execution

**Performance Benefit**: Up to 3x faster compared to serial execution

---

## 4. Multi-Agent Systems

### Agent Transfers

**Architecture**:

```mermaid
graph TB
    User[User Request]
    
    subgraph "Coordinator Layer"
        Triage[Triage Agent<br/>Routes requests]
    end
    
    subgraph "Specialist Agents"
        Sales[Sales Agent<br/>Pricing & demos]
        Support[Support Agent<br/>Technical help]
        Research[Research Agent<br/>Information]
    end
    
    subgraph "Sub-Specialists"
        Billing[Billing Specialist]
        Tech[Tech Specialist]
    end
    
    User --> Triage
    Triage -->|Sales query| Sales
    Triage -->|Support query| Support
    Triage -->|Research query| Research
    
    Support -->|Billing issue| Billing
    Support -->|Technical issue| Tech
    
    Sales -.->|Final answer| User
    Support -.->|Final answer| User
    Research -.->|Final answer| User
    Billing -.->|Final answer| User
    Tech -.->|Final answer| User
    
    style Triage fill:#4a90e2
    style Sales fill:#e74c3c
    style Support fill:#f39c12
    style Research fill:#27ae60
```

### Transfer Flow

```mermaid
sequenceDiagram
    participant User
    participant Coordinator
    participant Researcher
    participant Writer
    
    User->>Coordinator: "Write article about AI"
    
    Note over Coordinator: Decides: Need research first
    Coordinator->>Researcher: Transfer with context
    
    Note over Researcher: Gathers information
    Researcher->>Researcher: Uses search tools
    Researcher-->>Coordinator: Research complete
    
    Note over Coordinator: Decides: Now write
    Coordinator->>Writer: Transfer with research
    
    Note over Writer: Writes article
    Writer->>Writer: Uses formatting tools
    Writer-->>Coordinator: Article complete
    
    Coordinator-->>User: Final article
```

### Implementation

```typescript
// Specialist agents
const researcher = new Agent({
  name: 'Researcher',
  model: openai('gpt-4o'),
  instructions: 'You research topics thoroughly.',
  transferDescription: 'Use for research tasks',
  tools: { search, fetchData }
});

const writer = new Agent({
  name: 'Writer',
  model: openai('gpt-4o'),
  instructions: 'You write clear, engaging content.',
  transferDescription: 'Use for writing tasks',
  tools: { format, spellCheck }
});

// Coordinator
const coordinator = new Agent({
  name: 'Coordinator',
  model: openai('gpt-4o'),
  instructions: 'Route tasks to specialists.',
  subagents: [researcher, writer]  // Available specialists
});

// Agent autonomously decides transfer chain
const result = await run(coordinator, 'Write an article about quantum computing');
// Flow: Coordinator → Researcher → Writer → Final output
```

---

## 5. State Management

### RunState Architecture

```mermaid
graph TB
    subgraph "RunState"
        Input[Original Input]
        Messages[Message History]
        Steps[Execution Steps]
        Metrics[Agent Metrics]
        Turn[Current Turn]
        Context[Context Data]
    end
    
    subgraph "State Transitions"
        Running[Running]
        ToolCall[Tool Execution]
        Transfer[Agent Transfer]
        Complete[Complete]
    end

    Input --> Running
    Messages --> Running
    Steps --> Running
    Metrics --> Running

    Running --> ToolCall
    ToolCall --> Running
    Running --> Transfer
    Transfer --> Running
    Running --> Complete

    Complete -.Save.-> Storage[(Storage)]
    Storage -.Resume.-> Running

    style Running fill:#4a90e2
    style Complete fill:#27ae60
```

### Interruption & Resumption

```typescript
// Initial run
const result1 = await run(agent, 'Start complex task');

// Save state if needed for continuation
if (result1.state) {
  await saveToDatabase(result1.state);

  // ... later, resume from saved state ...

  const savedState = await loadFromDatabase();
  const result2 = await run(agent, savedState);

  console.log('Continued:', result2.finalOutput);
}
```

### State Transitions

```mermaid
stateDiagram-v2
    [*] --> Initializing
    Initializing --> Running: Start
    
    Running --> ToolExecution: Tools needed
    ToolExecution --> Running: Results ready
    
    Running --> Transfer: Transfer needed
    Transfer --> Running: Continue with new agent
    
    Running --> GuardrailCheck: Validate output
    GuardrailCheck --> Running: Pass
    GuardrailCheck --> Error: Fail

    Running --> Complete: Done
    Complete --> [*]
    
    Error --> [*]
```

---

## 6. Execution Lifecycle

### Complete Agent Execution

```mermaid
graph TB
    Start([User Input]) --> InputGuard{Input<br/>Guardrails}
    InputGuard -->|Pass| InitAgent[Initialize Agent]
    InputGuard -->|Fail| Reject([Reject])
    
    InitAgent --> Loop{Max Turns?}
    Loop -->|No| CallModel[Call AI Model]
    Loop -->|Yes| MaxTurns([Max Turns Error])
    
    CallModel --> Decision{Agent Decision}
    
    Decision -->|Tool Calls| ParallelTools[Execute Tools<br/>in Parallel]
    Decision -->|Transfer| SwitchAgent[Switch to<br/>New Agent]
    Decision -->|Final Answer| OutputGuard
    
    ParallelTools --> UpdateState[Update State]
    SwitchAgent --> InitAgent
    UpdateState --> Loop
    
    OutputGuard{Output<br/>Guardrails} -->|Pass| Complete([Success])
    OutputGuard -->|Fail| Reject
    
    style Start fill:#50c878
    style Complete fill:#50c878
    style Reject fill:#e74c3c
    style MaxTurns fill:#e74c3c
    style ParallelTools fill:#f39c12
    style Decision fill:#4a90e2
```

### Detailed Step-by-Step

```mermaid
sequenceDiagram
    participant User
    participant SDK
    participant Guardrails
    participant Agent
    participant Tools
    participant AI Model
    participant State
    
    User->>SDK: run(agent, input)
    SDK->>Guardrails: Validate input
    Guardrails-->>SDK: ✓ Pass
    
    SDK->>Agent: Initialize
    Agent->>State: Create RunState
    
    loop Until Complete or Max Turns
        Agent->>AI Model: Generate response
        AI Model-->>Agent: Response with tool calls
        
        Agent->>Tools: Execute in parallel
        par Tool Execution
            Tools->>Tools: Tool 1
            Tools->>Tools: Tool 2
            Tools->>Tools: Tool 3
        end
        Tools-->>Agent: All results
        
        Agent->>State: Record step
        Agent->>State: Update metrics
    end
    
    Agent->>Guardrails: Validate output
    Guardrails-->>Agent: ✓ Pass
    
    Agent->>State: Finalize
    Agent-->>SDK: RunResult
    SDK-->>User: Final output
```

### Lifecycle Hooks

```typescript
import { Agent } from '@tawk.to/tawk-agents-sdk';

// Agent extends AgentHooks (EventEmitter), so use .on() directly
const agent = new Agent({ /* config */ });

agent.on('agent_start', (context, agent) => {
  console.log('Agent starting');
});

agent.on('agent_tool_start', (context, tool) => {
  console.log(`Calling: ${tool.name}`);
});

agent.on('agent_tool_end', (context, tool, result) => {
  console.log(`Result: ${tool.name}`);
});

agent.on('agent_handoff', (context, nextAgent) => {
  console.log(`Handoff → ${nextAgent.name}`);
});

agent.on('agent_end', (context, output) => {
  console.log('Complete');
});
```

---

## 🎯 Key Takeaways

### 1. Agents are Autonomous
- They make decisions based on AI intelligence
- No predefined execution paths
- Dynamic adaptation to context

### 2. Parallel Execution is Default
- Tools execute simultaneously when possible
- Massive performance improvement
- No special configuration needed

### 3. State is First-Class
- Full state management with RunState
- State can be saved and resumed across calls
- Perfect for multi-step workflows

### 4. Multi-Agent is Native
- Agents can transfer to specialists
- Automatic context passing
- Seamless coordination

### 5. Safety is Built-In
- Guardrails at input and output
- Context-based tool enabling
- 9 built-in guardrail types

---

## 📚 Next Steps

Now that you understand the core concepts:

1. **Practice**: Try the [Getting Started Guide](../getting-started/GETTING_STARTED.md)
2. **Explore**: Read the [Features Guide](./FEATURES.md)
3. **Deep Dive**: Study the [Architecture](../reference/COMPLETE_ARCHITECTURE.md)
4. **Build**: Check out [Examples](../../examples)

---

## 🔗 Related Documentation

- [Features Guide](./FEATURES.md) - All features in detail
- [Architecture](../reference/COMPLETE_ARCHITECTURE.md) - Technical deep dive
- [API Reference](../reference/API.md) - Complete API docs
- [Advanced Features](./ADVANCED_FEATURES.md) - Power user features

---

**Ready to build?** → [Getting Started](../getting-started/GETTING_STARTED.md)

**Made with ❤️ by [Tawk.to](https://www.tawk.to)**
