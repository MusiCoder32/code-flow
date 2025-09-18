import * as vscode from 'vscode'
import { queryTexts } from './rag/retriever'
import { getLLMResult } from './rag/openai'

export class InlineRagProvider implements vscode.InlineCompletionItemProvider {
  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[] | null> {
    // 1. 当前行前缀（光标前）
    const lineRange = new vscode.Range(position.line, 0, position.line, position.character)
    const lineCode = document.getText(lineRange)

    // 2. 简单过滤：前缀去掉空白后长度太短就不检索
    if (lineCode.replace(/\s/g, '').length < 2) return null

    const full = document.getText()
    const filePath = document.uri.fsPath

    //         这句是“协作式取消”检查：如果 VS Code 已经取消了本次补全请求（token.isCancellationRequested 为 true），立刻停止后续逻辑并返回 null，表示“本次没有可展示的行内建议”。
    // 触发场景：用户继续输入/移动光标、出现新的补全请求、文档关闭、Provider 被重新触发等，VS Code 会对旧请求发出取消信号
    console.log(token.isCancellationRequested)
    if (token.isCancellationRequested) return null

    // 3. 向量检索（与 completionProvider 相同）
    let combined: any[] = []
    try {
      const res = await queryTexts(full, lineCode, position.line, filePath, 6)
      // const res = {}
      combined = res.combined || []
    } catch (e) {
      console.warn('[inline] vector query failed:', (e as Error).message)
      return null
    }
    if (!combined.length) return null

    // 4. 组装检索片段文本（同 completionProvider）
    const retrievedText = combined
      .map((c, i) => `---SNIPPET ${i + 1} (score=${c.score.toFixed(3)} file=${c.file})---\n${c.text}`)
      .join('\n')
    console.log(token.isCancellationRequested)
    if (token.isCancellationRequested) return null
    let startTime = new Date()
    console.log('开始推理')
    const suggestion = await getLLMResult(lineCode, filePath, retrievedText)
    console.log('推理时长' + (new Date() - startTime) / 1000 + '秒')
    console.log('推理结果：' + suggestion)
    // 7. 以“追加”方式呈现（不覆盖用户已输入）
    const item = new vscode.InlineCompletionItem(suggestion, new vscode.Range(position, position))

    return [item]
  }
}
