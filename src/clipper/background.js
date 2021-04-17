const apiUrl = 'http://localhost:5454';

let lastSubmittedItem = undefined;

let errCount = 0;

///////////////////////////////////
// Communication to Allusion app //
///////////////////////////////////
async function importImage(filename, url) {
  // We could just send the URL, but in some cases you need permission to view an image (e.g. pixiv)
  // Therefore we send it base64 encoded

  try {
    // Note: Google extensions don't work with promises, so we'll have to put up with callbacks here and there
    // Todo: url might already be base64
    const { base64, blob } = await imageAsBase64(url);

    let filenameWithExtension = filename;
    const extension = blob.type.split('/')[1];
    if (!filenameWithExtension.endsWith(extension)) {
      filenameWithExtension = `${filename}.${extension}`;
    }

    const item = {
      filename: filenameWithExtension,
      url,
      imgBase64: base64,
      tagNames: [],
    };

    lastSubmittedItem = item;

    await fetch(`${apiUrl}/import-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(item),
    });

    // no notification when it works as intended
    // show a badge instead. Resets when opening popup
    chrome.browserAction.setBadgeBackgroundColor({ color: '#147df1; /* rgb(51, 153, 255); */' });
    chrome.browserAction.setBadgeText({ text: '1' });
  } catch (e) {
    console.error(e);

    chrome.notifications.create('import-error-' + errCount++, {
      type: 'basic',
      iconUrl: 'favicon_32x32.png',
      title: 'Allusion Clipper',
      message: 'Could not import image. Is Allusion running?',
      buttons: [{ title: 'Retry' }],
    });

    chrome.browserAction.setBadgeBackgroundColor({ color: 'rgb(250, 52, 37)' });
    chrome.browserAction.setBadgeText({ text: '1' });

    lastSubmittedItem.error = true;
  }
}

function imageAsBase64(url) {
  return new Promise(async (resolve, reject) => {
    const response = await fetch(url);
    const blob = await response.blob();
    const reader = new FileReader();

    reader.onerror = reject;
    reader.onload = () => resolve({ base64: reader.result, blob });
    reader.readAsDataURL(blob);
  });
}

////////////////////////////////
// Context menu ////////////////
////////////////////////////////
function setupContextMenus() {
  // Todo: Disable context menu (or change text) when allusion is not open
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create(
      {
        title: 'Add to Allusion',
        id: 'add-image',
        // Todo: Could add page, then look though clicked element to find image (for instagram, they put an invisible div on top of images...)
        contexts: ['image'],
      },
      (...args) => console.log('created context menu', ...args),
    );
  });
}

// Initialize
chrome.runtime.onInstalled.addListener(() => {
  setupContextMenus();
});

// Communication with popup script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'setTags' && lastSubmittedItem !== undefined) {
    const tagNames = msg.tagNames;

    lastSubmittedItem.tagNames = tagNames;

    fetch(`${apiUrl}/set-tags`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tagNames,
        filename: lastSubmittedItem.filename,
      }),
    })
      .then(() => sendResponse(true))
      .catch(() => sendResponse(false));
    return true;
  } else if (msg.type === 'getLastSubmittedItem') {
    sendResponse(lastSubmittedItem);

    // reset badge text (that showed an image was imported)
    chrome.browserAction.setBadgeText({ text: undefined });
    return true;
  } else if (msg.type === 'getTags') {
    fetch(`${apiUrl}/tags`)
      .then((res) => {
        res
          .json()
          .then((tags) => sendResponse(tags.map((t) => t.name) || []))
          .catch(() => sendResponse([]));
      })
      .catch(() => sendResponse([]));
    return true;
  }
});

chrome.contextMenus.onClicked.addListener(async (props, tab) => {
  const srcUrl = props.srcUrl;

  // Get the filename from the url
  let filename = srcUrl.split('/').pop().split('#')[0].split('?')[0];

  // If the url is purely data or there is no extension, use a fallback (tab title)
  if (srcUrl.startsWith('data:image/') || filename.indexOf('.') === -1) {
    filename = tab.title;
  } else {
    filename = filename.substr(0, filename.indexOf('.')); // strip extension
  }

  importImage(filename, srcUrl);

  // Otherwise: https://stackoverflow.com/questions/7703697/how-to-retrieve-the-element-where-a-contextmenu-has-been-executed
});

chrome.notifications.onButtonClicked.addListener((id, buttonIndex) => {
  // retry importing image
  console.log('Clicked notification button', id, buttonIndex, lastSubmittedItem);
  if (id.startsWith('import-error') && buttonIndex === 0 && lastSubmittedItem) {
    importImage(lastSubmittedItem.filename, lastSubmittedItem.url);
  }
});
