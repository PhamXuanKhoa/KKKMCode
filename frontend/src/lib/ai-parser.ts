export interface ParsedResponse {
    thought?: string;
    content: string;
    isThinking: boolean;
}

export function parseAIResponse(text: string): ParsedResponse {
    const thoughtStartMatch = text.match(/<(thought|think)>/i);
    const thoughtEndMatch = text.match(/<\/(thought|think)>/i);

    if (!thoughtStartMatch) {
        return { content: text.trim(), isThinking: false };
    }

    const startTag = thoughtStartMatch[0];
    const startIndex = thoughtStartMatch.index!;
    const afterStart = text.substring(startIndex + startTag.length);

    if (thoughtEndMatch) {
        const endTag = thoughtEndMatch[0];
        const endIndex = text.indexOf(endTag);
        const thoughtPart = text.substring(startIndex + startTag.length, endIndex);
        const beforePart = text.substring(0, startIndex);
        const afterPart = text.substring(endIndex + endTag.length);

        return {
            thought: thoughtPart.trim(),
            content: (beforePart + afterPart).trim(),
            isThinking: false
        };
    } else {
        const beforePart = text.substring(0, startIndex);
        return {
            thought: afterStart.trim(),
            content: beforePart.trim(),
            isThinking: true
        };
    }
}
