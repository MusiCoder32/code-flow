import * as vscode from 'vscode'
// import { runLLM } from './llm/llamaRunner';
import { queryTexts } from './rag/retriever'

export class SmartCompletionProvider implements vscode.CompletionItemProvider {
  async provideCompletionItems(doc: vscode.TextDocument, pos: vscode.Position): Promise<vscode.CompletionItem[]> {
    const full = doc.getText()
    const lineRange = new vscode.Range(pos.line, 0, pos.line, pos.character)
    const lineCode = doc.getText(lineRange)
    const filePath = doc.uri.fsPath

    const { combined } = await queryTexts(full, lineCode, pos.line, filePath, 6)

    const retrievedText = combined
      .map((c, i) => `---SNIPPET ${i + 1} (score=${c.score.toFixed(3)} file=${c.file})---\n${c.text}`)
      .join('\n')

    const prompt = [
      '[CURRENT_LINE]',
      lineCode,
      '[FILE_PATH]',
      filePath,
      '[RETRIEVED_SNIPPETS]',
      retrievedText,
      '[TASK]',
      '根据当前行与检索片段生成合理续写，只输出代码片段：',
    ].join('\n')

    const item = new vscode.CompletionItem(
      lineCode.trim() ? lineCode.trim() : 'code_suggestion',
      vscode.CompletionItemKind.Text,
    )
    item.detail = 'RAG 相关上下文'
    item.documentation = retrievedText
    // 真实补全应调用 LLM(prompt)
    return [item]
  }
}
