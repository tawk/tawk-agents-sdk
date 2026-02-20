/**
 * Multi-Agent Research System Example (Structured Output Version)
 * 
 * Based on Anthropic's Multi-Agent Research System architecture.
 * Uses structured outputs throughout for reliable, type-safe processing.
 * 
 * Features:
 * - Structured research plan with steps (like Claude's multi-step process)
 * - Structured subagent findings
 * - Structured final synthesis
 * - Agent-driven flow with handoffs
 * - Parallel subagent execution
 * 
 * @example
 * ```bash
 * npx ts-node examples/advanced/multi-agent-research.ts
 * ```
 */

import 'dotenv/config';
import { Agent, run, tool, setDefaultModel } from '../../src';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

// Set default model
setDefaultModel(openai('gpt-4o-mini'));

// ============================================
// STRUCTURED OUTPUT SCHEMAS
// ============================================

/**
 * Research Step Schema - Each step in the research plan
 */
const ResearchStepSchema = z.object({
  stepNumber: z.number().describe('Step number in sequence'),
  focus: z.string().describe('Focus area for this step (e.g., "academic sources", "industry reports")'),
  task: z.string().describe('Specific, detailed research task for this step'),
  priority: z.enum(['high', 'medium', 'low']).describe('Priority level'),
  estimatedComplexity: z.enum(['simple', 'moderate', 'complex']).describe('Estimated complexity'),
});

/**
 * Research Plan Schema - Structured plan with multiple steps
 */
const ResearchPlanSchema = z.object({
  query: z.string().describe('The original research query'),
  summary: z.string().describe('Brief summary of the research approach'),
  steps: z.array(ResearchStepSchema).describe('Ordered list of research steps to execute'),
  totalSteps: z.number().describe('Total number of steps'),
});

/**
 * Source Schema - Individual source information
 */
const SourceSchema = z.object({
  title: z.string().describe('Source title'),
  url: z.string().url().describe('Source URL'),
  snippet: z.string().describe('Relevant snippet from source'),
  relevance: z.number().min(0).max(1).describe('Relevance score (0-1)'),
  quality: z.number().min(0).max(1).optional().describe('Quality score (0-1)'),
  isAuthoritative: z.boolean().optional().describe('Whether source is authoritative'),
});

/**
 * Subagent Finding Schema - Structured findings from a subagent
 */
const SubagentFindingSchema = z.object({
  focus: z.string().describe('Focus area of this subagent'),
  keyFindings: z.array(z.string()).describe('List of key findings (3-5 bullet points)'),
  sources: z.array(SourceSchema).describe('List of sources found'),
  summary: z.string().describe('2-3 sentence summary'),
  confidence: z.number().min(0).max(1).describe('Confidence level in findings (0-1)'),
  metadata: z.object({
    searchQueries: z.array(z.string()).optional().describe('Search queries used'),
    sourcesEvaluated: z.number().optional().describe('Number of sources evaluated'),
  }).optional(),
});

/**
 * Synthesized Report Schema - Final structured report
 */
const SynthesizedReportSchema = z.object({
  executiveSummary: z.string().describe('Executive summary of the research'),
  findingsByFocus: z.array(z.object({
    focus: z.string(),
    findings: z.array(z.string()),
    sources: z.array(SourceSchema),
  })).describe('Findings organized by focus area'),
  keyInsights: z.array(z.string()).describe('Key insights across all findings'),
  conclusion: z.string().describe('Overall conclusion'),
  totalSources: z.number().describe('Total number of sources cited'),
});

/**
 * Final Report Schema - Complete final report with citations
 */
const FinalReportSchema = z.object({
  title: z.string().describe('Report title'),
  executiveSummary: z.string().describe('Executive summary'),
  sections: z.array(z.object({
    heading: z.string(),
    content: z.string(),
    citations: z.array(z.string()).optional(),
  })).describe('Report sections with content and citations'),
  conclusion: z.string().describe('Final conclusion'),
  references: z.array(z.object({
    title: z.string(),
    url: z.string(),
    citationKey: z.string(),
  })).describe('Complete list of references'),
});

// ============================================
// TYPES & INTERFACES
// ============================================

