import * as vscode from 'vscode'

export class SmartCompletionProvider implements vscode.CompletionItemProvider {
  async provideCompletionItems(doc: vscode.TextDocument, pos: vscode.Position): Promise<vscode.CompletionItem[]> {
    const full = doc.getText()
    const lineRange = new vscode.Range(pos.line, 0, pos.line, pos.character)
    const lineCode = doc.getText(lineRange)
    const filePath = doc.uri.fsPath

    // 1) 内置 <simple-table> 片段
    if (/<simple-[\w-]*$/.test(lineCode)) {
      const start = lineCode.lastIndexOf('<simple-')
      const replaceRange = new vscode.Range(pos.line, start, pos.line, pos.character)

      const cfg = vscode.workspace.getConfiguration('codeFlow')
      const userTpl = cfg.get<string>('snippets.simpleTable')

      const snippet = new vscode.CompletionItem('<simple-table>', vscode.CompletionItemKind.Snippet)
      snippet.insertText = new vscode.SnippetString(userTpl)
      snippet.detail = '内置片段: <simple-table>'
      snippet.documentation = new vscode.MarkdownString('插入 simple-table 组件模板（可在设置中自定义）')
      snippet.filterText = '<simple-table'
      snippet.sortText = '0000'
      snippet.preselect = true
      snippet.range = replaceRange
      snippet.commitCharacters = ['>']
      return [snippet]
    }

    const item = new vscode.CompletionItem('simple-table', vscode.CompletionItemKind.Snippet)
    return [item]
  }
}
