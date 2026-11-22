// Kids A-Z 答案助手 - 一键完成调度
// 读取步骤配置，依次打开 Read / Listen / Quiz 活动页，由内容脚本执行具体操作。

const DEFAULTS = {
  enabled: true,
  autoCompleteEnabled: true,
  autoCompleteRead: true,
  autoCompleteQuiz: true,
  autoCompleteListen: false,
  readingSecondsPerPage: 10,
};

const DOWNLOAD_DEFAULTS = {
  enabled: true,
  downloadEnabled: true,
  downloadImages: true,
  downloadZip: false,
  downloadPdf: false,
  downloadAudio: false,
  downloadAudioMerge: true,
  audioSilenceSeconds: 0,
  downloadBundle: true,
};

function storageGet(keys) {
  return new Promise(function (resolve) {
    chrome.storage.local.get(keys, resolve);
  });
}

function storageSet(items) {
  return new Promise(function (resolve) {
    chrome.storage.local.set(items, resolve);
  });
}

function setStatus(status) {
  return storageSet({
    autoCompleteStatus: Object.assign({ updatedAt: Date.now() }, status),
  });
}

function activityUrl(book, step) {
  const id = book[step + 'Id'];
  if (!id) return null;
  let path = '/main/Activity/id/' + id;
  if (book.collectionId) {
    path += '/collectionId/' + book.collectionId;
  }
  return 'https://www.kidsa-z.com' + path;
}

function chooseSteps(settings, book) {
  const steps = [];

  if (
    settings.autoCompleteListen &&
    book.listenId &&
    !book.listenCompleted
  ) {
    steps.push('listen');
  }
  if (settings.autoCompleteRead && book.readId && !book.readCompleted) {
    steps.push('read');
  }
  if (settings.autoCompleteQuiz && book.quizId && !book.quizCompleted) {
    steps.push('quiz');
  }

  // Quiz 在 Read 完成前是锁定的；即使用户没勾 Read，也补上前置步骤
  if (
    steps.indexOf('quiz') >= 0 &&
    book.readId &&
    !book.readCompleted &&
    steps.indexOf('read') < 0
  ) {
    steps.unshift('read');
  }

  return steps;
}

async function finishTask(message, success) {
  const { autoCompleteTask } = await storageGet({ autoCompleteTask: null });
  if (autoCompleteTask) {
    autoCompleteTask.status = success ? 'done' : 'error';
    await storageSet({ autoCompleteTask });
  }
  await setStatus({
    running: false,
    success: !!success,
    step: null,
    message: message,
  });
}

async function runStep(task, index) {
  if (!task || task.status !== 'running') return;

  if (index >= task.steps.length) {
    await finishTask('已完成：' + task.title, true);
    return;
  }

  const step = task.steps[index];
  const url = activityUrl(task.book, step);
  if (!url) {
    await runStep(task, index + 1);
    return;
  }

  task.stepIndex = index;
  task.currentStep = step;
  task.tabId = null;
  await storageSet({ autoCompleteTask: task });

  const labels = { listen: 'Listen', read: 'Read', quiz: 'Quiz' };
  await setStatus({
    running: true,
    success: null,
    title: task.title,
    step: step,
    message: '正在完成 ' + (labels[step] || step) + '…',
  });

  chrome.tabs.create({ url: url, active: false }, function (tab) {
    if (chrome.runtime.lastError || !tab) {
      finishTask('无法打开活动页：' + (chrome.runtime.lastError || ''), false);
      return;
    }
    task.tabId = tab.id;
    storageSet({ autoCompleteTask: task });
  });
}

async function startTask(book) {
  const settings = await storageGet(DEFAULTS);

  if (!settings.enabled || !settings.autoCompleteEnabled) {
    return { ok: false, message: '一键完成已关闭' };
  }
  if (!book || !book.title) {
    return { ok: false, message: '没有选择书' };
  }

  const steps = chooseSteps(settings, book);
  if (!steps.length) {
    return { ok: false, message: '所选步骤已完成或不可用' };
  }

  const task = {
    title: book.title,
    book: book,
    steps: steps,
    stepIndex: 0,
    currentStep: null,
    secondsPerPage: Math.max(
      1,
      Math.min(60, Number(settings.readingSecondsPerPage) || 10)
    ),
    status: 'running',
    startedAt: Date.now(),
    tabId: null,
  };

  await storageSet({ autoCompleteTask: task });
  await setStatus({
    running: true,
    success: null,
    title: book.title,
    step: steps[0],
    message: '正在完成 ' + steps[0] + '…',
  });
  runStep(task, 0);
  return { ok: true, steps: steps };
}

