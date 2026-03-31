import { useState } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Send, Link as LinkIcon, X, Globe, Plus, Loader2, Trash2 } from "lucide-react"
import { parseAIResponse } from "@/lib/ai-parser"

import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import {
    Conversation,
    ConversationContent
} from '@/components/ai-elements/conversation'
import {
    Message,
    MessageContent,
    MessageResponse
} from '@/components/ai-elements/message'
import {
    Reasoning,
    ReasoningTrigger,
    ReasoningContent
} from '@/components/ai-elements/reasoning'
import { Loader } from "@/components/ai-elements/loader"
import { Shimmer } from "@/components/ai-elements/shimmer"

type ChatMessage = {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    thought?: string;
    speed?: number;
    tool_calls?: any[];
    tool_call_id?: string;
    name?: string;
}

type Source = {
    url: string;
    title: string;
    text: string;
}

interface AgentProps {
    onAcceptCode?: (code: string) => void;
    onFileTouched?: (path: string, originalContent?: string | null) => void;
}

export function Agent({ onAcceptCode, onFileTouched }: AgentProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState("")
    const [isStreaming, setIsStreaming] = useState(false)
    const [model, setModel] = useState("Qwen3.5-35B-A3B-UD-Q4_K_XL.gguf")
    const [sources, setSources] = useState<Source[]>([])
    const [newUrl, setNewUrl] = useState("")
    const [isAddingSource, setIsAddingSource] = useState(false)
    const [executingToolOutput, setExecutingToolOutput] = useState<Record<string, string>>({})
    const [currentStreamingTool, setCurrentStreamingTool] = useState<{ name: string, path: string } | null>(null)
    const isPendingToolApproval = messages.some(msg => {
        if (msg.role !== 'assistant') return false;
        const matches = [...msg.content.matchAll(/<tool_approval_request [^>]*id="([^"]+)"/g)];
        return matches.some(match => {
            const id = match[1];
            return !messages.some(m => m.role === 'tool' && m.tool_call_id === id);
        });
    });


    const addSource = async () => {
        if (!newUrl.trim() || isAddingSource) return;
        setIsAddingSource(true);
        try {
            const res = await fetch('http://localhost:3000/api/fetch-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: newUrl })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setSources(prev => [...prev, data]);
            setNewUrl("");
        } catch (e) {
            console.error("Error adding source:", e);
        } finally {
            setIsAddingSource(false);
        }
    }

    const removeSource = (url: string) => {
        setSources(prev => prev.filter(s => s.url !== url));
    }

    const callChat = async (history: ChatMessage[]) => {
        setIsStreaming(true);
        setCurrentStreamingTool(null);
        try {
            const response = await fetch('http://localhost:3000/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: history.map(m => ({
                        role: m.role,
                        content: m.content,
                        tool_calls: m.tool_calls,
                        tool_call_id: m.tool_call_id,
                        name: m.name
                    })),
                    model: model,
                    sources: sources
                }),
            });

            if (!response.body) throw new Error("No response body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            const startTime = Date.now();
            let accumulatedResponse = "";
            let lastProcessedIndex = 0;
            let currentAssistantMsg: ChatMessage = { role: 'assistant', content: '' };

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                accumulatedResponse += chunk;

                // Parse indicators
                const fileTouchedRegex = /__FILE_TOUCHED__:(.+)\n/g;
                const toolCallsRegex = /__TOOL_CALLS__:(.+)\n/g;
                const toolStreamingRegex = /__TOOL_STREAMING__:(.+)\n/g;
                const speedRegex = /__SPEED__:(.+)\n/g;

                // Extract file touched
                let match;
                while ((match = fileTouchedRegex.exec(accumulatedResponse)) !== null) {
                    try {
                        const info = JSON.parse(match[1]);
                        if (onFileTouched) onFileTouched(info.path.trim(), info.originalContent);
                    } catch (e) { }
                    lastProcessedIndex = Math.max(lastProcessedIndex, fileTouchedRegex.lastIndex);
                }

                const displayContent = accumulatedResponse
                    .replace(/__FILE_TOUCHED__:.*\n/g, '')
                    .replace(/__TOOL_CALLS__:.*\n/g, '')
                    .replace(/__TOOL_STREAMING__:.*\n/g, '')
                    .replace(/__SPEED__:.*\n/g, '');

                // Extract tool calls
                let tcMatch;
                while ((tcMatch = toolCallsRegex.exec(accumulatedResponse)) !== null) {
                    try {
                        const toolCalls = JSON.parse(tcMatch[1]);
                        currentAssistantMsg.tool_calls = toolCalls;
                    } catch (e) { }
                    lastProcessedIndex = Math.max(lastProcessedIndex, toolCallsRegex.lastIndex);
                }

                // Extract tool streaming
                let tsMatch;
                while ((tsMatch = toolStreamingRegex.exec(accumulatedResponse)) !== null) {
                    try {
                        const toolInfo = JSON.parse(tsMatch[1]);
                        setCurrentStreamingTool(toolInfo);
                    } catch (e) { }
                }
                
                // Extract speed
                let sMatch;
                while ((sMatch = speedRegex.exec(accumulatedResponse)) !== null) {
                    try {
                        const info = JSON.parse(sMatch[1]);
                        currentAssistantMsg.speed = info.tps;
                    } catch (e) { }
                    lastProcessedIndex = Math.max(lastProcessedIndex, speedRegex.lastIndex);
                }

                const elapsedSeconds = (Date.now() - startTime) / 1000;
                const estimatedTps = elapsedSeconds > 0 ? (displayContent.length / 4) / elapsedSeconds : 0;
                const tokensPerSec = currentAssistantMsg.speed || estimatedTps;

                setMessages(prev => {
                    const newMsgs = [...prev];
                    const lastIdx = newMsgs.length - 1;
                    if (lastIdx >= 0 && newMsgs[lastIdx].role === 'assistant') {
                        newMsgs[lastIdx] = {
                            ...newMsgs[lastIdx],
                            ...currentAssistantMsg,
                            content: displayContent,
                            speed: tokensPerSec
                        };
                    } else {
                        newMsgs.push({
                            ...currentAssistantMsg,
                            content: displayContent,
                            speed: tokensPerSec
                        });
                    }
                    return newMsgs;
                });
            }
        } catch (error) {
            console.error("Error:", error);
            setMessages(prev => [
                ...prev,
                { role: 'assistant', content: "Error: Could not connect." }
            ]);
        } finally {
            setIsStreaming(false);
            setCurrentStreamingTool(null);
        }
    };

    const sendMessage = async () => {
        if (!input.trim() || isStreaming) return;

        const userMsg: ChatMessage = { role: 'user', content: input };
        const assistantMsg: ChatMessage = { role: 'assistant', content: '' };
        const newHistory = [...messages, userMsg];
        setMessages([...newHistory, assistantMsg]);
        setIsStreaming(true);
        setInput("");
        await callChat(newHistory);
    };

    const handleApproveTool = async (call_id: string, command: string) => {
        if (isStreaming) return;

        const assistantMsg = [...messages].reverse().find((m: ChatMessage) => m.role === 'assistant' && m.tool_calls?.some((tc: any) => tc.id === call_id));
        if (!assistantMsg) return;

        const toolCall = assistantMsg.tool_calls!.find((tc: any) => tc.id === call_id);
        const args = JSON.parse(toolCall.function.arguments);
        // Use the passed command if it matches, otherwise use args.command
        const finalCommand = command || args.command;

        setIsStreaming(true);
        setExecutingToolOutput(prev => ({ ...prev, [call_id]: '' }));

        try {
            const res = await fetch('http://localhost:3000/api/execute-tool', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tool_name: 'execute_command', tool_args: { ...args, command: finalCommand } })
            });

            if (!res.body) throw new Error("No response body");
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let fullOutput = "";
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = (buffer + chunk).split('\n\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.substring(6));
                            if (data.type === 'output') {
                                fullOutput += data.content;
                                setExecutingToolOutput(prev => ({ ...prev, [call_id]: fullOutput }));
                            } else if (data.type === 'result') {
                                // fullOutput = data.content.output; // Prefer cumulative output
                            } else if (data.type === 'error') {
                                fullOutput += `\nError: ${data.content}`;
                                setExecutingToolOutput(prev => ({ ...prev, [call_id]: fullOutput }));
                            }
                        } catch (e) {
                            console.error("Error parsing SSE line:", e);
                        }
                    }
                }
            }

            const toolMsg: ChatMessage = {
                role: 'tool',
                content: fullOutput || "Command executed.",
                tool_call_id: call_id,
                name: 'execute_command'
            };

            const assistantMsg: ChatMessage = { role: 'assistant', content: '' };
            const updatedMessages = [...messages, toolMsg];
            setMessages([...updatedMessages, assistantMsg]);
            setIsStreaming(true);
            await callChat(updatedMessages);
        } catch (e) {
            console.error(e);
        } finally {
            setIsStreaming(false);
            setExecutingToolOutput(prev => {
                const next = { ...prev };
                delete next[call_id];
                return next;
            });
        }
    };

    const handleRejectTool = async (call_id: string) => {
        if (isStreaming) return;

        const toolMsg: ChatMessage = {
            role: 'tool',
            content: "Execution rejected by user.",
            tool_call_id: call_id,
            name: 'execute_command'
        };

        const assistantMsg: ChatMessage = { role: 'assistant', content: '' };
        const updatedMessages = [...messages, toolMsg];
        setMessages([...updatedMessages, assistantMsg]);
        setIsStreaming(true);
        await callChat(updatedMessages);
    };

    const handleClearChat = () => {
        setMessages([]);
        setSources([]);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <div className="flex flex-col h-full bg-card text-foreground rounded-lg overflow-hidden border">
            <div className="p-2 border-b bg-muted/30 flex justify-between items-center px-4">
                <span className="text-sm font-medium text-muted-foreground">Model</span>
                <div className="flex items-center gap-2">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="cursor-pointer h-8 w-8 text-muted-foreground hover:text-destructive transition-colors"
                                    onClick={handleClearChat}
                                    disabled={isStreaming}
                                >
                                    <Trash2 size={16} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" align="center">
                                <p>Clear Chat (Forget Context)</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                    <Select value={model} onValueChange={setModel}>
                        <SelectTrigger className="w-[180px] h-8 text-xs cursor-pointer">
                            <SelectValue placeholder="Select Model" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Qwen3.5-35B-A3B-UD-Q4_K_XL.gguf">Qwen3.5-35B-A3B-Q4</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <Conversation className="flex-1 overflow-y-auto">
                <ConversationContent className="p-4 space-y-4">
                    {messages.filter(m => m.role !== 'tool').map((msg, idx) => {
                        const { thought, content, isThinking } = parseAIResponse(msg.content);
                        const assistantMessages = messages.filter(m => m.role === 'assistant');
                        const isLastAssistantMessage = msg.role === 'assistant' && msg === assistantMessages[assistantMessages.length - 1];

                        return (
                            <Message key={idx} from={msg.role} className="gap-2">
                                <MessageContent>
                                    {msg.role === 'assistant' && msg.content === '' && isStreaming ? (
                                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                            <Loader size={14} className="text-primary" />
                                            <Shimmer duration={1.5}>
                                                {currentStreamingTool
                                                    ? `${currentStreamingTool.name === 'write_file' ? 'Editing' : 'Deleting'} ${currentStreamingTool.path}...`
                                                    : "Processing your prompt..."}
                                            </Shimmer>
                                        </div>
                                    ) : (
                                        <>
                                            {msg.role === 'assistant' && thought && (
                                                <Reasoning isStreaming={isStreaming && isThinking && isLastAssistantMessage}>
                                                    <ReasoningTrigger />
                                                    <ReasoningContent>
                                                        {thought}
                                                    </ReasoningContent>
                                                </Reasoning>
                                            )}
                                            {content && (
                                                <div className="flex flex-col gap-2 w-full">
                                                    <MessageResponse
                                                        onAcceptCode={onAcceptCode}
                                                        onApproveTool={handleApproveTool}
                                                        onRejectTool={handleRejectTool}
                                                        toolStatuses={messages.reduce((acc, m) => {
                                                            if (m.role === 'tool' && m.tool_call_id) {
                                                                acc[m.tool_call_id] = {
                                                                    status: m.content === 'Execution rejected by user.' ? 'rejected' : 'approved',
                                                                    output: m.content
                                                                };
                                                            }
                                                            return acc;
                                                        }, {} as Record<string, { status: 'approved' | 'rejected', output: string }>)}
                                                        executingToolOutput={executingToolOutput}
                                                    >
                                                        {content}
                                                    </MessageResponse>
                                                    {isStreaming && currentStreamingTool && (
                                                        <div className="flex items-center gap-2 text-muted-foreground text-sm mt-1 px-4 py-2 bg-muted/30 rounded-lg border border-border/50 animate-in fade-in slide-in-from-top-2 duration-300">
                                                            <Loader size={14} className="text-primary" />
                                                            <Shimmer duration={1.5}>
                                                                {`${currentStreamingTool.name === 'write_file' ? 'Editing' : 'Deleting'} ${currentStreamingTool.path}...`}
                                                            </Shimmer>
                                                        </div>
                                                    )}
                                                    {msg.speed !== undefined && (msg.speed > 0 || !isStreaming) && (
                                                        <div className="text-[10px] text-muted-foreground self-end px-2 py-0.5 bg-muted/50 rounded-full border border-border/50 font-mono animate-in fade-in duration-300">
                                                            {msg.speed.toFixed(1)} tokens/s
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </MessageContent>
                            </Message>
                        );
                    })}
                </ConversationContent>
            </Conversation>

            <div className="p-4 bg-card border-t space-y-3">
                {sources.length > 0 && (
                    <div className="flex flex-wrap gap-2 px-1">
                        {sources.map(source => (
                            <Badge key={source.url} variant="secondary" className="pl-1.5 pr-1 py-1 flex items-center gap-1.5 group max-w-[200px]">
                                <Globe size={12} className="text-muted-foreground shrink-0" />
                                <span className="truncate text-[10px] font-medium">{source.title}</span>
                                <button
                                    onClick={() => removeSource(source.url)}
                                    className="p-0.5 hover:bg-muted rounded-full text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <X size={10} />
                                </button>
                            </Badge>
                        ))}
                    </div>
                )}
                <div className="relative flex items-center gap-2">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-md border-dashed cursor-pointer">
                                <LinkIcon size={18} className="text-muted-foreground" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-3" side="top" align="start">
                            <div className="flex flex-col gap-0">
                                <h4 className="text-sm font-semibold">Add Reference Source</h4>
                                <p className="text-xs text-muted-foreground">Enter a URL to fetch its content for the LLM.</p>
                                <div className="flex gap-2 mt-3">
                                    <Input
                                        placeholder="https://example.com"
                                        value={newUrl}
                                        onChange={(e) => setNewUrl(e.target.value)}
                                        className="h-8 text-xs"
                                        onKeyDown={(e) => e.key === 'Enter' && addSource()}
                                    />
                                    <Button size="sm" className="h-8 px-2" onClick={addSource} disabled={isAddingSource || !newUrl}>
                                        {isAddingSource ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                                    </Button>
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                    <div className="relative flex-1">
                        <Textarea
                            className="text-sm pr-12 min-h-[40px] max-h-[200px] resize-none py-2.5"
                            placeholder={isPendingToolApproval ? "Please approve or decline the command before continuing..." : "Type your message here..."}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={isStreaming || isPendingToolApproval}
                        />
                        <button
                            onClick={sendMessage}
                            disabled={isStreaming || !input.trim() || isPendingToolApproval}
                            className="absolute right-2.5 bottom-2 p-1.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md disabled:opacity-50 transition-all font-semibold"
                        >
                            <Send size={16} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}