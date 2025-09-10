// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference itv with the alias vscode in your code below
import * as vscode from 'vscode'
import { showConfigPanel } from './configPanel'
import { listTemplates, generateProject, initTemplateManager } from './templateManager'
import { SmartCompletionProvider } from './completionProvider'

export function activate(context: vscode.ExtensionContext) {
    initTemplateManager(context)
    // 1. 一键生成项目命令
    const create = vscode.commands.registerCommand('code-flow.createProject', async () => {
        const templates = listTemplates()
        if (templates.length === 0) {
            vscode.window.showWarningMessage('暂无可用模板，请先在设置中添加模板。')
            return
        }
        const picked = await vscode.window.showQuickPick(
            templates.map((t) => t.name),
            { placeHolder: '选择一个项目模板' },
        )
        if (!picked) return

        const uri = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            openLabel: '选择生成项目的目标文件夹',
        })
        if (!uri || uri.length === 0) return

        await generateProject(picked, uri[0].fsPath)
        vscode.window.showInformationMessage('项目已生成！')
    })

    // 2. 配置界面命令
    const config = vscode.commands.registerCommand('code-flow.config', () => {
        showConfigPanel(context)
        vscode.window.showInformationMessage('config from CodeFlow111!')
    })

    const completion = vscode.languages.registerCompletionItemProvider(
        { scheme: 'file' }, // 你可以换成 'vue'、'typescript' 等，若不设置代表支持所有文件类型
        new SmartCompletionProvider(),
        '.',
        '(',
        '[',
        '{',
        '<',
        ' ',
        '\n', // 常见触发字符也可以不传，表示默认每次输入触发
    )

    console.log('Congratulations, your extension "code-flow" is now active!')

    context.subscriptions.push(create)
    context.subscriptions.push(config)
    context.subscriptions.push(completion)
}

// This method is called when your extension is deactivated
export function deactivate() {}
