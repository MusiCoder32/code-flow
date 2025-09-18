import * as path from 'path'
import * as fs from 'fs'

interface TemplateInfo {
  name: string
  path: string
  type: 'builtin' | 'user'
}

let extensionRoot: string

export function initTemplateManager(context: vscode.ExtensionContext) {
  extensionRoot = context.extensionPath
}

function getBuiltinDir() {
  return path.join(extensionRoot, 'src', 'templates', 'builtin')
}
function getUserDir() {
  return path.join(extensionRoot, 'src', 'templates', 'user')
}

// 列出所有模板
export function listTemplates(): TemplateInfo[] {
  const builtinDir = getBuiltinDir()

  const userDir = getUserDir()
  const builtin = fs.existsSync(builtinDir)
    ? fs.readdirSync(builtinDir).map((name) => ({
        name,
        path: path.join(builtinDir, name),
        type: 'builtin' as const,
      }))
    : []
  const user = fs.existsSync(userDir)
    ? fs.readdirSync(userDir).map((name) => ({
        name,
        path: path.join(userDir, name),
        type: 'user' as const,
      }))
    : []
  return [...builtin, ...user]
}

// 生成项目
export async function generateProject(templateName: string, targetDir: string) {
  const templates = listTemplates()
  const tpl = templates.find((t) => t.name === templateName)
  if (!tpl) throw new Error('模板不存在')
  copyDir(tpl.path, targetDir)
}

// 简单同步拷贝目录
function copyDir(src: string, dest: string) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
  for (const file of fs.readdirSync(src)) {
    const srcFile = path.join(src, file)
    const destFile = path.join(dest, file)
    if (fs.statSync(srcFile).isDirectory()) {
      copyDir(srcFile, destFile)
    } else {
      fs.copyFileSync(srcFile, destFile)
    }
  }
}
