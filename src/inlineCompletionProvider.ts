import * as vscode from 'vscode'
import { queryTexts } from './rag/retriever'

interface Controls {
  minPrefix: number
  pauseMs: number
  throttleMs: number
  maxLines: number
}

function loadControls(): Controls {
  const cfg = vscode.workspace.getConfiguration('code-flow.inline')
  return {
    minPrefix: cfg.get<number>('minPrefix', 3),
    pauseMs: cfg.get<number>('pauseMs', 300),
    throttleMs: cfg.get<number>('throttleMs', 800),
    maxLines: cfg.get<number>('maxLines', 12),
  }
}

function nonSymbolLength(s: string): number {
  const cleaned = s.replace(/[\s\(\)\{\}\[\];,\.]/g, '')
  return cleaned.length
}

function looksLikeComment(line: string): boolean {
  return /^\s*\/[\/\*]/.test(line) // 简单判定 // 或 /* 开头
}

let lastRunAt = 0
let lastKey = ''
let lastResult: vscode.InlineCompletionItem[] | null = null

async function sleep(ms: number, token: vscode.CancellationToken) {
  return new Promise<void>((resolve) => {
    const t = setTimeout(() => resolve(), ms)
    token.onCancellationRequested(() => clearTimeout(t))
  })
}

export class InlineRagProvider implements vscode.InlineCompletionItemProvider {
  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionList | vscode.InlineCompletionItem[] | null> {
    const { minPrefix, pauseMs, throttleMs, maxLines } = loadControls()

    // 当前行前缀
    const linePrefixRange = new vscode.Range(position.line, 0, position.line, position.character)
    const lineCode = document.getText(linePrefixRange)

    // 1. 空 / 长度不够
    if (nonSymbolLength(lineCode) < minPrefix) return null
    // 2. 注释行跳过
    if (looksLikeComment(lineCode)) return null

    // 3. Throttle：距离上次真实检索太近
    const now = Date.now()
    const key = `${document.uri.fsPath}:${position.line}:${lineCode}`
    if (now - lastRunAt < throttleMs) {
      // 若行 & 内容未变，直接复用缓存
      if (key === lastKey) return lastResult
      return null
    }

    // 4. Pause：等待用户停顿
    // 如果是手动触发 (triggerKind === Invoke) 可以跳过等待
    if (context.triggerKind !== vscode.InlineCompletionTriggerKind.Invoke) {
      await sleep(pauseMs, token)
      if (token.isCancellationRequested) return null
      // 停顿后再次获取最新前缀，若已变化则放弃
      const latest = document.getText(linePrefixRange)
      if (latest !== lineCode) return null
    }

    // 5. 生成查询文本
    const full = document.getText()
    const filePath = document.uri.fsPath

    let suggestion = 'hello wrold'
    try {
      const { combined } = await queryTexts(full, lineCode, position.line, filePath, 5)
      if (token.isCancellationRequested) return null
      if (!combined.length) return null

      // 第一条片段，截断行数
      suggestion = combined[0].text.split('\n').slice(0, maxLines).join('\n')

      // 去掉当前行重复前缀
      if (suggestion.startsWith(lineCode)) {
        suggestion = suggestion.slice(lineCode.length)
      }
      suggestion = suggestion.replace(/^\s+/, '')
      if (!suggestion) return null
    } catch {
      return null
    }

    console.log('suggestion', suggestion)

    const item = new vscode.InlineCompletionItem(suggestion, new vscode.Range(position, position))

    lastRunAt = Date.now()
    lastKey = key
    lastResult = [item]
    return lastResult
  }
}
