/**
 * Strategy selection for opening DeepSeek's native `<input type="file">`.
 *
 * This lives in the generic file-flow layer because the caller is part of the
 * web attachment UI, even though one concrete strategy is Android-specific.
 *
 * Strategy pattern:
 * - default strategy: click the input as-is.
 * - Android single-file strategy: temporarily clear `multiple` so WebView
 *   requests a single-file chooser instead of the OEM multi-document flow.
 *
 * The caller only expresses intent (`preferSingle`); this module chooses the
 * appropriate native-picker strategy and keeps the platform workaround local.
 */

function clickNativeInput(nativeInput) {
  nativeInput.click();
  return true;
}

function openWithDefaultStrategy(nativeInput) {
  return clickNativeInput(nativeInput);
}

function openWithAndroidSingleFileStrategy(nativeInput) {
  const previousMultiple = nativeInput.multiple;
  try {
    nativeInput.multiple = false;
    return clickNativeInput(nativeInput);
  } finally {
    nativeInput.multiple = previousMultiple;
  }
}

function selectNativeFilePickerStrategy(nativeInput, { preferSingle = false } = {}) {
  if (preferSingle && nativeInput.multiple) {
    return openWithAndroidSingleFileStrategy;
  }

  return openWithDefaultStrategy;
}

export function openNativeFilePicker(nativeInput, options = {}) {
  if (!nativeInput) return false;

  const strategy = selectNativeFilePickerStrategy(nativeInput, options);
  return strategy(nativeInput);
}
