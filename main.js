const { app, BrowserWindow, screen, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const http = require('http');
const net = require('net');

const USER_DATA_PATH = app.getPath('userData');
const CONFIG_PATH = path.join(USER_DATA_PATH, 'config.json');
const SESSION_NAME = 'my_session';

let config = null;
let pythonProcess = null;
let setupWin = null;
let notifWin = null;
let dismissTimer = null;
const SETUP_PORT = 47857;
let mainPort = 47856;

const NOTIF_WIDTH = 380;
const NOTIF_HEIGHT = 90;
const DEFAULT_DURATION = 5000;

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            mainPort = config.notifications?.port || 47856;
            return true;
        }
    } catch (e) {
        console.error('Error reading config.json:', e);
    }
    return false;
}

function getPythonCommand() {
    const isDev = !app.isPackaged;
    if (isDev) {
        return 'python';
    }
    return path.join(process.resourcesPath, 'python', 'telegram_listener.exe');
}

function killAllTelegramListener() {
    try {
        execSync('taskkill /f /im telegram_listener.exe 2>nul', { stdio: 'ignore' });
    } catch (e) {}
}

function waitForPort(port, timeout = 15000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const tryConnect = () => {
            const socket = new net.Socket();
            socket.once('connect', () => {
                socket.destroy();
                resolve();
            });
            socket.once('error', () => {
                socket.destroy();
                if (Date.now() - start > timeout) {
                    reject(new Error(`Timeout waiting for port ${port}`));
                } else {
                    setTimeout(tryConnect, 300);
                }
            });
            socket.connect(port, '127.0.0.1');
        };
        tryConnect();
    });
}

function startPython(port, args = [], noServer = false) {
    killAllTelegramListener();

    const cmd = getPythonCommand();
    const allArgs = [];
    if (!app.isPackaged) {
        allArgs.push('telegram_listener.py');
    }
    allArgs.push(`--port=${port}`, `--user-data=${USER_DATA_PATH}`, ...args);
    if (noServer) {
        allArgs.push('--no-server');
    }
    pythonProcess = spawn(cmd, allArgs, { stdio: 'pipe' });
    pythonProcess.on('error', (err) => console.error('Python error:', err));
    pythonProcess.stderr.on('data', (data) => console.error(`Python stderr: ${data}`));
    pythonProcess.stdout.on('data', (data) => console.log(`Python stdout: ${data}`));
}

function stopPython() {
    if (pythonProcess) {
        pythonProcess.kill();
        pythonProcess = null;
    }
    killAllTelegramListener();
}

function sendSetupAction(payload, callback) {
    const postData = JSON.stringify(payload);
    const options = {
        hostname: '127.0.0.1',
        port: SETUP_PORT,
        path: '/setup',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 10000
    };

    const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                const response = JSON.parse(data);
                callback(null, response);
            } catch (e) {
                callback(new Error('Invalid JSON from Python'), null);
            }
        });
    });

    req.on('timeout', () => {
        req.destroy();
        callback(new Error('Request timeout'), null);
    });

    req.on('error', (e) => {
        console.error(`Setup request error: ${e.message}`);
        callback(e, null);
    });

    req.write(postData);
    req.end();
}

