const { app, BrowserWindow, ipcMain, Menu, screen, globalShortcut } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { writeFileSync, renameSync } = require('node:fs');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const itemVariants = require('./capture/item-variants.json');
const { autoUpdater } = require('electron-updater');

// QA can use a separate profile without touching the user's notebook.
const profile = process.argv.find(arg => arg.startsWith('--fieldbook-profile='));
if (profile) app.setPath('userData', path.resolve(profile.split('=').slice(1).join('=')));
// Electron scopes its lock to userData. Use one canonical lock for installed
// builds, previews, and QA, then restore the requested data folder before startup.
const dataProfile = app.getPath('userData');
app.setPath('userData', path.join(app.getPath('appData'), 'daeva-fieldbook'));
const ownsInstance = app.requestSingleInstanceLock();
app.setPath('userData', dataProfile);
if (!ownsInstance) { app.quit(); } else {
  let win;
  let updateState = { status: 'idle', version: app.getVersion(), availableVersion: null, percent: 0, message: '' };
  let updateCheckPending = false;
  let updateDownloadPending = false;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.disableWebInstaller = true;
  function publishUpdateState(next) {
    updateState = { ...updateState, ...next };
    if (win && !win.isDestroyed()) win.webContents.send('update-state', updateState);
  }
  async function checkForUpdate() {
    if (updateCheckPending || updateDownloadPending || ['ready', 'installing'].includes(updateState.status)) return updateState;
    if (!app.isPackaged) { publishUpdateState({ status: 'development', message: 'Update checks are available in the installed app.' }); return updateState; }
    updateCheckPending = true;
    publishUpdateState({ status: 'checking', message: 'Checking for updates…' });
    try { await autoUpdater.checkForUpdates(); }
    catch { publishUpdateState({ status: 'error', message: 'Could not check for updates. Check your connection and try again.' }); }
    finally { updateCheckPending = false; }
    return updateState;
  }
  autoUpdater.on('update-available', info => publishUpdateState({ status: 'available', availableVersion: info.version, percent: 0, message: 'An update is available. Downloading it will restart the app when ready.' }));
  autoUpdater.on('update-not-available', () => publishUpdateState({ status: 'current', availableVersion: null, message: 'You are up to date.' }));
  autoUpdater.on('download-progress', progress => publishUpdateState({ status: 'downloading', percent: Math.max(0, Math.min(100, Math.round(progress.percent))), message: 'Downloading update. The app will restart when it is ready.' }));
  autoUpdater.on('update-downloaded', info => publishUpdateState({ status: 'ready', availableVersion: info.version, percent: 100, message: 'Update downloaded. Restarting to install…' }));
  autoUpdater.on('error', () => publishUpdateState({ status: 'error', message: updateDownloadPending ? 'The update could not be installed. Your current version is unchanged. Try again.' : 'Could not check for updates. Check your connection and try again.' }));
  let overlay;
  let timerOverlay;
  let eventOverlay;
  let noteOverlay;
  let goals = [];
  let selectedGoalId = null;
  let goalFile;
  let overlayPositionFile;
  let overlayPosition;
  let timerPins = [];
  let timerPinsFile;
  let timerOverlayPosition;
  let timerOverlayPositionFile;
  let eventOverlayPosition;
  let eventOverlayPositionFile;
  let noteOverlayPosition;
  let noteOverlayPositionFile;
  let timerSettingsFile;
  let separateEvents = false;
  let alertPins = [];
  let appSettingsFile;
  let appSettings = { volume: 70, alertIntervals: [60], overlayShortcut: 'Control+Alt+O', goalShortcut: 'Control+Alt+G', goalFontSize: 100, timerFontSize: 100, noteFontSize: 100, overlayOpacity: 93, overlayGameOnly: true, overlaysVisible: true, colors: { background: '#15191d', text: '#e8e7df', accent: '#b8d99b', border: '#465056' } };
  function saveAppSettings(next) {
    // This small file is committed before another settings IPC or window close can run.
    // Replace it atomically so an interrupted write leaves the last good settings intact.
    const temporary = `${appSettingsFile}.tmp`;
    writeFileSync(temporary, JSON.stringify(next), 'utf8');
    renameSync(temporary, appSettingsFile);
    appSettings = next;
  }
  let overlaysVisible = true;
  let gameFocused = false;
  let focusWatcher;
  let focusRestartTimer;
  let quitting = false;
  let overlayLocksFile;
  let overlayLocks = { goal: false, timer: false, event: false, note: false };
  const overlayLockButtons = new WeakMap();
  const overlayMouseIgnored = new WeakMap();
  const overlayMoves = new WeakMap();
  let overlayHitTestTimer;
  const alerted = new Map();
  let timerSnapshot = [];
  let noteSnapshot = [];
  let captureProcess;
  let captureStatus = 'Off';
  function applyOverlayVisibility(visible) {
    if (visible !== appSettings.overlaysVisible) saveAppSettings({ ...appSettings, overlaysVisible: visible });
    overlaysVisible = visible;
    for (const window of [overlay, timerOverlay, eventOverlay, noteOverlay]) if (window && !window.isDestroyed()) { if (visible && (gameFocused || !appSettings.overlayGameOnly)) window.showInactive(); else window.hide(); }
    if (win && !win.isDestroyed()) win.webContents.send('overlay-visibility', visible);
    syncOverlayActivity();
  }
  function startFocusWatcher() {
    if (quitting || focusWatcher) return;
    const captureRoot = app.isPackaged ? __dirname.replace(/app\.asar(?=[\\/]|$)/, 'app.asar.unpacked') : __dirname;
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(captureRoot, 'capture/game-focus.ps1'), '-ParentProcessId', String(process.pid)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    focusWatcher = child;
    child.stderr.resume();
    createInterface({ input: child.stdout }).on('line', line => {
      if (focusWatcher !== child || !['game', 'other'].includes(line)) return;
      const next = line === 'game';
      if (gameFocused !== next) { gameFocused = next; applyOverlayVisibility(overlaysVisible); }
    });
    const restart = () => {
      if (focusWatcher !== child) return;
      focusWatcher = null; gameFocused = false;
      if (!quitting) focusRestartTimer = setTimeout(() => { focusRestartTimer = null; syncOverlayActivity(); }, 2000);
      applyOverlayVisibility(overlaysVisible);
    };
    child.on('error', restart);
    child.on('exit', restart);
  }
  function syncOverlayActivity() {
    const windows = [['goal', overlay], ['timer', timerOverlay], ['event', eventOverlay], ['note', noteOverlay]].filter(([, target]) => target && !target.isDestroyed());
    const needsFocus = !quitting && overlaysVisible && appSettings.overlayGameOnly && windows.length > 0;
    if (needsFocus && !focusWatcher && !focusRestartTimer) {
      focusRestartTimer = setTimeout(() => { focusRestartTimer = null; startFocusWatcher(); }, 300);
    } else if (!needsFocus) {
      clearTimeout(focusRestartTimer); focusRestartTimer = null;
      const child = focusWatcher; focusWatcher = null;
      if (child) child.kill();
      gameFocused = false;
    }
    const needsHitTest = !quitting && windows.some(([kind, target]) => overlayLocks[kind] && target.isVisible());
    if (!needsHitTest) { clearInterval(overlayHitTestTimer); overlayHitTestTimer = null; }
    else if (!overlayHitTestTimer) {
      overlayHitTestTimer = setInterval(() => {
        for (const [kind, target] of [['goal', overlay], ['timer', timerOverlay], ['event', eventOverlay], ['note', noteOverlay]]) {
          if (!overlayLocks[kind] || !target || target.isDestroyed() || !target.isVisible()) continue;
          syncOverlayMouse(target, kind);
        }
      }, 16);
    }
  }
  function syncOverlayMouse(window, kind, force = false) {
    if (!window || window.isDestroyed()) return;
    const rect = overlayLockButtons.get(window);
    let ignore = false;
    // Never make the whole window click-through before its unlock control is known.
    if (overlayLocks[kind] && rect) {
      const bounds = window.getContentBounds(), cursor = screen.getCursorScreenPoint();
      const zoom = window.webContents.getZoomFactor();
      const overButton = cursor.x >= bounds.x + rect.x * zoom - 4 && cursor.x < bounds.x + (rect.x + rect.width) * zoom + 4 && cursor.y >= bounds.y + rect.y * zoom - 4 && cursor.y < bounds.y + (rect.y + rect.height) * zoom + 4;
      ignore = !overButton;
    }
    if (force || overlayMouseIgnored.get(window) !== ignore) {
      // Forward movement so entering the unlock control can recover input even
      // if the native click-through state changed during a hide/show or resize.
      window.setIgnoreMouseEvents(ignore, { forward: true });
      overlayMouseIgnored.set(window, ignore);
    }
  }
  function watchOverlayActivity(window) {
    window.on('show', () => {
      syncOverlayMouse(window, overlayKindFor(window.webContents), true);
      syncOverlayActivity();
    });
    window.on('hide', () => { overlayMoves.delete(window); syncOverlayActivity(); });
    window.webContents.on('did-start-loading', () => {
      overlayLockButtons.delete(window);
      overlayMoves.delete(window);
      syncOverlayMouse(window, overlayKindFor(window.webContents), true);
    });
    window.on('resize', () => syncOverlayMouse(window, overlayKindFor(window.webContents), true));
    window.on('closed', syncOverlayActivity);
    syncOverlayActivity();
  }
  function applyOverlayLock(window, kind) {
    if (!window || window.isDestroyed()) return;
    const locked = overlayLocks[kind];
    overlayMoves.delete(window);
    window.setMovable(!locked);
    window.setResizable(!locked);
    syncOverlayMouse(window, kind, true);
    if (!window.webContents.isLoading()) window.webContents.send('overlay-lock-state', locked);
    syncOverlayActivity();
  }
  function overlayKindFor(contents) {
    for (const [kind, window] of [['goal', overlay], ['timer', timerOverlay], ['event', eventOverlay], ['note', noteOverlay]]) if (window && !window.isDestroyed() && window.webContents === contents) return kind;
    return null;
  }
  function registerShortcuts(settings) {
    const toggle = globalShortcut.register(settings.overlayShortcut, () => applyOverlayVisibility(!overlaysVisible));
    const increment = toggle && globalShortcut.register(settings.goalShortcut, () => { if (selectedGoalId) void adjustGoal(selectedGoalId, 1); });
    if (!toggle || !increment) { globalShortcut.unregister(settings.overlayShortcut); globalShortcut.unregister(settings.goalShortcut); return false; }
    return true;
  }
  function overlayAppearanceFor(contents) {
    return { fontSize: contents === overlay?.webContents ? appSettings.goalFontSize : contents === noteOverlay?.webContents ? appSettings.noteFontSize : appSettings.timerFontSize, opacity: appSettings.overlayOpacity };
  }
  function enforceOverlayMinimum(window, width, height) {
    if (!window || window.isDestroyed()) return;
    const bounds = window.getBounds();
    const minimum = window.getMinimumSize();
    if (minimum[0] !== width || minimum[1] !== height) window.setMinimumSize(width, height);
    const area = screen.getDisplayMatching(bounds).workArea;
    const nextWidth = Math.max(bounds.width, width), nextHeight = Math.max(bounds.height, height);
    const x = Math.min(Math.max(bounds.x, area.x), area.x + area.width - nextWidth);
    const y = Math.min(Math.max(bounds.y, area.y), area.y + area.height - nextHeight);
    const current = window.getBounds();
    if (current.width !== nextWidth || current.height !== nextHeight || current.x !== x || current.y !== y) window.setBounds({ x, y, width: nextWidth, height: nextHeight });
  }
  function publishOverlayAppearance() {
    const area = screen.getPrimaryDisplay().workArea;
    enforceOverlayMinimum(overlay, Math.min(600, Math.ceil(190 * appSettings.goalFontSize / 100)), Math.min(700, area.height - 20, Math.ceil((36 + goals.length * 34) * appSettings.goalFontSize / 100)));
    const bossCount = timerPins.filter(pin => pin.startsWith('boss:')).length;
    for (const [window, count] of [[timerOverlay, separateEvents ? bossCount : timerPins.length], [eventOverlay, timerPins.length - bossCount]]) enforceOverlayMinimum(window, Math.min(700, Math.ceil(195 * appSettings.timerFontSize / 100)), Math.min(700, area.height - 20, Math.ceil((36 + count * 32) * appSettings.timerFontSize / 100)));
    enforceOverlayMinimum(noteOverlay, Math.min(800, Math.ceil(200 * appSettings.noteFontSize / 100)), Math.min(700, area.height - 20, Math.ceil((32 + noteSnapshot.length * 52) * appSettings.noteFontSize / 100)));
    for (const window of [overlay, timerOverlay, eventOverlay, noteOverlay]) if (window && !window.isDestroyed() && !window.webContents.isLoading()) window.webContents.send('overlay-appearance', overlayAppearanceFor(window.webContents));
  }
  function createOverlay() {
    const area = screen.getPrimaryDisplay().workArea;
    const minimumWidth = Math.min(600, Math.ceil(190 * appSettings.goalFontSize / 100));
    const width = Number.isInteger(overlayPosition?.width) ? Math.max(minimumWidth, Math.min(600, overlayPosition.width)) : Math.max(minimumWidth, 204);
    const minimumHeight = Math.min(700, screen.getPrimaryDisplay().workArea.height - 20, Math.ceil((36 + goals.length * 34) * appSettings.goalFontSize / 100));
    const height = Number.isInteger(overlayPosition?.height) ? Math.max(minimumHeight, Math.min(700, overlayPosition.height)) : minimumHeight;
    const visible = overlayPosition && screen.getAllDisplays().some(display => overlayPosition.x >= display.workArea.x && overlayPosition.y >= display.workArea.y && overlayPosition.x + width <= display.workArea.x + display.workArea.width && overlayPosition.y + height <= display.workArea.y + display.workArea.height);
    overlay = new BrowserWindow({ width, height, minWidth: minimumWidth, minHeight: minimumHeight, x: visible ? overlayPosition.x : area.x + area.width - width - 20, y: visible ? overlayPosition.y : area.y + 20, frame: false, transparent: true, resizable: true, movable: true, focusable: false, skipTaskbar: true, show: false, alwaysOnTop: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    overlay.setAlwaysOnTop(true, 'screen-saver');
    watchOverlayActivity(overlay);
    applyOverlayLock(overlay, 'goal');
    const saveBounds = () => { overlayPosition = overlay.getBounds(); void fs.writeFile(overlayPositionFile, JSON.stringify(overlayPosition), 'utf8'); };
    overlay.on('move', saveBounds);
    overlay.on('resize', saveBounds);
    overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    overlay.webContents.on('will-navigate', event => event.preventDefault());
    overlay.loadFile(path.join(__dirname, 'ui/goal-overlay.html'));
    overlay.once('ready-to-show', () => { if (overlaysVisible && (gameFocused || !appSettings.overlayGameOnly)) overlay.showInactive(); });
    overlay.webContents.on('did-finish-load', () => { overlay.webContents.send('goal-state', goals); overlay.webContents.send('overlay-lock-state', overlayLocks.goal); });
  }
  function createTimerOverlay(kind) {
    const isEvent = kind === 'event';
    const area = screen.getPrimaryDisplay().workArea;
    const saved = isEvent ? eventOverlayPosition : timerOverlayPosition;
    const count = timerPins.filter(pin => isEvent ? !pin.startsWith('boss:') : !separateEvents || pin.startsWith('boss:')).length;
    const minimumWidth = Math.min(700, Math.ceil(195 * appSettings.timerFontSize / 100));
    const width = Number.isInteger(saved?.width) ? Math.max(minimumWidth, Math.min(700, saved.width)) : Math.max(minimumWidth, 248);
    const minimumHeight = Math.min(700, area.height - 20, Math.ceil((36 + count * 32) * appSettings.timerFontSize / 100));
    const height = Number.isInteger(saved?.height) ? Math.max(minimumHeight, Math.min(700, saved.height)) : minimumHeight;
    const visible = saved && screen.getAllDisplays().some(display => saved.x >= display.workArea.x && saved.y >= display.workArea.y && saved.x + width <= display.workArea.x + display.workArea.width && saved.y + height <= display.workArea.y + display.workArea.height);
    const instance = new BrowserWindow({ width, height, minWidth: minimumWidth, minHeight: minimumHeight, x: visible ? saved.x : area.x + area.width - width - 20, y: visible ? saved.y : area.y + (isEvent ? 180 : 95), frame: false, transparent: true, resizable: true, movable: true, focusable: false, skipTaskbar: true, show: false, alwaysOnTop: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
    if (isEvent) eventOverlay = instance; else timerOverlay = instance;
    instance.setAlwaysOnTop(true, 'screen-saver');
    watchOverlayActivity(instance);
    applyOverlayLock(instance, isEvent ? 'event' : 'timer');
    const saveBounds = () => {
      if (isEvent) { eventOverlayPosition = instance.getBounds(); void fs.writeFile(eventOverlayPositionFile, JSON.stringify(eventOverlayPosition), 'utf8'); }
      else { timerOverlayPosition = instance.getBounds(); void fs.writeFile(timerOverlayPositionFile, JSON.stringify(timerOverlayPosition), 'utf8'); }
    };
    instance.on('move', saveBounds);
    instance.on('resize', saveBounds);
    instance.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    instance.webContents.on('will-navigate', event => event.preventDefault());
    instance.loadFile(path.join(__dirname, 'ui/timer-overlay.html'), { query: { kind: isEvent ? 'event' : separateEvents ? 'boss' : 'all' } });
    instance.once('ready-to-show', () => { if (overlaysVisible && (gameFocused || !appSettings.overlayGameOnly)) instance.showInactive(); });
    instance.webContents.on('did-finish-load', () => { instance.webContents.send('timer-overlay-snapshot', timerSnapshot.filter(item => isEvent ? !item.key.startsWith('boss:') : !separateEvents || item.key.startsWith('boss:'))); instance.webContents.send('timer-alert-pins', alertPins); instance.webContents.send('overlay-lock-state', overlayLocks[isEvent ? 'event' : 'timer']); });
  }
  function syncTimerOverlays() {
    const bossCount = timerPins.filter(pin => pin.startsWith('boss:')).length;
    const eventCount = timerPins.length - bossCount;
    if (timerPins.length && (!separateEvents || bossCount)) { if (!timerOverlay) createTimerOverlay('timer'); }
    else if (timerOverlay) { timerOverlay.close(); timerOverlay = null; }
    if (separateEvents && eventCount) { if (!eventOverlay) createTimerOverlay('event'); }
    else if (eventOverlay) { eventOverlay.close(); eventOverlay = null; }
    for (const [window, count] of [[timerOverlay, separateEvents ? bossCount : timerPins.length], [eventOverlay, eventCount]]) {
      enforceOverlayMinimum(window, Math.min(700, Math.ceil(195 * appSettings.timerFontSize / 100)), Math.min(700, screen.getPrimaryDisplay().workArea.height - 20, Math.ceil((36 + count * 32) * appSettings.timerFontSize / 100)));
    }
    if (timerOverlay && !timerOverlay.isDestroyed() && !timerOverlay.webContents.isLoading()) timerOverlay.webContents.send('timer-overlay-snapshot', timerSnapshot.filter(item => !separateEvents || item.key.startsWith('boss:')));
    if (eventOverlay && !eventOverlay.isDestroyed() && !eventOverlay.webContents.isLoading()) eventOverlay.webContents.send('timer-overlay-snapshot', timerSnapshot.filter(item => !item.key.startsWith('boss:')));
  }
  function createNoteOverlay() {
    const area = screen.getPrimaryDisplay().workArea;
    const saved = noteOverlayPosition;
    const minimumWidth = Math.min(800, Math.ceil(200 * appSettings.noteFontSize / 100));
    const width = Number.isInteger(saved?.width) ? Math.max(minimumWidth, Math.min(800, saved.width)) : Math.max(minimumWidth, 260);
    const minimumHeight = Math.min(700, area.height - 20, Math.ceil((32 + noteSnapshot.length * 52) * appSettings.noteFontSize / 100));
    const height = Number.isInteger(saved?.height) ? Math.max(minimumHeight, Math.min(700, saved.height)) : Math.max(90, minimumHeight);
    const visible = saved && screen.getAllDisplays().some(display => saved.x >= display.workArea.x && saved.y >= display.workArea.y && saved.x + width <= display.workArea.x + display.workArea.width && saved.y + height <= display.workArea.y + display.workArea.height);
    noteOverlay = new BrowserWindow({ width, height, minWidth: minimumWidth, minHeight: minimumHeight, x: visible ? saved.x : area.x + area.width - width - 20, y: visible ? saved.y : area.y + 270, frame: false, transparent: true, resizable: true, movable: true, focusable: false, skipTaskbar: true, show: false, alwaysOnTop: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    noteOverlay.setAlwaysOnTop(true, 'screen-saver');
    watchOverlayActivity(noteOverlay);
    applyOverlayLock(noteOverlay, 'note');
    const saveBounds = () => { noteOverlayPosition = noteOverlay.getBounds(); void fs.writeFile(noteOverlayPositionFile, JSON.stringify(noteOverlayPosition), 'utf8'); };
    noteOverlay.on('move', saveBounds);
    noteOverlay.on('resize', saveBounds);
    noteOverlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    noteOverlay.webContents.on('will-navigate', event => event.preventDefault());
    noteOverlay.loadFile(path.join(__dirname, 'ui/note-overlay.html'));
    noteOverlay.once('ready-to-show', () => { if (overlaysVisible && (gameFocused || !appSettings.overlayGameOnly)) noteOverlay.showInactive(); });
    noteOverlay.webContents.on('did-finish-load', () => { noteOverlay.webContents.send('note-overlay-snapshot', noteSnapshot); noteOverlay.webContents.send('overlay-lock-state', overlayLocks.note); });
  }
  function publishGoals() {
    win.webContents.send('goal-state', goals);
    if (overlay && !overlay.webContents.isLoading()) overlay.webContents.send('goal-state', goals);
    enforceOverlayMinimum(overlay, Math.min(600, Math.ceil(190 * appSettings.goalFontSize / 100)), Math.min(700, screen.getPrimaryDisplay().workArea.height - 20, Math.ceil((36 + goals.length * 34) * appSettings.goalFontSize / 100)));
  }
  async function adjustGoal(itemId, amount) {
    const index = goals.findIndex(item => item.itemId === itemId);
    if (index < 0) return goals;
    goals[index] = { ...goals[index], current: Math.min(goals[index].target, Math.max(0, goals[index].current + amount)) };
    await fs.writeFile(goalFile, JSON.stringify(goals), 'utf8');
    publishGoals();
    return goals;
  }
  function stopCapture() {
    if (captureProcess) { captureProcess.kill(); captureProcess = null; }
    captureStatus = 'Off';
    if (win && !win.isDestroyed()) win.webContents.send('goal-capture-status', captureStatus);
  }
  function startCapture() {
    stopCapture();
    if (!goals.length) return;
    const ids = goals.map(item => item.itemId);
    if (!ids?.length) { captureStatus = 'No item ID for this resource'; win.webContents.send('goal-capture-status', captureStatus); return; }
    captureStatus = 'Connecting to local game traffic…';
    win.webContents.send('goal-capture-status', captureStatus);
    try {
      const captureRoot = app.isPackaged ? __dirname.replace(/app\.asar(?=[\\/]|$)/, 'app.asar.unpacked') : __dirname;
      const child = spawn(path.join(captureRoot, 'capture/goal-capture.exe'), [ids.join(',')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      captureProcess = child;
      child.stderr.resume();
      createInterface({ input: child.stdout }).on('line', line => {
        if (captureProcess !== child) return;
        try {
          const event = JSON.parse(line);
          if (event.type === 'status') {
            captureStatus = event.state === 'connected' ? 'Auto-count ready' : event.state === 'searching' ? 'Finding game…' : 'Npcap unavailable';
            win.webContents.send('goal-capture-status', captureStatus);
          }
          if (event.type === 'item' && goals.some(item => item.itemId === event.item) && event.kind <= 1 && event.count > 0) void adjustGoal(event.item, 1);
        } catch { /* Ignore malformed detector output. */ }
      });
      child.on('error', () => { if (captureProcess === child) { captureStatus = 'Detector unavailable · manual tracking'; win.webContents.send('goal-capture-status', captureStatus); captureProcess = null; } });
      child.on('exit', () => { if (captureProcess === child) { captureStatus = 'Detector stopped · manual tracking'; win.webContents.send('goal-capture-status', captureStatus); captureProcess = null; } });
    } catch { captureStatus = 'Detector unavailable · manual tracking'; win.webContents.send('goal-capture-status', captureStatus); }
  }
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    goalFile = path.join(app.getPath('userData'), 'gather-goal.json');
    overlayPositionFile = path.join(app.getPath('userData'), 'goal-overlay-position.json');
    timerPinsFile = path.join(app.getPath('userData'), 'pinned-timers.json');
    timerOverlayPositionFile = path.join(app.getPath('userData'), 'timer-overlay-position.json');
    eventOverlayPositionFile = path.join(app.getPath('userData'), 'event-overlay-position.json');
    noteOverlayPositionFile = path.join(app.getPath('userData'), 'note-overlay-position.json');
    timerSettingsFile = path.join(app.getPath('userData'), 'timer-overlay-settings.json');
    appSettingsFile = path.join(app.getPath('userData'), 'app-settings.json');
    overlayLocksFile = path.join(app.getPath('userData'), 'overlay-locks.json');
    try {
      const saved = JSON.parse(await fs.readFile(overlayLocksFile, 'utf8'));
      for (const kind of Object.keys(overlayLocks)) overlayLocks[kind] = saved[kind] === true;
    } catch { /* Overlays start unlocked. */ }
    try {
      const savedPosition = JSON.parse(await fs.readFile(overlayPositionFile, 'utf8'));
      if (Number.isInteger(savedPosition.x) && Number.isInteger(savedPosition.y)) overlayPosition = savedPosition;
    } catch { /* Use the default overlay position. */ }
    try {
      const savedPosition = JSON.parse(await fs.readFile(timerOverlayPositionFile, 'utf8'));
      if (Number.isInteger(savedPosition.x) && Number.isInteger(savedPosition.y)) timerOverlayPosition = savedPosition;
    } catch { /* Use the default timer overlay position. */ }
    try {
      const savedPosition = JSON.parse(await fs.readFile(eventOverlayPositionFile, 'utf8'));
      if (Number.isInteger(savedPosition.x) && Number.isInteger(savedPosition.y)) eventOverlayPosition = savedPosition;
    } catch { /* Use the default event overlay position. */ }
    try {
      const savedPosition = JSON.parse(await fs.readFile(noteOverlayPositionFile, 'utf8'));
      if (Number.isInteger(savedPosition.x) && Number.isInteger(savedPosition.y)) noteOverlayPosition = savedPosition;
    } catch { /* Use the default note overlay position. */ }
    try {
      const settings = JSON.parse(await fs.readFile(timerSettingsFile, 'utf8'));
      separateEvents = settings.separateEvents === true;
      if (Array.isArray(settings.alertPins)) alertPins = settings.alertPins.filter(pin => typeof pin === 'string' && /^(?:boss:(?:Verteron|Altgard):[a-z0-9-]{1,100}|event:(?:shugo|invasion|rift|battlefield)|abyss:(?:siege|watcher|nahma|argo|kaira|tamasa))$/.test(pin));
    } catch { /* Keep timers together by default. */ }
    try {
      const saved = JSON.parse(await fs.readFile(appSettingsFile, 'utf8'));
      for (const key of Object.keys(appSettings.colors)) if (/^#[0-9a-f]{6}$/i.test(saved.colors?.[key])) appSettings.colors[key] = saved.colors[key];
      if (typeof saved.overlayGameOnly === 'boolean') appSettings.overlayGameOnly = saved.overlayGameOnly;
      if (typeof saved.overlaysVisible === 'boolean') appSettings.overlaysVisible = saved.overlaysVisible;
      overlaysVisible = appSettings.overlaysVisible;
      if (Number.isInteger(saved.volume) && saved.volume >= 0 && saved.volume <= 100) appSettings.volume = saved.volume;
      if (Array.isArray(saved.alertIntervals) && saved.alertIntervals.length <= 4 && saved.alertIntervals.every(seconds => [300, 180, 60, 30].includes(seconds))) appSettings.alertIntervals = [300, 180, 60, 30].filter(seconds => saved.alertIntervals.includes(seconds));
      for (const key of ['goalFontSize', 'timerFontSize', 'noteFontSize']) if (Number.isInteger(saved[key]) && saved[key] >= 75 && saved[key] <= 175) appSettings[key] = saved[key];
      if (Number.isInteger(saved.overlayOpacity) && saved.overlayOpacity >= 0 && saved.overlayOpacity <= 100) appSettings.overlayOpacity = saved.overlayOpacity;
      for (const key of ['overlayShortcut', 'goalShortcut']) if (typeof saved[key] === 'string' && /^(?:(?:Control|Alt|Shift)\+){1,3}(?:[A-Z0-9]|F(?:[1-9]|1[0-2]))$/.test(saved[key])) appSettings[key] = saved[key];
    } catch { /* Use default preferences. */ }
    try {
      const savedPins = JSON.parse(await fs.readFile(timerPinsFile, 'utf8'));
      if (Array.isArray(savedPins)) timerPins = [...new Set(savedPins.filter(pin => typeof pin === 'string' && /^(?:boss:(?:Verteron|Altgard):[a-z0-9-]{1,100}|event:(?:shugo|invasion|rift|battlefield)|abyss:(?:siege|watcher|nahma|argo|kaira|tamasa))$/.test(pin)))].slice(0, 58);
    } catch { /* No pinned timers yet. */ }
    try {
      const saved = JSON.parse(await fs.readFile(goalFile, 'utf8'));
      if (Array.isArray(saved)) goals = [...new Map(saved.filter(item => item && itemVariants[item.resource]?.some(variant => variant.id === item.itemId) && Number.isInteger(item.target) && item.target >= 1 && item.target <= 99999 && Number.isInteger(item.current) && item.current >= 0 && item.current <= item.target).slice(0, 30).map(item => [item.itemId, { resource: item.resource, itemId: item.itemId, name: itemVariants[item.resource].find(variant => variant.id === item.itemId).name, target: item.target, current: item.current }])).values()];
      else if (saved && itemVariants[saved.resource] && Number.isInteger(saved.target) && saved.target >= 1 && saved.target <= 99999 && Number.isInteger(saved.current) && saved.current >= 0 && saved.current <= saved.target) {
        const variants = itemVariants[saved.resource].filter(item => saved.items?.includes(item.id));
        goals = (variants.length ? variants : itemVariants[saved.resource].slice(0, 1)).map((item, index) => ({ resource: saved.resource, itemId: item.id, name: item.name, target: saved.target, current: index === 0 ? saved.current : 0 }));
        await fs.writeFile(goalFile, JSON.stringify(goals), 'utf8');
      }
    } catch { /* No saved goal yet. */ }
    selectedGoalId = goals[0]?.itemId || null;
    win = new BrowserWindow({
      width: 1120, height: 790, minWidth: 520, minHeight: 600,
      title: 'Daeva Fieldbook', backgroundColor: appSettings.colors.background,
      icon: path.join(__dirname, 'ui/icon.png'),
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    win.on('closed', () => app.quit());
    if (goals.length) createOverlay();
    syncTimerOverlays();
    if (goals.length) startCapture();
    ipcMain.handle('goal-get', () => goals);
    ipcMain.handle('goal-variants-get', () => itemVariants);
    ipcMain.handle('goal-capture-status-get', () => captureStatus);
    ipcMain.handle('timer-pins-get', () => timerPins);
    ipcMain.handle('timer-separate-get', () => separateEvents);
    ipcMain.handle('timer-separate-set', async (_event, value) => {
      if (typeof value !== 'boolean') throw new Error('Invalid overlay setting');
      separateEvents = value;
      await fs.writeFile(timerSettingsFile, JSON.stringify({ separateEvents, alertPins }), 'utf8');
      if (timerOverlay) { timerOverlay.close(); timerOverlay = null; }
      if (eventOverlay) { eventOverlay.close(); eventOverlay = null; }
      syncTimerOverlays();
      return separateEvents;
    });
    ipcMain.handle('timer-pins-set', async (_event, next) => {
      if (!Array.isArray(next) || next.length > 58 || next.some(pin => typeof pin !== 'string' || !/^(?:boss:(?:Verteron|Altgard):[a-z0-9-]{1,100}|event:(?:shugo|invasion|rift|battlefield)|abyss:(?:siege|watcher|nahma|argo|kaira|tamasa))$/.test(pin))) throw new Error('Invalid timer pins');
      timerPins = [...new Set(next)];
      alertPins = alertPins.filter(pin => timerPins.includes(pin));
      await fs.writeFile(timerPinsFile, JSON.stringify(timerPins), 'utf8');
      await fs.writeFile(timerSettingsFile, JSON.stringify({ separateEvents, alertPins }), 'utf8');
      timerSnapshot = timerSnapshot.filter(item => timerPins.includes(item.key));
      syncTimerOverlays();
      for (const window of [timerOverlay, eventOverlay]) if (window && !window.isDestroyed()) window.webContents.send('timer-alert-pins', alertPins);
      return timerPins;
    });
    ipcMain.handle('timer-alert-toggle', async (event, key) => {
      if (![timerOverlay, eventOverlay].some(window => window && window.webContents === event.sender) || !timerPins.includes(key)) throw new Error('Invalid timer alert');
      alertPins = alertPins.includes(key) ? alertPins.filter(pin => pin !== key) : [...alertPins, key];
      await fs.writeFile(timerSettingsFile, JSON.stringify({ separateEvents, alertPins }), 'utf8');
      for (const window of [timerOverlay, eventOverlay]) if (window && !window.isDestroyed()) window.webContents.send('timer-alert-pins', alertPins);
      return alertPins;
    });
    ipcMain.on('timer-overlay-snapshot', (event, snapshot) => {
      if (event.sender !== win.webContents || !Array.isArray(snapshot)) return;
      timerSnapshot = snapshot.filter(item => item && timerPins.includes(item.key) && typeof item.name === 'string' && item.name.length <= 100 && typeof item.label === 'string' && item.label.length <= 80 && Number.isFinite(item.dueAt) && Number.isFinite(item.endAt)).slice(0, 58);
      syncTimerOverlays();
    });
    ipcMain.on('note-overlay-snapshot', (event, snapshot) => {
      if (event.sender !== win.webContents || !Array.isArray(snapshot)) return;
      noteSnapshot = snapshot.filter(item => item && typeof item.id === 'string' && /^[a-f0-9-]{36}$/i.test(item.id) && typeof item.title === 'string' && typeof item.body === 'string').slice(0, 20).map(item => ({ id: item.id, title: item.title.slice(0, 160), body: item.body.slice(0, 5000) }));
      if (noteSnapshot.length && !noteOverlay) createNoteOverlay();
      if (!noteSnapshot.length && noteOverlay) { noteOverlay.close(); noteOverlay = null; }
      enforceOverlayMinimum(noteOverlay, Math.min(800, Math.ceil(200 * appSettings.noteFontSize / 100)), Math.min(700, screen.getPrimaryDisplay().workArea.height - 20, Math.ceil((32 + noteSnapshot.length * 52) * appSettings.noteFontSize / 100)));
      if (noteOverlay && !noteOverlay.isDestroyed() && !noteOverlay.webContents.isLoading()) noteOverlay.webContents.send('note-overlay-snapshot', noteSnapshot);
    });
    ipcMain.on('overlay-content-min', (event, height) => {
      if (!noteOverlay || noteOverlay.webContents !== event.sender || !Number.isInteger(height)) return;
      enforceOverlayMinimum(noteOverlay, Math.min(800, Math.ceil(200 * appSettings.noteFontSize / 100)), Math.min(700, screen.getPrimaryDisplay().workArea.height - 20, Math.max(90, height)));
    });
    ipcMain.on('overlay-move', (event, phase) => {
      const kind = overlayKindFor(event.sender);
      if (!kind) return;
      const target = BrowserWindow.fromWebContents(event.sender);
      if (phase === 'end' || overlayLocks[kind] || !target.isVisible()) { overlayMoves.delete(target); return; }
      const cursor = screen.getCursorScreenPoint();
      if (phase === 'start') {
        const bounds = target.getBounds();
        overlayMoves.set(target, { x: bounds.x, y: bounds.y, cursorX: cursor.x, cursorY: cursor.y });
      } else if (phase === 'move') {
        const start = overlayMoves.get(target);
        if (start) target.setPosition(Math.round(start.x + cursor.x - start.cursorX), Math.round(start.y + cursor.y - start.cursorY));
      }
    });
    ipcMain.on('overlay-resize', (event, dimensions) => {
      const target = [overlay, timerOverlay, eventOverlay, noteOverlay].find(window => window && !window.isDestroyed() && window.webContents === event.sender);
      if (!target || overlayLocks[overlayKindFor(event.sender)] || !dimensions || !Number.isInteger(dimensions.width) || !Number.isInteger(dimensions.height)) return;
      const minWidth = target.getMinimumSize()[0];
      const minHeight = target.getMinimumSize()[1];
      const maxWidth = target === overlay ? 600 : target === noteOverlay ? 800 : 700;
      const maxHeight = 700;
      target.setSize(Math.max(minWidth, Math.min(maxWidth, dimensions.width)), Math.max(minHeight, Math.min(maxHeight, dimensions.height)));
    });
    ipcMain.handle('overlay-lock-get', event => {
      const kind = overlayKindFor(event.sender);
      if (!kind) throw new Error('Invalid overlay');
      return overlayLocks[kind];
    });
    ipcMain.handle('overlay-lock-toggle', async event => {
      const kind = overlayKindFor(event.sender);
      if (!kind) throw new Error('Invalid overlay');
      overlayLocks[kind] = !overlayLocks[kind];
      const target = { goal: overlay, timer: timerOverlay, event: eventOverlay, note: noteOverlay }[kind];
      applyOverlayLock(target, kind);
      publishOverlayAppearance();
      await fs.writeFile(overlayLocksFile, JSON.stringify(overlayLocks), 'utf8');
      return overlayLocks[kind];
    });
    ipcMain.on('overlay-lock-button-bounds', (event, rect) => {
      const kind = overlayKindFor(event.sender);
      if (!kind || !rect || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(rect[key])) || rect.width < 1 || rect.width > 64 || rect.height < 1 || rect.height > 64) return;
      const target = BrowserWindow.fromWebContents(event.sender);
      overlayLockButtons.set(target, rect);
      syncOverlayMouse(target, kind, true);
    });
    ipcMain.on('overlay-input-refresh', event => {
      const kind = overlayKindFor(event.sender);
      if (kind) syncOverlayMouse(BrowserWindow.fromWebContents(event.sender), kind, true);
    });
    ipcMain.handle('overlay-lock-clear', async event => {
      if (event.sender !== win.webContents) throw new Error('Invalid settings action');
      for (const kind of Object.keys(overlayLocks)) overlayLocks[kind] = false;
      for (const [kind, target] of [['goal', overlay], ['timer', timerOverlay], ['event', eventOverlay], ['note', noteOverlay]]) applyOverlayLock(target, kind);
      publishOverlayAppearance();
      await fs.writeFile(overlayLocksFile, JSON.stringify(overlayLocks), 'utf8');
      return true;
    });
    ipcMain.handle('goal-set', async (_event, next) => {
      if (next !== null && (!next || !itemVariants[next.resource] || !Number.isInteger(next.target) || next.target < 1 || next.target > 99999 || !Array.isArray(next.items) || next.items.length < 1 || next.items.length > itemVariants[next.resource].length || next.items.some(id => !Number.isInteger(id) || !itemVariants[next.resource].some(item => item.id === id)))) throw new Error('Invalid goal');
      if (next === null) goals = [];
      else for (const id of [...new Set(next.items)]) {
        const item = itemVariants[next.resource].find(variant => variant.id === id);
        const index = goals.findIndex(goal => goal.itemId === id);
        const row = { resource: next.resource, itemId: id, name: item.name, target: next.target, current: index >= 0 ? Math.min(next.target, goals[index].current) : 0 };
        if (index >= 0) goals[index] = row; else if (goals.length < 30) goals.push(row);
      }
      selectedGoalId = goals.some(item => item.itemId === selectedGoalId) ? selectedGoalId : goals[0]?.itemId || null;
      if (goals.length) await fs.writeFile(goalFile, JSON.stringify(goals), 'utf8'); else await fs.rm(goalFile, { force: true });
      if (goals.length && !overlay) createOverlay();
      if (!goals.length && overlay) { overlay.close(); overlay = null; }
      publishGoals();
      startCapture();
      return goals;
    });
    ipcMain.handle('goal-remove', async (_event, itemId) => {
      if (!Number.isInteger(itemId)) throw new Error('Invalid goal');
      goals = goals.filter(goal => goal.itemId !== itemId);
      selectedGoalId = goals.some(item => item.itemId === selectedGoalId) ? selectedGoalId : goals[0]?.itemId || null;
      if (goals.length) await fs.writeFile(goalFile, JSON.stringify(goals), 'utf8'); else await fs.rm(goalFile, { force: true });
      if (!goals.length && overlay) { overlay.close(); overlay = null; }
      publishGoals(); startCapture(); return goals;
    });
    ipcMain.handle('goal-adjust', async (_event, itemId, amount) => {
      if (!Number.isInteger(itemId) || !Number.isInteger(amount) || ![-1, 1].includes(amount)) return goals;
      return adjustGoal(itemId, amount);
    });
    ipcMain.handle('goal-select', (_event, itemId) => { if (goals.some(item => item.itemId === itemId)) selectedGoalId = itemId; return selectedGoalId; });
    ipcMain.handle('overlay-appearance-get', event => overlayAppearanceFor(event.sender));
    ipcMain.handle('theme-set', (event, colors) => {
      if (event.sender !== win?.webContents || !colors || !Object.keys(appSettings.colors).every(key => typeof colors[key] === 'string' && /^#[0-9a-f]{6}$/i.test(colors[key]))) throw new Error('Invalid theme colors');
      const palette = Object.fromEntries(Object.keys(appSettings.colors).map(key => [key, colors[key].toLowerCase()]));
      saveAppSettings({ ...appSettings, colors: palette });
      for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send('theme-colors', palette);
      return palette;
    });
    ipcMain.handle('settings-get', () => ({ ...appSettings, overlaysVisible }));
    ipcMain.handle('settings-set', (event, patch) => {
      if (event.sender !== win.webContents || !patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid settings');
      const next = { ...appSettings };
      for (const key of ['volume', 'alertIntervals', 'overlayShortcut', 'goalShortcut', 'goalFontSize', 'timerFontSize', 'noteFontSize', 'overlayOpacity', 'overlayGameOnly']) if (Object.hasOwn(patch, key)) next[key] = patch[key];
      if (!next || typeof next.overlayGameOnly !== 'boolean' || !Number.isInteger(next.volume) || next.volume < 0 || next.volume > 100 || !['goalFontSize', 'timerFontSize', 'noteFontSize'].every(key => Number.isInteger(next[key]) && next[key] >= 75 && next[key] <= 175) || !Number.isInteger(next.overlayOpacity) || next.overlayOpacity < 0 || next.overlayOpacity > 100 || !['overlayShortcut', 'goalShortcut'].every(key => typeof next[key] === 'string' && /^(?:(?:Control|Alt|Shift)\+){1,3}(?:[A-Z0-9]|F(?:[1-9]|1[0-2]))$/.test(next[key]) && (next[key].includes('Control+') || next[key].includes('Alt+'))) || next.overlayShortcut === next.goalShortcut) throw new Error('Invalid settings');
      const previous = appSettings;
      if (!Array.isArray(next.alertIntervals) || next.alertIntervals.length > 4 || next.alertIntervals.some(seconds => ![300, 180, 60, 30].includes(seconds))) throw new Error('Invalid alert intervals');
      next.alertIntervals = [300, 180, 60, 30].filter(seconds => next.alertIntervals.includes(seconds));
      if (next.overlayShortcut !== previous.overlayShortcut || next.goalShortcut !== previous.goalShortcut) {
        globalShortcut.unregister(previous.overlayShortcut); globalShortcut.unregister(previous.goalShortcut);
        if (!registerShortcuts(next)) { registerShortcuts(previous); throw new Error('Shortcut unavailable'); }
      }
      try { saveAppSettings(next); }
      catch (error) {
        if (next.overlayShortcut !== previous.overlayShortcut || next.goalShortcut !== previous.goalShortcut) {
          globalShortcut.unregister(next.overlayShortcut); globalShortcut.unregister(next.goalShortcut); registerShortcuts(previous);
        }
        throw error;
      }
      publishOverlayAppearance();
      applyOverlayVisibility(overlaysVisible);
      return { ...appSettings, overlaysVisible };
    });
    ipcMain.handle('overlay-visibility-set', (_event, visible) => { if (typeof visible !== 'boolean') throw new Error('Invalid visibility'); applyOverlayVisibility(visible); return overlaysVisible; });
    ipcMain.handle('alert-test', () => { win.webContents.send('alert-play', appSettings.volume); });
    registerShortcuts(appSettings);
    setInterval(() => {
      const now = Date.now();
      for (const item of timerSnapshot) {
        if (!alertPins.includes(item.key) || item.dueAt <= now) continue;
        const target = !item.key.startsWith('boss:') && separateEvents ? eventOverlay : timerOverlay;
        if (!target || target.isDestroyed()) continue;
        let history = alerted.get(item.key);
        if (!history || Math.abs(history.dueAt - item.dueAt) >= 120000) history = { dueAt: item.dueAt, intervals: new Set() };
        const reached = appSettings.alertIntervals.filter(seconds => item.dueAt - now <= seconds * 1000 && !history.intervals.has(seconds));
        if (!reached.length) continue;
        for (const seconds of reached) history.intervals.add(seconds);
        alerted.set(item.key, history);
        // Coalesce missed thresholds after starting late or waking from sleep.
        // Each later selected threshold still gets its own alert for this event.
        target.webContents.send('alert-play', appSettings.volume);
      }
    }, 1000);
    ipcMain.handle('update-get', event => {
      if (event.sender !== win.webContents) throw new Error('Invalid update request');
      return updateState;
    });
    ipcMain.handle('update-check', event => {
      if (event.sender !== win.webContents) throw new Error('Invalid update request');
      return checkForUpdate();
    });
    ipcMain.handle('update-download', async event => {
      if (event.sender !== win.webContents) throw new Error('Invalid update request');
      if (!app.isPackaged || updateDownloadPending || !updateState.availableVersion || !['available', 'error'].includes(updateState.status)) return updateState;
      updateDownloadPending = true;
      publishUpdateState({ status: 'downloading', percent: 0, message: 'Downloading update. The app will restart when it is ready.' });
      try {
        await autoUpdater.downloadUpdate();
        if (updateState.status !== 'ready') throw new Error('Download was not verified');
        publishUpdateState({ status: 'installing', message: 'Installing update and restarting…' });
        setTimeout(() => autoUpdater.quitAndInstall(true, true), 750);
      } catch { publishUpdateState({ status: 'error', message: 'The update could not be installed. Your current version is unchanged. Try again.' }); }
      finally { updateDownloadPending = false; }
      return updateState;
    });
    if (app.isPackaged) {
      win.webContents.once('did-finish-load', () => { setTimeout(() => void checkForUpdate(), 2500); });
      setInterval(() => void checkForUpdate(), 4 * 60 * 60 * 1000).unref();
    }
    ipcMain.handle('boss-feed', async () => {
      const response = await fetch('https://www.aion2timers.com/api/fieldboss.php?action=feed&server=naw-siel', {
        headers: { Accept: 'application/json', 'User-Agent': `DaevaFieldbook/${app.getVersion()}` },
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Boss feed unavailable');
      const body = await response.text();
      if (body.length > 100000) throw new Error('Boss feed too large');
      const payload = JSON.parse(body);
      if (payload?.ok !== true || !Number.isFinite(payload.now) || !payload.kills || typeof payload.kills !== 'object' || Array.isArray(payload.kills)) throw new Error('Invalid boss feed');
      const entries = {};
      for (const [id, item] of Object.entries(payload.kills)) {
        if (!/^(elyos|asmo)\d\d$/.test(id) || !item || !['up', 'dead'].includes(item.st)) continue;
        const reportAt = Number(item.ra || item.u || item.mu || 0);
        const since = Number(item.us || 0);
        const nextSpawn = Number(item.ns || 0);
        if (![reportAt, since, nextSpawn].every(Number.isFinite)) continue;
        entries[id] = {status:item.st, reportAt, since, nextSpawn, estimated:Boolean(item.est)};
      }
      if (Object.keys(entries).length === 0) throw new Error('Empty boss feed');
      return {server:'naw-siel',serverNow:payload.now,checkedAt:Date.now(),entries};
    });
    win.loadFile(path.join(__dirname, 'ui/index.html'));
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => { quitting = true; clearInterval(overlayHitTestTimer); clearTimeout(focusRestartTimer); if (focusWatcher) focusWatcher.kill(); globalShortcut.unregisterAll(); stopCapture(); });
}
