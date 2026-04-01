require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const pty = require('node-pty');
const os = require('os');
const { Sequelize, DataTypes } = require('sequelize');

const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const port = process.env.PORT || 3000;

// Database Connection
const sequelize = new Sequelize(
    process.env.DB_NAME || 'vgu_cursor_clone',
    process.env.DB_USER || 'root',
    process.env.DB_PASSWORD || '',
    {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        dialect: 'mysql',
        logging: false,
    }
);

// Models
const Chat = sequelize.define('Chat', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    title: { type: DataTypes.STRING, defaultValue: 'New Chat' },
});

const Message = sequelize.define('Message', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    role: { type: DataTypes.STRING, allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    thought: { type: DataTypes.TEXT },
    speed: { type: DataTypes.FLOAT },
    tool_calls: { type: DataTypes.JSON },
});

Chat.hasMany(Message, { onDelete: 'CASCADE' });
Message.belongsTo(Chat);

sequelize.sync({ alter: true })
    .then(() => console.log('Database & tables updated (alter: true)'))
    .catch(err => console.error('Error syncing database:', err));
app.use(cors());
app.use(express.json());


const WORKSPACE_DIR = path.resolve('./workspace');
if (!fs.existsSync(WORKSPACE_DIR)) fs.mkdirSync(WORKSPACE_DIR);

const tool_schemas = [
    {
        "type": "function",
        "function": {
            "name": "list_files",
            "description": "List files and directories in a given relative workspace path. Path must stay within the workspace and must not be absolute or contain '..'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative path within the workspace (e.g., '.', 'src/', 'data')."
                    }
                },
                "required": ["path"],
                "additionalProperties": false
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read the contents of a text file from the workspace. Binary files may not be supported.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative file path (e.g., 'src/index.js'). Must not be absolute or contain '..'."
                    }
                },
                "required": ["path"],
                "additionalProperties": false
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write content to a file in the workspace. Overwrites the file if it already exists.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative file path. Must not be absolute or contain '..'."
                    },
                    "content": {
                        "type": "string",
                        "description": "Full text content to write into the file."
                    }
                },
                "required": ["path", "content"],
                "additionalProperties": false
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "delete_file",
            "description": "Delete a file from the workspace. This operation is irreversible.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative file path. Must not be absolute or contain '..'."
                    }
                },
                "required": ["path"],
                "additionalProperties": false
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "execute_command",
            "description": "Execute a shell command in a sandboxed environment. Commands must be validated against an allowlist before execution.",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "Shell command to execute. Should be restricted to safe, predefined commands."
                    }
                },
                "required": ["command"],
                "additionalProperties": false
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_url",
            "description": "Fetch and return the textual content of a URL. Only HTTP and HTTPS protocols are allowed.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "Valid HTTP or HTTPS URL."
                    }
                },
                "required": ["url"],
                "additionalProperties": false
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "open_temporary_file",
            "description": "Open a temporary markdown file in a new editor tab for the user to see a walkthrough or summary. This file is NOT saved to the workspace and only exists in the UI.",
            "parameters": {
                "type": "object",
                "properties": {
                    "filename": {
                        "type": "string",
                        "description": "The name of the temporary file (e.g., 'walkthrough.md')."
                    },
                    "content": {
                        "type": "string",
                        "description": "The markdown content to display in the temporary file."
                    }
                },
                "required": ["filename", "content"],
                "additionalProperties": false
            }
        }
    }
]