type ResearchPlan = z.infer<typeof ResearchPlanSchema>;
type ResearchStep = z.infer<typeof ResearchStepSchema>;
type SubagentFinding = z.infer<typeof SubagentFindingSchema>;
type SynthesizedReport = z.infer<typeof SynthesizedReportSchema>;
type FinalReport = z.infer<typeof FinalReportSchema>;

interface ResearchContext {
  researchPlan?: ResearchPlan;
  subagentResults: Array<{
    subagentId: string;
    finding: SubagentFinding;
    focus: string;
    metadata: {
      tokens: number;
      toolCalls: number;
    };
  }>;
  memory: Map<string, any>;
  tokenBudget: {
    maxTokens: number;
    usedTokens: number;
  };
  pendingSteps?: ResearchStep[];
  synthesizedReport?: SynthesizedReport;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  relevance: number;
}

// ============================================
// SIMULATED WEB SEARCH
// ============================================

/**
 * Simulated web search (replace with real API like Serper, Tavily, etc.)
 */
async function performWebSearch(
  query: string,
  maxResults: number = 10
): Promise<SearchResult[]> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Simulated results
  return Array.from({ length: Math.min(maxResults, 5) }, (_, i) => ({
    title: `Result ${i + 1} for "${query}"`,
    url: `https://example.com/result-${i + 1}`,
    snippet: `This is a simulated search result for "${query}". It contains relevant information about the topic.`,
    relevance: 0.9 - (i * 0.1),
  }));
}

/**
 * Evaluate source quality (simplified)
 */
function evaluateSourceQuality(url: string, content: string): {
  score: number;
  reasoning: string;
  isAuthoritative: boolean;
} {
  const isAuthoritative = url.includes('.edu') || url.includes('.gov') || url.includes('wikipedia.org');
  const score = isAuthoritative ? 0.9 : 0.7;
  
  return {
    score,
    reasoning: isAuthoritative 
      ? 'Source appears to be from an authoritative domain'
      : 'Source quality is moderate',
    isAuthoritative,
  };
}

// ============================================
// SUBAGENT (with structured output)
// ============================================

/**
 * Create a specialized research subagent with structured output
 */
function createSubagent(step: ResearchStep): Agent<any, SubagentFinding> {
  return new Agent<any, SubagentFinding>({
    name: `Subagent-${step.focus.replace(/\s+/g, '-')}-${Date.now()}`,
    model: openai('gpt-4o-mini'),
    instructions: `You are a specialized research subagent focused on: ${step.focus}

Your specific task: ${step.task}

Guidelines:
- Perform thorough web searches using the web_search tool
- Evaluate source quality using evaluate_source
- Return structured findings matching the required schema
- Be concise but comprehensive
- Focus ONLY on your assigned aspect: ${step.focus}
- Provide 3-5 key findings
- Include at least 3-5 sources
- Provide a 2-3 sentence summary
- Assess your confidence level (0-1) based on source quality and coverage

CRITICAL: Return ONLY valid JSON matching the SubagentFinding schema. Do NOT include markdown code blocks or any text outside the JSON.

The JSON structure must be:
{
  "focus": "string - Your focus area",
  "keyFindings": ["array of 3-5 key findings as strings"],
  "sources": [
    {
      "title": "string",
      "url": "string (valid URL)",
      "snippet": "string",
      "relevance": 0.0-1.0,
      "quality": 0.0-1.0 (optional),
      "isAuthoritative": true/false (optional)
    }
  ],
  "summary": "string - 2-3 sentence summary",
  "confidence": 0.0-1.0,
  "metadata": {
    "searchQueries": ["array of queries used"],
    "sourcesEvaluated": 0
  }
}

Return ONLY the JSON object, nothing else.`,
    
    outputSchema: SubagentFindingSchema,
    
    tools: {
      web_search: tool({
        description: 'Search the web for information related to your research task',
        inputSchema: z.object({
          query: z.string().describe('Search query'),
          maxResults: z.number().min(1).max(20).optional().describe('Maximum results to return'),
        }),
        execute: async ({ query, maxResults = 10 }) => {
          console.log(`   🔍 [${step.focus}] Searching: "${query}"`);
          const results = await performWebSearch(query, maxResults);
          return {
            query,
            results: results.map(r => ({
              title: r.title,
              url: r.url,
              snippet: r.snippet,
              relevance: r.relevance,
            })),
            count: results.length,
          };
        },
      }),
      
      evaluate_source: tool({
        description: 'Evaluate the quality and reliability of a source',
        inputSchema: z.object({
          url: z.string(),
          content: z.string(),
        }),
        execute: async ({ url, content }) => {
          const quality = evaluateSourceQuality(url, content);
          return {
            url,
            quality: quality.score,
            reasoning: quality.reasoning,
            isAuthoritative: quality.isAuthoritative,
          };
        },
      }),
    },
    maxSteps: 15,
  });
}

