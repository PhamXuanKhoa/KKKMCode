import { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react'
import { Folder, FolderOpen, File, FilePlus, FolderPlus, RefreshCw, Pencil, Trash2 } from 'lucide-react'
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
    ContextMenuSeparator,
} from '@/components/ui/context-menu'
import { TreeView, type TreeDataItem, type TreeRenderItemParams, TreeIcon } from '@/components/tree-view'

interface FileSystemNode {
    name: string
    path: string
    type: 'file' | 'folder'
    children?: FileSystemNode[]
}

interface FileExplorerProps {
    onFileSelect: (content: string, filePath: string, language?: string) => void
    activeFilePath?: string | null
}

export interface FileExplorerHandle {
    refresh: () => void
    handleCreateFile: () => void
    handleCreateFolder: () => void
}
import { getLanguageFromPath, normalizePath } from '@/lib/utils'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

// Transform the filesystem data to TreeDataItem format
function transformToTreeData(
    node: FileSystemNode,
    onFileSelectRef: React.MutableRefObject<FileExplorerProps['onFileSelect']>
): TreeDataItem {
    const normalizedNodePath = normalizePath(node.path)
    return {
        id: normalizedNodePath,
        name: node.name,
        icon: node.type === 'folder' ? Folder : File,
        openIcon: node.type === 'folder' ? FolderOpen : undefined,
        children: node.children ? node.children.map(child => transformToTreeData(child, onFileSelectRef)) : undefined,
        draggable: true,
        droppable: node.type === 'folder',
        onClick: node.type === 'file' ? () => {
            console.log(`Clicked file: ${node.name} (${normalizedNodePath})`)

            // Send fetch request to server with file's absolute path
            fetch('http://localhost:3000/file-content', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    path: normalizedNodePath
                })
            })
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Failed to send file click to server')
                    }
                    return response.json()
                })
                .then(data => {
                    // Update the Monaco editor with the file content
                    if (data && data.content !== undefined) {
                        const language = getLanguageFromPath(normalizedNodePath)
                        console.log('FileExplorer: About to call onFileSelectRef.current with:', {
                            filePath: normalizedNodePath,
                            contentLength: data.content.length,
                            language
                        })
                        onFileSelectRef.current(data.content, normalizedNodePath, language)
                    }
                })
                .catch(err => {
                    console.error('Error sending file click:', err)
                })
        } : undefined
    }
}

