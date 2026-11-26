import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendDir = path.resolve(__dirname, '..')
const repoDir = path.resolve(frontendDir, '..')
const electronBin = path.join(
  frontendDir,
  'node_modules',
  'electron',
  'dist',
  process.platform === 'win32' ? 'electron.exe' : 'electron',
)
const screenshotDir = process.env.COMPILECRAFT_SCREENSHOT_DIR || ''

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl)
    this.nextId = 1
    this.pending = new Map()
    this.consoleErrors = []
    this.pageErrors = []
  }

  async connect() {
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('CDP open timeout')), 10000)
      this.ws.addEventListener('open', () => { clearTimeout(t); resolve() })
      this.ws.addEventListener('error', (err) => { clearTimeout(t); reject(err) })
    })
    this.ws.addEventListener('message', (msg) => {
      const data = JSON.parse(String(msg.data))
      if (typeof data.id === 'number') {
        const entry = this.pending.get(data.id)
        if (entry) {
          this.pending.delete(data.id)
          if (data.error) entry.reject(new Error(`${entry.method}: ${data.error.message}`))
          else entry.resolve(data.result)
        }
        return
      }
      if (data.method === 'Runtime.consoleAPICalled' && data.params?.type === 'error') {
        this.consoleErrors.push((data.params.args || []).map((a) => a.value ?? a.description ?? '').join(' '))
      } else if (data.method === 'Runtime.exceptionThrown') {
        this.pageErrors.push(data.params?.exceptionDetails?.text || 'exception')
      }
    })
    await this.send('Runtime.enable')
    await this.send('Page.enable')
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`Timeout: ${method}`)) }, 10000)
      this.pending.set(id, {
        method,
        resolve: (r) => { clearTimeout(t); resolve(r) },
        reject: (e) => { clearTimeout(t); reject(e) },
      })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async evalJs(expr) {
    const res = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.text)
    return res.result?.value
  }

  async waitFor(expr, timeoutMs = 8000, desc = 'condition') {
    const end = Date.now() + timeoutMs
    while (Date.now() < end) {
      const v = await this.evalJs(expr)
      if (v) return v
      await delay(50)
    }
    throw new Error(`Timed out waiting for ${desc}`)
  }

  async sendKey(key, code, keyCode, text = undefined) {
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
      ...(text ? { text, unmodifiedText: text } : {}),
    })
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
    })
  }

  async maybeScreenshot(filename) {
    if (!screenshotDir) return
    const res = await this.send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(path.join(screenshotDir, filename), Buffer.from(res.data, 'base64'))
  }

  close() {
    try { this.ws.close() } catch {}
  }
}