// ============================================
// CITATION AGENT (with structured output)
// ============================================

// Temporarily remove structured output from CitationAgent to avoid parsing errors
// We'll create the final report from synthesized data instead
const citationAgent = new Agent<ResearchContext>({
  name: 'CitationAgent',
  handoffDescription: 'Transfer to CitationAgent when research is complete and you need to add proper citations to the final report. Include the synthesized report in the transfer context.',
  model: openai('gpt-4o-mini'),
  instructions: `You are a citation agent that processes research documents and adds proper citations.

Your task:
1. Review the synthesized research report provided (in the conversation or context)
2. Identify all claims that need citations
3. Extract source URLs from the report
4. Match claims to their sources
5. Add proper citations in markdown format: [Source Title](URL)

When you receive a research report, process it and return the complete report with proper citations added throughout. Format citations as: [Source Title](URL)`,
  
  // Removed outputSchema temporarily - we'll create final report from synthesized data
  
  tools: {
    extract_sources: tool({
      description: 'Extract source information from research findings',
      inputSchema: z.object({
        findings: z.string().describe('Research findings text'),
      }),
      execute: async ({ findings }) => {
        const urlRegex = /https?:\/\/[^\s]+/g;
        const urls = findings.match(urlRegex) || [];
        
        return {
          sources: urls.map((url: string, i: number) => ({
            url,
            title: `Source ${i + 1}`,
            citationKey: `source-${i + 1}`,
          })),
        };
      },
    }),
  },
});

// ============================================
// LEAD RESEARCHER AGENT (with structured output)
// ============================================