export const FileExplorer = forwardRef<FileExplorerHandle, FileExplorerProps>(
    ({ onFileSelect, activeFilePath }, ref) => {
        const onFileSelectRef = useRef(onFileSelect)
        useEffect(() => {
            onFileSelectRef.current = onFileSelect
        }, [onFileSelect])

        const [fileSystem, setFileSystem] = useState<TreeDataItem | TreeDataItem[] | null>(null)
        const [loading, setLoading] = useState(true)
        const [error, setError] = useState<string | null>(null)
        const [selectedItem, setSelectedItem] = useState<TreeDataItem | null>(null)

        // Dialog state
        const [isDialogOpen, setIsDialogOpen] = useState(false)
        const [dialogType, setDialogType] = useState<'file' | 'folder'>('file')
        const [newItemName, setNewItemName] = useState('')
        const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false)
        const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
        const [itemToAction, setItemToAction] = useState<TreeDataItem | null>(null)
        const [renameValue, setRenameValue] = useState('')

        const fetchFilesystem = () => {
            setLoading(true)
            // Fetch filesystem data from the API
            fetch('http://localhost:3000/filesystem')
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Failed to fetch filesystem data')
                    }
                    return response.json()
                })
                .then((data: FileSystemNode | FileSystemNode[]) => {
                    // Handle both array and single object responses
                    let treeData: TreeDataItem | TreeDataItem[]

                    if (Array.isArray(data)) {
                        // If API returns an array, transform each item
                        treeData = data.map(node => transformToTreeData(node, onFileSelectRef))
                    } else {
                        // If API returns a single root node, transform it
                        treeData = transformToTreeData(data, onFileSelectRef)
                    }

                    setFileSystem(treeData)
                    setLoading(false)
                })
                .catch(err => {
                    console.error('Error fetching filesystem:', err)
                    setError(err.message)
                    setLoading(false)
                })
        }

        useEffect(() => {
            fetchFilesystem()
        }, [])

        const handleCreateFile = () => {
            setDialogType('file')
            setNewItemName('')
            setIsDialogOpen(true)
        }

        const handleCreateFolder = () => {
            setDialogType('folder')
            setNewItemName('')
            setIsDialogOpen(true)
        }

        useImperativeHandle(ref, () => ({
            refresh: () => {
                fetchFilesystem()
            },
            handleCreateFile,
            handleCreateFolder
        }))

        const handleCreateConfirm = () => {
            if (!newItemName.trim()) return

            // Determine parent path
            let parentPath = 'workspace'
            if (selectedItem) {
                const isFolder = selectedItem.children !== undefined
                if (isFolder) {
                    parentPath = selectedItem.id
                } else {
                    const lastSlash = selectedItem.id.lastIndexOf('/')
                    parentPath = lastSlash !== -1 ? selectedItem.id.substring(0, lastSlash) : 'workspace'
                }
            }

            const finalPath = `${parentPath}/${newItemName}`
            const endpoint = dialogType === 'file' ? 'save-file' : 'create-folder'
            const body = dialogType === 'file'
                ? { path: finalPath, content: '' }
                : { path: finalPath }

            fetch(`http://localhost:3000/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })
                .then(res => {
                    if (!res.ok) throw new Error(`Failed to create ${dialogType}`)
                    return res.json()
                })
                .then(() => {
                    setIsDialogOpen(false)
                    if (dialogType === 'file') {
                        onFileSelectRef.current('', finalPath, getLanguageFromPath(finalPath))
                    }
                    fetchFilesystem()
                })
                .catch(err => {
                    console.error('Error creating item:', err)
                    alert(err.message)
                })
        }

        const handleRenameConfirm = () => {
            if (!renameValue.trim() || !itemToAction) return

            const lastSlash = itemToAction.id.lastIndexOf('/')
            const parentPath = lastSlash !== -1 ? itemToAction.id.substring(0, lastSlash) : 'workspace'
            const newPath = `${parentPath}/${renameValue}`

            fetch('http://localhost:3000/rename', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    oldPath: itemToAction.id,
                    newPath: newPath
                })
            })
                .then(res => {
                    if (!res.ok) throw new Error('Failed to rename')
                    return res.json()
                })
                .then(() => {
                    setIsRenameDialogOpen(false)
                    fetchFilesystem()
                })
                .catch(err => {
                    console.error('Error renaming:', err)
                    alert(err.message)
                })
        }

        const handleDeleteConfirm = () => {
            if (!itemToAction) return

            fetch('http://localhost:3000/delete-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: itemToAction.id
                })
            })
                .then(res => {
                    if (!res.ok) throw new Error('Failed to delete')
                    return res.json()
                })
                .then(() => {
                    setIsDeleteDialogOpen(false)
                    fetchFilesystem()
                })
                .catch(err => {
                    console.error('Error deleting:', err)
                    alert(err.message)
                })
        }

        const handleMove = (sourceItem: TreeDataItem, targetItem: TreeDataItem) => {
            const fileName = sourceItem.id.split('/').pop()
            let newPath = ''
            
            if (targetItem.id === '') {
                // dropped on parent div (root)
                newPath = `workspace/${fileName}`
            } else {
                newPath = `${targetItem.id}/${fileName}`
            }

            if (sourceItem.id === newPath) return

            fetch('http://localhost:3000/rename', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    oldPath: sourceItem.id,
                    newPath: newPath
                })
            })
                .then(res => {
                    if (!res.ok) throw new Error('Failed to move')
                    return res.json()
                })
                .then(() => {
                    fetchFilesystem()
                })
                .catch(err => {
                    console.error('Error moving:', err)
                    alert(err.message)
                })
        }

        const renderTreeItem = ({ item, isSelected, isOpen, isLeaf }: TreeRenderItemParams) => {
            return (
                <ContextMenu>
                    <ContextMenuTrigger asChild>
                        <div className="flex items-center w-full">
                            <TreeIcon
                                item={item}
                                isSelected={isSelected}
                                isOpen={isOpen}
                                default={isLeaf ? File : Folder}
                            />
                            <span className="text-sm truncate select-none">{item.name}</span>
                        </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-48 bg-[#1e1e1e] border-[#333] text-zinc-300">
                        <ContextMenuItem
                            onClick={(e) => {
                                e.stopPropagation()
                                setItemToAction(item)
                                setRenameValue(item.name)
                                setIsRenameDialogOpen(true)
                            }}
                            className="flex items-center gap-2 hover:bg-[#2a2d2e] focus:bg-[#2a2d2e] rounded-none cursor-pointer"
                        >
                            <Pencil className="h-4 w-4" />
                            <span>Rename...</span>
                        </ContextMenuItem>
                        <ContextMenuItem
                            onClick={(e) => {
                                e.stopPropagation()
                                setItemToAction(item)
                                setIsDeleteDialogOpen(true)
                            }}
                            className="flex items-center gap-2 text-red-500 hover:bg-[#2a2d2e] focus:bg-[#2a2d2e] rounded-none cursor-pointer"
                        >
                            <Trash2 className="h-4 w-4" />
                            <span>Delete</span>
                        </ContextMenuItem>
                    </ContextMenuContent>
                </ContextMenu>
            )
        }

        if (loading) {
            return (
                <div className="flex h-full items-center justify-center p-6">
                    <span className="text-xs text-muted-foreground">Loading...</span>
                </div>
            )
        }

        if (error) {
            return (
                <div className="flex h-full items-center justify-center p-6">
                    <span className="text-xs text-destructive">Error: {error}</span>
                </div>
            )
        }

        if (!fileSystem) {
            return (
                <div className="flex h-full items-center justify-center p-6">
                    <span className="text-xs text-muted-foreground">No data</span>
                </div>
            )
        }

        return (
            <div 
                className="h-full overflow-hidden flex flex-col pt-0"
                onClick={() => setSelectedItem(null)}
            >
                <div 
                    className="flex items-center justify-end px-2 py-1 border-b border-border bg-card/50 gap-1"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-white"
                        onClick={(e) => {
                            e.stopPropagation()
                            handleCreateFile()
                        }}
                        title="New File"
                    >
                        <FilePlus className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-white"
                        onClick={(e) => {
                            e.stopPropagation()
                            handleCreateFolder()
                        }}
                        title="New Folder"
                    >
                        <FolderPlus className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-white"
                        onClick={(e) => {
                            e.stopPropagation()
                            fetchFilesystem()
                        }}
                        title="Refresh"
                    >
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                </div>

                <ContextMenu>
                    <ContextMenuTrigger className="flex-1 flex flex-col min-h-0 overflow-auto">
                        <div onClick={(e) => e.stopPropagation()}>
                            <TreeView
                                data={fileSystem}
                                className="w-full"
                                expandAll={false}
                                initialSelectedItemId={activeFilePath ? normalizePath(activeFilePath) : undefined}
                                onSelectChange={(item) => setSelectedItem(item || null)}
                                renderItem={renderTreeItem}
                                onDocumentDrag={handleMove}
                            />
                        </div>
                        {/* Invisible spacer to catch clicks in empty area and trigger root context menu */}
                        <div className="flex-1 min-h-[50px] w-full" />
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-48 bg-[#1e1e1e] border-[#333] text-zinc-300">
                        <ContextMenuItem 
                            onClick={(e) => {
                                e.stopPropagation();
                                handleCreateFile();
                            }}
                            className="flex items-center gap-2 hover:bg-[#2a2d2e] focus:bg-[#2a2d2e] rounded-none cursor-pointer"
                        >
                            <FilePlus className="h-4 w-4" />
                            <span>New File</span>
                        </ContextMenuItem>
                        <ContextMenuItem 
                            onClick={(e) => {
                                e.stopPropagation();
                                handleCreateFolder();
                            }}
                            className="flex items-center gap-2 hover:bg-[#2a2d2e] focus:bg-[#2a2d2e] rounded-none cursor-pointer"
                        >
                            <FolderPlus className="h-4 w-4" />
                            <span>New Folder</span>
                        </ContextMenuItem>
                        <ContextMenuSeparator className="bg-[#333]" />
                        <ContextMenuItem 
                            onClick={(e) => {
                                e.stopPropagation();
                                fetchFilesystem();
                            }}
                            className="flex items-center gap-2 hover:bg-[#2a2d2e] focus:bg-[#2a2d2e] rounded-none cursor-pointer"
                        >
                            <RefreshCw className="h-4 w-4" />
                            <span>Refresh</span>
                        </ContextMenuItem>
                    </ContextMenuContent>
                </ContextMenu>

                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>Create New {dialogType === 'file' ? 'File' : 'Folder'}</DialogTitle>
                        </DialogHeader>
                        <div className="py-4">
                            <Input
                                autoFocus
                                value={newItemName}
                                onChange={(e) => setNewItemName(e.target.value)}
                                placeholder="Enter name..."
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleCreateConfirm()
                                }}
                            />
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleCreateConfirm}>Create</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>Rename {itemToAction?.children ? 'Folder' : 'File'}</DialogTitle>
                        </DialogHeader>
                        <div className="py-4">
                            <Input
                                autoFocus
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                placeholder="Enter new name..."
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleRenameConfirm()
                                }}
                            />
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsRenameDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleRenameConfirm}>Rename</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>Delete {itemToAction?.children ? 'Folder' : 'File'}</DialogTitle>
                        </DialogHeader>
                        <div className="py-4 text-sm text-muted-foreground">
                            Are you sure you want to delete <span className="font-semibold text-foreground">{itemToAction?.name}</span>?
                            {itemToAction?.children && ' This will delete all contents inside the folder.'}
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
                            <Button variant="destructive" onClick={handleDeleteConfirm}>Delete</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        )
    }
)

FileExplorer.displayName = 'FileExplorer'