function createSetupWindow() {
    setupWin = new BrowserWindow({
        width: 460,
        height: 420,
        frame: false,
        transparent: false,
        resizable: false,
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    setupWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(setupHtml)}`);
    setupWin.on('closed', () => { setupWin = null; });
}

const setupHtml = `
<html>
<head>
<style>
  body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #1e1e1e; color: white; padding: 30px; margin:0; }
  h2 { margin-top:0; }
  input { width: 100%; padding: 8px; margin: 5px 0; background: #333; border: 1px solid #555; color: white; border-radius: 4px; box-sizing:border-box; }
  button { padding: 10px 24px; background: #0078d4; color: white; border: none; border-radius: 4px; cursor: pointer; font-size:14px; }
  button:disabled { background: #555; }
  .step { display: none; }
  .step.active { display: block; }
  .error { color: #ff4444; margin-top:10px; }
</style>
</head>
<body>
<div id="step1" class="step active">
  <h2>Welcome!</h2>
  <p>Enter your Telegram app credentials (my.telegram.org)</p>
  <input id="api_id" placeholder="API ID (number)" type="number">
  <input id="api_hash" placeholder="API Hash (string)" type="text">
  <button onclick="nextStep()">Next</button>
</div>
<div id="step2" class="step">
  <h2>Telegram Login</h2>
  <p>Enter your phone number (with country code)</p>
  <input id="phone" placeholder="+79991234567" type="text">
  <button onclick="sendPhone()">Send code</button>
  <div class="error" id="errorMsg"></div>
</div>
<div id="step3" class="step">
  <h2>Verification</h2>
  <p>Enter the code from Telegram</p>
  <input id="code" placeholder="Code" type="text">
  <button onclick="sendCode()">Sign in</button>
  <div class="error" id="errorMsg3"></div>
</div>
<div id="step4" class="step">
  <h2>Cloud password</h2>
  <p>Enter your cloud password (if enabled)</p>
  <input id="password" placeholder="Password" type="password">
  <button onclick="sendPassword()">Sign in</button>
  <div class="error" id="errorMsg4"></div>
</div>
<script>
  const { ipcRenderer } = require('electron');
  let apiId, apiHash, phone;

  function showStep(id) {
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  function nextStep() {
    apiId = document.getElementById('api_id').value;
    apiHash = document.getElementById('api_hash').value;
    if (!apiId || !apiHash) return;
    ipcRenderer.send('save-config', { api_id: apiId, api_hash: apiHash });
  }

  function sendPhone() {
    phone = document.getElementById('phone').value;
    if (!phone.startsWith('+')) {
      document.getElementById('errorMsg').textContent = 'Phone number must include country code (e.g. +79991234567)';
      return;
    }
    ipcRenderer.send('setup-action', { action: 'send_code', phone: phone });
  }

  function sendCode() {
    let code = document.getElementById('code').value;
    ipcRenderer.send('setup-action', { action: 'sign_in', phone: phone, code: code });
  }

  function sendPassword() {
    let password = document.getElementById('password').value;
    ipcRenderer.send('setup-action', { action: 'sign_in_password', password: password });
  }

  ipcRenderer.on('setup-error', (event, msg) => {
    document.getElementById('errorMsg').textContent = msg;
    document.getElementById('errorMsg3').textContent = msg;
    document.getElementById('errorMsg4').textContent = msg;
  });

  ipcRenderer.on('setup-next', (event, step) => {
    if (step === 'code') showStep('step3');
    else if (step === 'password') showStep('step4');
    else if (step === 'phone') showStep('step2');
    else if (step === 'done') ipcRenderer.send('setup-done');
  });
</script>
</body>
</html>
`;

function createNotificationWindow() {
    const { width } = screen.getPrimaryDisplay().workAreaSize;
    const x = Math.round((width - NOTIF_WIDTH) / 2);
    const y = 10;

    const win = new BrowserWindow({
        width: NOTIF_WIDTH,
        height: NOTIF_HEIGHT,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    const html = `
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body {
            height: 100%;
            background: transparent;
            -webkit-app-region: no-drag;
            overflow: hidden;
            font-family: 'Segoe UI', 'Segoe UI Emoji', Tahoma, sans-serif;
          }
          body::-webkit-scrollbar { display: none; }
          .notification {
            background: rgba(30, 30, 30, 0.8);
            backdrop-filter: blur(16px) saturate(180%);
            border-radius: 12px;
            margin: 10px;
            padding: 14px 16px;
            box-shadow:
              0 0 0 1px rgba(255,255,255,0.06),
              0 2px 12px rgba(0,0,0,0.25),
              0 8px 28px rgba(0,0,0,0.15);
            display: flex;
            align-items: flex-start;
            gap: 12px;
            color: #fff;
            transform: translateY(-15px);
            opacity: 0;
            transition: all 0.35s cubic-bezier(0.22, 0.61, 0.36, 1);
            position: relative;
            height: calc(100% - 20px);
            overflow: visible;
          }
          .notification.show {
            transform: translateY(0);
            opacity: 1;
          }
          .notification:hover {
            background: rgba(40, 40, 40, 0.85);
            backdrop-filter: blur(20px) saturate(200%);
            box-shadow:
              0 0 0 1px rgba(255,255,255,0.1),
              0 4px 16px rgba(0,0,0,0.3),
              0 12px 36px rgba(0,0,0,0.2);
          }

          .running-border {
            position: absolute;
            inset: -2px;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 0;
            display: none;
            overflow: visible;
          }
          .mentioned .running-border {
            display: block;
          }

          .running-border rect {
            fill: none;
            stroke: rgba(255,255,255,0.9);
            stroke-width: 2px;
            stroke-linecap: round;
            stroke-dasharray: 300 552;
            animation: runBorder 2s linear infinite;
          }

          @keyframes runBorder {
            0% { stroke-dashoffset: 852; }
            100% { stroke-dashoffset: 0; }
          }

          .avatar, .avatar-img {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            flex-shrink: 0;
            object-fit: cover;
            background: #333;
            z-index: 1;
          }
          .avatar {
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            font-size: 16px;
            color: #fff;
            letter-spacing: 0.5px;
          }
          .content {
            flex: 1;
            min-width: 0;
            z-index: 1;
          }
          .sender {
            font-weight: 600;
            font-size: 13px;
            line-height: 1.3;
            margin-bottom: 3px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .message {
            font-size: 13px;
            line-height: 1.4;
            word-break: break-word;
            white-space: pre-wrap;
            max-height: 40px;
            overflow: hidden;
            color: rgba(255,255,255,0.9);
          }
          .close-btn {
            position: absolute;
            top: 10px;
            right: 12px;
            background: rgba(255,255,255,0.15);
            border: none;
            color: #fff;
            width: 22px;
            height: 22px;
            border-radius: 50%;
            font-size: 14px;
            line-height: 1;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
            -webkit-app-region: no-drag;
            z-index: 2;
          }
          .close-btn:hover { background: rgba(255,255,255,0.25); }
        </style>
      </head>
      <body>
        <div class="notification" id="toast">
          <svg class="running-border" viewBox="-2 -2 364 74" preserveAspectRatio="none" overflow="visible">
            <rect x="1" y="1" width="358" height="68" rx="12" ry="12" />
          </svg>

          <img id="avatarImg" class="avatar-img" src="" alt="avatar" style="display:none">
          <div id="avatarInitial" class="avatar">?</div>
          <div class="content">
            <div class="sender" id="senderEl"></div>
            <div class="message" id="messageEl"></div>
          </div>
          <button class="close-btn" onclick="window.dismiss()" title="Close">×</button>
        </div>
        <script>
          window.animateUpdate = function(jsonStr) {
            const data = JSON.parse(jsonStr);
            const toast = document.getElementById('toast');
            const senderEl = document.getElementById('senderEl');
            const messageEl = document.getElementById('messageEl');
            const avatarImg = document.getElementById('avatarImg');
            const avatarInitial = document.getElementById('avatarInitial');

            toast.classList.remove('show');
            clearTimeout(window._updateTimer);
            window._updateTimer = setTimeout(() => {
              senderEl.textContent = data.sender || 'Notification';
              messageEl.textContent = data.text || '';
              if (data.avatarUrl) {
                avatarImg.src = data.avatarUrl;
                avatarImg.style.display = 'block';
                avatarInitial.style.display = 'none';
              } else {
                avatarImg.style.display = 'none';
                avatarInitial.style.display = 'flex';
                avatarInitial.textContent = (data.sender || '?').charAt(0).toUpperCase();
              }

              if (data.mention) {
                toast.classList.add('mentioned');
              } else {
                toast.classList.remove('mentioned');
              }

              requestAnimationFrame(() => {
                toast.classList.add('show');
              });
            }, 150);
          };

          window.dismiss = function() {
            const toast = document.getElementById('toast');
            toast.classList.remove('show');
          };

          document.getElementById('toast').addEventListener('click', (e) => {
            if (e.target.tagName !== 'BUTTON') {
              window.dismiss();
            }
          });
        </script>
      </body>
    </html>
  `;

    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    win.setPosition(x, y);

    win.once('ready-to-show', () => {
        win.showInactive();
        win.setIgnoreMouseEvents(true, { forward: true });
    });

    return win;
}

function updateNotification(sender, text, avatarUrl, duration = DEFAULT_DURATION, isMention = false) {
    if (!notifWin) return;
    if (dismissTimer) {
        clearTimeout(dismissTimer);
        dismissTimer = null;
    }
    notifWin.setIgnoreMouseEvents(false);

    const payload = JSON.stringify({ sender, text, avatarUrl, mention: isMention });
    notifWin.webContents.executeJavaScript(`window.animateUpdate('${payload.replace(/'/g, "\\'")}')`);

    dismissTimer = setTimeout(() => {
        if (notifWin) {
            notifWin.webContents.executeJavaScript('window.dismiss()');
            notifWin.setIgnoreMouseEvents(true, { forward: true });
        }
        dismissTimer = null;
    }, duration);
}

function startNotificationServer() {
    http.createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/notify') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    updateNotification(
                        data.sender || '',
                        data.text || '',
                        data.avatar || null,
                        data.duration || DEFAULT_DURATION,
                        data.mention || false
                    );
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'ok' }));
                } catch (e) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Invalid JSON' }));
                }
            });
        } else {
            res.writeHead(404);
            res.end();
        }
    }).listen(mainPort, '127.0.0.1', () => {
        console.log(`Notification server listening on port ${mainPort}`);
    });
}

