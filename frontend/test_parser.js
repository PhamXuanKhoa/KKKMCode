// Mocking the parseAIResponse locally for testing if import fails
// Or just paste the logic here to be sure
function parseAIResponse(text) {
    let thought = "";
    let content = text;
    let isThinking = false;
    const completedThoughtRegex = /<(thought|think)>([\s\S]*?)<\/\1>/gi;
    content = content.replace(completedThoughtRegex, (_match, _tag, inner) => {
        thought += inner.trim() + "\n\n";
        return "";
    });
    const openTagRegex = /<(thought|think)>(?!.*<\/\1>)([\s\S]*)$/i;
    const openTagMatch = content.match(openTagRegex);
    if (openTagMatch) {
        isThinking = true;
        const innerFragment = openTagMatch[2];
        thought += innerFragment.trim();
        content = content.substring(0, openTagMatch.index).trim();
    }
    return {
        thought: thought.trim() || undefined,
        content: content.trim(),
        isThinking
    };
}

const testCases = [
    {
        name: "Simple thought before content",
        input: "<thought>Checking if 1+1=2</thought> Yes, it is.",
        expected: { content: "Yes, it is.", thought: "Checking if 1+1=2", isThinking: false }
    },
    {
        name: "Multiple thought blocks",
        input: "<thought>Step 1</thought> Hello! <thought>Step 2</thought> World!",
        expected: { content: "Hello!  World!", thought: "Step 1\n\nStep 2", isThinking: false }
    },
    {
        name: "Unclosed thought (streaming)",
        input: "Hi! <thought>I am thinking",
        expected: { content: "Hi!", thought: "I am thinking", isThinking: true }
    },
    {
        name: "Mixed <think> and <thought>",
        input: "<think>deep reasoning</think> <thought>shallow reasoning</thought> Final answer.",
        expected: { content: "Final answer.", thought: "deep reasoning\n\nshallow reasoning", isThinking: false }
    }
];

testCases.forEach(tc => {
    const result = parseAIResponse(tc.input);
    console.log(`Test: ${tc.name}`);
    
    const keys = ["content", "thought", "isThinking"];
    const success = keys.every(k => JSON.stringify(result[k]) === JSON.stringify(tc.expected[k]));
    
    if (!success) {
        console.log(`  Expected: ${JSON.stringify(tc.expected)}`);
        console.log(`  Actual:   ${JSON.stringify(result)}`);
    }
    console.log(`Status: ${success ? "PASSED" : "FAILED"}`);
});
