// Selection lookup never reads form values or rewrites the page.
(() => {
  if (globalThis.clearspaceWordLookup?.version === 4) return;
  globalThis.clearspaceWordLookup?.dispose?.();
  const controllers = new Set();
  const enabled = settings => settings?.version === 1 && settings.enabled === true && settings.dyslexia?.enabled !== false && settings.dyslexia?.experiences?.unfamiliarWords === true;
  function selectionText(doc, path = []) {
    const protectedSelector = 'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]';
    function protectedNode(node) {
      let element = node?.nodeType === 1 ? node : node?.parentElement;
      while (element) {
        if (element.matches?.(protectedSelector) || element.isContentEditable) return true;
        element = element.parentElement ?? element.getRootNode?.().host;
      }
      return false;
    }
    if (path.some(protectedNode) || protectedNode(doc.activeElement)) return '';
    const root = path.find(node => node?.nodeType === 11 && node.getSelection);
    const selection = root?.getSelection() ?? doc.getSelection();
    if (!selection || selection.isCollapsed || protectedNode(selection.anchorNode) || protectedNode(selection.focusNode)) return '';
    const text = selection.toString().replace(/\s+/gu, ' ').trim();
    return text.length <= 120 && text.split(' ').length <= 8 && /\p{L}/u.test(text) ? text : '';
  }
  function createController(doc, api) {
    let active = false, timer, last = '', generation = 0, notice;
    function clear() { clearTimeout(timer); generation++; }
    function dismiss() { notice?.remove(); notice = undefined; }
    function failure(reason, text) {
      dismiss();
      notice = doc.createElement('div');
      notice.setAttribute('data-clearspace-lookup', '');
      notice.style.cssText = 'all:initial!important;position:fixed!important;right:16px!important;bottom:16px!important;z-index:2147483647!important;';
      const root = notice.attachShadow({ mode: 'closed' });
      const message = doc.createElement('p');
      message.setAttribute('role', 'alert');
      message.textContent = `Word lookup could not open automatically. ${reason || 'The extension did not respond. Reload Clearspace in chrome://extensions, then refresh this webpage.'}`;
      message.style.cssText = 'font:16px/1.5 Arial;background:#111;color:#fff;padding:16px;max-width:320px;border:1px solid #fff;border-radius:8px;';
      const close = doc.createElement('button');
      close.textContent = 'Dismiss'; close.addEventListener('click', dismiss);
      const lookup = doc.createElement('a');
      lookup.textContent = 'Open definition and pronunciation';
      lookup.href = `https://www.google.com/search?q=${encodeURIComponent(`${text} definition pronunciation`)}`;
      lookup.target = '_blank'; lookup.rel = 'noopener noreferrer';
      lookup.style.cssText = 'display:block;font:16px/1.5 Arial;background:#111;color:#fff;padding:12px;text-decoration:underline;';
      root.append(message, lookup, close); doc.documentElement.append(notice);
    }
    function schedule(event) {
      if (!active || !event.isTrusted || !doc.hasFocus() || doc.visibilityState !== 'visible') return;
      const path = event.composedPath();
      if (path.includes(notice)) return;
      clear(); const token = generation;
      timer = setTimeout(async () => {
        if (!active || token !== generation || !doc.hasFocus()) return;
        // A stale page listener must never turn a disabled preference into an error.
        if (api.storage?.local?.get) {
          try {
            const { settings } = await api.storage.local.get('settings');
            if (!enabled(settings)) { disable(); return; }
          } catch { disable(); return; }
          if (!active || token !== generation) return;
        }
        const text = selectionText(doc, path);
        if (!text) { last = ''; return; }
        if (text === last) return;
        last = text; dismiss();
        try {
          const response = await api.runtime.sendMessage({ type: 'clearspace:word-lookup', text });
          if (response?.cancelled) { disable(); return; }
          if (!response?.ok && active && token === generation) { last = ''; failure(response?.message, text); }
        } catch (error) {
          if (active && token === generation) {
            last = '';
            const disconnected = /context invalidated|receiving end does not exist|connection|message port/i.test(error?.message ?? '');
            if (disconnected) { disable(); return; }
            failure(error?.message, text);
          }
        }
      }, 350);
    }
    function key(event) {
      if (event.key === 'Escape') { clear(); dismiss(); return; }
      if (event.key === 'Shift' || event.shiftKey || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a')) schedule(event);
    }
    function selectionChanged() { if (doc.getSelection()?.isCollapsed) { clear(); last = ''; } }
    function disable() {
      active = false; clear(); last = ''; dismiss();
      doc.removeEventListener('pointerup', schedule, true);
      doc.removeEventListener('keyup', key, true);
      doc.removeEventListener('selectionchange', selectionChanged);
      doc.defaultView.removeEventListener('pagehide', disable);
      api.storage?.onChanged?.removeListener(settingsChanged);
      controllers.delete(disable);
    }
    function settingsChanged(changes, area) {
      if (area === 'local' && changes.settings && !enabled(changes.settings.newValue)) disable();
    }
    function update(settings) {
      const next = enabled(settings);
      if (next === active) return;
      disable(); if (!next) return; active = true;
      controllers.add(disable);
      api.storage?.onChanged?.addListener(settingsChanged);
      doc.addEventListener('pointerup', schedule, { capture: true, passive: true });
      doc.addEventListener('keyup', key, true);
      doc.addEventListener('selectionchange', selectionChanged);
      doc.defaultView.addEventListener('pagehide', disable);
    }
    return { update, disable };
  }
  globalThis.clearspaceWordLookup = { version: 4, createController, selectionText, dispose: () => [...controllers].forEach(disable => disable()) };
})();