const leadResearcher = new Agent<ResearchContext>({
  name: 'LeadResearcher',
  model: openai('gpt-4o'), // Use stronger model for planning
  instructions: `You are a lead research agent that coordinates multi-agent research using structured planning (like Claude's multi-step process).

CRITICAL: You MUST complete ALL steps in sequence. Do NOT stop after tool calls - continue until the workflow is complete.

Your responsibilities:
1. Analyze the user's research query
2. Create a structured research plan with multiple steps (like Claude's multi-step process)
3. Execute each step using subagents in parallel
4. Synthesize findings from all subagents
5. Hand off to CitationAgent to add citations

WORKFLOW (MUST COMPLETE ALL STEPS):
1. First, create a structured research plan using create_research_plan tool
   - Break down the query into 3-6 focused research steps
   - Each step should have: stepNumber, focus, task, priority, estimatedComplexity
   - The tool will return a structured ResearchPlan
2. After creating the plan, execute all steps in parallel using execute_research_steps
   - Pass the steps array from the plan
3. After all steps complete, synthesize findings using synthesize_findings
4. After synthesis, hand off to CitationAgent using transfer_to_citationagent
   - Pass the synthesized report JSON in the "context" parameter

CRITICAL RULES:
- Create the research plan FIRST using create_research_plan tool
- Execute all steps in parallel after planning
- Synthesize after execution
- Hand off after synthesis
- Do NOT stop until you have handed off to CitationAgent`,
  
  tools: {
    // Create structured research plan
    create_research_plan: tool({
      description: 'Create a structured research plan with multiple steps. This is the first step - break down the query into 3-6 focused research steps. Each step should have: stepNumber (1,2,3...), focus (e.g., "academic sources"), task (specific research task), priority (high/medium/low), estimatedComplexity (simple/moderate/complex).',
      inputSchema: z.object({
        query: z.string().describe('The research query to plan for'),
        summary: z.string().optional().describe('Brief summary of research approach'),
        steps: z.array(ResearchStepSchema).describe('Array of research steps (3-6 steps recommended)'),
      }),
      execute: async ({ query, summary, steps }, context) => {
        console.log(`   📋 Creating structured research plan for: "${query}"`);
        console.log(`      Steps planned: ${steps.length}`);
        
        // Create structured plan
        const plan: ResearchPlan = {
          query,
          summary: summary || `Research plan with ${steps.length} focused steps`,
          steps,
          totalSteps: steps.length,
        };
        
        // Store in context
        context.context.researchPlan = plan;
        context.context.memory.set('researchPlan', plan);
        
        console.log(`   ✅ Research plan created:`);
        steps.forEach((step: ResearchStep, _idx: number) => {
          console.log(`      Step ${step.stepNumber}: ${step.focus} (${step.priority} priority, ${step.estimatedComplexity} complexity)`);
        });
        console.log(`      Next step: Call execute_research_steps with the steps array\n`);
        
        return {
          success: true,
          plan: plan,
          message: `Research plan created with ${steps.length} steps. Now call execute_research_steps with the steps array from this plan.`,
          nextStep: 'Call execute_research_steps with steps array',
        };
      },
    }),
    
    // Execute all research steps in parallel
    execute_research_steps: tool({
      description: 'Execute all research steps in parallel using subagents. Call this after creating the research plan.',
      inputSchema: z.object({
        steps: z.array(ResearchStepSchema).describe('Array of research steps to execute'),
      }),
      execute: async ({ steps }, context) => {
        if (steps.length === 0) {
          return {
            error: 'No steps provided. Create a research plan first.',
            executed: false,
          };
        }
        
        // Check token budget
        const budget = context.context.tokenBudget;
        const estimatedTokens = steps.length * 5000;
        if (budget.usedTokens + estimatedTokens > budget.maxTokens) {
          return {
            error: 'Token budget would be exceeded',
            usedTokens: budget.usedTokens,
            maxTokens: budget.maxTokens,
            estimated: estimatedTokens,
            executed: false,
          };
        }
        
        console.log(`\n   🏃 Executing ${steps.length} research steps in parallel...\n`);
        
        // Create subagents for each step
        const subagents = steps.map((step: ResearchStep) => createSubagent(step));
        
        // Run all subagents in parallel
        const results = await Promise.all(
          subagents.map((subagent: Agent<any, SubagentFinding>, index: number) => 
            run(subagent, `Research the following: ${steps[index].task}`, {
              context: context.context as any,
              maxTurns: 20,
            }).catch((error: Error) => ({
              finalOutput: {
                focus: steps[index].focus,
                keyFindings: [`Error: ${error.message}`],
                sources: [],
                summary: `Error occurred during research: ${error.message}`,
                confidence: 0,
              } as SubagentFinding,
              metadata: { totalTokens: 0, totalToolCalls: 0 },
            }))
          )
        );
        
        // Store structured results
        results.forEach((result: any, index: number) => {
          const subagentId = subagents[index].name;
          const step = steps[index];
          
          budget.usedTokens += result.metadata.totalTokens || 0;
          
          // result.finalOutput should be a SubagentFinding (structured)
          // Handle case where structured output parsing might have failed
          let finding: SubagentFinding;
          if (result.finalOutput && typeof result.finalOutput === 'object' && 'keyFindings' in result.finalOutput) {
            finding = result.finalOutput as SubagentFinding;
          } else {
            // Fallback: create a minimal structured finding
            console.log(`      ⚠️  Warning: Subagent did not return structured output, creating fallback`);
            finding = {
              focus: step.focus,
              keyFindings: [typeof result.finalOutput === 'string' ? result.finalOutput : 'Research completed'],
              sources: [],
              summary: 'Research completed but output format was unexpected',
              confidence: 0.5,
            };
          }
          
          context.context.subagentResults.push({
            subagentId,
            finding,
            focus: step.focus,
            metadata: {
              tokens: result.metadata.totalTokens || 0,
              toolCalls: result.metadata.totalToolCalls || 0,
            },
          });
          
          console.log(`   ✅ Step ${step.stepNumber} completed: ${step.focus}`);
          console.log(`      Tokens: ${result.metadata.totalTokens}, Tool Calls: ${result.metadata.totalToolCalls}`);
          if (result.finalOutput && typeof result.finalOutput === 'object' && 'keyFindings' in result.finalOutput) {
            console.log(`      Findings: ${result.finalOutput.keyFindings.length} key findings, ${result.finalOutput.sources.length} sources`);
          } else {
            console.log(`      ⚠️  Warning: Unexpected output format from subagent`);
            console.log(`      Output type: ${typeof result.finalOutput}`);
          }
        });
        
        console.log(`\n   📊 Execution summary:`);
        console.log(`      Total steps executed: ${steps.length}`);
        console.log(`      Total findings collected: ${context.context.subagentResults.length}`);
        console.log(`      Next step: Call synthesize_findings tool\n`);
        
        return {
          executed: true,
          stepsExecuted: steps.length,
          totalFindings: context.context.subagentResults.length,
          message: 'All research steps completed. Now call synthesize_findings to combine structured findings.',
          nextStep: 'Call synthesize_findings tool',
        };
      },
    }),
    
    // Synthesize structured findings
    synthesize_findings: tool({
      description: 'Synthesize structured findings from all subagents into a comprehensive structured report. Call this after all steps have completed.',
      inputSchema: z.object({}),
      execute: async (_, context) => {
        console.log(`\n   🔄 SYNTHESIZING STRUCTURED FINDINGS...`);
        console.log(`      Subagents to synthesize: ${context.context.subagentResults.length}`);
        
        const allFindings = context.context.subagentResults.map((r: { finding: SubagentFinding }) => r.finding);
        
        if (allFindings.length === 0) {
          return {
            error: 'No findings to synthesize. Make sure research steps have completed.',
            synthesized: false,
          };
        }
        
        // Create structured synthesized report
        const synthesizedReport: SynthesizedReport = {
          executiveSummary: `This report synthesizes findings from ${allFindings.length} specialized research steps.`,
          findingsByFocus: allFindings.map((f: SubagentFinding) => ({
            focus: f.focus,
            findings: f.keyFindings,
            sources: f.sources,
          })),
          keyInsights: allFindings.flatMap((f: SubagentFinding) => f.keyFindings).slice(0, 10), // Top 10 insights
          conclusion: allFindings.map((f: SubagentFinding) => f.summary).join(' '),
          totalSources: allFindings.reduce((sum: number, f: SubagentFinding) => sum + f.sources.length, 0),
        };
        
        // Store in context
        context.context.synthesizedReport = synthesizedReport;
        
        console.log(`\n   ✅ SYNTHESIS COMPLETE:`);
        console.log(`      Focus areas: ${synthesizedReport.findingsByFocus.length}`);
        console.log(`      Total sources: ${synthesizedReport.totalSources}`);
        console.log(`      Key insights: ${synthesizedReport.keyInsights.length}`);
        console.log(`      Next step: Hand off to CitationAgent\n`);
        
        return {
          synthesized: true,
          synthesizedReport: synthesizedReport,
          message: 'Findings synthesized successfully. Now hand off to CitationAgent using transfer_to_citationagent. Pass the synthesizedReport in the context parameter.',
          nextStep: 'Call transfer_to_citationagent with reason="Add citations" and context="[JSON string of synthesizedReport]"',
        };
      },
    }),
  },
  
  // Transfer to CitationAgent
  subagents: [citationAgent],
  
  // Add logging for each step
  onStepFinish: (step) => {
    if (step.toolCalls && step.toolCalls.length > 0) {
      step.toolCalls.forEach(tc => {
        if (tc.toolName === 'synthesize_findings') {
          console.log(`\n   ✅ SYNTHESIS TOOL CALLED`);
        } else if (tc.toolName === 'transfer_to_citationagent') {
          console.log(`\n   🔄 HANDING OFF TO CITATION AGENT...`);
          console.log(`      Reason: ${tc.args?.reason || 'N/A'}`);
          if (tc.args?.context) {
            console.log(`      Context length: ${tc.args.context.length} chars`);
          }
        } else if (tc.toolName === 'execute_research_steps') {
          console.log(`\n   ✅ PARALLEL EXECUTION COMPLETE`);
        }
      });
    }
  },
  
  // Prevent finishing until handoff is complete
  shouldFinish: (context: ResearchContext, toolResults: any[]) => {
    const hasSynthesized = context.synthesizedReport !== undefined;
    
    if (!hasSynthesized && context.subagentResults.length > 0) {
      console.log('   ⚠️  Agent trying to finish, but synthesis not complete. Forcing continuation...');
      return false;
    }
    
    const lastToolResult = toolResults[toolResults.length - 1];
    if (lastToolResult && typeof lastToolResult === 'object' && 'synthesized' in lastToolResult && lastToolResult.synthesized) {
      console.log('   ⚠️  Synthesis just completed. Must hand off to CitationAgent. Forcing continuation...');
      return false;
    }
    
    return hasSynthesized;
  },
  
  maxSteps: 50,
});

