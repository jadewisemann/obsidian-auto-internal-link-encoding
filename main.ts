import { 
    App, 
    Editor,
    MarkdownView,
    Notice,
    Plugin,
    TFile,
    EventRef
} from 'obsidian'

const dedent = (strings: TemplateStringsArray, ...values: any[]): string => {
    const fullString = strings.reduce(
      (acc, str, i) => acc + (i > 0 ? values[i - 1] : '') + str,
      ''
    )
  
    const lines = fullString.split('\n')
    if (lines[0].trim() === '') lines.shift()
    if (lines[lines.length - 1].trim() === '') lines.pop()
  
    const indentLengths = lines
      .filter(line => line.trim())
      .map(line => {
        const match = line.match(/^(\s*)/)
        return match ? match[1].length : 0
      })
    const minIndent = Math.min(...indentLengths)
  
    return lines.map(line => line.slice(minIndent)).join('\n')
}

export default class InternalLinkCreator extends Plugin {
    private fileChangeRef: EventRef

    async onload() {
        this.fileChangeRef = this.app.vault.on('modify', async (file: TFile) => {
            await this.handleFileChange(file)
        })

        this.addCommand({
            id: 'make-it-as-internal',
            name: 'Make selection as internal link',
            editorCallback: async (editor: Editor, view: MarkdownView) => {
                const selectedText = editor.getSelection()
                if (!selectedText) {
                    new Notice('텍스트를 선택해주세요')
                    return
                }

                try {
                    const currentFile = view.file
                    const currentFileName = currentFile?.basename
                    
                    const uid = this.generateUID()
                    const alias = `${currentFileName}__${selectedText}`
                    
                    const newNotePath = `${uid}.md`
                    const newNoteContent = dedent`
                    ---
                    aliases: ["${alias}"]
                    parent: [[${currentFileName}]]
                    ---

                    # ${selectedText}
                    `

                    await this.app.vault.create(newNotePath, newNoteContent)
                    editor.replaceSelection(`[[${uid}|${selectedText}]]`)
                    
                    new Notice('내부 링크가 생성되었습니다')
                } catch (error) {
                    new Notice('링크 생성 중 오류가 발생했습니다')
                    console.error(error)
                }
            }
        })
    }

    private generateUID(): string {
        const timestamp = Date.now().toString(36)
        const randomChars = Math.random().toString(36).substring(2, 7)
        return `${timestamp}-${randomChars}`
    }

    private async handleFileChange(file: TFile) {
        const content = await this.app.vault.read(file)
        
        const parts = content.split('---')
        if (parts.length < 3) return
        
        const mainContent = parts.slice(2).join('---')
        const headingMatch = mainContent.match(/^\s*# (.+)$/m)
        
        if (headingMatch) {
            const newTitle = headingMatch[1]
            const oldTitle = this.getOldTitle(mainContent)
            
            if (oldTitle && oldTitle !== newTitle) {
                const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter
                
                if (frontmatter?.aliases) {
                    const oldAlias = frontmatter.aliases[0]
                    const [prefix] = oldAlias.split('__')
                    const newAlias = `${prefix}__${newTitle}`

                    const updatedContent = content.replace(
                        /aliases: \[".+?"\]/,
                        `aliases: ["${newAlias}"]`
                    )
                    await this.app.vault.modify(file, updatedContent)

                    await this.updateOriginalFileLink(file.basename, oldAlias, newTitle)
                }
            }
        }
    }

    private getOldTitle(content: string): string | null {
        const cache = this.app.metadataCache.getFileCache(this.app.workspace.getActiveFile())
        if (cache?.headings && cache.headings.length > 0) {
            return cache.headings[0].heading
        }
        return null
    }

    private async updateOriginalFileLink(uid: string, oldAlias: string, newTitle: string) {
        const [prefix] = oldAlias.split('__')
        const files = this.app.vault.getMarkdownFiles()
        
        for (const file of files) {
            if (file.basename === prefix) {
                const content = await this.app.vault.read(file)
                const updatedContent = content.replace(
                    new RegExp(`\\[\\[${uid}\\|.+?\\]\\]`),
                    `[[${uid}|${newTitle}]]`
                )
                
                if (content !== updatedContent) {
                    await this.app.vault.modify(file, updatedContent)
                }
                break
            }
        }
    }

    onunload() {
        this.app.vault.offref(this.fileChangeRef)
    }
}