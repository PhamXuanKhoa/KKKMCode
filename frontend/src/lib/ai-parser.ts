export interface ParsedResponse {
    thought?: string;
    content: string;
    isThinking: boolean;
}

export function parseAIResponse(text: string): ParsedResponse {
    let thought = "";
    let content = text;
    let isThinking = false;

    // Use a regular expression that handles both <thought> and <think> globally
    const completedThoughtRegex = /<(thought|think)>([\s\S]*?)<\/\1>/gi;

    // 1. Extract all completed thought blocks
    content = content.replace(completedThoughtRegex, (_match, _tag, inner) => {
        // Look for <tool_call> inside the thought
        const toolCallRegex = /<tool_call>[\s\S]*?<\/tool_call>/gi;
        let innerText = inner;
        
        // Find all tool calls inside the thought
        const toolCalls = inner.match(toolCallRegex) || [];
        
        // If we find tool calls inside the thought, we strip them from the 
        // reasoning/thought block but append them to the content.
        innerText = innerText.replace(toolCallRegex, "");

        thought += innerText.trim() + "\n\n";
        
        // Append found tool calls back to content (outside the thought)
        if (toolCalls.length > 0) {
            content += "\n" + toolCalls.join("\n");
        }
        
        return "";
    });


    // 2. Check for an unclosed thought block at the end (mostly for streaming)
    const openTagRegex = /<(thought|think)>(?!.*<\/\1>)([\s\S]*)$/i;
    const openTagMatch = content.match(openTagRegex);

    if (openTagMatch) {
        isThinking = true;
        let innerFragment = openTagMatch[2];
        
        // Also strip partial tool calls from the trailing thought
        const partialToolCallRegex = /<tool_call>[\s\S]*$/i;
        innerFragment = innerFragment.replace(partialToolCallRegex, "");
        
        thought += innerFragment.trim();
        content = content.substring(0, openTagMatch.index).trim();
    }

    // Final cleanup: remove any orphaned or redundant thought/think tags from display content
    content = content.replace(/<\/?(thought|think)>/gi, '').trim();

    return {
        thought: thought.trim() || undefined,
        content,
        isThinking
    };
}

