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

  async sendKey(key, code, keyCode, modifiers = 0) {
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code,
      modifiers,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
    })
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code,
      modifiers,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
    })
  }

  async dragElement(selector, dx, dy) {
    const box = await this.evalJs(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`)
    if (!box) throw new Error(`Missing drag handle ${selector}`)

    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: box.x,
      y: box.y,
    })
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: box.x,
      y: box.y,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    })
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: box.x + Math.round(dx * 0.5),
      y: box.y + Math.round(dy * 0.5),
      button: 'left',
      buttons: 1,
    })
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: box.x + dx,
      y: box.y + dy,
      button: 'left',
      buttons: 1,
    })
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: box.x + dx,
      y: box.y + dy,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    })
    await delay(80)
  }

  async maybeScreenshot(filename) {
    if (!screenshotDir) return
    fs.mkdirSync(screenshotDir, { recursive: true })
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

async function openLanguageAndSetUnsavedSource(cdp, language, source) {
  await cdp.evalJs(`(() => {
    const select = document.getElementById('language-selector');
    if (!select) throw new Error('language-selector missing');
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(select, ${JSON.stringify(language)});
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`)
  await cdp.waitFor(
    `Boolean(document.querySelector('.monaco-editor [role="textbox"], .monaco-editor textarea'))`,
    8000,
    'Monaco after language switch',
  )
  await delay(120)
  await cdp.evalJs(`document.querySelector('.monaco-editor [role="textbox"], .monaco-editor textarea').focus()`)
  await cdp.sendKey('a', 'KeyA', 65, 2)
  await cdp.evalJs(`(() => {
    const ta = document.querySelector('.monaco-editor [role="textbox"], .monaco-editor textarea');
    const dt = new DataTransfer();
    dt.setData('text/plain', ${JSON.stringify(source)});
    ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  })()`)
  await delay(80)
}

async function openExplorerFile(cdp, fileId) {
  await cdp.waitFor(
    `Boolean(document.querySelector('[data-testid="explorer-file-${fileId}"]'))`,
    5000,
    `explorer item ${fileId}`,
  )
  await cdp.evalJs(`document.querySelector('[data-testid="explorer-file-${fileId}"]').click()`)
  await delay(120)
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
      `Boolean(document.querySelector('[data-testid="explorer-sidebar"]') && document.querySelector('.monaco-editor [role="textbox"], .monaco-editor textarea'))`,
      15000,
      'IDE boot',
    )

    await runCase('ctrl_enter_runs_unsaved_c_cpp_java_and_preserves_editor_text', async () => {
      // C unsaved edit + Ctrl+Enter (without Save)
      const cSrc = `#include <stdio.h>\nint main() {\n    printf("UNSAVED_C_901\\n");\n    return 0;\n}`
      await openLanguageAndSetUnsavedSource(cdp, 'c', cSrc)
      // Move cursor to line 2 before Ctrl+Enter to prove insertLineAfter does not insert a blank line
      await cdp.sendKey('ArrowUp', 'ArrowUp', 38)
      await cdp.sendKey('Enter', 'Enter', 13, 2)
      await cdp.waitFor(
        `document.querySelector('[data-testid="program-output-stdout"]')?.textContent?.includes('UNSAVED_C_901')`,
        8000,
        'C Ctrl+Enter unsaved output',
      )
      const lineCountAfter = await cdp.evalJs(`document.querySelectorAll('.monaco-editor .view-line').length`)
      if (lineCountAfter !== 5) {
        throw new Error(`Expected 5 lines in C editor (no spurious Ctrl+Enter newline), got ${lineCountAfter}`)
      }
      const cDirty = await cdp.evalJs(`(() => {
        const revertBtn = document.querySelector('button[aria-label="Revert session changes"]');
        return Boolean(revertBtn && !revertBtn.disabled);
      })()`)
      if (!cDirty) {
        throw new Error('Expected C document to remain unsaved (dirty) after Ctrl+Enter run')
      }

      // C++ unsaved edit + Ctrl+Enter
      const cppSrc = `#include <iostream>\nusing namespace std;\nint main() {\n    cout << "UNSAVED_CPP_902" << endl;\n    return 0;\n}`
      await openLanguageAndSetUnsavedSource(cdp, 'cpp', cppSrc)
      await cdp.sendKey('Enter', 'Enter', 13, 2)
      await cdp.waitFor(
        `document.querySelector('[data-testid="program-output-stdout"]')?.textContent?.includes('UNSAVED_CPP_902')`,
        8000,
        'C++ Ctrl+Enter unsaved output',
      )

      // Java unsaved edit + Ctrl+Enter, then second unsaved edit + Run button parity
      const javaSrc1 = `public class Main {\n    public static void main(String[] args) {\n        System.out.println("UNSAVED_JAVA_903");\n    }\n}`
      await openLanguageAndSetUnsavedSource(cdp, 'java', javaSrc1)
      await cdp.sendKey('Enter', 'Enter', 13, 2)
      await cdp.waitFor(
        `document.querySelector('[data-testid="program-output-stdout"]')?.textContent?.includes('UNSAVED_JAVA_903')`,
        8000,
        'Java Ctrl+Enter unsaved output',
      )

      const javaSrc2 = `public class Main {\n    public static void main(String[] args) {\n        System.out.println("RUN_BTN_JAVA_904");\n    }\n}`
      await openLanguageAndSetUnsavedSource(cdp, 'java', javaSrc2)
      await cdp.evalJs(`document.querySelector('button[aria-label="Run compiler"]').click()`)
      await cdp.waitFor(
        `document.querySelector('[data-testid="program-output-stdout"]')?.textContent?.includes('RUN_BTN_JAVA_904')`,
        8000,
        'Java Run button unsaved output',
      )
    })

    await runCase('resizable_panels_drag_clamp_keyboard_and_reload_persistence', async () => {
      const readBoxes = () =>
        cdp.evalJs(`(() => {
          const sb = document.querySelector('[data-testid="explorer-sidebar"]').getBoundingClientRect();
          const rp = document.querySelector('[data-testid="desktop-results-pane"]').getBoundingClientRect();
          const bp = document.querySelector('[data-testid="bottom-panel"]').getBoundingClientRect();
          return {
            sidebarW: Math.round(sb.width),
            resultsW: Math.round(rp.width),
            bottomH: Math.round(bp.height),
            overflowX: document.documentElement.scrollWidth > window.innerWidth,
            overflowY: document.documentElement.scrollHeight > window.innerHeight,
          };
        })()`)

      const before = await readBoxes()

      // Drag sidebar +72px
      await cdp.dragElement('[data-testid="resize-sidebar"]', 72, 0)
      // Drag results splitter left -64px (grows right pane)
      await cdp.dragElement('[data-testid="resize-results"]', -64, 0)
      // Drag bottom splitter up -56px (grows bottom panel)
      await cdp.dragElement('[data-testid="resize-bottom"]', 0, -56)

      const afterDrag = await readBoxes()
      if (afterDrag.sidebarW < before.sidebarW + 50) {
        throw new Error(`Sidebar did not grow as expected: before=${before.sidebarW}, after=${afterDrag.sidebarW}`)
      }
      if (afterDrag.resultsW < before.resultsW + 45) {
        throw new Error(`Results pane did not grow as expected: before=${before.resultsW}, after=${afterDrag.resultsW}`)
      }
      if (afterDrag.bottomH < before.bottomH + 40) {
        throw new Error(`Bottom panel did not grow as expected: before=${before.bottomH}, after=${afterDrag.bottomH}`)
      }
      if (afterDrag.overflowX || afterDrag.overflowY) {
        throw new Error(`Viewport overflowed after resize: ${JSON.stringify(afterDrag)}`)
      }

      // Keyboard resize check on sidebar handle
      await cdp.evalJs(`document.querySelector('[data-testid="resize-sidebar"]').focus()`)
      await cdp.sendKey('ArrowRight', 'ArrowRight', 39)
      await delay(60)
      const afterKey = await readBoxes()
      if (afterKey.sidebarW <= afterDrag.sidebarW) {
        throw new Error(`Keyboard ArrowRight did not resize sidebar: ${afterDrag.sidebarW} -> ${afterKey.sidebarW}`)
      }

      // Reload & verify persistence
      await cdp.send('Page.reload')
      await cdp.waitFor(
        `Boolean(document.querySelector('[data-testid="explorer-sidebar"]') && document.querySelector('.monaco-editor [role="textbox"], .monaco-editor textarea'))`,
        12000,
        'IDE reload with persisted panel layout',
      )
      await delay(100)
      const afterReload = await readBoxes()
      if (
        Math.abs(afterReload.sidebarW - afterKey.sidebarW) > 2 ||
        Math.abs(afterReload.resultsW - afterDrag.resultsW) > 2 ||
        Math.abs(afterReload.bottomH - afterDrag.bottomH) > 2
      ) {
        throw new Error(`Persisted sizes did not survive reload: beforeReload=${JSON.stringify({ s: afterKey.sidebarW, r: afterDrag.resultsW, b: afterDrag.bottomH })} afterReload=${JSON.stringify(afterReload)}`)
      }

      // Clamp test: extreme shrink & extreme grow
      await cdp.dragElement('[data-testid="resize-sidebar"]', -500, 0)
      const minClamp = await readBoxes()
      if (minClamp.sidebarW < 178 || minClamp.sidebarW > 184) {
        throw new Error(`Expected sidebar min clamp ~180, got ${minClamp.sidebarW}`)
      }
      await cdp.dragElement('[data-testid="resize-sidebar"]', 500, 0)
      const maxClamp = await readBoxes()
      if (maxClamp.sidebarW < 416 || maxClamp.sidebarW > 422) {
        throw new Error(`Expected sidebar max clamp ~420, got ${maxClamp.sidebarW}`)
      }

      // Restore balanced defaults so subsequent screenshots look clean
      await cdp.evalJs(`localStorage.removeItem('compilecraft_panel_layout')`)
      await cdp.send('Page.reload')
      await cdp.waitFor(
        `Boolean(document.querySelector('[data-testid="explorer-sidebar"]') && document.querySelector('.monaco-editor [role="textbox"], .monaco-editor textarea'))`,
        12000,
        'IDE reload after layout reset',
      )
    })

    await runCase('error_navigation_c_cpp_java_cross_file_highlight_and_focus', async () => {
      // 1) C error example: undeclared_var.c via DiagnosticsPanel (Errors)
      await openExplorerFile(cdp, 'invalid-c')
      await cdp.evalJs(`document.querySelector('button[aria-label="Run compiler"]').click()`)
      await cdp.waitFor(
        `Boolean(document.querySelector('[data-testid="diagnostics-error-item-0"]'))`,
        8000,
        'C error diagnostic item',
      )
      // Move cursor to line 1 first so jump change is observable
      await cdp.evalJs(`document.querySelector('.monaco-editor [role="textbox"], .monaco-editor textarea').focus()`)
      await cdp.sendKey('Home', 'Home', 36, 2)
      await delay(50)
      await cdp.evalJs(`document.querySelector('[data-testid="diagnostics-error-item-0"]').click()`)
      await cdp.waitFor(
        `Boolean(document.querySelector('.monaco-editor .cc-editor-error-line')) && /Ln\\s+[2-9]/.test(document.body.innerText)`,
        5000,
        'C error line highlighted and cursor moved',
      )
      const cFocused = await cdp.evalJs(`Boolean(document.activeElement?.closest('.monaco-editor'))`)
      if (!cFocused) throw new Error('Editor did not regain focus after clicking C error')

      // 2) C++ error example: type_mismatch.cpp via BottomPanel Problems
      await openExplorerFile(cdp, 'invalid-cpp')
      await cdp.evalJs(`document.querySelector('button[aria-label="Run compiler"]').click()`)
      await cdp.waitFor(
        `Boolean(document.querySelector('[data-testid="problems-error-item-0"]'))`,
        8000,
        'C++ problem diagnostic item',
      )
      await cdp.evalJs(`document.querySelector('[data-testid="problems-error-item-0"]').click()`)
      await cdp.waitFor(
        `Boolean(document.querySelector('.monaco-editor .cc-editor-error-line'))`,
        5000,
        'C++ error line highlighted',
      )

      // 3) Java error example: SyntaxError.java, then switch away to demo-c, then cross-file click!
      await openExplorerFile(cdp, 'invalid-java')
      await cdp.evalJs(`document.querySelector('button[aria-label="Run compiler"]').click()`)
      await cdp.waitFor(
        `Boolean(document.querySelector('[data-testid="diagnostics-error-item-0"]'))`,
        8000,
        'Java error diagnostic item',
      )

      // Switch tab to demo-c
      await openExplorerFile(cdp, 'demo-c')
      await cdp.waitFor(
        `document.querySelector('#language-selector')?.value === 'c'`,
        5000,
        'Switched away to C file',
      )
      await cdp.evalJs(`document.getElementById('cc-bottom-tab-problems')?.click()`)
      await cdp.waitFor(
        `Array.from(document.querySelectorAll('[data-testid^="problems-error-item-"]')).some((b) => b.textContent.includes('SyntaxError.java'))`,
        5000,
        'Java problem visible in Problems tab from another file',
      )
      await cdp.evalJs(`(() => {
        const btn = Array.from(document.querySelectorAll('[data-testid^="problems-error-item-"]')).find((b) => b.textContent.includes('SyntaxError.java'));
        btn.click();
      })()`)
      await cdp.waitFor(
        `document.querySelector('#language-selector')?.value === 'java' && Boolean(document.querySelector('.monaco-editor .cc-editor-error-line'))`,
        5000,
        'Cross-file click switched to SyntaxError.java and highlighted line',
      )
      const javaFocused = await cdp.evalJs(`Boolean(document.activeElement?.closest('.monaco-editor'))`)
      if (!javaFocused) throw new Error('Editor was not focused after cross-file jump to Java')
    })

    await runCase('final_light_and_dark_theme_screenshots', async () => {
      await cdp.evalJs(`(() => {
        const s = document.querySelector('[data-settings-trigger="true"]');
        s?.click();
      })()`)
      await cdp.waitFor(`Boolean(document.querySelector('select[id$="-theme"]'))`, 5000, 'theme select')
      await cdp.evalJs(`(() => {
        const sel = document.querySelector('select[id$="-theme"]');
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, 'light');
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      })()`)
      await delay(150)
      await cdp.evalJs(`document.querySelector('[data-settings-trigger="true"]')?.click()`)
      await delay(150)
      await cdp.maybeScreenshot('m17_final_light.png')

      await cdp.evalJs(`document.querySelector('[data-settings-trigger="true"]')?.click()`)
      await cdp.waitFor(`Boolean(document.querySelector('select[id$="-theme"]'))`, 5000, 'theme select 2')
      await cdp.evalJs(`(() => {
        const sel = document.querySelector('select[id$="-theme"]');
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, 'dark');
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      })()`)
      await delay(150)
      await cdp.evalJs(`document.querySelector('[data-settings-trigger="true"]')?.click()`)
      await delay(150)
      await cdp.maybeScreenshot('m17_final_dark.png')
    })

    if (cdp.consoleErrors.length > 0 || cdp.pageErrors.length > 0) {
      throw new Error(`Console/page errors detected: console=${JSON.stringify(cdp.consoleErrors)} page=${JSON.stringify(cdp.pageErrors)}`)
    }
  } finally {
    cdp.close()
    child.kill()
  }

  const passed = results.filter((r) => r.ok).length
  console.log(`\nUX Refinements E2E Summary: ${passed}/${results.length} passed`)
  if (passed !== results.length) process.exit(1)
}

runTests().catch((err) => {
  console.error(err)
  process.exit(1)
})
