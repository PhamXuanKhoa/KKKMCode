"use client";

import { cn } from "@/lib/utils";
import { Play, CheckCircle2, XCircle, Terminal } from "lucide-react";
import type { ComponentProps, HTMLAttributes } from "react";
import { useEffect, useRef } from "react";

// --- NEW IMPORTS FOR THE ACCEPT BUTTON ---
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Loader } from "./loader";
import { Shimmer } from "./shimmer";


export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: 'user' | 'assistant' | 'system' | 'tool';
};

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      "group flex w-full max-w-[95%] flex-col gap-2",
      from === "user" ? "is-user ml-auto justify-end" : "is-assistant",
      className
    )}
    {...props}
  />
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageContent = ({
  children,
  className,
  ...props
}: MessageContentProps) => (
  <div
    className={cn(
      "flex min-w-0 max-w-full flex-col gap-2 overflow-hidden text-sm",
      "group-[.is-user]:w-fit group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground",
      "group-[.is-assistant]:w-full group-[.is-assistant]:text-foreground",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

// ... (Skip down to MessageResponse. Copy everything above this from your original file if needed, 
//      but make sure MessageBranch and others are still there.) 
//      For brevity, I am assuming you keep MessageActions, MessageBranch, etc. exactly as they were.

export type MessageActionsProps = ComponentProps<"div">;
export const MessageActions = ({ className, children, ...props }: MessageActionsProps) => (
  <div className={cn("flex items-center gap-1", className)} {...props}>{children}</div>
);

// ... [Keep MessageAction, MessageBranchContext, MessageBranch, etc. unchanged] ...

// ----------------------------------------------------------------------
// THE MODIFIED MESSAGE RESPONSE COMPONENT
// ----------------------------------------------------------------------

interface MessageResponseProps {
  children: string;
  className?: string;
  onAcceptCode?: (code: string) => void; // <--- The new Prop
}

interface ToolExecutingProps {
  name: string;
}

interface ToolApprovalProps {
  name: string;
  command: string;
  id: string;
  onApprove: (id: string, command: string) => void;
  onReject: (id: string) => void;
}

const ToolApproval = ({ name, command, id, onApprove, onReject }: ToolApprovalProps) => (
  <div className="flex flex-col gap-4 p-4 my-4 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 rounded-md w-full">
    {/* Header: Normal text, no eyebrow labels, no decorative orange glow */}
    <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100 font-semibold text-sm">
      <Terminal size={16} strokeWidth={2.5} />
      <span>Approve command</span>
    </div>

    {/* Code Block: Standard border, no fancy glass effects */}
    <div className="bg-zinc-50 dark:bg-zinc-900/50 p-3 rounded-sm border border-zinc-200 dark:border-zinc-800 font-mono text-[13px] leading-relaxed overflow-x-auto whitespace-pre text-zinc-700 dark:text-zinc-300">
      {command}
    </div>

    {/* Actions: Normal buttons, 8px radius, no bounciness, clear hierarchy */}
    <div className="flex gap-2">
      <button
        onClick={() => onApprove(id, command)}
        className="cursor-pointer px-4 py-2 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 rounded-md text-sm font-medium transition-colors"
      >
        Approve
      </button>
      <button
        onClick={() => onReject(id)}
        className="cursor-pointer px-4 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-400 rounded-md text-sm font-medium transition-colors"
      >
        Decline
      </button>
    </div>
  </div>
);

const ToolExecuting = ({ name }: ToolExecutingProps) => (
  <div className="flex items-center gap-2 text-muted-foreground italic text-sm my-2 animate-in fade-in slide-in-from-left-2 duration-300">
    <Loader size={14} className="text-primary" />
    <Shimmer duration={1.5} className="font-medium">
      {`Executing ${name} tool...`}
    </Shimmer>
  </div>
);

const ToolCompleted = ({ name, error }: { name: string; error?: boolean }) => (
  <div className="flex items-center gap-2 text-muted-foreground text-sm my-2 animate-in fade-in duration-300">
    {error ? (
      <XCircle className="w-4 h-4 text-destructive" />
    ) : (
      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
    )}
    <span className="font-black text-foreground/80">
      {`Executed ${name} tool`}
    </span>
  </div>
);

interface MessageResponseProps {
  children: string;
  className?: string;
  onAcceptCode?: (code: string) => void;
  onApproveTool?: (id: string, command: string) => void;
  onRejectTool?: (id: string) => void;
  toolStatuses?: Record<string, { status: 'approved' | 'rejected', output: string }>;
  executingToolOutput?: Record<string, string>;
}

const TerminalView = ({ command, output, isDone }: { command: string; output: string, isDone?: boolean }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output]);

  return (
    <div className="flex flex-col my-3 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-sm animate-in fade-in duration-300 w-full">
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <Terminal size={14} className="text-zinc-500" />
        <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 font-mono">
          Terminal — {isDone ? 'Command Complete' : 'Executing Command'}
        </span>
        {!isDone && (
          <div className="ml-auto flex gap-1">
            <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
          </div>
        )}
      </div>
      <div
        ref={scrollRef}
        className="bg-zinc-900 p-4 font-mono text-[12px] leading-relaxed overflow-x-auto whitespace-pre text-zinc-300 min-h-[100px] max-h-[400px] scroll-smooth"
      >
        <span className="text-emerald-500 mr-2">$</span>
        {command}
        {"\n"}
        {output || <span className="text-zinc-500 italic">Starting execution...</span>}
        {!isDone && <span className="inline-block w-2 h-4 bg-zinc-600 ml-1 animate-pulse align-middle" />}
      </div>
    </div>
  );
};

export const MessageResponse = ({ className, children, onAcceptCode, onApproveTool, onRejectTool, toolStatuses, executingToolOutput }: MessageResponseProps) => {
  const markdownComponents = {
    code({ node, inline, className, children: codeChildren, ...props }: any) {
      const langMatch = /language-(\w+)/.exec(className || '');
      const codeString = String(codeChildren).replace(/\n$/, '');

      if (!inline && langMatch) {
        return (
          <div className="relative border border-border rounded-lg overflow-hidden my-3 bg-zinc-950 not-prose">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
              <span className="text-xs font-mono text-muted-foreground">
                {langMatch[1]}
              </span>
              {onAcceptCode && (
                <button
                  onClick={() => onAcceptCode(codeString)}
                  className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 rounded transition-colors"
                  title="Replace editor content"
                >
                  <Play className="w-3 h-3" />
                  Accept
                </button>
              )}
            </div>
            <SyntaxHighlighter
              {...props}
              style={vscDarkPlus}
              language={langMatch[1]}
              PreTag="div"
              customStyle={{
                margin: 0,
                padding: '1rem',
                background: 'transparent',
                fontSize: '0.875rem'
              }}
            >
              {codeString}
            </SyntaxHighlighter>
          </div>
        );
      }

      return (
        <code className={cn("bg-muted px-1.5 py-0.5 rounded font-mono text-sm", className)} {...props}>
          {codeChildren}
        </code>
      );
    },
    table({ node, ...props }: any) {
      return (
        <div className="my-6 overflow-x-auto rounded-xl border border-border/50 bg-background/50 backdrop-blur-sm shadow-md ring-1 ring-border/5 animate-in fade-in slide-in-from-top-2 duration-500 not-prose">
          <table className="w-full border-collapse text-left text-[13px] leading-relaxed" {...props} />
        </div>
      );
    },
    thead({ node, ...props }: any) {
      return <thead className="bg-muted/30 text-foreground font-semibold border-b border-border/50" {...props} />;
    },
    th({ node, ...props }: any) {
      return <th className="px-5 py-3 first:pl-6 last:pr-6 whitespace-nowrap text-foreground font-medium uppercase tracking-wider text-[11px]" {...props} />;
    },
    td({ node, ...props }: any) {
      return <td className="px-5 py-3.5 border-t border-border/10 first:pl-6 last:pr-6 align-top text-muted-foreground/90" {...props} />;
    },
    tr({ node, ...props }: any) {
      return <tr className="group/row hover:bg-muted/10 transition-colors" {...props} />;
    }
  };

  // Fix tables that are collapsed into a single line (a common AI formatting issue)
  const fixedContent = children.replace(/\|\s+\|/g, '|\n|');
  const parts = fixedContent.split(/(<tool_executing name="[^"]+" \/>|<tool_done name="[^"]+"(?:\s+error="true")? \/>|<tool_approval_request name="[^"]+" command="[^"]+" id="[^"]+" \/>|<tool_call>[\s\S]*?<\/tool_call>)/);

  return (
    <div className={cn("prose prose-sm prose-invert max-w-none leading-relaxed break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}>
      {parts.map((part, index) => {
        const rawToolCallMatch = part.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
        if (rawToolCallMatch) {
          const inner = rawToolCallMatch[1];
          const funcMatch = inner.match(/<function=([^>]+)>/);
          const toolName = funcMatch ? funcMatch[1] : "unknown";
          
          return (
            <div key={index} className="flex flex-col gap-2 p-3 my-2 bg-zinc-500/5 text-zinc-500 text-sm font-medium rounded-md border border-zinc-500/10 opacity-70 italic animate-in fade-in duration-300">
              <div className="flex items-center gap-2">
                <Terminal size={14} />
                <span>Unexecuted Tool: {toolName}</span>
              </div>
              <div className="text-[11px] font-mono whitespace-pre opacity-80 overflow-x-auto">
                {inner.trim()}
              </div>
            </div>
          );
        }

        const approvalMatch = part.match(/<tool_approval_request name="([^"]+)" command="([^"]+)" id="([^"]+)" \/>/);
        if (approvalMatch) {
          const toolName = approvalMatch[1];
          const command = decodeURIComponent(approvalMatch[2]);
          const id = approvalMatch[3];
          const toolStatus = toolStatuses?.[id];
          const activeOutput = executingToolOutput?.[id];

          if (activeOutput !== undefined) {
            return (
              <TerminalView key={index} command={command} output={activeOutput} />
            );
          }

          if (toolStatus?.status === 'approved') {
            return (
              <TerminalView
                key={index}
                command={command}
                output={toolStatus.output}
                isDone={true}
              />
            );
          }

          if (toolStatus?.status === 'rejected') {
            return (
              <div key={index} className="flex items-center gap-2 p-3 my-2 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 text-sm font-medium rounded-md border border-zinc-500/20 animate-in fade-in duration-300">
                <XCircle size={16} />
                <span>Command execution declined</span>
              </div>
            );
          }

          return (
            <ToolApproval
              key={index}
              name={toolName}
              command={command}
              id={id}
              onApprove={onApproveTool || (() => { })}
              onReject={onRejectTool || (() => { })}
            />
          );
        }

        const execMatch = part.match(/<tool_executing name="([^"]+)" \/>/);
        if (execMatch) {
          const toolName = execMatch[1];
          // Check if there's a corresponding tool_done later in the string
          const isDone = parts.slice(index + 1).some(p => p.includes(`<tool_done name="${toolName}"`));
          if (isDone) return null; // Hide the "executing" part if it's done
          return <ToolExecuting key={index} name={toolName} />;
        }

        const doneMatch = part.match(/<tool_done name="([^"]+)"(?:\s+error="([^"]+)")? \/>/);
        if (doneMatch) {
          const toolName = doneMatch[1];
          const hasError = doneMatch[2] === "true";
          return <ToolCompleted key={index} name={toolName} error={hasError} />;
        }

        if (!part.trim() && index > 0 && index < parts.length - 1) return null;
        return (
          <ReactMarkdown
            key={index}
            components={markdownComponents}
            remarkPlugins={[remarkGfm]}
          >
            {part}
          </ReactMarkdown>
        );
      })}
    </div>
  );
};

MessageResponse.displayName = "MessageResponse";