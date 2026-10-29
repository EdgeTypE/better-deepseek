const key = document.getElementById('key');
const status = document.getElementById('status');
const error = document.getElementById('error');
const buttons = [...document.querySelectorAll('button')];
async function action(name) {
  buttons.forEach(button => { button.disabled = true; }); error.textContent = '';
  try {
    const response = await chrome.runtime.sendMessage({ type: 'bds-official-web-settings', action: name, ...(name === 'save' ? { apiKey: key.value } : {}) });
    if (!response?.ok) throw new Error(response?.error || '设置操作失败 / Settings failed');
    key.value = '';
    status.textContent = response.data.configured ? '已配置密钥 / Key configured' : '未配置密钥 / No key configured';
  } catch (e) { error.textContent = e.message; }
  finally { buttons.forEach(button => { button.disabled = false; }); }
}
document.getElementById('save').addEventListener('click', () => action('save'));
document.getElementById('clear').addEventListener('click', () => action('clear'));
void action('status');