// ============================================
// RESEARCH SYSTEM (Structured Flow)
// ============================================

interface ResearchSystemConfig {
  maxSteps?: number;
  tokenBudget?: number;
  useCitations?: boolean;
}

async function runResearchSystem(
  query: string,
  config: ResearchSystemConfig = {}
): Promise<{
  finalReport: FinalReport;
  researchPlan: ResearchPlan | null;
  metadata: {
    subagentsUsed: number;
    totalTokens: number;
    totalToolCalls: number;
    duration: number;
    handoffChain?: string[];
  };
}> {
  const startTime = Date.now();
  
  // Initialize context
  const context: ResearchContext = {
    subagentResults: [],
    memory: new Map(),
    tokenBudget: {
      maxTokens: config.tokenBudget || 100000,
      usedTokens: 0,
    },
  };
  
  console.log('\n' + '='.repeat(80));
  console.log('🔬 MULTI-AGENT RESEARCH SYSTEM (Structured Output)');
  console.log('='.repeat(80));
  console.log(`Query: ${query}\n`);
  console.log('📋 Flow: Lead Researcher (Plan) → Subagents (Parallel) → Synthesis → Citation Agent\n');
  
  // Run the lead researcher - it will create plan, execute steps, synthesize, and hand off
  const result = await run(leadResearcher, query, {
    context: context as any,
    maxTurns: 50,
  });
  
  // Research plan is stored in context (created by create_research_plan tool)
  const researchPlan = context.researchPlan || null;
  
  console.log(`\n✅ Research completed`);
  console.log(`   Research Plan: ${researchPlan?.steps.length || 0} steps`);
  console.log(`   Subagents created: ${context.subagentResults.length}`);
  console.log(`   Handoff chain: ${result.metadata.handoffChain?.join(' → ') || 'None'}`);
  console.log(`   Tokens used: ${result.metadata.totalTokens}`);
  console.log(`   Tool calls: ${result.metadata.totalToolCalls}`);
  
  // Get final report from CitationAgent (if handoff happened)
  // For now, we'll need to extract it from the last step or context
  // In a real implementation, the CitationAgent's output would be in the handoff chain
  
  // Show complete structured findings
  if (context.subagentResults.length > 0) {
    console.log(`\n   🔬 STRUCTURED SUBAGENT FINDINGS:`);
    context.subagentResults.forEach((subagentResult, idx) => {
      console.log(`\n   ${'='.repeat(70)}`);
      console.log(`   ${idx + 1}. ${subagentResult.focus}`);
      console.log(`   Subagent ID: ${subagentResult.subagentId}`);
      console.log(`   Tokens: ${subagentResult.metadata.tokens}, Tool Calls: ${subagentResult.metadata.toolCalls}`);
      console.log(`   ${'-'.repeat(70)}`);
      console.log(`   Key Findings (${subagentResult.finding.keyFindings.length}):`);
      subagentResult.finding.keyFindings.forEach((finding, i) => {
        console.log(`      ${i + 1}. ${finding}`);
      });
      console.log(`   Sources (${subagentResult.finding.sources.length}):`);
      subagentResult.finding.sources.forEach((source, i) => {
        console.log(`      ${i + 1}. [${source.title}](${source.url}) - Relevance: ${source.relevance.toFixed(2)}`);
      });
      console.log(`   Summary: ${subagentResult.finding.summary}`);
      console.log(`   Confidence: ${subagentResult.finding.confidence.toFixed(2)}`);
      console.log(`   ${'='.repeat(70)}`);
    });
  }
  
  // Show synthesized report if available
  if (context.synthesizedReport) {
    console.log(`\n   📝 SYNTHESIZED REPORT (STRUCTURED):`);
    console.log('   ' + '='.repeat(70));
    console.log(`   Executive Summary: ${context.synthesizedReport.executiveSummary}`);
    console.log(`   Focus Areas: ${context.synthesizedReport.findingsByFocus.length}`);
    console.log(`   Key Insights: ${context.synthesizedReport.keyInsights.length}`);
    console.log(`   Total Sources: ${context.synthesizedReport.totalSources}`);
    console.log(`   Conclusion: ${context.synthesizedReport.conclusion}`);
    console.log('   ' + '='.repeat(70));
  }
  
  console.log();
  
  const duration = Date.now() - startTime;
  
  // For now, create a final report from synthesized report
  // In a real implementation, this would come from CitationAgent
  const finalReport: FinalReport = context.synthesizedReport ? {
    title: `Research Report: ${query}`,
    executiveSummary: context.synthesizedReport.executiveSummary,
    sections: context.synthesizedReport.findingsByFocus.map(f => ({
      heading: f.focus,
      content: f.findings.join('\n'),
      citations: f.sources.map(s => s.url),
    })),
    conclusion: context.synthesizedReport.conclusion,
    references: context.synthesizedReport.findingsByFocus.flatMap(f => 
      f.sources.map((s, i) => ({
        title: s.title,
        url: s.url,
        citationKey: `ref-${f.focus}-${i}`,
      }))
    ),
  } : {
    title: `Research Report: ${query}`,
    executiveSummary: 'Research in progress',
    sections: [],
    conclusion: 'Research not completed',
    references: [],
  };
  
  return {
    finalReport,
    researchPlan,
    metadata: {
      subagentsUsed: context.subagentResults.length,
      totalTokens: result.metadata.totalTokens || 0,
      totalToolCalls: result.metadata.totalToolCalls || 0,
      duration,
      handoffChain: result.metadata.handoffChain,
    },
  };
}

