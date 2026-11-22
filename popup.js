// Kids A-Z 答案助手 - Popup
(function () {
  'use strict';

  const body = document.getElementById('body');
  const answerStringEl = document.getElementById('answerString');
  const openOptions = document.getElementById('openOptions');

  const autoCompletePanel = document.getElementById('autoCompletePanel');
  const autoCompleteBook = document.getElementById('autoCompleteBook');
  const autoCompleteSteps = document.getElementById('autoCompleteSteps');
  const startAutoComplete = document.getElementById('startAutoComplete');
  const cancelAutoComplete = document.getElementById('cancelAutoComplete');
  const autoCompleteStatusText = document.getElementById('autoCompleteStatusText');

  const downloadPanel = document.getElementById('downloadPanel');
  const downloadBook = document.getElementById('downloadBook');
  const downloadOptionsSummary = document.getElementById('downloadOptionsSummary');
  const startDownload = document.getElementById('startDownload');
  const downloadStatusText = document.getElementById('downloadStatusText');

  let autoCompleteBooks = [];
  let downloadBooks = [];
  let statusTimer = null;

  openOptions.addEventListener('click', function () {
    chrome.runtime.openOptionsPage();
  });

  // 检查当前标签页是否在 Kids A-Z 域名
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const tab = tabs[0];
    const isKidsAZ = tab && tab.url && tab.url.includes('www.kidsa-z.com');

    if (!isKidsAZ) {
      body.innerHTML =
        '<div class="empty"><div>请在 Kids A-Z 的测验页面使用此扩展</div></div>';
      answerStringEl.style.display = 'none';
      autoCompletePanel.hidden = true;
      return;
    }

    initAutoCompletePanel(tab);
    initDownloadPanel(tab);

    // 读取答案数据
    chrome.storage.local.get(
      { quizAnswers: null, enabled: true, quizAnswersEnabled: true },
      function (items) {
        if (!items.enabled) {
          body.innerHTML =
            '<div class="empty"><div>扩展已关闭<br />请在设置中打开“启用扩展（所有功能）”</div></div>';
          answerStringEl.style.display = 'none';
          return;
        }

        if (!items.quizAnswersEnabled) {
          body.innerHTML =
            '<div class="empty"><div>答题助手已关闭<br />请在设置中打开“自动获取测验答案”</div></div>';
          answerStringEl.style.display = 'none';
          return;
        }

        if (!items.quizAnswers || items.quizAnswers.length === 0) {
          body.innerHTML =
            '<div class="empty"><div>请打开一篇文章的测验页面<br />答案将自动显示在这里</div></div>';
          answerStringEl.style.display = 'none';
          return;
        }

        renderAnswers(items.quizAnswers);
      }
    );
  });

  function initAutoCompletePanel(tab) {
    chrome.storage.local.get(
      {
        enabled: true,
        autoCompleteEnabled: true,
        autoCompletePopupEnabled: true,
        autoCompleteRead: true,
        autoCompleteQuiz: true,
        autoCompleteListen: false,
        autoCompleteStatus: null,
      },
      function (items) {
        if (
          !items.enabled ||
          !items.autoCompleteEnabled ||
          !items.autoCompletePopupEnabled
        ) {
          autoCompletePanel.hidden = true;
          return;
        }

        autoCompletePanel.hidden = false;
        // 主页/书目页默认展开；测验页把答案放在前面
        autoCompletePanel.open = !/\/main\/Activity|\/quiz/i.test(tab.url || '');

        const steps = [];
        if (items.autoCompleteListen) steps.push('听');
        if (items.autoCompleteRead) steps.push('读');
        if (items.autoCompleteQuiz) steps.push('做 Quiz');
        autoCompleteSteps.textContent = steps.length
          ? '步骤：' + steps.join(' + ')
          : '尚未选择执行步骤';

        updateAutoCompleteStatus(items.autoCompleteStatus);
        loadAutoCompleteBooks(tab.id);

        if (!statusTimer) {
          statusTimer = setInterval(refreshAutoCompleteStatus, 1000);
        }
      }
    );
  }

  function loadAutoCompleteBooks(tabId) {
    chrome.tabs.sendMessage(
      tabId,
      { type: 'getAutoCompleteBooks' },
      function (response) {
        if (chrome.runtime.lastError || !response) {
          showAutoCompleteMessage('当前页面没有可用书目', true);
          return;
        }
        if (response.error) {
          showAutoCompleteMessage(response.error, true);
          return;
        }
        autoCompleteBooks = Array.isArray(response.books) ? response.books : [];
        if (!autoCompleteBooks.length) {
          showAutoCompleteMessage('没有找到可用的书', true);
          return;
        }

        autoCompleteBook.innerHTML = '';
        autoCompleteBooks.forEach(function (book, index) {
          const option = document.createElement('option');
          option.value = String(index);
          option.textContent =
            book.title + (book.level ? '（' + book.level + '）' : '');
          autoCompleteBook.appendChild(option);
        });
        startAutoComplete.disabled = false;
        showAutoCompleteMessage('');
      }
    );
  }

  function showAutoCompleteMessage(text, isError) {
    autoCompleteStatusText.textContent = text || '';
    autoCompleteStatusText.classList.toggle('error', !!isError);
  }

  function updateAutoCompleteStatus(status) {
    if (!status) {
      showAutoCompleteMessage('');
      cancelAutoComplete.hidden = true;
      return;
    }
    if (status.running) {
      showAutoCompleteMessage(
        '正在完成：' + (status.title || '') + ' — ' + (status.message || status.step || '')
      );
      cancelAutoComplete.hidden = false;
      startAutoComplete.disabled = true;
      return;
    }
    showAutoCompleteMessage(
      status.message || (status.success ? '已完成' : '未完成'),
      status.success === false
    );
    cancelAutoComplete.hidden = true;
    startAutoComplete.disabled = false;
  }

  function refreshAutoCompleteStatus() {
    chrome.storage.local.get({ autoCompleteStatus: null }, function (items) {
      updateAutoCompleteStatus(items.autoCompleteStatus);
    });
  }

  startAutoComplete.addEventListener('click', function () {
    const index = Number(autoCompleteBook.value);
    const book = autoCompleteBooks[index];
    if (!book) {
      showAutoCompleteMessage('请选择一本书', true);
      return;
    }

    startAutoComplete.disabled = true;
    showAutoCompleteMessage('正在启动…');
    chrome.runtime.sendMessage(
      { type: 'startAutoComplete', book: book },
      function (response) {
        if (chrome.runtime.lastError) {
          showAutoCompleteMessage(chrome.runtime.lastError.message, true);
          startAutoComplete.disabled = false;
          return;
        }
        if (!response || !response.ok) {
          showAutoCompleteMessage(
            (response && response.message) || '无法启动',
            true
          );
          startAutoComplete.disabled = false;
          return;
        }
        refreshAutoCompleteStatus();
      }
    );
  });

  cancelAutoComplete.addEventListener('click', function () {
    chrome.runtime.sendMessage({ type: 'cancelAutoComplete' }, function () {
      refreshAutoCompleteStatus();
    });
  });

  function initDownloadPanel(tab) {
    chrome.storage.local.get(
      {
        enabled: true,
        downloadEnabled: true,
        downloadPopupEnabled: true,
        downloadImages: true,
        downloadZip: false,
        downloadPdf: false,
        downloadAudio: false,
        downloadAudioMerge: true,
        audioSilenceSeconds: 0,
        downloadBundle: true,
        downloadSinglePageEnabled: true,
      },
      function (items) {
        if (
          !items.enabled ||
          !items.downloadEnabled ||
          !items.downloadPopupEnabled
        ) {
          downloadPanel.hidden = true;
          return;
        }

        downloadPanel.hidden = false;
        downloadStatusText.classList.remove('error');
        downloadStatusText.textContent = '';
        startDownload.disabled = true;

        const parts = [];
        if (items.downloadImages) parts.push('每页图片');
        if (items.downloadZip) parts.push('ZIP');
        if (items.downloadPdf) parts.push('PDF');
        if (items.downloadAudio) {
          parts.push(items.downloadAudioMerge ? '音频合并 WAV' : '音频分段 MP3');
        }
        if (
          items.downloadBundle &&
          items.downloadPdf &&
          items.downloadAudio &&
          items.downloadAudioMerge
        ) {
          parts.push('PDF+音频 ZIP');
        }
        if (items.downloadSinglePageEnabled) parts.push('单页下载');

        let summary = parts.length
          ? '输出：' + parts.join(' + ')
          : '尚未选择下载内容';
        if (
          items.downloadAudio &&
          Number(items.audioSilenceSeconds) > 0
        ) {
          summary += ' · 段间 ' + items.audioSilenceSeconds + 's';
        }
        downloadOptionsSummary.textContent = summary;
        loadDownloadBooks(tab.id);
      }
    );
  }

  function loadDownloadBooks(tabId) {
    chrome.tabs.sendMessage(
      tabId,
      { type: 'getDownloadBooks' },
      function (response) {
        if (chrome.runtime.lastError || !response) {
          showDownloadMessage('当前页面没有可用书目', true);
          return;
        }
        if (response.error) {
          showDownloadMessage(response.error, true);
          return;
        }
        downloadBooks = Array.isArray(response.books) ? response.books : [];
        if (!downloadBooks.length) {
          showDownloadMessage('没有找到可下载的书', true);
          return;
        }

        downloadBook.innerHTML = '';
        downloadBooks.forEach(function (book, index) {
          const option = document.createElement('option');
          option.value = String(index);
          option.textContent =
            book.title + (book.level ? '（' + book.level + '）' : '');
          downloadBook.appendChild(option);
        });
        startDownload.disabled = false;
        showDownloadMessage('');
      }
    );
  }

  function showDownloadMessage(text, isError) {
    downloadStatusText.textContent = text || '';
    downloadStatusText.classList.toggle('error', !!isError);
  }

  startDownload.addEventListener('click', function () {
    const index = Number(downloadBook.value);
    const book = downloadBooks[index];
    if (!book) {
      showDownloadMessage('请选择一本书', true);
      return;
    }

    startDownload.disabled = true;
    showDownloadMessage('正在启动下载…');
    chrome.runtime.sendMessage(
      { type: 'startDownload', book: book },
      function (response) {
        if (chrome.runtime.lastError) {
          showDownloadMessage(chrome.runtime.lastError.message, true);
          startDownload.disabled = false;
          return;
        }
        if (!response || !response.ok) {
          showDownloadMessage(
            (response && response.message) || '无法启动下载',
            true
          );
          startDownload.disabled = false;
          return;
        }
        showDownloadMessage('已开始下载，请查看浏览器的下载栏');
        startDownload.disabled = false;
      }
    );
  });
})();

