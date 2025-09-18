import * as vscode from 'vscode'

export function showConfigPanel(context: vscode.ExtensionContext) {
  const panel = vscode.window.createWebviewPanel(
    'simple-assistant-config',
    'simple-assistant 插件配置',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
    },
  )
  panel.webview.html = getHtml()
}

function getHtml() {
  // 这里只做简单UI，实际可用React/Vue Webview更美观
  return `
    <html>
    <body>

      <h2>模板与LLM配置</h2>
      <p>请在 settings.json 手动配置API KEY、模板目录等。</p>
      <ul>
        <li>内置模板位于插件目录 /templates/builtin/</li>
        <li>用户模板位于 /templates/user/</li>
        <li>本地LLM建议用 llama.cpp，可配置端口</li>
      </ul>
      <p>后续可支持可视化设置。</p>
    </body>
    </html>
  `
}
