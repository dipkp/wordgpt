import MarkdownIt from 'markdown-it'

/**
 * Renders assistant replies as HTML. Raw HTML from the model is disabled, so a
 * prompt-injected tag cannot execute inside the task pane; links are opened by
 * the host and tables are wrapped so they can scroll horizontally.
 */
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: true,
})

md.renderer.rules.table_open = () => '<div class="md-table-wrap"><table>'
md.renderer.rules.table_close = () => '</table></div>'

/**
 * Adds `data-label` to every body cell (so narrow panes can stack rows as cards)
 * and tags severity cells so High/Medium/Low get colour.
 */
function decorateTables(html: string): string {
  if (typeof document === 'undefined') return html

  const template = document.createElement('template')
  template.innerHTML = html

  for (const table of template.content.querySelectorAll('table')) {
    const headers = [...table.querySelectorAll('thead th')].map(th => (th.textContent ?? '').trim())

    for (const row of table.querySelectorAll('tbody tr')) {
      ;[...row.children].forEach((cell, index) => {
        if (!(cell instanceof HTMLElement)) return

        const label = headers[index]
        if (label) cell.dataset.label = label

        const text = (cell.textContent ?? '').trim()
        if (/^(high|medium|low|critical)$/i.test(text)) {
          cell.classList.add('sev', `sev-${text.toLowerCase()}`)
        }
      })
    }
  }

  return template.innerHTML
}

export function renderMarkdown(text: string): string {
  return decorateTables(md.render(text ?? ''))
}