const tools = {
    list_files: async ({ path: relPath = '.' }) => {
        const fullPath = path.join(WORKSPACE_DIR, relPath);
        if (!fullPath.startsWith(WORKSPACE_DIR)) throw new Error("Access denied");
        return fs.readdirSync(fullPath).map(name => {
            const stats = fs.statSync(path.join(fullPath, name));
            return { name, type: stats.isDirectory() ? 'folder' : 'file' };
        });
    },
    read_file: async ({ path: relPath }) => {
        const fullPath = path.join(WORKSPACE_DIR, relPath);
        if (!fullPath.startsWith(WORKSPACE_DIR)) throw new Error("Access denied");
        return fs.readFileSync(fullPath, 'utf8');
    },
    write_file: async ({ path: relPath, content }) => {
        const fullPath = path.join(WORKSPACE_DIR, relPath);
        if (!fullPath.startsWith(WORKSPACE_DIR)) throw new Error("Access denied");

        let originalContent = null;
        if (fs.existsSync(fullPath)) {
            originalContent = fs.readFileSync(fullPath, 'utf8');
        }

        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf8');
        return { message: "File saved successfully", originalContent };
    },
    delete_file: async ({ path: relPath }) => {
        const fullPath = path.join(WORKSPACE_DIR, relPath);
        if (!fullPath.startsWith(WORKSPACE_DIR)) throw new Error("Access denied");
        let originalContent = null;
        if (fs.existsSync(fullPath)) {
            originalContent = fs.readFileSync(fullPath, 'utf8');
            fs.unlinkSync(fullPath);
        }
        return { message: "File deleted successfully", originalContent };
    },
    execute_command: async ({ command }, onData) => {
        return new Promise((resolve) => {
            const isWin = os.platform() === 'win32';
            const shell = isWin ? 'powershell.exe' : 'bash';
            const child = spawn(shell, [isWin ? '-Command' : '-c', command], { cwd: WORKSPACE_DIR });
            let output = '';

            child.stdout.on('data', d => {
                const chunk = d.toString();
                output += chunk;
                if (onData) onData(chunk);
            });

            child.stderr.on('data', d => {
                const chunk = d.toString();
                output += chunk;
                if (onData) onData(chunk);
            });

            child.on('close', (code) => {
                resolve({ output: output || 'Command executed with no output.', code });
            });
        });
    },
    fetch_url: async ({ url }) => {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                },
                timeout: 10000
            });
            const $ = cheerio.load(response.data);
            $('script, style, nav, footer, header, noscript').remove();
            const title = $('title').text() || url;
            const text = $('body').text().replace(/\s+/g, ' ').trim();
            return { title, text: text.substring(0, 50000), url };
        } catch (err) {
            throw new Error(`Failed to fetch URL: ${err.message}`);
        }
    },
    open_temporary_file: async ({ filename, content }) => {
        return { message: `Temporary file '${filename}' opened in editor.` };
    }
};

function detectUnexecutedToolCalls(messageContent, toolCalls, reasoningContent = '') {
    const issues = [];

    // 0. Check if tool call intent is trapped in reasoning
    if (reasoningContent.includes('<tool_call>') || reasoningContent.includes('<function=')) {
        issues.push("Tool call found inside reasoning content. Tool calls MUST be placed after the reasoning block is closed (outside of `<thought>` tags).");
    }

    // 1. Check for unclosed XML tags
    if (messageContent.includes('<tool_call>') && !messageContent.includes('</tool_call>')) {
        issues.push("Missing closing </tool_call> tag.");
    }
    
    const paramStarts = (messageContent.match(/<parameter=/g) || []).length;
    const paramEnds = (messageContent.match(/<\/parameter>/g) || []).length;
    if (paramStarts > paramEnds) {
        issues.push(`Missing ${paramStarts - paramEnds} closing </parameter> tag(s).`);
    }

    // 2. Check for missing tool calls if intent is detected (heuristic)
    const xmlIntent = messageContent.includes('<tool_call>') || messageContent.includes('<function=');
    const hasToolCalls = toolCalls && toolCalls.length > 0;
    
    if (xmlIntent && !hasToolCalls) {
        issues.push("Found XML tool tags but no valid tool call was parsed. Ensure you use the exact format: <tool_call><function=name><parameter=name>value</parameter></function></tool_call>");
    }

    // 3. Check for valid JSON in standard tool calls
    if (toolCalls) {
        for (const tc of toolCalls) {
            if (tc.function && tc.function.arguments) {
                try {
                    if (typeof tc.function.arguments === 'string') {
                        JSON.parse(tc.function.arguments);
                    }
                } catch (e) {
                    issues.push(`Invalid JSON arguments in tool call '${tc.function.name}': ${e.message}. Ensure arguments are a single valid JSON object.`);
                }
            } else if (!tc.function || !tc.function.name) {
                issues.push("Empty or partial tool call detected.");
            }
        }
    }

    return issues;
}