ipcMain.on('save-config', async (event, data) => {
    const cfg = {
        telegram: {
            api_id: parseInt(data.api_id),
            api_hash: data.api_hash,
            session_name: SESSION_NAME
        },
        notifications: {
            port: 47856,
            duration: 5000,
            width: 380,
            height: 90,
            position: 'center-top',
            max_visible: 1
        }
    };
    if (!fs.existsSync(USER_DATA_PATH)) {
        fs.mkdirSync(USER_DATA_PATH, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
    loadConfig();
    startPython(SETUP_PORT, [], false);

    try {
        await waitForPort(SETUP_PORT, 15000);
        event.reply('setup-next', 'phone');
    } catch (e) {
        event.reply('setup-error', 'Python setup server did not start. Please try again.');
    }
});

ipcMain.on('setup-action', (event, payload) => {
    sendSetupAction(payload, (err, response) => {
        if (err) {
            event.reply('setup-error', 'Python process is not responding');
            return;
        }
        if (response.status === 'code_sent') {
            event.reply('setup-next', 'code');
        } else if (response.status === 'password_needed') {
            event.reply('setup-next', 'password');
        } else if (response.status === 'ok') {
            event.reply('setup-next', 'done');
        } else {
            event.reply('setup-error', response.message || 'Error');
        }
    });
});

ipcMain.on('setup-done', () => {
    if (setupWin) setupWin.close();
    stopPython();
    startPython(mainPort, [], true);
    notifWin = createNotificationWindow();
    startNotificationServer();
    setTimeout(() => updateNotification('System', 'Setup complete! Notifications are working.', null, 5000), 1000);
});

app.whenReady().then(() => {
    if (!loadConfig()) {
        createSetupWindow();
    } else {
        startPython(mainPort, [], true);
        notifWin = createNotificationWindow();
        startNotificationServer();
        setTimeout(() => updateNotification('System', 'App started', null, 3000), 500);
    }

    const ghost = new BrowserWindow({
        width: 1, height: 1, show: false, skipTaskbar: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true }
    });
    ghost.loadURL('about:blank');
    ghost.on('closed', () => {
        stopPython();
        app.quit();
    });
});

app.on('window-all-closed', () => {});

app.on('before-quit', () => {
    stopPython();
});