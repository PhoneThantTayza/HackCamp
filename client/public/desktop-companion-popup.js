const status = document.querySelector('#status');
chrome.storage.local.get('desktopStatus').then(value => { status.textContent = value.desktopStatus || 'Not connected.'; });
chrome.storage.onChanged.addListener(changes => { if (changes.desktopStatus) status.textContent = changes.desktopStatus.newValue; });
document.querySelector('#connect').addEventListener('click', async () => {
  try {
    if (!await chrome.permissions.request({ origins: ['http://*/*', 'https://*/*'] })) { status.textContent = 'Website permission was declined.'; return; }
    const result = await chrome.runtime.sendMessage({ type: 'desktop:connect' });
    if (result.error) status.textContent = result.error;
  } catch (e) { status.textContent = e.message; }
});
document.querySelector('#disconnect').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'desktop:disconnect' }));
