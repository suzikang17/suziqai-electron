declare module '@anthropic-ai/claude-code' {
  interface ClaudeCodeOptions {
    prompt: string;
    systemPrompt?: string;
    options?: {
      maxTokens?: number;
      [key: string]: unknown;
    };
  }

  interface ContentBlock {
    type: string;
    text?: string;
  }

  interface ClaudeCodeResponse {
    content: ContentBlock[];
  }

  export function claudeCode(options: ClaudeCodeOptions): Promise<string | ClaudeCodeResponse>;
}
