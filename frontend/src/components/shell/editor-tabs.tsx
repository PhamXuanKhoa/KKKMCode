import { X, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

interface OpenFile {
    path: string
    name: string
    language: string
    isDirty?: boolean
}

interface EditorTabsProps {
    openFiles: OpenFile[]
    activeFilePath: string | null
    onTabClick: (path: string) => void
    onTabClose: (path: string) => void
}

export function EditorTabs({ openFiles, activeFilePath, onTabClick, onTabClose }: EditorTabsProps) {
    if (openFiles.length === 0) return null

    return (
        <div className="flex h-9 w-full items-center bg-[#1e1e1e] border-b border-border overflow-x-auto no-scrollbar">
            {openFiles.map((file) => {
                const isActive = file.path === activeFilePath
                const fileName = file.path.split(/[\\/]/).pop() || file.name

                return (
                    <div
                        key={file.path}
                        className={cn(
                            "group flex items-center h-full min-w-[120px] max-w-[200px] px-3 gap-2 border-r border-border cursor-pointer select-none transition-colors",
                            isActive ? "bg-[#1e1e1e] border-t-2 border-t-primary" : "bg-[#2d2d2d] hover:bg-[#2a2d2e] opacity-70 hover:opacity-100"
                        )}
                        onClick={() => onTabClick(file.path)}
                        onAuxClick={(e) => {
                            if (e.button === 1) {
                                e.preventDefault()
                                e.stopPropagation()
                                onTabClose(file.path)
                            }
                        }}
                    >
                        <FileText size={14} className={cn("shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                        <span className={cn(
                            "truncate text-xs flex-1",
                            isActive ? "text-white font-medium" : "text-zinc-400"
                        )}>
                            {fileName}
                        </span>
                        <div className="flex items-center justify-center h-4 w-4 shrink-0 relative pr-0">
                            {file.isDirty && (
                                <div className="h-1.5 w-1.5 rounded-full bg-white opacity-100 group-hover:opacity-0 transition-opacity" />
                            )}
                            <button
                                className={cn(
                                    "absolute inset-0 flex items-center justify-center p-0.5 rounded-sm hover:bg-zinc-700 transition-opacity",
                                    file.isDirty ? "opacity-0 group-hover:opacity-100" : (isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100")
                                )}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onTabClose(file.path)
                                }}
                            >
                                <X size={14} className="text-zinc-400 hover:text-white" />
                            </button>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
