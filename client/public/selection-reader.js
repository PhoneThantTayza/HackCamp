(() => {
  if (globalThis.clearspaceSelectionReader?.version === 5) return;
  const buttonSelector = 'button,[role="button"],input[type="button"],input[type="submit"],input[type="reset"]';
  const protectedArea = 'input,textarea,select,[role="textbox"],[contenteditable]:not([contenteditable="false"])';
  function activeControl(doc, path = []) {
    const target = path.find(node => node?.matches?.('input,textarea'));
    if (target) return target;
    // A native selection drag can end outside the field. The focused control still owns it.
    let element = doc.activeElement;
    while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
    return element?.matches?.('input,textarea') ? element : undefined;
  }
  function controlText(element) {
    const autocomplete = (element.getAttribute('autocomplete') ?? '').toLowerCase().split(/\s+/);
    if (element.matches('input') && !['text','search','tel','url'].includes(element.type)) return '';
    if (autocomplete.some(value => value.startsWith('cc-') || ['current-password','new-password','one-time-code'].includes(value))) return '';
    const start = element.selectionStart, end = element.selectionEnd;
    if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) return '';
    if (end - start > 32768) return ' '.repeat(32769); // Reject the selection without reading the whole value.
    return element.value.slice(start, end).trim();
  }
  function protectedNode(node) {
    let element = node?.nodeType === 1 ? node : node?.parentElement;
    while (element) {
      if (element.matches(protectedArea) || element.isContentEditable) return true;
      element = element.parentElement ?? element.getRootNode().host;
    }
    return false;
  }
  function selectionText(doc, path = []) {
    const control = activeControl(doc, path);
    if (control) return controlText(control);
    const shadow = path.find(node => node?.nodeType === 11 && node.getSelection);
    const selection = shadow?.getSelection() ?? doc.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount || protectedNode(selection.anchorNode) || protectedNode(selection.focusNode)) return '';
    for (let index = 0; index < selection.rangeCount; index++) {
      const range = selection.getRangeAt(index), common = range.commonAncestorContainer;
      const ancestor = common.nodeType === 1 ? common : common.parentElement;
      if (ancestor && [...ancestor.querySelectorAll(protectedArea)].some(element => range.intersectsNode(element))) return '';
    }
    return selection.toString().trim();
  }
  function selectionLanguage(doc, path) {
    const shadow = path.find(node => node?.nodeType === 11 && node.getSelection);
    const selection = shadow?.getSelection() ?? doc.getSelection();
    let element = activeControl(doc, path) ?? selection?.anchorNode;
    return elementLanguage(element, doc);
  }
  function elementLanguage(element, doc) {
    if (element?.nodeType !== 1) element = element?.parentElement;
    while (element) {
      const lang = element.getAttribute('lang');
      if (lang) return lang.slice(0, 80);
      element = element.parentElement ?? element.getRootNode().host;
    }
    return (doc.documentElement?.getAttribute('lang') ?? '').slice(0, 80);
  }
  function buttonLabel(element) {
    if (!element?.matches?.(buttonSelector)) return '';
    const clean = value => (value ?? '').replace(/\s+/g, ' ').trim().slice(0, 2000);
    const root = element.getRootNode();
    const referenced = (element.getAttribute('aria-labelledby') ?? '').trim().split(/\s+/).slice(0, 20)
      .map(id => root.getElementById?.(id)?.textContent ?? '').join(' ');
    if (clean(referenced)) return clean(referenced);
    if (clean(element.getAttribute('aria-label'))) return clean(element.getAttribute('aria-label'));
    if (element.matches('input')) return clean(element.value || element.getAttribute('title'));
    const view = element.ownerDocument.defaultView;
    const walker = element.ownerDocument.createTreeWalker(element, 5, {
      acceptNode(node) {
        if (node.nodeType === 1) {
          if (node.matches('script,style,template,[hidden],[aria-hidden="true"],input,textarea,select')) return 2;
          const style = view.getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden') return 2;
        }
        return 1;
      },
    });
    const parts = []; let node, visited = 0;
    while ((node = walker.nextNode()) && visited++ < 200) {
      if (node.nodeType === 3) parts.push(node.data);
      else if (node.matches('img')) parts.push(node.getAttribute('alt') ?? '');
    }
    return clean(parts.join(' ')) || clean(element.getAttribute('title'));
  }
  function createController(doc, api) {
    let active = false, timer, last = '', generation = 0, host, status, hideTimer, source;
    let buttonTarget, actionHost, buttonShortcut = false;
    const listeners = [];
    const listen = (target, type, fn, options) => { target.addEventListener(type, fn, options); listeners.push(() => target.removeEventListener(type, fn, options)); };
    const send = async message => {
      try { return await api.runtime.sendMessage(message); }
      catch { return { ok: false, message: 'Speech connection lost. Reload this page after reloading the extension.' }; }
    };
    function ownPath(path) { return path.includes(host) || path.includes(actionHost); }
    function focusedButton() {
      let element = doc.activeElement;
      while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
      return element?.matches?.(buttonSelector) && element !== actionHost ? element : undefined;
    }
    function clearAction() { actionHost?.remove(); actionHost = undefined; buttonTarget = undefined; }
    function offerButton(element) {
      if (!element?.isConnected || element.closest('[hidden],[aria-hidden="true"]')) { clearAction(); return; }
      if (buttonTarget === element && actionHost?.isConnected) return;
      clearAction(); buttonTarget = element;
      actionHost = doc.createElement('div'); actionHost.setAttribute('data-clearspace-button-reader', '');
      const shadow = actionHost.attachShadow({ mode: 'closed' }), style = doc.createElement('style');
      style.textContent = ':host{all:initial!important;position:fixed!important;bottom:18px!important;right:18px!important;z-index:2147483647!important}button{font:14px/1.5 system-ui;background:#191919;color:#fff;border:1px solid #aaa;border-radius:8px;padding:10px 14px;min-height:44px;max-width:calc(100vw - 36px);cursor:pointer}button:focus-visible{outline:3px solid #7db7ff;outline-offset:3px}';
      const action = doc.createElement('button'); action.type = 'button'; action.textContent = 'Read button label';
      action.setAttribute('aria-keyshortcuts', 'Alt+Shift+R'); action.title = 'Read this button without activating it (Alt+Shift+R)';
      action.addEventListener('click', () => { void readButton(buttonTarget); });
      shadow.append(style, action); doc.documentElement.append(actionHost);
    }
    async function readButton(element) {
      if (!active || !element?.isConnected || !element.matches(buttonSelector)) return;
      clearTimeout(timer); timer = undefined;
      const token = ++generation, text = buttonLabel(element);
      source = 'button'; last = '';
      if (!text) { stop(); show('This button has no readable label.'); return; }
      show('Preparing button label…', true);
      const result = await send({ type: 'clearspace:selection-read', text, languageHint: elementLanguage(element, doc), requestId: token });
      if (active && token === generation && !result?.ok && result?.message) show(result.message);
    }
    function show(message, reading = false) {
      if (!active || !message) return;
      if (!host?.isConnected) {
        host = doc.createElement('div');
        const shadow = host.attachShadow({ mode: 'closed' }), style = doc.createElement('style');
        style.textContent = ':host{all:initial!important;position:fixed!important;bottom:80px!important;right:18px!important;z-index:2147483647!important}div{font:14px/1.5 system-ui;color:#fff;background:#191919;border:1px solid #aaa;border-radius:10px;padding:12px;max-width:min(340px,85vw);box-shadow:0 2px 12px #0004}button{font:inherit;background:#fff;color:#111;border:0;border-radius:5px;padding:6px 12px;margin-left:10px;cursor:pointer}button:focus-visible{outline:3px solid #7db7ff;outline-offset:3px}';
        const box = doc.createElement('div'); status = doc.createElement('span'); status.setAttribute('role', 'status');
        const button = doc.createElement('button'); button.type = 'button'; button.textContent = 'Stop'; button.addEventListener('click', stop);
        box.append(status, button); shadow.append(style, box); doc.documentElement.append(host);
      }
      status.textContent = message;
      clearTimeout(hideTimer);
      if (!reading) hideTimer = setTimeout(() => { host?.remove(); host = undefined; }, 6000);
    }
    function stop() {
      generation++; clearTimeout(timer); timer = undefined; last = ''; source = undefined;
      void send({ type: 'clearspace:selection-stop' }); host?.remove(); host = undefined;
    }
    function schedule(event) {
      const path = event.composedPath();
      if (ownPath(path)) return;
      if (!event.isTrusted || !doc.hasFocus() || doc.visibilityState !== 'visible' ||
        (protectedNode(path[0]) && !activeControl(doc, path))) return;
      const token = ++generation;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (!active || token !== generation || !doc.hasFocus()) return;
        const text = selectionText(doc, path);
        if (!text) { if (source === 'selection' && last) stop(); return; }
        if (text === last && source === 'selection') return;
        if (text.length > 32768) { stop(); show('Select a shorter passage (under 32,768 characters).'); return; }
        last = text; source = 'selection'; show('Preparing selected text…', true);
        const result = await send({ type: 'clearspace:selection-read', text, languageHint: selectionLanguage(doc, path), requestId: token });
        if (!active || token !== generation) return;
        if (!result?.ok) { last = ''; if (result?.message) show(result.message); }
      }, 250);
    }
    function disable() {
      if (active) stop(); active = false; clearAction(); buttonShortcut = false;
      clearTimeout(timer); clearTimeout(hideTimer); listeners.splice(0).forEach(remove => remove());
      api.runtime.onMessage.removeListener(onStatus);
    }
    function onStatus(message) {
      if (message?.type === 'clearspace:speech-status' && message.requestId === generation) show(message.message, message.state === 'speaking');
    }
    function update(settings) {
      const next = settings?.version === 1 && settings.enabled === true && settings.dyslexia?.enabled !== false && settings.dyslexia?.experiences?.preferListening === true;
      if (next === active) return;
      disable(); if (!next) return; active = true;
      listen(doc, 'pointerup', schedule, { passive: true, capture: true });
      listen(doc, 'keyup', event => {
        if (buttonShortcut) { if (!event.altKey && !event.shiftKey) buttonShortcut = false; return; }
        if (event.key === 'Shift' || event.shiftKey || (event.key.toLowerCase() === 'a' && (event.ctrlKey || event.metaKey))) schedule(event);
      }, { capture: true });
      listen(doc, 'pointerover', event => {
        const path = event.composedPath(); if (ownPath(path)) return;
        const element = path.find(node => node.matches?.(buttonSelector)) ?? focusedButton();
        if (element) offerButton(element); else clearAction();
      }, { passive: true, capture: true });
      listen(doc, 'focusin', event => {
        const path = event.composedPath(); if (ownPath(path)) return;
        const element = path.find(node => node.matches?.(buttonSelector));
        if (element) offerButton(element); else clearAction();
      }, { capture: true });
      listen(doc, 'keydown', event => {
        if (event.key === 'Escape') { stop(); clearAction(); return; }
        if (!event.isTrusted || event.defaultPrevented || event.repeat || !event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey || event.key.toLowerCase() !== 'r') return;
        const path = event.composedPath();
        const element = (ownPath(path) ? undefined : path.find(node => node.matches?.(buttonSelector))) ?? buttonTarget;
        if (element?.isConnected) { buttonShortcut = true; event.preventDefault(); void readButton(element); }
      }, { capture: true });
      listen(doc, 'selectionchange', () => { if (source !== 'button' && !selectionText(doc) && (last || timer)) stop(); });
      listen(doc, 'focusout', event => { if (event.composedPath().some(node => node.matches?.('input,textarea'))) stop(); });
      listen(doc.defaultView, 'pagehide', () => { stop(); clearAction(); });
      listen(doc, 'visibilitychange', () => { if (doc.visibilityState !== 'visible') stop(); });
      api.runtime.onMessage.addListener(onStatus);
    }
    return { update, disable };
  }
  globalThis.clearspaceSelectionReader = { version: 5, createController, selectionText, selectionLanguage, buttonLabel };
})();
