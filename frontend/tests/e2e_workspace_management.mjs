import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
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

  async sendKey(key, code, keyCode, modifiers = 0, text = undefined) {
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code,
      modifiers,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
      ...(text ? { text, unmodifiedText: text } : {}),
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

async function launchElectron({ userDataDir, dialogResponseFile }) {
  const env = {
    ...process.env,
    COMPILECRAFT_CLI_PATH: path.join(repoDir, 'bin', process.platform === 'win32' ? 'compilecraft.exe' : 'compilecraft'),
    COMPILECRAFT_USER_DATA_DIR: userDataDir,
    COMPILECRAFT_E2E_DIALOG_RESPONSE_FILE: dialogResponseFile,
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

async function setReactInput(cdp, selector, value) {
  await cdp.evalJs(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('Missing input: ' + ${JSON.stringify(selector)});
    el.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
  await delay(30)
}

async function replaceMonacoContent(cdp, source) {
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

async function runTests() {
  const tempHarnessDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-m18-e2e-'))
  const userDataDir = path.join(tempHarnessDir, 'user-data')
  const dialogResponseFile = path.join(tempHarnessDir, 'dialog-response.json')
  fs.mkdirSync(userDataDir, { recursive: true })
  fs.writeFileSync(dialogResponseFile, JSON.stringify({ useDesktop: true }), 'utf8')

  const cleanupPaths = [tempHarnessDir]
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

  let session1 = await launchElectron({ userDataDir, dialogResponseFile })
  let savedDesktopProjectDir = null

  try {
    const { cdp } = session1
    await cdp.waitFor(
      `Boolean(document.querySelector('[data-testid="explorer-file-demo-c"]') && document.querySelector('.monaco-editor [role="textbox"], .monaco-editor textarea'))`,
      15000,
      'IDE boot',
    )

    await runCase('default_workspace_has_Main_files_and_compiles_c_cpp_java', async () => {
      const names = await cdp.evalJs(`({
        c: document.querySelector('[data-testid="explorer-file-demo-c"]')?.textContent?.trim(),
        cpp: document.querySelector('[data-testid="explorer-file-demo-cpp"]')?.textContent?.trim(),
        java: document.querySelector('[data-testid="explorer-file-demo-java"]')?.textContent?.trim(),
      })`)
      if (names.c !== 'Main.c' || names.cpp !== 'Main.cpp' || names.java !== 'Main.java') {
        throw new Error(`Unexpected default filenames: ${JSON.stringify(names)}`)
      }

      for (const [id, expectedOut] of [
        ['demo-c', 'Large sum = 18'],
        ['demo-cpp', 'Total = 28'],
        ['demo-java', 'Result = 22'],
      ]) {
        await cdp.evalJs(`document.querySelector('[data-testid="explorer-file-${id}"]').click()`)
        await delay(80)
        await cdp.evalJs(`document.querySelector('button[aria-label="Run compiler"]').click()`)
        await cdp.waitFor(
          `document.querySelector('[data-testid="program-output-stdout"]')?.textContent?.includes(${JSON.stringify(expectedOut)})`,
          8000,
          `${id} compiled and ran`,
        )
      }
    })

    await runCase('new_folder_creation_validation_escape_and_nesting', async () => {
      // Trigger from header New Folder button -> cancel with Escape
      await cdp.evalJs(`document.querySelector('[data-testid="explorer-new-folder-btn"]').click()`)
      await cdp.waitFor(`Boolean(document.querySelector('[data-testid="new-folder-input"]'))`, 5000, 'new folder input')
      await setReactInput(cdp, '[data-testid="new-folder-input"]', 'temp_cancelled')
      await cdp.sendKey('Escape', 'Escape', 27)
      await cdp.waitFor(`!document.querySelector('[data-testid="new-folder-input"]')`, 5000, 'new folder input closed')

      // Invalid names & duplicate checks
      await cdp.evalJs(`document.querySelector('[data-testid="explorer-new-folder-btn"]').click()`)
      await cdp.waitFor(`Boolean(document.querySelector('[data-testid="new-folder-input"]'))`, 5000, 'new folder input reopened')

      for (const [badName, expectedSub] of [
        ['   ', 'empty'],
        ['CON', 'Reserved'],
        ['bad/path', '< >'],
        ['..', 'Path traversal'],
        ['SRC', 'already exists'],
      ]) {
        await setReactInput(cdp, '[data-testid="new-folder-input"]', badName)
        await cdp.sendKey('Enter', 'Enter', 13, 0, '\r')
        const errText = await cdp.waitFor(
          `document.querySelector('[data-testid="new-folder-error"]')?.textContent`,
          4000,
          `error for ${badName}`,
        )
        if (!errText.includes(expectedSub)) {
          throw new Error(`Expected '${expectedSub}' in error for '${badName}', got '${errText}'`)
        }
      }

      // Create valid root folder 'utils'
      await setReactInput(cdp, '[data-testid="new-folder-input"]', 'utils')
      await cdp.sendKey('Enter', 'Enter', 13, 0, '\r')
      await cdp.waitFor(
        `Boolean(document.querySelector('[data-testid="explorer-folder-utils"]'))`,
        5000,
        'utils folder rendered',
      )

      // Open context menu on 'utils' and create nested folder 'helpers'
      await cdp.evalJs(`(() => {
        const el = document.querySelector('[data-testid="explorer-folder-utils"]');
        const r = el.getBoundingClientRect();
        el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 8 }));
      })()`)
      await cdp.waitFor(
        `Boolean(document.querySelector('[data-testid="context-menu-new-folder"]'))`,
        4000,
        'folder context menu',
      )
      await cdp.evalJs(`document.querySelector('[data-testid="context-menu-new-folder"]').click()`)
      await cdp.waitFor(`Boolean(document.querySelector('[data-testid="new-folder-input"]'))`, 4000, 'nested folder input')
      await setReactInput(cdp, '[data-testid="new-folder-input"]', 'helpers')
      await cdp.sendKey('Enter', 'Enter', 13, 0, '\r')
      await cdp.waitFor(
        `Boolean(document.querySelector('[data-testid="explorer-folder-utils__helpers"]'))`,
        5000,
        'nested utils/helpers folder rendered',
      )

      // Organize Main.c inside utils/helpers via file context menu and verify it still compiles & runs
      await cdp.evalJs(`(() => {
        const row = document.querySelector('[data-testid="explorer-file-demo-c"]').closest('div');
        const r = row.getBoundingClientRect();
        row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 8 }));
      })()`)
      await cdp.waitFor(
        `Boolean(document.querySelector('[data-testid="context-menu-move-utils__helpers"]'))`,
        4000,
        'Move to utils/helpers context option',
      )
      await cdp.evalJs(`document.querySelector('[data-testid="context-menu-move-utils__helpers"]').click()`)
      await delay(100)
      const movedTitle = await cdp.evalJs(`document.querySelector('[data-testid="explorer-file-demo-c"]')?.getAttribute('title') || ''`)
      if (!movedTitle.includes('utils/helpers/Main.c')) {
        throw new Error(`Expected Main.c path to update to utils/helpers/Main.c, got '${movedTitle}'`)
      }
      await cdp.maybeScreenshot('m18_01_folders_and_defaults.png')
    })

    let editedCSrc1 = `#include <stdio.h>\nint main() {\n    printf("DESKTOP_SAVED_V1\\n");\n    return 0;\n}\n`
    let editedCSrc2 = `#include <stdio.h>\nint main() {\n    printf("DESKTOP_SAVED_V2\\n");\n    return 0;\n}\n`

    await runCase('save_workspace_to_desktop_with_unsaved_edits_and_overwrite_guard', async () => {
      // Edit Main.c without saving first
      await cdp.evalJs(`document.querySelector('[data-testid="explorer-file-demo-c"]').click()`)
      await delay(80)
      await replaceMonacoContent(cdp, editedCSrc1)

      // Trigger Save Workspace As... via Save button on unsaved in-memory workspace!
      await cdp.evalJs(`document.querySelector('button[aria-label="Save session baseline"]').click()`)
      await cdp.waitFor(
        `Boolean(document.querySelector('[data-testid="save-workspace-dialog"]'))`,
        6000,
        'Save Workspace dialog opened from Save button on in-memory workspace',
      )

      const parentDir = await cdp.evalJs(`document.querySelector('[data-testid="save-workspace-parent-dir"]')?.textContent?.trim()`)
      const defaultName = await cdp.evalJs(`document.querySelector('[data-testid="save-workspace-name-input"]')?.value`)
      if (defaultName !== 'CompileCraft-Workspace') {
        throw new Error(`Expected default name CompileCraft-Workspace, got ${defaultName}`)
      }
      if (!parentDir || !fs.existsSync(parentDir)) {
        throw new Error(`Expected valid Desktop parentDir, got '${parentDir}'`)
      }

      // Avoid clobbering a real user CompileCraft-Workspace on Desktop if one already existed before test
      const defaultTarget = path.join(parentDir, 'CompileCraft-Workspace')
      const targetProjectName = fs.existsSync(defaultTarget)
        ? `CompileCraft-Workspace-M18-Test-${Date.now()}`
        : 'CompileCraft-Workspace'
      savedDesktopProjectDir = path.join(parentDir, targetProjectName)
      cleanupPaths.push(savedDesktopProjectDir)

      await cdp.maybeScreenshot('m18_02_save_workspace_dialog.png')

      if (targetProjectName !== defaultName) {
        await setReactInput(cdp, '[data-testid="save-workspace-name-input"]', targetProjectName)
      }
      await cdp.evalJs(`document.querySelector('[data-testid="save-workspace-confirm-btn"]').click()`)

      await cdp.waitFor(
        `document.querySelector('[data-testid="workspace-toast"]')?.textContent?.includes('Saved workspace to')`,
        8000,
        'Save workspace success toast',
      )

      // Verify all folders & files exist on Desktop
      for (const rel of [
        'utils/helpers/Main.c',
        'src/cpp/Main.cpp',
        'src/java/Main.java',
        'src/error-examples/undeclared_var.c',
        'src/error-examples/type_mismatch.cpp',
        'src/error-examples/SyntaxError.java',
      ]) {
        const full = path.join(savedDesktopProjectDir, ...rel.split('/'))
        if (!fs.existsSync(full)) {
          throw new Error(`Expected saved file missing on Desktop: ${full}`)
        }
      }
      const savedContent = fs.readFileSync(path.join(savedDesktopProjectDir, 'utils', 'helpers', 'Main.c'), 'utf8')
      if (!savedContent.includes('DESKTOP_SAVED_V1')) {
        throw new Error(`Expected unsaved Monaco edits on Desktop, got:\n${savedContent}`)
      }

      // Verify overwrite protection when saving again to non-empty target directory
      await cdp.evalJs(`document.querySelector('[data-testid="save-workspace-as-btn"]').click()`)
      await cdp.waitFor(
        `Boolean(document.querySelector('[data-testid="save-workspace-dialog"]'))`,
        5000,
        'Save Workspace As dialog reopened',
      )
      await cdp.evalJs(`document.querySelector('[data-testid="save-workspace-confirm-btn"]').click()`)
      await cdp.waitFor(
        `Boolean(document.querySelector('[data-testid="save-workspace-overwrite-warning"]'))`,
        5000,
        'Overwrite confirmation warning shown for existing non-empty directory',
      )
      await cdp.evalJs(`document.querySelector('[data-testid="save-workspace-cancel-btn"]').click()`)
      await cdp.waitFor(`!document.querySelector('[data-testid="save-workspace-dialog"]')`, 4000, 'dialog closed')
    })

    await runCase('disk_save_updates_file_and_revert_restores_saved_content', async () => {
      // Edit -> Save -> verify physical file updated cleanly
      await replaceMonacoContent(cdp, editedCSrc2)
      await cdp.waitFor(
        `Boolean(document.querySelector('[aria-label="Unsaved changes"]'))`,
        4000,
        'dirty dot shown after edit',
      )
      await cdp.evalJs(`document.querySelector('button[aria-label="Save session baseline"]').click()`)
      await cdp.waitFor(
        `!document.querySelector('[aria-label="Unsaved changes"]')`,
        5000,
        'dirty dot cleared after disk save',
      )
      const diskAfterSave = fs.readFileSync(path.join(savedDesktopProjectDir, 'utils', 'helpers', 'Main.c'), 'utf8')
      if (!diskAfterSave.includes('DESKTOP_SAVED_V2')) {
        throw new Error(`Expected Save to update physical file to V2, got:\n${diskAfterSave}`)
      }

      // Edit again -> Revert -> verify restores V2
      await replaceMonacoContent(cdp, `#include <stdio.h>\nint main() {\n    printf("DISCARD_ME\\n");\n    return 0;\n}\n`)
      await cdp.waitFor(`Boolean(document.querySelector('[aria-label="Unsaved changes"]'))`, 4000, 'dirty dot after second edit')
      await cdp.evalJs(`document.querySelector('button[aria-label="Revert session changes"]').click()`)
      await cdp.waitFor(`Boolean(document.querySelector('[data-testid="confirm-dialog-confirm-btn"]'))`, 4000, 'revert confirm dialog')
      await cdp.evalJs(`document.querySelector('[data-testid="confirm-dialog-confirm-btn"]').click()`)
      await cdp.waitFor(`!document.querySelector('[aria-label="Unsaved changes"]')`, 5000, 'dirty dot cleared after revert')

      // Compile & Run after Revert -> must output DESKTOP_SAVED_V2
      await cdp.evalJs(`document.querySelector('button[aria-label="Run compiler"]').click()`)
      await cdp.waitFor(
        `document.querySelector('[data-testid="program-output-stdout"]')?.textContent?.includes('DESKTOP_SAVED_V2')`,
        8000,
        'reverted file runs with V2 output',
      )
    })

    if (cdp.consoleErrors.length > 0 || cdp.pageErrors.length > 0) {
      throw new Error(`Session 1 console/page errors: ${JSON.stringify({ c: cdp.consoleErrors, p: cdp.pageErrors })}`)
    }
  } finally {
    session1.cdp.close()
    session1.child.kill()
  }

  // Session 2: Restart Electron cleanly with the same userDataDir and verify workspace persists!
  await delay(400)
  const session2 = await launchElectron({ userDataDir, dialogResponseFile })
  try {
    const { cdp } = session2
    await cdp.waitFor(
      `document.querySelector('[data-testid="explorer-storage-status"]')?.textContent?.includes('Saved workspace') && Boolean(document.querySelector('[data-testid="explorer-folder-utils__helpers"]')) && Boolean(document.querySelector('.monaco-editor [role="textbox"], .monaco-editor textarea'))`,
      15000,
      'persisted Desktop workspace reopened after Electron restart',
    )

    await runCase('workspace_persists_folders_files_and_runs_after_restart', async () => {
      await cdp.evalJs(`document.querySelector('[data-testid="explorer-file-demo-c"]').click()`)
      await delay(100)
      await cdp.evalJs(`document.querySelector('button[aria-label="Run compiler"]').click()`)
      await cdp.waitFor(
        `document.querySelector('[data-testid="program-output-stdout"]')?.textContent?.includes('DESKTOP_SAVED_V2')`,
        8000,
        'reopened Main.c compiled and ran with persisted V2 output',
      )
      await cdp.maybeScreenshot('m18_03_saved_to_desktop_and_reopened.png')
    })

    if (cdp.consoleErrors.length > 0 || cdp.pageErrors.length > 0) {
      throw new Error(`Session 2 console/page errors: ${JSON.stringify({ c: cdp.consoleErrors, p: cdp.pageErrors })}`)
    }
  } finally {
    session2.cdp.close()
    session2.child.kill()
    await delay(250)
    for (const target of cleanupPaths) {
      try {
        fs.rmSync(target, { recursive: true, force: true })
      } catch {
        // Ignore cleanup locks on Windows
      }
    }
  }

  const passed = results.filter((r) => r.ok).length
  console.log(`\nWorkspace Management E2E Summary: ${passed}/${results.length} passed`)
  if (passed !== results.length) process.exit(1)
}

runTests().catch((err) => {
  console.error(err)
  process.exit(1)
})