function renderAnswers(answers) {
  const body = document.getElementById('body');
  const answerStringEl = document.getElementById('answerString');

  // 构建答案速写串：每 5 个一组，空格分隔
  const letters = answers.map(function (a) { return a.correctLetter || '?'; });
  const groups = [];
  for (let i = 0; i < letters.length; i += 5) {
    groups.push(letters.slice(i, i + 5).join(''));
  }
  answerStringEl.textContent = groups.join(' ');
  answerStringEl.style.display = '';

  // 渲染每题
  body.innerHTML = '';
  for (let i = 0; i < answers.length; i++) {
    const a = answers[i];
    const item = document.createElement('div');
    item.className = 'item';

    let choicesHTML = '<div class="choices">';
    const labels = 'ABCDEFGH';
    for (let j = 0; j < a.choices.length; j++) {
      const c = a.choices[j];
      const cls = c.isCorrect ? 'choice correct' : 'choice';
      choicesHTML +=
        '<div class="' + cls + '">' +
        labels[j] + '. ' + esc(c.text) +
        (c.isCorrect ? ' ✓' : '') +
        '</div>';
    }
    choicesHTML += '</div>';

    item.innerHTML =
      '<div class="q"><span class="q-num">' +
      (i + 1) +
      '.</span> ' +
      esc(a.question) +
      '</div>' +
      choicesHTML;
    body.appendChild(item);
  }
}

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
