import { parseAIResponse } from './ai-parser';

function test() {
    const cases = [
        {
            name: "Standard lowercase",
            input: "<thought>\nI am thinking\n</thought>\nHi!",
            expected: { thought: "I am thinking", content: "Hi!", isThinking: false }
        },
        {
            name: "Uppercase thinking",
            input: "<THOUGHT>\nI am thinking\n</THOUGHT>\nHi!",
            expected: { thought: "I am thinking", content: "Hi!", isThinking: false }
        },
        {
            name: "Mixed case think",
            input: "<ThinK>\nTesting\n</Think>\nHello",
            expected: { thought: "Testing", content: "Hello", isThinking: false }
        },
        {
            name: "No content after end tag but newlines",
            input: "<thought>\nThinking\n</thought>\n\n\n",
            expected: { thought: "Thinking", content: "", isThinking: false }
        },
        {
            name: "Still thinking",
            input: "<thought>\nStarted thinking but not finished",
            expected: { thought: "Started thinking but not finished", content: "", isThinking: true }
        }
    ];

    cases.forEach(c => {
        const result = parseAIResponse(c.input);
        const matches = JSON.stringify(result) === JSON.stringify(c.expected);
        console.log(`[${matches ? 'PASS' : 'FAIL'}] ${c.name}`);
        if (!matches) {
            console.log(`  Expected: ${JSON.stringify(c.expected)}`);
            console.log(`  Got:      ${JSON.stringify(result)}`);
        }
    });
}

test();
