import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
export function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  const languageMap: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'typescript',
    'js': 'javascript',
    'jsx': 'javascript',
    'py': 'python',
    'json': 'json',
    'css': 'css',
    'html': 'html',
    'md': 'markdown',
    'txt': 'plaintext',
  }
  return languageMap[ext || ''] || 'plaintext'
}
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}