// --- History API ---

app.get('/api/chats', async (req, res) => {
    try {
        const chats = await Chat.findAll({
            order: [['createdAt', 'DESC']],
        });
        res.json(chats);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch chats", details: err.message });
    }
});

app.post('/api/chats', async (req, res) => {
    try {
        const chat = await Chat.create({ title: req.body.title || 'New Chat' });
        res.json(chat);
    } catch (err) {
        res.status(500).json({ error: "Failed to create chat", details: err.message });
    }
});

app.get('/api/chats/:id', async (req, res) => {
    try {
        const messages = await Message.findAll({
            where: { ChatId: req.params.id },
            order: [['createdAt', 'ASC']],
        });
        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch messages", details: err.message });
    }
});

app.delete('/api/chats/:id', async (req, res) => {
    try {
        await Chat.destroy({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete chat", details: err.message });
    }
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
app.post('/api/fetch-url', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 10000
        });
        const $ = cheerio.load(response.data);
        $('script, style, nav, footer, header, noscript').remove();
        const title = $('title').text() || url;
        const text = $('body').text().replace(/\s+/g, ' ').trim();
        res.json({ title, text: text.substring(0, 50000), url });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch URL", details: err.message });
    }
});

app.post('/api/execute-tool', async (req, res) => {
    const { tool_name, tool_args } = req.body;
    if (!tool_name || !tool_args) return res.status(400).json({ error: "tool_name and tool_args are required" });

    if (tool_name === 'execute_command') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        });

        const send = (data) => {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        try {
            const result = await tools.execute_command(tool_args, (chunk) => {
                send({ type: 'output', content: chunk });
            });
            send({ type: 'result', content: result });
            res.end();
        } catch (err) {
            send({ type: 'error', content: err.message });
            res.end();
        }
        return;
    }

    try {
        const result = await tools[tool_name](tool_args);
        res.json({ result });
    } catch (err) {
        res.status(500).json({ error: "Failed to execute tool", details: err.message });
    }
});

