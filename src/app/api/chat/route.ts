import { ToolInvocation } from 'ai';
import { Resume, Job } from '@/lib/types';
import { type AIConfig } from '@/utils/ai-tools';
import { AI_ASSISTANT_SYSTEM_MESSAGE } from '@/lib/prompts';
import { LLMService } from '@/lib/llm-service';
import { createChatTools } from '@/lib/tools';
import { classifyAIError, getAIErrorUserMessage } from '@/lib/ai/reliability';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolInvocations?: ToolInvocation[];
}

interface ChatRequest {
  messages: Message[];
  resume: Resume;
  target_role: string;
  config?: AIConfig;
  job?: Job;
}

function redactDiagnostic(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return (text || 'unknown')
    .replace(/(NVIDIA_API_KEY|GROQ_API_KEY|CLOUDFLARE_API_KEY|SUPABASE_SERVICE_ROLE_KEY|authorization|cookie)\s*[:=]\s*[^,\s}]+/gi, '$1=[REDACTED]')
    .slice(0, 4000);
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    const requestBody = await req.json();
    const { messages, target_role, config, job, resume }: ChatRequest = requestBody;

    const baseSystemPrompt = config?.customPrompts?.aiAssistant 
      ?? (AI_ASSISTANT_SYSTEM_MESSAGE.content as string);
    
    // Append context-specific information to the system prompt
    const systemPrompt = `${baseSystemPrompt}

      TOOL USAGE INSTRUCTIONS:
      1. For work experience improvements:
         - Use 'suggest_work_experience_improvement' with 'index' and 'improved_experience' fields
         - Always include company, position, date, and description
      
      2. For project improvements:
         - Use 'suggest_project_improvement' with 'index' and 'improved_project' fields
         - Always include name and description
      
      3. For skill improvements:
         - Use 'suggest_skill_improvement' with 'index' and 'improved_skill' fields
         - Only use for adding new or removing existing skills
      
      4. For education improvements:
         - Use 'suggest_education_improvement' with 'index' and 'improved_education' fields
        - Always include school, degree, and date; include field only when it exists in the source data
      
      5. For viewing resume sections:
         - Use 'read_resume' with an optional 'sections' array
         - Valid sections: 'all', 'personal_info', 'work_experience', 'education', 'skills', 'projects'

      6. For explicit requests to add, remove, or change resume content:
        - ALWAYS use 'modifyWholeResume' and return the completed change, not a suggestion
        - Any request containing "add", "remove", or "change" plus resume content is explicit, including requests to add skills

      7. For multiple section updates:
        - Use 'modifyWholeResume' when changing multiple sections at once

      Never use a suggest_* tool for an explicit add, remove, or change request.

      Aim to use a maximum of 5 tools in one go, then confirm with the user if they would like you to continue.
      The target role is ${target_role}. The job is ${job ? JSON.stringify(job) : 'No job specified'}.
      Current resume summary: ${resume ? `${resume.first_name} ${resume.last_name} - ${resume.target_role}` : 'No resume data'}.
      `;

    const { result } = await LLMService.runWithFallback({
      system: systemPrompt,
      messages,
      tools: createChatTools(resume),
      maxSteps: 5,
    });

    return result.toDataStreamResponse({
      sendUsage: false,
      getErrorMessage: error => {
        console.error('[LLM][STREAM_FAIL]', {
          provider: 'stream',
          model: 'stream',
          'error name': error instanceof Error ? error.name : typeof error,
          'error message': redactDiagnostic(error instanceof Error ? error.message : 'Unknown stream failure'),
          'status code': typeof error === 'object' && error !== null && 'statusCode' in error ? error.statusCode : 'unknown',
          'response body': redactDiagnostic(typeof error === 'object' && error !== null && 'responseBody' in error ? error.responseBody : 'unknown'),
          cause: redactDiagnostic(error instanceof Error ? error.cause : 'unknown'),
          duration: Date.now() - startedAt,
        });
        const classification = classifyAIError(error);
        console.error('[LLM][STREAM_CLASSIFIED]', {
          kind: classification.kind,
          retryable: classification.retryable,
          statusCode: classification.statusCode,
        });
        return getAIErrorUserMessage(error);
      },
    });
  } catch (error) {
    console.error('[LLM][CHAT_FAIL]', {
      provider: 'request',
      model: 'request',
      'error name': error instanceof Error ? error.name : typeof error,
      'error message': redactDiagnostic(error instanceof Error ? error.message : 'Unknown AI error'),
      'status code': typeof error === 'object' && error !== null && 'statusCode' in error ? error.statusCode : 'unknown',
      'response body': redactDiagnostic(typeof error === 'object' && error !== null && 'responseBody' in error ? error.responseBody : 'unknown'),
      cause: redactDiagnostic(error instanceof Error ? error.cause : 'unknown'),
      duration: Date.now() - startedAt,
    });
    return new Response(
      JSON.stringify({ error: getAIErrorUserMessage(error) }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
