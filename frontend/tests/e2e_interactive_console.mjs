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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl)
    this.nextId = 1
    this.pending = new Map()
    this.events = []
    this.consoleErrors = []
    this.pageErrors = []
    this.externalRequests = []
  }

  async connect() {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP WebSocket open timeout')), 10000)
      this.ws.addEventListener('open', () => {
        clearTimeout(timer)
        resolve()
      })
      this.ws.addEventListener('error', (err) => {
        clearTimeout(timer)
        reject(new Error(`CDP WebSocket error: ${err?.message ?? 'unknown'}`))
      })
    })

    this.ws.addEventListener('message', (msg) => {
      const data = JSON.parse(String(msg.data))
      if (typeof data.id === 'number') {
        const entry = this.pending.get(data.id)
        if (entry) {
          this.pending.delete(data.id)
          if (data.error) {
            entry.reject(new Error(`${entry.method}: ${data.error.message}`))
          } else {
            entry.resolve(data.result)
          }
        }
        return
      }

      if (data.method === 'Runtime.consoleAPICalled' && data.params?.type === 'error') {
        const text = (data.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ')
        this.consoleErrors.push(text)
      } else if (data.method === 'Runtime.exceptionThrown') {
        const ex = data.params?.exceptionDetails
        this.pageErrors.push(ex?.exception?.description || ex?.text || 'Unknown exception')
      } else if (data.method === 'Network.requestWillBeSent') {
        const url = data.params?.request?.url || ''
        if (/^(https?|wss?):/i.test(url)) {
          this.externalRequests.push(url)
        }
      }
      this.events.push(data)
    })

    await this.send('Runtime.enable')
    await this.send('Page.enable')
    await this.send('Network.enable')
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP timeout for ${method}`))
      }, 10000)
      this.pending.set(id, {
        method,
        resolve: (res) => {
          clearTimeout(timer)
          resolve(res)
        },
        reject: (err) => {
          clearTimeout(timer)
          reject(err)
        },
      })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async evalJs(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (res.exceptionDetails) {
      throw new Error(
        `evalJs exception: ${res.exceptionDetails.exception?.description || res.exceptionDetails.text}`,
      )
    }
    return res.result?.value
  }

  async waitFor(fnExpr, timeoutMs = 10000, description = 'condition') {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const value = await this.evalJs(fnExpr)
      if (value) {
        return value
      }
      await delay(50)
    }
    const debugState = await this.evalJs(`(() => ({
      href: location.href,
      title: document.title,
      bodyLen: document.body?.innerHTML?.length || 0,
      hasRunBtn: Boolean(document.querySelector('button[aria-label="Run compiler"]')),
      hasMonaco: Boolean(document.querySelector('.monaco-editor')),
      status: document.querySelector('[data-testid="console-execution-status"]')?.textContent || '',
      stdout: document.querySelector('[data-testid="program-output-stdout"]')?.textContent || '',
      stderr: document.querySelector('[data-testid="program-output-stderr"]')?.textContent || '',
      hasInput: Boolean(document.querySelector('[data-testid="console-stdin-input"]')),
    }))()`)
    throw new Error(`Timed out waiting for ${description}; state=${JSON.stringify(debugState)} consoleErrors=${JSON.stringify(this.consoleErrors)} pageErrors=${JSON.stringify(this.pageErrors)}`)
  }

  async pressEnter() {
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
      text: '\r',
      unmodifiedText: '\r',
    })
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    })
  }

  close() {
    try {
      this.ws.close()
    } catch {
      // ignore
    }
  }
}

async function launchElectronWithCdp() {
  const childEnv = {
    ...process.env,
    COMPILECRAFT_CLI_PATH: path.join(
      repoDir,
      'bin',
      process.platform === 'win32' ? 'compilecraft.exe' : 'compilecraft',
    ),
  }
  delete childEnv.ELECTRON_RUN_AS_NODE

  const child = spawn(
    electronBin,
    [frontendDir, '--remote-debugging-port=0', '--no-sandbox'],
    {
      cwd: repoDir,
      shell: false,
      windowsHide: true,
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  let port = null
  let stderrLog = ''
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Electron DevTools port timeout. stderr:\n${stderrLog}`))
    }, 15000)

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8')
      stderrLog += text
      const match = stderrLog.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//)
      if (match && !port) {
        port = Number(match[1])
        clearTimeout(timer)
        resolve()
      }
    })

    child.on('exit', (code) => {
      if (!port) {
        clearTimeout(timer)
        reject(new Error(`Electron exited early (${code}). stderr:\n${stderrLog}`))
      }
    })
  })

  let target = null
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/json/list`)
      const list = await resp.json()
      target = list.find((item) => item.type === 'page' && item.webSocketDebuggerUrl)
      if (target) {
        break
      }
    } catch {
      // retry
    }
    await delay(100)
  }

  if (!target) {
    throw new Error('Could not locate Electron renderer CDP target')
  }

  const cdp = new CdpClient(target.webSocketDebuggerUrl)
  await cdp.connect()
  return { child, cdp }
}

async function selectLanguageAndSetSource(cdp, language, source) {
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
    'Monaco editor after language switch',
  )

  await delay(80)

  await cdp.evalJs(`(() => {
    const ta = document.querySelector('.monaco-editor [role="textbox"], .monaco-editor textarea');
    ta.focus();
  })()`)

  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'a',
    code: 'KeyA',
    modifiers: 2,
    windowsVirtualKeyCode: 65,
  })
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'a',
    code: 'KeyA',
    modifiers: 2,
    windowsVirtualKeyCode: 65,
  })

  await cdp.evalJs(`(() => {
    const ta = document.querySelector('.monaco-editor [role="textbox"], .monaco-editor textarea');
    const dt = new DataTransfer();
    dt.setData('text/plain', ${JSON.stringify(source)});
    ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  })()`)

  await delay(80)
}

async function clickRun(cdp) {
  await cdp.waitFor(
    `(() => {
      const btn = document.querySelector('button[aria-label="Run compiler"]');
      return Boolean(btn && !btn.disabled);
    })()`,
    8000,
    'Run button enabled',
  )
  await cdp.evalJs(`document.querySelector('button[aria-label="Run compiler"]').click()`)
}

async function submitConsoleInput(cdp, text) {
  await cdp.waitFor(
    `Boolean(document.querySelector('[data-testid="console-stdin-input"]'))`,
    8000,
    'console stdin input visible',
  )
  await cdp.evalJs(`(() => {
    const input = document.querySelector('[data-testid="console-stdin-input"]');
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(text)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
  await delay(30)
  await cdp.pressEnter()
}

async function getConsoleState(cdp) {
  return cdp.evalJs(`(() => ({
    status: document.querySelector('[data-testid="console-execution-status"]')?.textContent || '',
    stdout: document.querySelector('[data-testid="program-output-stdout"]')?.textContent || '',
    stderr: document.querySelector('[data-testid="program-output-stderr"]')?.textContent || '',
    echoCount: document.querySelectorAll('[data-testid="console-input-echo"]').length,
    hasInput: Boolean(document.querySelector('[data-testid="console-stdin-input"]')),
  }))()`)
}

async function runTests() {
  const { child, cdp } = await launchElectronWithCdp()
  const results = []

  const runCase = async (name, fn) => {
    try {
      await fn()
      results.push({ name, ok: true, detail: '' })
      console.log(`  [PASS] ${name}`)
    } catch (err) {
      results.push({ name, ok: false, detail: err?.message || String(err) })
      console.error(`  [FAIL] ${name}: ${err?.message || err}`)
      await cdp.evalJs(`document.querySelector('button[aria-label="Stop execution"]')?.click()`).catch(() => {})
      await delay(100)
    }
  }

  try {
    await cdp.waitFor(
      `Boolean(document.querySelector('.monaco-editor [role="textbox"], .monaco-editor textarea') && document.querySelector('button[aria-label="Run compiler"]'))`,
      15000,
      'CompileCraft IDE boot',
    )

    await runCase('c_scanf_single_integer', async () => {
      await selectLanguageAndSetSource(
        cdp,
        'c',
        `#include <stdio.h>
int main() {
    int number;
    printf("Enter number: ");
    scanf("%d", &number);
    printf("Result: %d\\n", number);
    return 0;
}`,
      )
      await clickRun(cdp)
      await cdp.waitFor(
        `document.querySelector('[data-testid="program-output-stdout"]')?.textContent?.includes('Enter number: ')`,
        8000,
        'initial prompt before scanf',
      )
      await submitConsoleInput(cdp, '42')
      await cdp.waitFor(
        `document.querySelector('[data-testid="console-execution-status"]')?.textContent?.includes('Completed (C)')`,
        8000,
        'C completion',
      )
      const st = await getConsoleState(cdp)
      if (!st.stdout.includes('Enter number: ') || !st.stdout.includes('Result: 42') || st.echoCount !== 1) {
        throw new Error(`Unexpected state: ${JSON.stringify(st)}`)
      }
    })

    await runCase('c_scanf_multiple_variables', async () => {
      await selectLanguageAndSetSource(
        cdp,
        'c',
        `#include <stdio.h>
int main() {
    int a;
    float b;
    printf("Pair: ");
    scanf("%d,%f", &a, &b);
    printf("Out=%d|%.2f\\n", a, b);
    return 0;
}`,
      )
      await clickRun(cdp)
      await cdp.waitFor(
        `document.querySelector('[data-testid="program-output-stdout"]')?.textContent?.includes('Pair: ')`,
        8000,
        'Pair prompt',
      )
      await submitConsoleInput(cdp, '12,3.5')
      await cdp.waitFor(
        `document.querySelector('[data-testid="console-execution-status"]')?.textContent?.includes('Completed (C)')`,
        8000,
        'multi var completion',
      )
      const st = await getConsoleState(cdp)
      if (!st.stdout.includes('Out=12|3.50')) {
        throw new Error(`Unexpected state: ${JSON.stringify(st)}`)
      }
    })

    await runCase('c_scanf_string_input', async () => {
      await selectLanguageAndSetSource(
        cdp,
        'c',
        `#include <stdio.h>
int main() {
    char name[16];
    printf("Name: ");
    scanf("%s", name);
    printf("Hello %s\\n", name);
    return 0;
}`,
      )
      await clickRun(cdp)
      await submitConsoleInput(cdp, 'CompileCraft')
      await cdp.waitFor(
        `document.querySelector('[data-testid="console-execution-status"]')?.textContent?.includes('Completed (C)')`,
        8000,
        'C string completion',
      )
      const st = await getConsoleState(cdp)
      if (!st.stdout.includes('Hello CompileCraft')) {
        throw new Error(`Unexpected state: ${JSON.stringify(st)}`)
      }
    })

    await runCase('cpp_cin_chained_input', async () => {
      await selectLanguageAndSetSource(
        cdp,
        'cpp',
        `#include <iostream>
using namespace std;
int main() {
    int number;
    float ratio;
    cout << "Enter pair: ";
    cin >> number >> ratio;
    cout << "Result: " << number << ":" << ratio << endl;
    return 0;
}`,
      )
      await clickRun(cdp)
      await submitConsoleInput(cdp, '7 2.5')
      await cdp.waitFor(
        `document.querySelector('[data-testid="console-execution-status"]')?.textContent?.includes('Completed (CPP)')`,
        8000,
        'C++ chained completion',
      )
      const st = await getConsoleState(cdp)
      if (!st.stdout.includes('Result: 7:2.5')) {
        throw new Error(`Unexpected state: ${JSON.stringify(st)}`)
      }
    })

    await runCase('cpp_multiple_input_rounds', async () => {
      await selectLanguageAndSetSource(
        cdp,
        'cpp',
        `#include <iostream>
#include <string>
using namespace std;
int main() {
    int x;
    string word;
    cout << "First: ";
    cin >> x;
    cout << "Second: ";
    cin >> word;
    cout << "Sum=" << x << "|" << word << endl;
    return 0;
}`,
      )
      await clickRun(cdp)
      await cdp.waitFor(
        `document.querySelector('[data-testid="program-output-stdout"]')?.textContent?.includes('First: ')`,
        8000,
        'First prompt',
      )
      await submitConsoleInput(cdp, '15')
      await cdp.waitFor(
        `document.querySelector('[data-testid="program-output-stdout"]')?.textContent?.includes('Second: ')`,
        8000,
        'Second prompt',
      )
      await submitConsoleInput(cdp, 'alpha')
      await cdp.waitFor(
        `document.querySelector('[data-testid="console-execution-status"]')?.textContent?.includes('Completed (CPP)')`,
        8000,
        'C++ multi round completion',
      )
      const st = await getConsoleState(cdp)
      if (!st.stdout.includes('Sum=15|alpha') || st.echoCount !== 2) {
        throw new Error(`Unexpected state: ${JSON.stringify(st)}`)
      }
    })

    await runCase('java_scanner_nextint', async () => {
      await selectLanguageAndSetSource(
        cdp,
        'java',
        `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        System.out.println("Enter number:");
        int number = sc.nextInt();
        System.out.println("Result: " + number);
    }
}`,
      )
      await clickRun(cdp)
      await cdp.waitFor(
        `document.querySelector('[data-testid="program-output-stdout"]')?.textContent?.includes('Enter number:')`,
        8000,
        'Java prompt',
      )
      await submitConsoleInput(cdp, '99')
      await cdp.waitFor(
        `document.querySelector('[data-testid="console-execution-status"]')?.textContent?.includes('Completed (JAVA)')`,
        8000,
        'Java nextInt completion',
      )
      const st = await getConsoleState(cdp)
      if (!st.stdout.includes('Result: 99')) {
        throw new Error(`Unexpected state: ${JSON.stringify(st)}`)
      }
    })

    await runCase('java_scanner_nextline_with_spaces', async () => {
      await selectLanguageAndSetSource(
        cdp,
        'java',
        `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        System.out.print("Line: ");
        String line = sc.nextLine();
        System.out.println("[" + line + "]");
    }
}`,
      )
      await clickRun(cdp)
      await cdp.waitFor(
        `document.querySelector('[data-testid="program-output-stdout"]')?.textContent?.includes('Line: ')`,
        8000,
        'Java line prompt',
      )
      await submitConsoleInput(cdp, 'hello interactive spaces')
      await cdp.waitFor(
        `document.querySelector('[data-testid="console-execution-status"]')?.textContent?.includes('Completed (JAVA)')`,
        8000,
        'Java nextLine completion',
      )
      const st = await getConsoleState(cdp)
      if (!st.stdout.includes('[hello interactive spaces]')) {
        throw new Error(`Unexpected state: ${JSON.stringify(st)}`)
      }
    })

    await runCase('java_scanner_nextboolean', async () => {
      await selectLanguageAndSetSource(
        cdp,
        'java',
        `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        boolean flag = sc.nextBoolean();
        System.out.println("Flag=" + flag);
    }
}`,
      )
      await clickRun(cdp)
      await submitConsoleInput(cdp, 'true')
      await cdp.waitFor(
        `document.querySelector('[data-testid="console-execution-status"]')?.textContent?.includes('Completed (JAVA)')`,
        8000,
        'Java nextBoolean completion',
      )
      const st = await getConsoleState(cdp)
      if (!st.stdout.includes('Flag=true')) {
        throw new Error(`Unexpected state: ${JSON.stringify(st)}`)
      }
    })

    await runCase('runtime_error_preserves_partial_output', async () => {
      await selectLanguageAndSetSource(
        cdp,
        'c',
        `#include <stdio.h>
int main() {
    int x;
    printf("Before\\n");
    scanf("%d", &x);
    printf("After\\n");
    return 0;
}`,
      )
      await clickRun(cdp)
      await cdp.waitFor(
        `document.querySelector('[data-testid="program-output-stdout"]')?.textContent?.includes('Before')`,
        8000,
        'Before output',
      )
      await submitConsoleInput(cdp, 'bad_int')
      await cdp.waitFor(
        `document.querySelector('[data-testid="console-execution-status"]')?.textContent?.includes('Runtime error (C)')`,
        8000,
        'Runtime error status',
      )
      const st = await getConsoleState(cdp)
      if (!st.stdout.includes('Before') || !st.stderr.includes('Invalid integer input')) {
        throw new Error(`Unexpected state: ${JSON.stringify(st)}`)
      }
    })

    await runCase('stop_while_waiting_for_input', async () => {
      await selectLanguageAndSetSource(
        cdp,
        'c',
        `#include <stdio.h>
int main() {
    int x;
    printf("Waiting...\\n");
    scanf("%d", &x);
    return 0;
}`,
      )
      await clickRun(cdp)
      await cdp.waitFor(
        `Boolean(document.querySelector('[data-testid="console-stop-btn"]') && document.querySelector('[data-testid="console-stdin-input"]'))`,
        8000,
        'Stop button while waiting for input',
      )
      await cdp.evalJs(`document.querySelector('[data-testid="console-stop-btn"]').click()`)
      await cdp.waitFor(
        `document.querySelector('[data-testid="console-execution-status"]')?.textContent?.includes('Execution stopped (C)')`,
        8000,
        'Execution stopped status',
      )
    })

    await runCase('eof_handling_from_console', async () => {
      await selectLanguageAndSetSource(
        cdp,
        'c',
        `#include <stdio.h>
int main() {
    int x;
    printf("Need input:\\n");
    scanf("%d", &x);
    return 0;
}`,
      )
      await clickRun(cdp)
      await cdp.waitFor(
        `Boolean(document.querySelector('[data-testid="console-eof-btn"]'))`,
        8000,
        'Send EOF button visible',
      )
      await cdp.evalJs(`document.querySelector('[data-testid="console-eof-btn"]').click()`)
      await cdp.waitFor(
        `document.querySelector('[data-testid="console-execution-status"]')?.textContent?.includes('Runtime error (C)')`,
        8000,
        'EOF runtime error status',
      )
      const st = await getConsoleState(cdp)
      if (!st.stdout.includes('[EOF sent') || !st.stderr.includes('end of input')) {
        throw new Error(`Unexpected state: ${JSON.stringify(st)}`)
      }
    })

    await runCase('repeated_execution_no_stale_input_and_m15_compat', async () => {
      await selectLanguageAndSetSource(
        cdp,
        'c',
        `#include <stdio.h>
int main() {
    int x;
    printf("Num: ");
    scanf("%d", &x);
    printf("Val=%d\\n", x);
    return 0;
}`,
      )
      await clickRun(cdp)
      await submitConsoleInput(cdp, '111')
      await cdp.waitFor(
        `document.querySelector('[data-testid="console-execution-status"]')?.textContent?.includes('Completed (C)')`,
        8000,
        'First run completed',
      )
      const st1 = await getConsoleState(cdp)
      if (!st1.stdout.includes('Val=111')) {
        throw new Error(`Unexpected first run state: ${JSON.stringify(st1)}`)
      }

      await clickRun(cdp)
      await cdp.waitFor(
        `(() => {
          const out = document.querySelector('[data-testid="program-output-stdout"]')?.textContent || '';
          return out.includes('Num: ') && !out.includes('Val=111');
        })()`,
        8000,
        'Console cleared on second run',
      )
      await submitConsoleInput(cdp, '222')
      await cdp.waitFor(
        `document.querySelector('[data-testid="console-execution-status"]')?.textContent?.includes('Completed (C)')`,
        8000,
        'Second run completed',
      )
      const st2 = await getConsoleState(cdp)
      if (!st2.stdout.includes('Val=222') || st2.stdout.includes('Val=111')) {
        throw new Error(`Unexpected second run state: ${JSON.stringify(st2)}`)
      }

      // Verify Tokens, AST, Symbol Table, and TAC panels populate cleanly
      for (const tabId of ['tokens', 'ast', 'symtab', 'tac']) {
        await cdp.evalJs(`document.getElementById('desktop-results-tab-${tabId}')?.click()`)
        const text = await cdp.evalJs(
          `document.getElementById('desktop-results-panel-${tabId}')?.textContent || ''`,
        )
        if (!text.trim()) {
          throw new Error(`Results panel '${tabId}' was empty after run`)
        }
      }
    })

    await runCase('light_dark_theme_toggle_and_persistence', async () => {
      await cdp.evalJs(`document.querySelector('[data-settings-trigger="true"]')?.click()`)
      await cdp.waitFor(
        `Boolean(document.querySelector('select[id$="-theme"]'))`,
        5000,
        'theme selector in EditorSettingsMenu',
      )
      await cdp.evalJs(`(() => {
        const s = document.querySelector('select[id$="-theme"]');
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'light');
        s.dispatchEvent(new Event('change', { bubbles: true }));
      })()`)
      await cdp.waitFor(
        `document.documentElement.getAttribute('data-theme') === 'light'`,
        5000,
        'light theme applied to documentElement',
      )
      await delay(150)
      const ssDir = process.env.COMPILECRAFT_SCREENSHOT_DIR
      if (ssDir) {
        const res = await cdp.send('Page.captureScreenshot', { format: 'png' })
        fs.writeFileSync(path.join(ssDir, 'm17_theme_01_light.png'), Buffer.from(res.data, 'base64'))
      }

      // Reload page to verify theme persistence
      await cdp.send('Page.reload')
      await cdp.waitFor(
        `Boolean(document.querySelector('.monaco-editor [role="textbox"], .monaco-editor textarea') && document.documentElement.getAttribute('data-theme') === 'light')`,
        12000,
        'light theme persisted after reload',
      )

      // Switch back to dark theme
      await cdp.evalJs(`document.querySelector('[data-settings-trigger="true"]')?.click()`)
      await cdp.waitFor(
        `Boolean(document.querySelector('select[id$="-theme"]'))`,
        5000,
        'theme selector after reload',
      )
      await cdp.evalJs(`(() => {
        const s = document.querySelector('select[id$="-theme"]');
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'dark');
        s.dispatchEvent(new Event('change', { bubbles: true }));
      })()`)
      await cdp.waitFor(
        `document.documentElement.getAttribute('data-theme') === 'dark'`,
        5000,
        'dark theme restored',
      )
      await delay(150)
      if (ssDir) {
        const res = await cdp.send('Page.captureScreenshot', { format: 'png' })
        fs.writeFileSync(path.join(ssDir, 'm17_theme_02_dark.png'), Buffer.from(res.data, 'base64'))
      }
    })

    await runCase('error_examples_folder_and_diagnostics', async () => {
      const folderOk = await cdp.evalJs(`(() => ({
        hasErrorExamples: Boolean(document.querySelector('button[aria-label$="folder error-examples"]')),
        hasOldInvalid: Boolean(document.querySelector('button[aria-label$="folder invalid"]')),
      }))()`)
      if (!folderOk.hasErrorExamples || folderOk.hasOldInvalid) {
        throw new Error(`Unexpected Explorer folder state: ${JSON.stringify(folderOk)}`)
      }

      const cases = [
        { id: 'invalid-c', file: 'undeclared_var.c', stage: 'Semantic Error', needle: 'total' },
        { id: 'invalid-cpp', file: 'type_mismatch.cpp', stage: 'Semantic Error', needle: 'Type mismatch' },
        { id: 'invalid-java', file: 'SyntaxError.java', stage: 'Syntax Error', needle: 'syntax error' },
      ]

      for (const tc of cases) {
        await cdp.evalJs(`document.querySelector('[data-testid="explorer-file-${tc.id}"]')?.click()`)
        await cdp.waitFor(
          `Boolean(document.querySelector('button[aria-label="Close ${tc.file}"]'))`,
          5000,
          `opened ${tc.file}`,
        )
        await clickRun(cdp)
        await cdp.waitFor(
          `(document.getElementById('desktop-results-panel-errors')?.textContent || '').includes(${JSON.stringify(tc.stage)})`,
          8000,
          `${tc.file} diagnostics`,
        )
        const diagText = await cdp.evalJs(
          `document.getElementById('desktop-results-panel-errors')?.textContent || ''`,
        )
        if (!diagText.toLowerCase().includes(tc.needle.toLowerCase())) {
          throw new Error(`Expected diagnostic for ${tc.file} containing ${tc.needle}, got ${diagText}`)
        }
      }
    })

    await runCase('zero_external_network_requests', async () => {
      if (cdp.externalRequests.length > 0) {
        throw new Error(`External requests detected: ${cdp.externalRequests.join(', ')}`)
      }
    })

    await runCase('zero_console_or_renderer_errors', async () => {
      if (cdp.consoleErrors.length > 0 || cdp.pageErrors.length > 0) {
        throw new Error(
          `Console/page errors detected: console=${JSON.stringify(cdp.consoleErrors)} page=${JSON.stringify(cdp.pageErrors)}`,
        )
      }
    })
  } finally {
    cdp.close()
    try {
      child.kill()
    } catch {
      // ignore
    }
  }

  const passed = results.filter((r) => r.ok).length
  const failed = results.length - passed
  console.log(`\nElectron E2E Summary: ${passed} passed, ${failed} failed out of ${results.length} tests.`)
  process.exit(failed === 0 ? 0 : 1)
}

runTests().catch((err) => {
  console.error('Fatal E2E runner error:', err)
  process.exit(1)
})
