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
            name: '선택한 텍스트를 내부 링크로 만들기',
            editorCallback: async (editor: Editor, view: MarkdownView) => {
                const selectedText = editor.getSelection()
                if (!selectedText) {
                    new Notice('텍스트를 선택해주세요')
                    return
                }

                try {
                    const currentFile = view.file
                    if (!currentFile) {
                        new Notice('현재 파일을 찾을 수 없습니다')
                        return
                    }
                    
                    const currentFileName = currentFile.basename
                    const currentFileCache = this.app.metadataCache.getFileCache(currentFile)
                    const currentFileAlias = currentFileCache?.frontmatter?.aliases?.[0]
                    
                    const prefix = currentFileAlias || currentFileName
                    const displayAlias = `${prefix}__${selectedText}`
                    
                    const uid = this.generateUID()
                    const parentLink = await this.createParentLink(currentFile)
                    
                    const newNotePath = `${uid}.md`
                    const newNoteContent = dedent`
                    ---
                    aliases: ["${displayAlias}"]
                    ---

                    parent: ${parentLink}

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

        // 상위 문서로 이동 명령어 추가
        this.addCommand({
            id: 'go-to-parent-document',
            name: '상위 문서로 이동',
            callback: async () => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView)
                if (!view) {
                    new Notice("활성화된 마크다운 뷰가 없습니다.")
                    return
                }
                const currentFile = view.file
                if (!currentFile) {
                    new Notice("현재 파일을 찾을 수 없습니다.")
                    return
                }
                
                const fileCache = this.app.metadataCache.getFileCache(currentFile)
                let parentLink: string | undefined = fileCache?.frontmatter?.parent

                if (!parentLink) {
                    const content = await this.app.vault.read(currentFile)
                    const parentLine = content.split("\n").find(line => line.startsWith("parent:"))
                    if (parentLine) {
                        parentLink = parentLine.substring("parent:".length).trim()
                    }
                }

                if (!parentLink) {
                    new Notice("상위 문서 정보가 없습니다.")
                    return
                }

                const regex = /\[\[([^|\]]+)(?:\|[^\]]+)?\]\]/
                const match = regex.exec(parentLink)
                if (!match) {
                    new Notice("올바른 상위 문서 링크가 아닙니다.")
                    return
                }
                const parentFileName = match[1]
                
                const parentFile = this.app.vault.getMarkdownFiles().find(f => f.basename === parentFileName)
                if (!parentFile) {
                    new Notice("상위 문서를 찾을 수 없습니다.")
                    return
                }
                
                this.app.workspace.openLinkText(parentFile.basename, '', false)
            }
        })
    }

    private async createParentLink(file: TFile): Promise<string> {
        const cache = this.app.metadataCache.getFileCache(file)
        const parentAlias = cache?.frontmatter?.aliases?.[0]
        
        if (parentAlias) {
            return `[[${file.basename}|${parentAlias}]]`
        }
        
        return `[[${file.basename}]]`
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
            const oldTitle = this.getOldTitle(file)
            
            if (oldTitle && oldTitle !== newTitle) {
                const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter
                
                if (frontmatter?.aliases && frontmatter?.parent) {
                    const oldAlias = frontmatter.aliases[0]
                    const [prefix] = oldAlias.split('__')
                    const newAlias = `${prefix}__${newTitle}`
                    
                    let updatedContent = content.replace(
                        /aliases: \[".+?"\]/,
                        `aliases: ["${newAlias}"]`
                    )

                    const parentMatch = frontmatter.parent.match(/\[\[(.+?)(?:\|.+?)?\]\]/)
                    if (parentMatch) {
                        const parentFile = this.app.vault.getMarkdownFiles().find(f => f.basename === parentMatch[1])
                        if (parentFile) {
                            const parentLink = await this.createParentLink(parentFile)
                            updatedContent = updatedContent.replace(
                                /parent: \[\[.+?\]\]/g,
                                `parent: ${parentLink}`
                            )
                        }
                    }

                    await this.app.vault.modify(file, updatedContent)
                    await this.updateOriginalFileLink(file.basename, oldAlias, newTitle)
                }
            }
        }
    }

    private getOldTitle(file: TFile): string | null {
        const cache = this.app.metadataCache.getFileCache(file)
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