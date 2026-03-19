import { useEffect, useRef } from 'react';
import { Terminal as XtermTerminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { CanvasAddon } from '@xterm/addon-canvas';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
    className?: string;
}

export function Terminal({ className }: TerminalProps) {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XtermTerminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const socketRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        if (!terminalRef.current) return;

        const term = new XtermTerminal({
            cursorBlink: true,
            cursorStyle: 'bar',
            fontSize: 14,
            fontWeight: 'normal',
            lineHeight: 1.1,
            letterSpacing: 0,
            fontFamily: '"Cascadia Code", "JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
            theme: {
                background: '#0c0c0c',
                foreground: '#cccccc',
                cursor: '#cccccc',
                cursorAccent: '#0c0c0c',
                selectionBackground: 'rgba(255, 255, 255, 0.3)',
                black: '#0c0c0c',
                red: '#c50f1f',
                green: '#13a10e',
                yellow: '#c19c00',
                blue: '#0037da',
                magenta: '#881798',
                cyan: '#3a96dd',
                white: '#cccccc',
                brightBlack: '#767676',
                brightRed: '#e74856',
                brightGreen: '#16c60c',
                brightYellow: '#f9f1a5',
                brightBlue: '#3b78ff',
                brightMagenta: '#b4009e',
                brightCyan: '#61d6d6',
                brightWhite: '#f2f2f2'
            },
            convertEol: true,
            scrollback: 5000,
            allowProposedApi: true,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.loadAddon(new WebLinksAddon());
        term.loadAddon(new Unicode11Addon());
        term.unicode.activeVersion = '11';

        try {
            term.loadAddon(new CanvasAddon());
        } catch (e) {
            console.warn('Canvas addon failed to load', e);
        }

        term.open(terminalRef.current);
        fitAddon.fit();

        term.writeln('Connecting to shell...');

        const socket = new WebSocket('ws://localhost:3000');
        socketRef.current = socket;

        const sendResize = () => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    type: 'resize',
                    cols: term.cols,
                    rows: term.rows,
                }));
            }
        };

        socket.onopen = () => {
            fitAddon.fit();
            sendResize();
        };

        socket.onmessage = (event) => {
            term.write(event.data);
        };

        term.onData((data) => {
            if (socket.readyState === WebSocket.OPEN) {

                socket.send(data);
            }
        });

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        const resizeObserver = new ResizeObserver(() => {
            fitAddon.fit();
            sendResize();
        });
        resizeObserver.observe(terminalRef.current);

        return () => {
            resizeObserver.disconnect();
            term.dispose();
            socket.close();
        };
    }, []);

    return (
        <div ref={terminalRef} className={`w-full h-full bg-[#0c0c0c] p-3 overflow-hidden ${className}`} />
    );
}