// ============================================
// EXAMPLE USAGE
// ============================================

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY not found');
    process.exit(1);
  }
  
  console.log('\n' + '━'.repeat(80));
  console.log('EXAMPLE: Structured Multi-Agent Research System');
  console.log('━'.repeat(80));
  
  const result = await runResearchSystem(
    'What are the latest developments in quantum computing error correction?',
    {
      tokenBudget: 50000,
      useCitations: true,
    }
  );
  
  console.log('\n' + '='.repeat(80));
  console.log('📄 FINAL STRUCTURED REPORT');
  console.log('='.repeat(80));
  console.log(JSON.stringify(result.finalReport, null, 2));
  console.log('='.repeat(80));
  
  console.log('\n' + '='.repeat(80));
  console.log('📋 RESEARCH PLAN (STRUCTURED)');
  console.log('='.repeat(80));
  if (result.researchPlan) {
    console.log(JSON.stringify(result.researchPlan, null, 2));
  } else {
    console.log('No research plan available');
  }
  console.log('='.repeat(80));
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 COMPLETE METADATA');
  console.log('='.repeat(80));
  console.log(`   Subagents Used: ${result.metadata.subagentsUsed}`);
  console.log(`   Total Tokens: ${result.metadata.totalTokens}`);
  console.log(`   Total Tool Calls: ${result.metadata.totalToolCalls}`);
  console.log(`   Duration: ${(result.metadata.duration / 1000).toFixed(2)}s`);
  console.log(`   Handoff Chain: ${result.metadata.handoffChain?.join(' → ') || 'None'}`);
  console.log('='.repeat(80));
  
  console.log('\n' + '━'.repeat(80));
  console.log('✅ Research System Demo Complete!');
  console.log('━'.repeat(80) + '\n');
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { runResearchSystem, createSubagent, leadResearcher, citationAgent };
export type { ResearchPlan, ResearchStep, SubagentFinding, SynthesizedReport, FinalReport };