async function launchElectron() {
  const env = {
    ...process.env,
    COMPILECRAFT_CLI_PATH: path.join(repoDir, 'bin', process.platform === 'win32' ? 'compilecraft.exe' : 'compilecraft'),
  }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(electronBin, [frontendDir, '--remote-debugging-port=0', '--no-sandbox'], {
    cwd: repoDir, shell: false, windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let port = null
  let err = ''
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Boot timeout: ${err}`)), 15000)
    child.stderr.on('data', (c) => {
      err += c.toString('utf8')
      const m = err.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//)
      if (m && !port) { port = Number(m[1]); clearTimeout(t); resolve() }
    })
  })
  let target = null
  for (let i = 0; i < 50; i++) {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    target = list.find((x) => x.type === 'page' && x.webSocketDebuggerUrl)
    if (target) break
    await delay(100)
  }
  const cdp = new CdpClient(target.webSocketDebuggerUrl)
  await cdp.connect()
  return { child, cdp }
}

async function startInlineRename(cdp, fileId) {
  await cdp.evalJs(`document.querySelector('[data-testid="rename-file-btn-${fileId}"]').click()`)
  await cdp.waitFor(`Boolean(document.querySelector('[data-testid="rename-file-input"]'))`, 5000, 'rename input')
}

async function setRenameDraft(cdp, stem) {
  await cdp.evalJs(`(() => {
    const el = document.querySelector('[data-testid="rename-file-input"]');
    el.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(stem)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
  await delay(30)
}

async function runTests() {
  const { child, cdp } = await launchElectron()
  const results = []
  const runCase = async (name, fn) => {
    try {
      await fn()
      results.push({ name, ok: true })
      console.log(`  [PASS] ${name}`)
    } catch (err) {
      results.push({ name, ok: false })
      console.error(`  [FAIL] ${name}: ${err?.message || err}`)
    }
  }

  try {
    await cdp.waitFor(
      `Boolean(document.querySelector('[data-testid="explorer-file-demo-c"]') && document.querySelector('.monaco-editor [role="textbox"], .monaco-editor textarea'))`,
      15000,
      'IDE boot',
    )

    await runCase('preserve_extension_during_inline_edit', async () => {
      await startInlineRename(cdp, 'demo-c')
      const ext = await cdp.evalJs(`document.querySelector('[data-testid="rename-file-ext"]')?.textContent`)
      if (ext !== '.c') throw new Error(`Expected .c extension badge, got ${ext}`)
    })

    await runCase('cancel_rename_with_escape', async () => {
      await setRenameDraft(cdp, 'temporary_name')
      await cdp.sendKey('Escape', 'Escape', 27)
      await cdp.waitFor(`!document.querySelector('[data-testid="rename-file-input"]')`, 5000, 'rename closed')
      const name = await cdp.evalJs(`document.querySelector('[data-testid="explorer-file-demo-c"]')?.textContent?.trim()`)
      if (name !== 'control_flow.c') throw new Error(`Expected control_flow.c, got ${name}`)
    })

    await runCase('reject_empty_filename', async () => {
      await startInlineRename(cdp, 'demo-c')
      await setRenameDraft(cdp, '   ')
      await cdp.sendKey('Enter', 'Enter', 13, '\r')
      const err = await cdp.waitFor(`document.querySelector('[data-testid="rename-error-message"]')?.textContent`, 5000, 'empty error')
      if (!err.includes('empty')) throw new Error(`Unexpected error: ${err}`)
    })

    await runCase('reject_invalid_windows_characters', async () => {
      await setRenameDraft(cdp, 'bad<name')
      await cdp.sendKey('Enter', 'Enter', 13, '\r')
      const err = await cdp.waitFor(`document.querySelector('[data-testid="rename-error-message"]')?.textContent`, 5000, 'invalid chars error')
      if (!err.includes('< >')) throw new Error(`Unexpected error: ${err}`)
    })

    await runCase('reject_reserved_windows_filenames', async () => {
      await setRenameDraft(cdp, 'CON')
      await cdp.sendKey('Enter', 'Enter', 13, '\r')
      const err = await cdp.waitFor(`document.querySelector('[data-testid="rename-error-message"]')?.textContent`, 5000, 'reserved error')
      if (!err.includes('Reserved')) throw new Error(`Unexpected error: ${err}`)
    })

    await runCase('reject_trailing_space_or_period', async () => {
      await setRenameDraft(cdp, 'program.')
      await cdp.sendKey('Enter', 'Enter', 13, '\r')
      const err = await cdp.waitFor(`document.querySelector('[data-testid="rename-error-message"]')?.textContent`, 5000, 'trailing period error')
      if (!err.includes('period')) throw new Error(`Unexpected error: ${err}`)
    })

    await runCase('reject_duplicate_filename_case_insensitive', async () => {
      await setRenameDraft(cdp, 'UNDECLARED_VAR')
      await cdp.sendKey('Enter', 'Enter', 13, '\r')
      const err = await cdp.waitFor(`document.querySelector('[data-testid="rename-error-message"]')?.textContent`, 5000, 'duplicate error')
      if (!err.includes('already exists')) throw new Error(`Unexpected error: ${err}`)
      await cdp.maybeScreenshot('m17_rename_01_validation.png')
      await cdp.sendKey('Escape', 'Escape', 27)
    })

    await runCase('rename_c_file_preserves_unsaved_edits_and_runs', async () => {
      // Edit active C editor content so file is dirty
      await cdp.evalJs(`document.querySelector('.monaco-editor [role="textbox"], .monaco-editor textarea').focus()`)
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 })
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 })
      const cCode = `#include <stdio.h>\nint main() { printf("Renamed C OK\\n"); return 0; }`
      await cdp.evalJs(`(() => {
        const ta = document.querySelector('.monaco-editor [role="textbox"], .monaco-editor textarea');
        const dt = new DataTransfer();
        dt.setData('text/plain', ${JSON.stringify(cCode)});
        ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      })()`)
      await delay(60)

      await startInlineRename(cdp, 'demo-c')
      await setRenameDraft(cdp, 'program')
      await cdp.sendKey('Enter', 'Enter', 13, '\r')
      await cdp.waitFor(
        `document.querySelector('[data-testid="explorer-file-demo-c"]')?.textContent?.trim() === 'program.c'`,
        5000,
        'C file renamed to program.c',
      )

      const state = await cdp.evalJs(`(() => ({
        hasRenamedTab: Boolean(document.querySelector('button[aria-label="Close program.c"]')),
        dirtyCount: document.querySelectorAll('[aria-label="Unsaved changes"]').length,
        lang: document.getElementById('language-selector')?.value,
      }))()`)
      if (!state.hasRenamedTab || state.dirtyCount < 1 || state.lang !== 'c') {
        throw new Error(`State lost on rename: ${JSON.stringify(state)}`)
      }

      await cdp.evalJs(`document.querySelector('button[aria-label="Run compiler"]').click()`)
      await cdp.waitFor(
        `document.querySelector('[data-testid="console-execution-status"]')?.textContent?.includes('Completed (C)')`,
        8000,
        'Renamed C file executed cleanly',
      )
      const out = await cdp.evalJs(`document.querySelector('[data-testid="program-output-stdout"]')?.textContent || ''`)
      if (!out.includes('Renamed C OK')) throw new Error(`Unexpected C output: ${out}`)
      await cdp.maybeScreenshot('m17_rename_02_compiled.png')
    })

    await runCase('rename_cpp_and_java_files_and_compile', async () => {
      await cdp.evalJs(`document.querySelector('[data-testid="explorer-file-demo-cpp"]').click()`)
      await startInlineRename(cdp, 'demo-cpp')
      await setRenameDraft(cdp, 'example')
      await cdp.sendKey('Enter', 'Enter', 13, '\r')
      await cdp.waitFor(
        `document.querySelector('[data-testid="explorer-file-demo-cpp"]')?.textContent?.trim() === 'example.cpp'`,
        5000,
        'CPP file renamed to example.cpp',
      )

      await cdp.evalJs(`document.querySelector('[data-testid="explorer-file-demo-java"]').click()`)
      await startInlineRename(cdp, 'demo-java')
      await setRenameDraft(cdp, 'Student')
      await cdp.sendKey('Enter', 'Enter', 13, '\r')
      await cdp.waitFor(
        `document.querySelector('[data-testid="explorer-file-demo-java"]')?.textContent?.trim() === 'Student.java'`,
        5000,
        'Java file renamed to Student.java',
      )
      await cdp.evalJs(`document.querySelector('button[aria-label="Run compiler"]').click()`)
      await cdp.waitFor(
        `document.querySelector('[data-testid="console-execution-status"]')?.textContent?.includes('Completed (JAVA)')`,
        8000,
        'Renamed Java file executed cleanly',
      )
    })

    if (cdp.consoleErrors.length || cdp.pageErrors.length) {
      throw new Error(`Renderer errors: console=${JSON.stringify(cdp.consoleErrors)} page=${JSON.stringify(cdp.pageErrors)}`)
    }
  } finally {
    cdp.close()
    try { child.kill() } catch {}
  }

  const passed = results.filter((r) => r.ok).length
  const failed = results.length - passed
  console.log(`\nElectron Rename E2E Summary: ${passed} passed, ${failed} failed out of ${results.length} tests.`)
  process.exit(failed === 0 ? 0 : 1)
}

runTests().catch((err) => {
  console.error('Fatal Rename E2E error:', err)
  process.exit(1)
})