app.post('/api/chat', async (req, res) => {
    const { messages, model = 'Qwen3.5-35B-A3B-UD-Q4_K_XL.gguf', sources = [], chatId } = req.body;

    // Save the last user message if chatId exists
    if (chatId && messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.role === 'user') {
            try {
                const userMsg = await Message.create({
                    role: lastMsg.role,
                    content: lastMsg.content,
                    ChatId: chatId
                });
                console.log('Saved user message:', userMsg.id);
                
                // If it's the first message, update chat title
                if (messages.length === 1) {
                    await Chat.update(
                        { title: lastMsg.content.substring(0, 30) + (lastMsg.content.length > 30 ? '...' : '') },
                        { where: { id: chatId } }
                    );
                    console.log('Updated chat title for:', chatId);
                }
            } catch (e) {
                console.error("Error saving user message to database:", e);
            }
        }
    }

    res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
    });

    try {
        let systemPrompt = "You are a 'vibe coding' agent. Your name is KKKM. You must output response professionally since you will be used in big tech companies. Your primary role is to help the user with their workspace. You can use tools (like `write_file`) to implement code changes when requested. If the user's request is purely conversational (e.g., 'How are you?'), answer naturally without using tools. NEVER output code blocks (```language ... ```) in your responses; use the `write_file` tool if you need to show or write code. Focus on the 'vibe' of your actions.";
        const promptPath = path.join(__dirname, 'prompt.md');
        if (fs.existsSync(promptPath)) {
            try {
                systemPrompt = fs.readFileSync(promptPath, 'utf8');
            } catch (err) {
                console.error('Error reading prompt.md:', err);
            }
        }

        if (sources && sources.length > 0) {
            const sourceText = sources.map(s => `SOURCE: ${s.url}\nTITLE: ${s.title}\nCONTENT: ${s.text}`).join('\n\n---\n\n');
            systemPrompt += `\n\nReference sources provided by the user:\n\n${sourceText}`;
        }
        let currentMessages = [{ role: "system", content: systemPrompt }, ...messages];
        let running = true;

        let turnRetryCount = 0;
        const MAX_TURN_RETRIES = 3;

        while (running) {
            let messageContent = '';
            let reasoningContent = '';
            let toolCalls = [];
            let isThoughtOpen = false;
            const sentToolStreamingMarkers = new Set();

            const localResponse = await fetch('http://localhost:8080/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: currentMessages,
                    model: model,
                    tools: tool_schemas,
                    tool_choice: 'auto',
                    stream: true,
                    stream_options: { include_usage: true },
                    chat_template_kwargs: { "enable_thinking": true },
                    stop: ["<|endoftext|>", "</s>", "<|im_end|>", "<|eot_id|>", "<|im_start|>", "\n\n\n\n\n"]
                })
            });

            if (!localResponse.ok) {
                const error = await localResponse.text();
                throw new Error(`Local LLM Error: ${error}`);
            }

            const reader = localResponse.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine || trimmedLine === 'data: [DONE]') continue;
                    if (trimmedLine.startsWith('data: ')) {
                        try {
                            const chunk = JSON.parse(trimmedLine.slice(6));
                            const delta = (chunk.choices && chunk.choices.length > 0) ? chunk.choices[0].delta : null;

                             if (delta && delta.reasoning_content) {
                                 if (!isThoughtOpen) {
                                     res.write('<thought>\n');
                                     isThoughtOpen = true;
                                 }
                                 // Sanitize literal thought tags from the model to avoid nesting
                                 const sanitizedReasoning = delta.reasoning_content.replace(/<\/?thought[^>]*>/gi, '');
                                 res.write(sanitizedReasoning);
                                 reasoningContent += sanitizedReasoning;
                             }

                            if (delta && delta.content) {
                                if (isThoughtOpen) {
                                    res.write('\n</thought>\n');
                                    isThoughtOpen = false;
                                }
                                res.write(delta.content);
                                messageContent += delta.content;

                                // XML-style status marker
                                const pathMatch = messageContent.match(/<parameter=(?:path|TargetFile)>\s*([^<\n]+)/);
                                if (pathMatch) {
                                    const fileName = pathMatch[1].trim().split(/[/\\]/).pop();
                                    const marker = `__TOOL_STREAMING__:${JSON.stringify({ name: 'write_file', path: fileName })}\n`;
                                    if (!sentToolStreamingMarkers.has(marker)) {
                                        res.write(`\n${marker}`);
                                        sentToolStreamingMarkers.add(marker);
                                    }
                                }
                            }

                            if (chunk.timings && chunk.timings.predicted_per_second) {
                                res.write(`\n__SPEED__:${JSON.stringify({ tps: chunk.timings.predicted_per_second })}\n`);
                            } else if (chunk.usage && chunk.usage.completion_tokens && chunk.usage.completion_milliseconds) {
                                const tps = (chunk.usage.completion_tokens / (chunk.usage.completion_milliseconds / 1000)).toFixed(2);
                                res.write(`\n__SPEED__:${JSON.stringify({ tps: parseFloat(tps) })}\n`);
                            }

                            if (delta && delta.tool_calls) {
                                for (const tc of delta.tool_calls) {
                                    if (tc.index === undefined) continue;
                                    if (!toolCalls[tc.index]) toolCalls[tc.index] = { id: tc.id, type: "function", function: { name: "", arguments: "" } };
                                    if (tc.id) toolCalls[tc.index].id = tc.id;
                                    if (tc.function?.name) toolCalls[tc.index].function.name += tc.function.name;
                                    if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments;

                                    const currentTool = toolCalls[tc.index];
                                    if (currentTool.function?.name === 'write_file' || currentTool.function?.name === 'delete_file') {
                                        const args = currentTool.function.arguments;
                                        const pathMatch = args.match(/"path"\s*:\s*"([^"]*)"/);
                                        if (pathMatch) {
                                            const filePath = pathMatch[1];
                                            const fileName = filePath.split(/[/\\]/).pop();
                                            const marker = `__TOOL_STREAMING__:${JSON.stringify({ name: currentTool.function.name, path: fileName })}\n`;
                                            if (!sentToolStreamingMarkers.has(marker)) {
                                                res.write(`\n${marker}`);
                                                sentToolStreamingMarkers.add(marker);
                                            }
                                        }
                                    }
                                }
                            }

                            if (chunk.timings && chunk.timings.predicted_per_second) {
                                res.write(`\n__SPEED__:${JSON.stringify({ tps: chunk.timings.predicted_per_second })}\n`);
                            } else if (chunk.usage && chunk.usage.completion_tokens && chunk.usage.completion_milliseconds) {
                                const tps = (chunk.usage.completion_tokens / (chunk.usage.completion_milliseconds / 1000)).toFixed(2);
                                res.write(`\n__SPEED__:${JSON.stringify({ tps: parseFloat(tps) })}\n`);
                            }
                        } catch (e) {
                            console.error('Error parsing chunk:', e, trimmedLine);
                        }
                    }
                }
            }

            if (isThoughtOpen) {
                res.write('\n</thought>\n');
                isThoughtOpen = false;
            }

            const finalMessage = {
                role: "assistant",
                content: reasoningContent ? `<thought>\n${reasoningContent}\n</thought>\n${messageContent}` : messageContent,
            };

            // Parse XML tool calls from content
            const xmlToolCallRegex = /<tool_call>[\s\S]*?<function=([^>]+)>([\s\S]*?)<\/tool_call>/gi;
            const paramRegex = /<parameter=([^>]+)>([\s\S]*?)<\/parameter>/gi;
            let match;
            while ((match = xmlToolCallRegex.exec(messageContent)) !== null) {
                const functionName = match[1].trim();
                const parametersRaw = match[2];
                const args = {};
                let pMatch;
                while ((pMatch = paramRegex.exec(parametersRaw)) !== null) {
                    args[pMatch[1].trim()] = pMatch[2].trim();
                }
                
                if (!finalMessage.tool_calls) finalMessage.tool_calls = [];
                // Only add if not already present (avoid duplicates if model uses both styles)
                if (!finalMessage.tool_calls.some(tc => {
                    if (tc.function.name !== functionName) return false;
                    try {
                        const tcArgs = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments;
                        return JSON.stringify(tcArgs) === JSON.stringify(args);
                    } catch (e) {
                        return tc.function.arguments === JSON.stringify(args);
                    }
                })) {
                    finalMessage.tool_calls.push({
                        id: `xml_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        type: 'function',
                        function: {
                            name: functionName,
                            arguments: JSON.stringify(args)
                        }
                    });
                }
            }

            if (toolCalls.length > 0) {
                const existingCalls = finalMessage.tool_calls || [];
                finalMessage.tool_calls = [...existingCalls, ...toolCalls.filter(tc => tc)];
                res.write(`\n__TOOL_CALLS__:${JSON.stringify(finalMessage.tool_calls)}\n`);
            } else if (finalMessage.tool_calls) {
                 res.write(`\n__TOOL_CALLS__:${JSON.stringify(finalMessage.tool_calls)}\n`);
            }

            currentMessages.push(finalMessage);

            // Guardrail: Detect unexecuted/malformed tools and retry
            const issues = detectUnexecutedToolCalls(messageContent, finalMessage.tool_calls, reasoningContent);
            if (issues.length > 0 && turnRetryCount < MAX_TURN_RETRIES) {
                turnRetryCount++;
                const feedback = `[GUARDRAIL] I detected issues with your last response's tool calls:\n${issues.map(i => `- ${i}`).join('\n')}\n\nPlease fix the format and try again. Remember to use valid JSON for arguments or the exact XML structure.`;
                console.warn(feedback);
                currentMessages.push({ role: "user", content: feedback });
                res.write(`\n__GUARDRAIL_RETRY__:${JSON.stringify({ attempt: turnRetryCount, issues })}\n`);
                continue;
            }
            
            // Reset retry count for successful turn
            turnRetryCount = 0;

            // Save assistant message to database
            if (chatId) {
                try {
                    const savedMsg = await Message.create({
                        role: finalMessage.role,
                        content: finalMessage.content,
                        thought: reasoningContent,
                        tool_calls: finalMessage.tool_calls,
                        ChatId: chatId
                    });
                    console.log('Saved assistant turn message:', savedMsg.id);
                } catch (e) {
                    console.error("Error saving assistant message to database:", e);
                }
            }

            if (finalMessage.tool_calls) {
                let stopLoop = false;
                for (const tool_call of finalMessage.tool_calls) {
                    const tool_name = tool_call.function.name;
                    const tool_args = JSON.parse(tool_call.function.arguments);

                    if (tool_name === 'execute_command') {
                        res.write(`\n<tool_approval_request name="${tool_name}" command="${encodeURIComponent(tool_args.command)}" id="${tool_call.id}" />\n`);
                        stopLoop = true;
                        continue;
                    }

                    res.write(`\n<tool_executing name="${tool_name}" />\n`);
                    // Small delay to ensure the UI has time to show the "Executing" state
                    await new Promise(resolve => setTimeout(resolve, 500));
                    try {
                        const result = await tools[tool_name](tool_args);
                        if (tool_name === 'write_file' || tool_name === 'delete_file') {
                            const markerPath = path.join('workspace', tool_args.path).replace(/\\/g, '/');
                            const info = { path: markerPath, originalContent: result.originalContent, tool: tool_name };
                            res.write(`\n__FILE_TOUCHED__:${JSON.stringify(info)}\n`);
                        }
                        res.write(`\n<tool_done name="${tool_name}" />\n`);
                        currentMessages.push({
                            role: "tool",
                            tool_call_id: tool_call.id,
                            name: tool_name,
                            content: JSON.stringify(result)
                        });

                        // Save tool result to database
                        if (chatId) {
                            try {
                                await Message.create({
                                    role: "tool",
                                    content: JSON.stringify(result),
                                    tool_call_id: tool_call.id,
                                    name: tool_name,
                                    ChatId: chatId
                                });
                            } catch (e) {
                                console.error("Error saving tool message:", e);
                            }
                        }
                    } catch (err) {
                        res.write(`\n<tool_done name="${tool_name}" error="true" />\n`);
                        const errorMsg = {
                            role: "tool",
                            tool_call_id: tool_call.id,
                            name: tool_name,
                            content: JSON.stringify({ error: err.message })
                        };
                        currentMessages.push(errorMsg);

                        // Save tool error to database
                        if (chatId) {
                            try {
                                await Message.create({
                                    role: "tool",
                                    content: errorMsg.content,
                                    tool_call_id: tool_call.id,
                                    name: tool_name,
                                    ChatId: chatId
                                });
                            } catch (e) {
                                console.error("Error saving tool error message:", e);
                            }
                        }
                    }
                }
                if (stopLoop) {
                    running = false;
                }
            } else {
                running = false;
            }
        }

        res.end();
    } catch (error) {
        console.error('Error:', error);
        res.status(500).write(`Error: ${error.message}`);
        res.end();
    }
});
wss.on('connection', (ws) => {
    console.log('Client connected');
    let shell = null;
    function startShell() {
        if (shell && shell.pid) {
            try { process.kill(-shell.pid, 'SIGKILL'); } catch (e) { }
        }
        const isWin = os.platform() === 'win32';
        let cmd, args, env;
        if (isWin) {
            cmd = 'powershell.exe';
            args = ['-NoLogo'];
            env = {
                ...process.env,
                TERM: 'xterm-256color',
                COLORTERM: 'truecolor',
                FORCE_COLOR: '1'
            };
        } else {
            cmd = 'bash';
            args = [];
            env = {
                ...process.env,
                COLUMNS: '200',
                LINES: '50',
                TERM: 'xterm-256color',
                COLORTERM: 'truecolor',
                FORCE_COLOR: '1'
            };
        }
        shell = pty.spawn(cmd, args, {
            name: 'xterm-256color',
            cols: 80,
            rows: 30,
            cwd: WORKSPACE_DIR,
            env: env,
        });

        shell.on('data', (data) => {
            ws.send(data);
        });

        shell.on('exit', () => {
            console.log('Shell exited');
        });
    }
    startShell();
    ws.on('message', (message) => {
        const msg = message.toString();
        try {
            const data = JSON.parse(msg);
            if (data.type === 'resize') {
                if (shell) shell.resize(data.cols, data.rows);
                return;
            }
        } catch (e) { }

        if (shell) {
            shell.write(msg);
        }
    });
    ws.on('close', () => {
        if (shell) shell.kill();
        console.log('Client disconnected');
    });
});
function getDirectoryTree(dirPath) {
    const stats = fs.statSync(dirPath);
    const node = {
        name: path.basename(dirPath),
        path: dirPath.replace(/\\/g, '/'),
        type: stats.isDirectory() ? 'folder' : 'file',
    };
    if (stats.isDirectory()) {
        const children = fs.readdirSync(dirPath).map(child => {
            return getDirectoryTree(path.join(dirPath, child));
        });
        node.children = children;
    }
    return node;
}
app.get('/filesystem', (req, res) => {
    if (!fs.existsSync(WORKSPACE_DIR)) fs.mkdirSync(WORKSPACE_DIR);
    const tree = getDirectoryTree('workspace');
    res.json(tree.children || []);
});
app.post('/file-content', (req, res) => {
    const { path: requestedPath } = req.body;
    if (!requestedPath) return res.status(400).json({ error: "Path is required" });
    const fullPath = path.resolve(requestedPath);
    if (!fullPath.startsWith(WORKSPACE_DIR)) return res.status(403).json({ error: "Access denied" });
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "File not found" });
    try {
        const content = fs.readFileSync(fullPath, 'utf8');
        res.json({ content });
    } catch (err) {
        res.status(500).json({ error: "Failed to read file", details: err.message });
    }
});
app.post('/save-file', (req, res) => {
    const { path: requestedPath, content } = req.body;
    if (!requestedPath) return res.status(400).json({ error: "Path is required" });
    if (content === undefined) return res.status(400).json({ error: "Content is required" });
    const fullPath = path.resolve(requestedPath);
    if (!fullPath.startsWith(WORKSPACE_DIR)) {
        return res.status(403).json({ error: "Access denied" });
    }
    try {
        fs.writeFileSync(fullPath, content, 'utf8');
        res.json({ success: true, message: "File saved successfully" });
    } catch (err) {
        res.status(500).json({ error: "Failed to save file", details: err.message });
    }
});

