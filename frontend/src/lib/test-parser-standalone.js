function parseAIResponse(text) {
    const thoughtStartMatch = text.match(/<(thought|think)>/i);
    const thoughtEndMatch = text.match(/<\/(thought|think)>/i);

    if (!thoughtStartMatch) {
        return { content: text.trim(), isThinking: false };
    }

    const startTag = thoughtStartMatch[0];
    const startIndex = thoughtStartMatch.index;
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