async function handleStepDone(message) {
  const { autoCompleteTask } = await storageGet({ autoCompleteTask: null });
  if (!autoCompleteTask || autoCompleteTask.status !== 'running') {
    return { ok: false };
  }
  if (message.step !== autoCompleteTask.currentStep) {
    return { ok: false };
  }

  if (!message.success) {
    await finishTask(message.message || '步骤失败', false);
    return { ok: true };
  }

  const nextIndex = autoCompleteTask.stepIndex + 1;
  if (nextIndex >= autoCompleteTask.steps.length) {
    await finishTask('已完成：' + autoCompleteTask.title, true);
    return { ok: true };
  }

  const nextStep = autoCompleteTask.steps[nextIndex];
  const delay =
    autoCompleteTask.currentStep === 'read' && nextStep === 'quiz'
      ? 3500
      : 600;

  await setStatus({
    running: true,
    success: null,
    title: autoCompleteTask.title,
    step: nextStep,
    message:
      autoCompleteTask.currentStep +
      ' 完成，准备 ' +
      nextStep +
      '…',
  });

  setTimeout(function () {
    runStep(autoCompleteTask, nextIndex);
  }, delay);
  return { ok: true };
}

async function cancelTask(message) {
  const { autoCompleteTask } = await storageGet({ autoCompleteTask: null });
  if (autoCompleteTask && autoCompleteTask.tabId) {
    chrome.tabs.remove(autoCompleteTask.tabId, function () {
      void chrome.runtime.lastError;
    });
  }
  await storageSet({ autoCompleteTask: null });
  await setStatus({
    running: false,
    success: false,
    step: null,
    message: message || '已取消',
  });
}

async function startDownload(book) {
  const settings = await storageGet(DOWNLOAD_DEFAULTS);

  if (!settings.enabled || !settings.downloadEnabled) {
    return { ok: false, message: '下载功能已关闭' };
  }
  if (!book || !book.title) {
    return { ok: false, message: '没有选择书' };
  }
  if (
    !settings.downloadImages &&
    !settings.downloadZip &&
    !settings.downloadPdf &&
    !settings.downloadAudio
  ) {
    return { ok: false, message: '未选择任何下载内容' };
  }

  let path = null;
  if (book.listenId) {
    path = '/main/Activity/id/' + book.listenId;
  } else if (book.readId) {
    path = '/main/Activity/id/' + book.readId;
  }
  if (!path) {
    return { ok: false, message: '这本书没有可下载的活动' };
  }
  if (book.collectionId) {
    path += '/collectionId/' + book.collectionId;
  }

  const task = {
    book: book,
    settings: settings,
    tabId: null,
    startedAt: Date.now(),
  };
  await storageSet({ downloadTask: task });

  chrome.tabs.create(
    { url: 'https://www.kidsa-z.com' + path, active: false },
    function (tab) {
      if (chrome.runtime.lastError || !tab) {
        storageSet({ downloadTask: null });
      }
    }
  );

  return { ok: true };
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunk)
    );
  }
  return btoa(binary);
}

async function handleDownloadFetch(url) {
  try {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
      return { error: 'HTTP ' + response.status };
    }
    const buffer = await response.arrayBuffer();
    return { base64: toBase64(buffer) };
  } catch (error) {
    return { error: String(error && error.message || error) };
  }
}

const pendingDownloadNames = new Map();

async function handleDownloadData(base64, filename, mime) {
  return await new Promise(function (resolve) {
    const url =
      'data:' +
      (mime || 'application/octet-stream') +
      ';base64,' +
      base64;
    pendingDownloadNames.set(url, filename);

    chrome.downloads.download(
      {
        url: url,
        filename: filename,
        conflictAction: 'uniquify',
        saveAs: false,
      },
      function (downloadId) {
        if (chrome.runtime.lastError) {
          pendingDownloadNames.delete(url);
          resolve({ error: chrome.runtime.lastError.message });
          return;
        }
        resolve({ ok: true, id: downloadId });
      }
    );
  });
}

chrome.downloads.onDeterminingFilename.addListener(function (item, suggest) {
  if (item && item.url && pendingDownloadNames.has(item.url)) {
    const filename = pendingDownloadNames.get(item.url);
    pendingDownloadNames.delete(item.url);
    suggest({ filename: filename, conflictAction: 'uniquify' });
    return;
  }
  suggest();
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || !message.type) return;

  if (message.type === 'startAutoComplete') {
    startTask(message.book).then(sendResponse);
    return true;
  }
  if (message.type === 'startDownload') {
    startDownload(message.book).then(sendResponse);
    return true;
  }
  if (message.type === 'downloadFetch') {
    handleDownloadFetch(message.url).then(sendResponse);
    return true;
  }
  if (message.type === 'downloadData') {
    handleDownloadData(
      message.base64,
      message.filename,
      message.mime
    ).then(sendResponse);
    return true;
  }
  if (message.type === 'autoCompleteStepDone') {
    handleStepDone(message).then(sendResponse);
    return true;
  }
  if (message.type === 'getAutoCompleteStatus') {
    storageGet({ autoCompleteStatus: null }).then(function (items) {
      sendResponse(items.autoCompleteStatus);
    });
    return true;
  }
  if (message.type === 'cancelAutoComplete') {
    cancelTask().then(function () {
      sendResponse({ ok: true });
    });
    return true;
  }
});

chrome.storage.onChanged.addListener(function (changes) {
  if (
    (changes.enabled && changes.enabled.newValue === false) ||
    (changes.autoCompleteEnabled && changes.autoCompleteEnabled.newValue === false)
  ) {
    cancelTask('已关闭');
  }
});
