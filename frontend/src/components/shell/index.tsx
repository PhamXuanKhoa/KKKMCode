import { useState, useRef } from 'react'
import { getLanguageFromPath, normalizePath } from '@/lib/utils'
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from "@/components/ui/resizable"
import Editor, { DiffEditor } from "@monaco-editor/react"
import { Terminal } from "@/components/terminal"
import { Agent } from "@/components/agent"
import { FileExplorer, type FileExplorerHandle } from "@/components/explorer"
import type { editor as MonacoEditor } from 'monaco-editor'
import * as monaco from "monaco-editor"
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuGroup,
    ContextMenuItem,
    ContextMenuTrigger
} from '@/components/ui/context-menu'
import { EditorTabs } from './editor-tabs'

import { FloatingActionButtons } from './floating-actions'

interface OpenFile {
    path: string
    name: string
    content: string
    language: string
    isDirty?: boolean
}

export function ResizableDemo() {
    const [openFiles, setOpenFiles] = useState<OpenFile[]>([])
    const [activeFilePath, setActiveFilePath] = useState<string | null>(null)
    const [editorContent, setEditorContent] = useState<string>('')
    const [editorLanguage, setEditorLanguage] = useState<string>('python')
    const [pendingFiles, setPendingFiles] = useState<Record<string, string | null>>({})
    const currentFilePathRef = useRef<string>('')
    const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
    const fileExplorerRef = useRef<FileExplorerHandle>(null)

    const handleFileSelect = (content: string, filePath: string, language?: string) => {
        const normalizedPath = normalizePath(filePath)
        console.log('handleFileSelect called with:', { filePath: normalizedPath, contentLength: content?.length, language })

        setOpenFiles(prev => {
            const exists = prev.find(f => f.path === normalizedPath)
            if (exists) {
                return prev.map(f =>
                    f.path === normalizedPath ? { ...f, content: content, language: language || f.language } : f
                )
            }

            const fileName = normalizedPath.split(/[\\/]/).pop() || 'Untitled'
            return [...prev, {
                path: normalizedPath,
                name: fileName,
                content: content,
                language: language || 'plaintext',
                isDirty: false
            }]
        })

        setActiveFilePath(normalizedPath)
        setEditorContent(content)
        currentFilePathRef.current = normalizedPath
        if (language) {
            setEditorLanguage(language)
        }
    }

    const handleTabClick = (path: string) => {
        if (path === activeFilePath) return

        if (activeFilePath) {
            setOpenFiles(prev => prev.map(f =>
                f.path === activeFilePath
                    ? { ...f, content: editorRef.current?.getValue() || editorContent }
                    : f
            ))
        }

        const file = openFiles.find(f => f.path === path)
        if (file) {
            setActiveFilePath(path)
            setEditorContent(file.content)
            setEditorLanguage(file.language)
            currentFilePathRef.current = path
        }
    }

    const handleTabClose = (path: string) => {
        const newOpenFiles = openFiles.filter(f => f.path !== path)
        setOpenFiles(newOpenFiles)

        if (activeFilePath === path) {
            if (newOpenFiles.length > 0) {
                const lastFile = newOpenFiles[newOpenFiles.length - 1]
                setActiveFilePath(lastFile.path)
                setEditorContent(lastFile.content)
                setEditorLanguage(lastFile.language)
                currentFilePathRef.current = lastFile.path
            } else {
                setActiveFilePath(null)
                setEditorContent('')
                currentFilePathRef.current = ''
            }
        }
    }

    const handleSaveFile = () => {
        const currentFilePath = currentFilePathRef.current
        console.log('handleSaveFile triggered. currentFilePath:', currentFilePath)
        if (!currentFilePath) {
            console.warn('No file currently open')
            return
        }

        const content = editorRef.current?.getValue()
        if (content === undefined) {
            console.warn('No content to save')
            return
        }

        fetch('http://localhost:3000/save-file', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                path: currentFilePath,
                content: content
            })
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to save file')
                }
                return response.json()
            })
            .then(data => {
                console.log('File saved successfully:', data)
                setOpenFiles(prev => prev.map(f =>
                    f.path === currentFilePath ? { ...f, content, isDirty: false } : f
                ))
            })
            .catch(err => {
                console.error('Error saving file:', err)
            })
    }

    const handleAcceptCode = (code: string) => {
        if (editorRef.current) {
            editorRef.current.setValue(code)
            setEditorContent(code)
            if (activeFilePath) {
                setOpenFiles(prev => prev.map(f =>
                    f.path === activeFilePath ? { ...f, content: code, isDirty: true } : f
                ))
            }
        }
    }

    const handleFileTouched = (filePath: string, originalContent?: string | null) => {
        const normalizedPath = normalizePath(filePath)
        console.log('handleFileTouched called for:', normalizedPath, 'original length:', originalContent?.length);

        setPendingFiles(prev => ({ ...prev, [normalizedPath]: originalContent !== undefined ? originalContent : (prev[normalizedPath] || null) }))

        // Fetch file content and open it (if not deleted)
        fetch('http://localhost:3000/file-content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: normalizedPath })
        })
            .then(res => {
                if (!res.ok) throw new Error('File might be deleted or inaccessible')
                return res.json()
            })
            .then(data => {
                if (data && data.content) {
                    const language = getLanguageFromPath(normalizedPath)
                    handleFileSelect(data.content, normalizedPath, language)
                }
            })
            .catch(err => {
                console.log('Could not fetch file content (possibly deleted):', err)
                // If it was a delete, maybe close the tab if open?
                handleTabClose(normalizedPath)
            });

        // Refresh explorer
        fileExplorerRef.current?.refresh();
    }

    const handleAcceptAll = () => {
        setPendingFiles({})
    }

    const handleRejectAll = () => {
        const paths = Object.keys(pendingFiles)
        Promise.all(paths.map(path => {
            const content = pendingFiles[path]
            console.log('Reverting path:', path, 'with content length:', content?.length)
            if (content === null) {
                // If it was a new file (originalContent is null), delete it
                return fetch('http://localhost:3000/delete-file', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path })
                }).then(() => {
                    handleTabClose(path)
                })
            }
            return fetch('http://localhost:3000/save-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path, content })
            })
        })).then(() => {
            // Update UI for the currently active file if it was reverted
            if (activeFilePath) {
                const normalizedActivePath = normalizePath(activeFilePath)
                if (pendingFiles[normalizedActivePath] !== undefined) {
                    const originalContent = pendingFiles[normalizedActivePath]
                    if (originalContent !== null) {
                        setEditorContent(originalContent)
                        setOpenFiles(prev => prev.map((f: any) =>
                            f.path === normalizedActivePath ? { ...f, content: originalContent } : f
                        ))
                    }
                }
            }
            fileExplorerRef.current?.refresh()
            setPendingFiles({})
        }).catch(err => {
            console.error('Error rejecting changes:', err)
            setPendingFiles({})
        })
    }

    return (
        <div className="h-screen w-full overflow-hidden dark bg-background text-foreground">
            <ResizablePanelGroup
                direction="horizontal"
                className="h-full border"
            >
                <ResizablePanel defaultSize={20} minSize={10}>
                    <ContextMenu>
                        <ContextMenuTrigger asChild>
                            <div className="h-full bg-card text-foreground">
                                <div className="px-4 py-2 border-b border-border">
                                    <span className="font-semibold text-white text-xs uppercase tracking-wide">Explorer</span>
                                </div>
                                <FileExplorer ref={fileExplorerRef} onFileSelect={handleFileSelect} activeFilePath={activeFilePath} />
                            </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-48">
                            <ContextMenuGroup>
                                <ContextMenuItem onClick={() => fileExplorerRef.current?.refresh()}>
                                    <span>Refresh</span>
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => fileExplorerRef.current?.handleCreateFile()}>
                                    <span>Create new file</span>
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => fileExplorerRef.current?.handleCreateFolder()}>
                                    <span>Create new folder</span>
                                </ContextMenuItem>
                            </ContextMenuGroup>
                        </ContextMenuContent>
                    </ContextMenu>
                </ResizablePanel>

                <ResizableHandle />

                <ResizablePanel defaultSize={60}>
                    <ResizablePanelGroup direction="vertical">
                        <ResizablePanel defaultSize={70}>
                            <div className="flex flex-col h-full bg-card">
                                <EditorTabs
                                    openFiles={openFiles}
                                    activeFilePath={activeFilePath}
                                    onTabClick={handleTabClick}
                                    onTabClose={handleTabClose}
                                />
                                <div className="flex-1 min-h-0 relative">
                                    {activeFilePath ? (
                                        <>
                                            {pendingFiles[normalizePath(activeFilePath)] !== undefined ? (
                                                <DiffEditor
                                                    height="100%"
                                                    language={editorLanguage}
                                                    theme="vs-dark"
                                                    original={pendingFiles[normalizePath(activeFilePath)] || ''}
                                                    modified={editorContent}
                                                    onMount={(editor: MonacoEditor.IStandaloneDiffEditor) => {
                                                        const modifiedEditor = editor.getModifiedEditor()
                                                        editorRef.current = modifiedEditor
                                                        modifiedEditor.onDidChangeModelContent(() => {
                                                            const newContent = modifiedEditor.getValue()
                                                            setEditorContent(newContent)
                                                            if (activeFilePath) {
                                                                setOpenFiles(prev => prev.map(f =>
                                                                    f.path === activeFilePath ? { ...f, isDirty: true } : f
                                                                ))
                                                            }
                                                        })
                                                        modifiedEditor.addCommand(
                                                            monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
                                                            () => {
                                                                handleSaveFile()
                                                            }
                                                        )
                                                    }}
                                                    options={{
                                                        renderSideBySide: true,
                                                        readOnly: false,
                                                        originalEditable: false,
                                                        scrollBeyondLastLine: false,
                                                        automaticLayout: true,
                                                    }}
                                                />
                                            ) : (
                                                <Editor
                                                    height="100%"
                                                    language={editorLanguage}
                                                    theme="vs-dark"
                                                    value={editorContent}
                                                    onChange={(value) => {
                                                        const newContent = value || ''
                                                        setEditorContent(newContent)
                                                        if (activeFilePath) {
                                                            setOpenFiles(prev => prev.map(f =>
                                                                f.path === activeFilePath ? { ...f, isDirty: true } : f
                                                            ))
                                                        }
                                                    }}
                                                    onMount={(editor) => {
                                                        editorRef.current = editor
                                                        editor.addCommand(
                                                            monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
                                                            () => {
                                                                handleSaveFile()
                                                            }
                                                        )
                                                    }}
                                                />
                                            )}
                                            {Object.keys(pendingFiles).length > 0 && (
                                                <div className="absolute bottom-4 right-8 z-50">
                                                    <FloatingActionButtons
                                                        onAccept={handleAcceptAll}
                                                        onReject={handleRejectAll}
                                                    />
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-muted-foreground bg-[#1e1e1e]">
                                            <div className="text-center">
                                                <p className="text-sm">No file open</p>
                                                <p className="text-xs mt-1">Select a file from the explorer to start editing</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </ResizablePanel>

                        <ResizableHandle />

                        <ResizablePanel defaultSize={15}>
                            <div className="h-full bg-[#1e1e1e] p-2">
                                <Terminal />
                            </div>
                        </ResizablePanel>
                    </ResizablePanelGroup>
                </ResizablePanel>

                <ResizableHandle />

                <ResizablePanel defaultSize={25} minSize={10}>
                    <div className="h-full bg-card">
                        <Agent onAcceptCode={handleAcceptCode} onFileTouched={handleFileTouched} />
                    </div>
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    )
}
