const fs = require('fs');
const path = require('path');

// Extract the function from app.js to test it
const appJsPath = path.join(__dirname, 'backend', 'app.js');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');

// Simple regex to extract the function body
const functionMatch = appJsContent.match(/function detectUnexecutedToolCalls[\s\S]*?\n}/);
if (!functionMatch) {
    console.error("Could not find detectUnexecutedToolCalls in app.js");
    process.exit(1);
}

const detectUnexecutedToolCalls = new Function('messageContent', 'toolCalls', `
    ${functionMatch[0]}
    return detectUnexecutedToolCalls(messageContent, toolCalls);
`);

const testCases = [
    {
        name: "Valid XML",
        message: "<tool_call><function=write_file><parameter=path>test.js</parameter><parameter=content>console.log(1)</parameter></function></tool_call>",
        toolCalls: [{ function: { name: 'write_file', arguments: '{"path":"test.js","content":"console.log(1)"}' } }],
        expectedIssues: 0
    },
    {
        name: "Unclosed tool_call",
        message: "<tool_call><function=write_file><parameter=path>test.js</parameter>",
        toolCalls: [],
        expectedIssues: 2 // Missing closing </tool_call> and missing parsed tool calls
    },
    {
        name: "Unclosed parameter",
        message: "<tool_call><function=write_file><parameter=path>test.js</function></tool_call>",
        toolCalls: [],
        expectedIssues: 2 // Missing closing </parameter> and missing parsed tool calls
    },
    {
        name: "Invalid JSON arguments",
        message: "Calling tool...",
        toolCalls: [{ function: { name: 'list_files', arguments: '{"path": "incomplete' } }],
        expectedIssues: 1
    },
    {
        name: "Normal text",
        message: "Hello, how can I help?",
        toolCalls: [],
        expectedIssues: 0
    }
];

let failed = false;
testCases.forEach(tc => {
    const issues = detectUnexecutedToolCalls(tc.message, tc.toolCalls);
    if (issues.length !== tc.expectedIssues) {
        console.error(`FAIL: ${tc.name}. Expected ${tc.expectedIssues} issues, got ${issues.length}:`, issues);
        failed = true;
    } else {
        console.log(`PASS: ${tc.name}`);
    }
});

if (failed) process.exit(1);
