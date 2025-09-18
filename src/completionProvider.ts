import * as vscode from 'vscode'

type SnippetKind =
  | 'Text'
  | 'Method'
  | 'Function'
  | 'Constructor'
  | 'Field'
  | 'Variable'
  | 'Class'
  | 'Interface'
  | 'Module'
  | 'Property'
  | 'Unit'
  | 'Value'
  | 'Enum'
  | 'Keyword'
  | 'Snippet'
  | 'Color'
  | 'File'
  | 'Reference'
  | 'Folder'
  | 'EnumMember'
  | 'Constant'
  | 'Struct'
  | 'Event'
  | 'Operator'
  | 'TypeParameter'

interface ConfigSnippet {
  label: string
  template: string
  detail?: string
  documentation?: string
  filterText?: string
  sortText?: string
  preselect?: boolean
  commitCharacters?: string[]
  kind?: SnippetKind
  languages?: string[] // 为空表示所有语言
  // 触发条件二选一
  trigger?:
    | {
        regex?: string
        flags?: string // 默认 g
      }
    | {
        prefix: string
      }
}

function toKind(kind?: SnippetKind): vscode.CompletionItemKind {
  const k = kind ?? 'Snippet'
  return (vscode.CompletionItemKind as any)[k] ?? vscode.CompletionItemKind.Snippet
}

export class SmartCompletionProvider implements vscode.CompletionItemProvider {
  private snippets: ConfigSnippet[] = []
  private loaded = false
  private watcher?: vscode.FileSystemWatcher

  constructor() {
    this.initWatcher()
    // 尝试尽早加载（异步）
    this.reload().catch(() => {})
  }

  async provideCompletionItems(doc: vscode.TextDocument, pos: vscode.Position): Promise<vscode.CompletionItem[]> {
    await this.ensureLoaded()

    const textTillPos = doc.getText(new vscode.Range(pos.line, 0, pos.line, pos.character))
    const lang = doc.languageId

    const items: vscode.CompletionItem[] = []

    for (const s of this.snippets) {
      if (s.languages && s.languages.length && !s.languages.includes(lang)) continue

      const startCol = this.matchStartColumn(textTillPos, s)
      if (startCol === undefined) continue

      const range = new vscode.Range(pos.line, startCol, pos.line, pos.character)
      const item = new vscode.CompletionItem(s.label, toKind(s.kind))
      item.insertText = new vscode.SnippetString(s.template)
      if (s.detail) item.detail = s.detail
      if (s.documentation) item.documentation = new vscode.MarkdownString(s.documentation)
      if (s.filterText) item.filterText = s.filterText
      if (s.sortText) item.sortText = s.sortText
      if (s.preselect !== undefined) item.preselect = s.preselect
      if (s.commitCharacters) item.commitCharacters = s.commitCharacters
      item.range = range
      items.push(item)
    }

    return items
  }

  // 仅在当前行末尾命中触发（避免中途位置误触发）
  private matchStartColumn(textTillPos: string, s: ConfigSnippet): number | undefined {
    if (!s.trigger) return undefined

    // regex 触发：取最后一次匹配，且必须触达行末
    if ('regex' in s.trigger && s.trigger.regex) {
      const flags = (s.trigger.flags ?? '') + (s.trigger.flags?.includes('g') ? '' : 'g')
      let last: RegExpExecArray | null = null
      try {
        const re = new RegExp(s.trigger.regex, flags)
        for (let m = re.exec(textTillPos); m; m = re.exec(textTillPos)) last = m
      } catch {
        return undefined
      }
      if (last && last.index + last[0].length === textTillPos.length) {
        return last.index
      }
      return undefined
    }

    // prefix 触发：要求行末以该前缀或其未闭合 token 结尾
    if ('prefix' in s.trigger && s.trigger.prefix) {
      const p = s.trigger.prefix
      const idx = textTillPos.lastIndexOf(p)
      if (idx >= 0 && idx + p.length === textTillPos.length) return idx
      return undefined
    }

    return undefined
  }

  private async ensureLoaded() {
    if (!this.loaded) await this.reload()
  }

  private async reload() {
    const snippets = await this.loadFromWorkspaceFiles()
    if (snippets.length > 0) {
      this.snippets = snippets
    } else {
      // 回退到用户/工作区设置：simpleAssistant.snippets（可不在 package.json 中声明也能读取）
      const cfgSnippets = vscode.workspace.getConfiguration('simpleAssistant').get<ConfigSnippet[]>('snippets', [])
      this.snippets = Array.isArray(cfgSnippets) ? cfgSnippets : []
    }
    this.loaded = true
  }

  private async loadFromWorkspaceFiles(): Promise<ConfigSnippet[]> {
    const out: ConfigSnippet[] = []
    try {
      const uris = await vscode.workspace.findFiles('**/.simple-assistant/snippets.jsonc', '**/node_modules/**')
      for (const uri of uris) {
        try {
          const buf = await vscode.workspace.fs.readFile(uri)
          const text = Buffer.from(buf).toString('utf8')
          const json = this.parseConfigText(text)
          if (Array.isArray(json)) out.push(...json)
          else if (Array.isArray((json as any)?.snippets)) out.push(...(json as any).snippets)
        } catch {
          // 忽略单个文件解析错误
        }
      }
    } catch {
      // ignore
    }
    return out
  }

  private parseConfigText(text: string): any {
    try {
      return JSON.parse(text)
    } catch {
      const noComments = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      const noTrailingCommas = noComments.replace(/,\s*([}\]])/g, '$1')
      return JSON.parse(noTrailingCommas)
    }
  }

  private initWatcher() {
    this.watcher?.dispose()
    this.watcher = vscode.workspace.createFileSystemWatcher('**/.simple-assistant/snippets.jsonc')
    const onChange = () => this.reload().catch(() => {})
    this.watcher.onDidCreate(onChange)
    this.watcher.onDidChange(onChange)
    this.watcher.onDidDelete(onChange)

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('simpleAssistant.snippets')) this.reload().catch(() => {})
    })
  }
}
