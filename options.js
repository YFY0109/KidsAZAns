// Kids A-Z 答案助手 - 设置页面
(function () {
  'use strict';

  const toggleEnabled = document.getElementById('toggleEnabled');
  const toggleQuizAnswers = document.getElementById('toggleQuizAnswers');
  const toggleHighlight = document.getElementById('toggleHighlight');
  const toggleIgnoreReadingPace = document.getElementById('toggleIgnoreReadingPace');

  const toggleAutoComplete = document.getElementById('toggleAutoComplete');
  const toggleAutoCompleteCard = document.getElementById('toggleAutoCompleteCard');
  const toggleAutoCompletePopup = document.getElementById('toggleAutoCompletePopup');
  const toggleAutoCompleteListen = document.getElementById('toggleAutoCompleteListen');
  const toggleAutoCompleteRead = document.getElementById('toggleAutoCompleteRead');
  const toggleAutoCompleteQuiz = document.getElementById('toggleAutoCompleteQuiz');
  const readingSecondsPerPage = document.getElementById('readingSecondsPerPage');
  const autoCompleteOptions = document.getElementById('autoCompleteOptions');

  const toggleDownload = document.getElementById('toggleDownload');
  const toggleDownloadCard = document.getElementById('toggleDownloadCard');
  const toggleDownloadPopup = document.getElementById('toggleDownloadPopup');
  const toggleDownloadImages = document.getElementById('toggleDownloadImages');
  const toggleDownloadZip = document.getElementById('toggleDownloadZip');
  const toggleDownloadPdf = document.getElementById('toggleDownloadPdf');
  const toggleDownloadAudio = document.getElementById('toggleDownloadAudio');
  const toggleDownloadAudioMerge = document.getElementById('toggleDownloadAudioMerge');
  const toggleDownloadBundle = document.getElementById('toggleDownloadBundle');
  const toggleDownloadSinglePage = document.getElementById('toggleDownloadSinglePage');
  const downloadSilenceSeconds = document.getElementById('downloadSilenceSeconds');
  const downloadOptions = document.getElementById('downloadOptions');

  const toggleAutoLogin = document.getElementById('toggleAutoLogin');

  const teacherUsername = document.getElementById('teacherUsername');
  const studentName = document.getElementById('studentName');
  const studentPassword = document.getElementById('studentPassword');
  const saveAutoLogin = document.getElementById('saveAutoLogin');
  const clearAutoLogin = document.getElementById('clearAutoLogin');

  const saved = document.getElementById('saved');
  const version = document.getElementById('version');
  const featureGroups = document.querySelectorAll('.feature-group');

  let hasStoredPassword = false;
  let savedTimer = null;

  version.textContent = 'v' + chrome.runtime.getManifest().version;

  // 读取当前状态
  chrome.storage.local.get(
    {
      enabled: true,
      quizAnswersEnabled: true,
      highlightEnabled: false,
      ignoreReadingPace: true,
      autoCompleteEnabled: true,
      autoCompleteCardEnabled: true,
      autoCompletePopupEnabled: true,
      autoCompleteRead: true,
      autoCompleteQuiz: true,
      autoCompleteListen: false,
      readingSecondsPerPage: 10,
      downloadEnabled: true,
      downloadCardEnabled: true,
      downloadPopupEnabled: true,
      downloadImages: true,
      downloadZip: false,
      downloadPdf: false,
      downloadAudio: false,
      downloadAudioMerge: true,
      audioSilenceSeconds: 0,
      downloadBundle: true,
      downloadSinglePageEnabled: true,
      autoLoginEnabled: false,
      teacherUsername: '',
      studentName: '',
      studentPassword: '',
    },
    function (items) {
      toggleEnabled.checked = items.enabled;
      toggleQuizAnswers.checked = items.quizAnswersEnabled;
      toggleHighlight.checked = items.highlightEnabled;
      toggleIgnoreReadingPace.checked = items.ignoreReadingPace;
      toggleAutoComplete.checked = items.autoCompleteEnabled;
      toggleAutoCompleteCard.checked = items.autoCompleteCardEnabled;
      toggleAutoCompletePopup.checked = items.autoCompletePopupEnabled;
      toggleAutoCompleteListen.checked = items.autoCompleteListen;
      toggleAutoCompleteRead.checked = items.autoCompleteRead;
      toggleAutoCompleteQuiz.checked = items.autoCompleteQuiz;
      readingSecondsPerPage.value = items.readingSecondsPerPage;

      toggleDownload.checked = items.downloadEnabled;
      toggleDownloadCard.checked = items.downloadCardEnabled;
      toggleDownloadPopup.checked = items.downloadPopupEnabled;
      toggleDownloadImages.checked = items.downloadImages;
      toggleDownloadZip.checked = items.downloadZip;
      toggleDownloadPdf.checked = items.downloadPdf;
      toggleDownloadAudio.checked = items.downloadAudio;
      toggleDownloadAudioMerge.checked = items.downloadAudioMerge;
      toggleDownloadBundle.checked = items.downloadBundle;
      toggleDownloadSinglePage.checked = items.downloadSinglePageEnabled;
      downloadSilenceSeconds.value = items.audioSilenceSeconds;

      toggleAutoLogin.checked = items.autoLoginEnabled;
      updateAutoCompleteUI();
      updateDownloadUI();

      teacherUsername.value = items.teacherUsername || '';
      studentName.value = items.studentName || '';

      hasStoredPassword = !!items.studentPassword;
      studentPassword.placeholder = hasStoredPassword
        ? '已保存，留空表示不修改'
        : '请输入学生密码';

      updateMasterUI();
    }
  );

  function showMessage(text, isError) {
    saved.textContent = text || '已保存';
    saved.classList.toggle('error', !!isError);
    saved.classList.add('show');
    clearTimeout(savedTimer);
    savedTimer = setTimeout(function () {
      saved.classList.remove('show');
    }, 1800);
  }

  function updateMasterUI() {
    for (let i = 0; i < featureGroups.length; i++) {
      featureGroups[i].classList.toggle('disabled', !toggleEnabled.checked);
    }
  }

  function updateAutoCompleteUI() {
    autoCompleteOptions.classList.toggle('disabled', !toggleAutoComplete.checked);
  }

  function saveAutoCompleteSetting(key, value) {
    const data = {};
    data[key] = value;
    chrome.storage.local.set(data, function () {
      showMessage();
    });
  }

  function updateDownloadUI() {
    downloadOptions.classList.toggle('disabled', !toggleDownload.checked);
  }

  function saveDownloadSetting(key, value) {
    const data = {};
    data[key] = value;
    chrome.storage.local.set(data, function () {
      showMessage();
    });
  }

  toggleEnabled.addEventListener('change', function () {
    updateMasterUI();
    chrome.storage.local.set({ enabled: toggleEnabled.checked }, function () {
      showMessage(toggleEnabled.checked ? '所有功能已启用' : '所有功能已暂停');
    });
  });

  toggleQuizAnswers.addEventListener('change', function () {
    chrome.storage.local.set(
      { quizAnswersEnabled: toggleQuizAnswers.checked },
      function () {
        showMessage();
      }
    );
  });

  toggleHighlight.addEventListener('change', function () {
    chrome.storage.local.set(
      { highlightEnabled: toggleHighlight.checked },
      function () {
        showMessage();
      }
    );
  });

  toggleIgnoreReadingPace.addEventListener('change', function () {
    chrome.storage.local.set(
      { ignoreReadingPace: toggleIgnoreReadingPace.checked },
      function () {
        showMessage();
      }
    );
  });

  toggleAutoComplete.addEventListener('change', function () {
    updateAutoCompleteUI();
    chrome.storage.local.set(
      { autoCompleteEnabled: toggleAutoComplete.checked },
      function () {
        showMessage();
      }
    );
  });

  toggleAutoCompleteCard.addEventListener('change', function () {
    saveAutoCompleteSetting(
      'autoCompleteCardEnabled',
      toggleAutoCompleteCard.checked
    );
  });

  toggleAutoCompletePopup.addEventListener('change', function () {
    saveAutoCompleteSetting(
      'autoCompletePopupEnabled',
      toggleAutoCompletePopup.checked
    );
  });

  toggleAutoCompleteListen.addEventListener('change', function () {
    saveAutoCompleteSetting('autoCompleteListen', toggleAutoCompleteListen.checked);
  });

  toggleAutoCompleteRead.addEventListener('change', function () {
    saveAutoCompleteSetting('autoCompleteRead', toggleAutoCompleteRead.checked);
  });

  toggleAutoCompleteQuiz.addEventListener('change', function () {
    saveAutoCompleteSetting('autoCompleteQuiz', toggleAutoCompleteQuiz.checked);
  });

  readingSecondsPerPage.addEventListener('change', function () {
    let value = parseInt(readingSecondsPerPage.value, 10);
    if (!isFinite(value)) value = 10;
    value = Math.max(1, Math.min(60, value));
    readingSecondsPerPage.value = value;
    saveAutoCompleteSetting('readingSecondsPerPage', value);
  });

  toggleDownload.addEventListener('change', function () {
    updateDownloadUI();
    saveDownloadSetting('downloadEnabled', toggleDownload.checked);
  });

  toggleDownloadCard.addEventListener('change', function () {
    saveDownloadSetting('downloadCardEnabled', toggleDownloadCard.checked);
  });

  toggleDownloadPopup.addEventListener('change', function () {
    saveDownloadSetting('downloadPopupEnabled', toggleDownloadPopup.checked);
  });

  toggleDownloadImages.addEventListener('change', function () {
    saveDownloadSetting('downloadImages', toggleDownloadImages.checked);
  });

  toggleDownloadZip.addEventListener('change', function () {
    saveDownloadSetting('downloadZip', toggleDownloadZip.checked);
  });

  toggleDownloadPdf.addEventListener('change', function () {
    saveDownloadSetting('downloadPdf', toggleDownloadPdf.checked);
  });

  toggleDownloadAudio.addEventListener('change', function () {
    saveDownloadSetting('downloadAudio', toggleDownloadAudio.checked);
  });

  toggleDownloadAudioMerge.addEventListener('change', function () {
    saveDownloadSetting(
      'downloadAudioMerge',
      toggleDownloadAudioMerge.checked
    );
  });

  toggleDownloadBundle.addEventListener('change', function () {
    saveDownloadSetting('downloadBundle', toggleDownloadBundle.checked);
  });

  toggleDownloadSinglePage.addEventListener('change', function () {
    saveDownloadSetting(
      'downloadSinglePageEnabled',
      toggleDownloadSinglePage.checked
    );
  });

  downloadSilenceSeconds.addEventListener('change', function () {
    let value = parseFloat(downloadSilenceSeconds.value);
    if (!isFinite(value)) value = 0;
    value = Math.max(0, Math.min(30, value));
    value = Math.round(value * 2) / 2;
    downloadSilenceSeconds.value = value;
    saveDownloadSetting('audioSilenceSeconds', value);
  });

  toggleAutoLogin.addEventListener('change', function () {
    chrome.storage.local.set(
      { autoLoginEnabled: toggleAutoLogin.checked },
      function () {
        showMessage();
      }
    );
  });

  saveAutoLogin.addEventListener('click', function () {
    const teacher = teacherUsername.value.trim();
    const student = studentName.value.trim();
    const password = studentPassword.value;

    if (!student) {
      showMessage('请填写学生名字', true);
      return;
    }

    const data = {
      autoLoginEnabled: toggleAutoLogin.checked,
      teacherUsername: teacher,
      studentName: student,
    };
    if (password) {
      data.studentPassword = password;
      hasStoredPassword = true;
    }

    chrome.storage.local.set(data, function () {
      studentPassword.value = '';
      studentPassword.placeholder = hasStoredPassword
        ? '已保存，留空表示不修改'
        : '请输入学生密码';
      showMessage(
        hasStoredPassword ? '自动登录设置已保存' : '已保存；请填写学生密码',
        !hasStoredPassword
      );
    });
  });

  studentPassword.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveAutoLogin.click();
    }
  });

  clearAutoLogin.addEventListener('click', function () {
    if (!confirm('确定清除自动登录设置和已保存的学生密码？')) return;

    chrome.storage.local.remove(
      ['autoLoginEnabled', 'teacherUsername', 'studentName', 'studentPassword'],
      function () {
        toggleAutoLogin.checked = false;
        teacherUsername.value = '';
        studentName.value = '';
        studentPassword.value = '';
        studentPassword.placeholder = '请输入学生密码';
        hasStoredPassword = false;
        showMessage('自动登录信息已清除');
      }
    );
  });
})();