app.post('/delete-file', (req, res) => {
    const { path: requestedPath } = req.body;
    if (!requestedPath) return res.status(400).json({ error: "Path is required" });
    const fullPath = path.resolve(requestedPath);
    if (!fullPath.startsWith(WORKSPACE_DIR)) return res.status(403).json({ error: "Access denied" });
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "File not found" });
    try {
        fs.rmSync(fullPath, { recursive: true, force: true });
        res.json({ success: true, message: "Deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete", details: err.message });
    }
});

app.post('/rename', (req, res) => {
    const { oldPath: requestedOldPath, newPath: requestedNewPath } = req.body;
    if (!requestedOldPath || !requestedNewPath) return res.status(400).json({ error: "Old path and new path are required" });

    const oldPath = path.resolve(requestedOldPath);
    const newPath = path.resolve(requestedNewPath);

    if (!oldPath.startsWith(WORKSPACE_DIR) || !newPath.startsWith(WORKSPACE_DIR)) {
        return res.status(403).json({ error: "Access denied" });
    }

    if (!fs.existsSync(oldPath)) return res.status(404).json({ error: "Source not found" });
    if (fs.existsSync(newPath)) return res.status(400).json({ error: "Destination already exists" });

    try {
        fs.renameSync(oldPath, newPath);
        res.json({ success: true, message: "Renamed successfully" });
    } catch (err) {
        res.status(500).json({ error: "Failed to rename", details: err.message });
    }
});

app.post('/create-folder', (req, res) => {
    const { path: requestedPath } = req.body;
    if (!requestedPath) return res.status(400).json({ error: "Path is required" });
    const fullPath = path.resolve(requestedPath);
    if (!fullPath.startsWith(WORKSPACE_DIR)) return res.status(403).json({ error: "Access denied" });
    if (fs.existsSync(fullPath)) return res.status(400).json({ error: "Folder already exists" });
    try {
        fs.mkdirSync(fullPath, { recursive: true });
        res.json({ success: true, message: "Folder created successfully" });
    } catch (err) {
        res.status(500).json({ error: "Failed to create folder", details: err.message });
    }
});

server.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
});