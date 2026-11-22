// Kids A-Z 答案助手 - 一键完成（书目按钮 / 弹窗书目 / 活动执行）
(function () {
  'use strict';

  const DEFAULTS = {
    enabled: true,
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
    downloadSinglePageEnabled: true,
  };

  let settings = null;
  let levelUpCache = { at: 0, books: [] };
  let levelUpFetching = false;
  let task = null;
  let mainPosted = false;
  let quizRunning = false;
  let rewardReported = false;

  function clean(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  function isDone(status) {
    return status === 'completed' || status === 'complete' || status === true;
  }

  function getSettings(callback) {
    chrome.storage.local.get(DEFAULTS, function (items) {
      settings = items;
      callback(items);
    });
  }

  function isCardEnabled() {
    return !!(
      settings &&
      settings.enabled &&
      settings.autoCompleteEnabled &&
      settings.autoCompleteCardEnabled
    );
  }

  function hasPendingStep(book) {
    if (!settings) return true;
    if (
      settings.autoCompleteListen &&
      book.listenId &&
      !book.listenCompleted
    ) {
      return true;
    }
    if (settings.autoCompleteRead && book.readId && !book.readCompleted) {
      return true;
    }
    if (settings.autoCompleteQuiz && book.quizId && !book.quizCompleted) {
      return true;
    }
    return false;
  }

  // ========== Level Up 书目 ==========
  async function getLevelUpBooks() {
    if (Date.now() - levelUpCache.at < 10000) return levelUpCache.books;
    const response = await fetch(
      '/ng/api/kids/student/reading/assignment/self-paced',
      { credentials: 'include' }
    );
    if (!response.ok) throw new Error('书目接口失败：' + response.status);
    const data = await response.json();
    const books = data.map(function (book) {
      const activities = book.activities || [];
      function find(type) {
        return activities.find(function (a) {
          return a.activityType === type;
        });
      }
      const listen = find('listen');
      const read = find('read');
      const quiz = find('quiz');
      return {
        title: book.title,
        level: null,
        collectionId: null,
        listenId: listen ? listen.resourceDeploymentId : null,
        readId: read ? read.resourceDeploymentId : null,
        quizId: quiz ? quiz.resourceDeploymentId : null,
        listenCompleted: listen ? isDone(listen.activityStatus) : false,
        readCompleted: read ? isDone(read.activityStatus) : false,
        quizCompleted: quiz ? isDone(quiz.activityStatus) : false,
      };
    });
    levelUpCache = { at: Date.now(), books: books };
    return books;
  }

  // ========== Reading Room 书目 ==========
  // AngularJS scope 只在主世界可见，由 inject.js 回传
  let angularBooksCache = [];

  function requestAngularBooks() {
    return new Promise(function (resolve) {
      let done = false;

      function handler(event) {
        if (
          event.data &&
          event.data.source === 'kidsaz-answer-helper' &&
          event.data.type === 'angular-books'
        ) {
          done = true;
          window.removeEventListener('message', handler);
          angularBooksCache = Array.isArray(event.data.payload)
            ? event.data.payload
            : [];
          resolve(angularBooksCache);
        }
      }

      window.addEventListener('message', handler);
      window.postMessage(
        {
          source: 'kidsaz-answer-helper',
          type: 'request-angular-books',
        },
        '*'
      );

      setTimeout(function () {
        if (done) return;
        window.removeEventListener('message', handler);
        resolve(angularBooksCache);
      }, 900);
    });
  }

  async function getReadingRoomBooks() {
    let books = await requestAngularBooks();
    if (!books.length) {
      await new Promise(function (resolve) {
        setTimeout(resolve, 600);
      });
      books = await requestAngularBooks();
    }
    return books;
  }

  function collectBooksForCurrentPage() {
    const path = location.pathname;
    if (path.indexOf('/main/Activity') === 0) {
      return Promise.reject(new Error('当前是活动页，请在书目页选择'));
    }
    if (path.indexOf('/main/ReadingBookRoom') === 0) {
      return getReadingRoomBooks().then(function (books) {
        return { source: 'reading-room', books: books };
      });
    }
    return getLevelUpBooks().then(function (books) {
      return { source: 'level-up', books: books };
    });
  }

  function getBooksForCurrentPage() {
    return collectBooksForCurrentPage().then(function (result) {
      return {
        source: result.source,
        books: result.books.filter(hasPendingStep),
      };
    });
  }

  function getDownloadBooksForCurrentPage() {
    return collectBooksForCurrentPage();
  }

  // ========== 书目按钮 ==========
  function ensureStyle() {
    if (document.getElementById('kaz-oneclick-style')) return;
    const style = document.createElement('style');
    style.id = 'kaz-oneclick-style';
    style.textContent =
      '.kaz-oneclick{position:absolute;top:8px;right:8px;z-index:9999;' +
      'padding:4px 7px;border:0;border-radius:5px;background:#89b4fa;' +
      'color:#1e1e2e;font-size:11px;font-weight:700;line-height:1.2;' +
      'cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.35);}' +
      '.kaz-oneclick:hover{background:#b4d0fb;}' +
      '.kaz-oneclick.kaz-busy{background:#f9e2af;}' +
      '.kaz-oneclick.kaz-error{background:#f38ba8;color:#1e1e2e;}' +
      '.kaz-download{position:absolute;top:8px;right:8px;z-index:9999;' +
      'padding:4px 7px;border:0;border-radius:5px;background:#a6e3a1;' +
      'color:#1e1e2e;font-size:11px;font-weight:700;line-height:1.2;' +
      'cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.35);}' +
      '.kaz-download:hover{background:#c7f0c4;}' +
      '.kaz-download.kaz-busy{background:#f9e2af;}';
    document.documentElement.appendChild(style);
  }

  function addButton(container, book, isAnchor) {
    if (!container || container.querySelector('.kaz-oneclick')) return;
    if (!hasPendingStep(book)) return;
    ensureStyle();
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    const button = document.createElement(isAnchor ? 'span' : 'button');
    button.className = 'kaz-oneclick';
    button.textContent = '一键完成';
    button.title = '按设置完成：' + book.title;
    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');

    function start(event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (button.classList.contains('kaz-busy')) return;
      button.classList.remove('kaz-error');
      button.classList.add('kaz-busy');
      button.textContent = '启动中…';
      chrome.runtime.sendMessage(
        { type: 'startAutoComplete', book: book },
        function (response) {
          if (chrome.runtime.lastError) {
            button.classList.remove('kaz-busy');
            button.classList.add('kaz-error');
            button.textContent = '失败';
            return;
          }
          if (!response || !response.ok) {
            button.classList.remove('kaz-busy');
            button.classList.add('kaz-error');
            button.textContent = response && response.message ? '失败' : '不可用';
            return;
          }
          button.textContent = '已启动';
          setTimeout(function () {
            button.classList.remove('kaz-busy');
            button.textContent = '一键完成';
          }, 2500);
        }
      );
    }

    button.addEventListener('click', start);
    button.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') start(event);
    });

    container.appendChild(button);
  }

  function hasDownloadSource(book) {
    return !!(book && (book.listenId || book.readId));
  }

  function addDownloadButton(container, book, isAnchor) {
    if (
      !container ||
      container.querySelector('.kaz-download') ||
      !settings ||
      !settings.enabled ||
      !settings.downloadEnabled ||
      !settings.downloadCardEnabled ||
      !hasDownloadSource(book)
    ) {
      return;
    }
    ensureStyle();
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    const button = document.createElement(isAnchor ? 'span' : 'button');
    button.className = 'kaz-download';
    button.textContent = '下载';
    button.title = '下载：' + book.title;
    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');
    button.style.top = container.querySelector('.kaz-oneclick')
      ? '36px'
      : '8px';

    function start(event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (button.classList.contains('kaz-busy')) return;
      button.classList.add('kaz-busy');
      button.textContent = '启动中…';
      chrome.runtime.sendMessage(
        { type: 'startDownload', book: book },
        function (response) {
          if (chrome.runtime.lastError) {
            button.classList.remove('kaz-busy');
            button.textContent = '失败';
            return;
          }
          if (!response || !response.ok) {
            button.classList.remove('kaz-busy');
            button.textContent = '不可用';
            return;
          }
          button.textContent = '已开始';
          setTimeout(function () {
            button.classList.remove('kaz-busy');
            button.textContent = '下载';
          }, 2500);
        }
      );
    }

    button.addEventListener('click', start);
    button.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') start(event);
    });
    container.appendChild(button);
  }

  function removeButtons() {
    Array.from(
      document.querySelectorAll('.kaz-oneclick, .kaz-download')
    ).forEach(function (el) {
      el.remove();
    });
  }

  async function refreshLevelUpButtons() {
    if (!isCardEnabled() || levelUpFetching) return;
    levelUpFetching = true;
    try {
      const books = await getLevelUpBooks();
      document.querySelectorAll('app-resource').forEach(function (card) {
        const title = clean(card.querySelector('.card__title')?.innerText);
        const book = books.find(function (b) {
          return b.title === title;
        });
        if (!book) return;
        const container = card.querySelector('.card-wrapper') || card;
        addButton(container, book, false);
        addDownloadButton(container, book, false);
      });
    } catch (e) {
      // 未登录或接口失败时静默，避免打断页面
    } finally {
      levelUpFetching = false;
    }
  }

  async function refreshReadingRoomButtons() {
    if (!isCardEnabled()) return;
    const books = await getReadingRoomBooks();
    const byTitle = {};
    books.forEach(function (book) {
      byTitle[book.title] = book;
    });
    document.querySelectorAll('.card_container').forEach(function (card) {
      const title =
        clean(card.querySelector('.card_title')?.innerText) ||
        clean(card.querySelector('.visuallyHidden')?.innerText);
      const book = byTitle[title];
      if (book) {
        addButton(card, book, true);
        addDownloadButton(card, book, true);
      }
    });
  }

  function refreshButtons() {
    if (!isCardEnabled()) {
      removeButtons();
      return;
    }
    if (location.pathname.indexOf('/ng/student-portal/reading/self-paced-assignment') === 0) {
      refreshLevelUpButtons();
    } else if (location.pathname.indexOf('/main/ReadingBookRoom') === 0) {
      refreshReadingRoomButtons();
    }
  }

  // ========== 活动页：Read / Listen / Quiz ==========
  function matchesCurrentStep(task, step) {
    const id = task.book && task.book[step + 'Id'];
    return id && location.pathname.indexOf('/main/Activity/id/' + id) === 0;
  }

  function reportDone(step, success, message) {
    chrome.runtime.sendMessage({
      type: 'autoCompleteStepDone',
      step: step,
      success: success,
      message: message,
      url: location.href,
    });
  }

  function postTaskToMain() {
    if (mainPosted || !task) return;
    if (task.status !== 'running') return;
    if (task.currentStep !== 'read' && task.currentStep !== 'listen') return;
    if (!matchesCurrentStep(task, task.currentStep)) return;
    mainPosted = true;
    window.postMessage(
      {
        source: 'kidsaz-answer-helper',
        type: 'auto-complete-task',
        payload: task,
      },
      '*'
    );
  }

  function waitForQuizDom(callback) {
    let attempts = 0;
    const timer = setInterval(function () {
      attempts += 1;
      if (document.querySelector('#question-tab-0') && document.querySelector('#done')) {
        clearInterval(timer);
        callback(true);
      } else if (attempts > 40) {
        clearInterval(timer);
        callback(false);
      }
    }, 500);
  }

  function waitForQuizAnswers(callback) {
    let attempts = 0;
    const timer = setInterval(function () {
      attempts += 1;
      chrome.storage.local.get({ quizAnswers: null }, function (items) {
        if (items.quizAnswers && items.quizAnswers.length) {
          clearInterval(timer);
          callback(items.quizAnswers);
        } else if (attempts > 60) {
          clearInterval(timer);
          callback(null);
        }
      });
    }, 300);
  }

  function selectCorrectChoices(answers, callback) {
    let index = 0;

    function next() {
      if (index >= answers.length) {
        callback(true);
        return;
      }
      const answer = answers[index];
      const tab = document.querySelector('#question-tab-' + index);
      if (tab) tab.click();

      setTimeout(function () {
        const correct = Number(answer.correctIndex);
        if (!isFinite(correct) || correct < 0) {
          callback(false, '第 ' + (index + 1) + ' 题是开放题，无法自动完成');
          return;
        }
        const choice = document.querySelector(
          '#choice-' + (index + 1) + '-' + (correct + 1)
        );
        if (!choice) {
          callback(false, '第 ' + (index + 1) + ' 题选项未找到');
          return;
        }
        choice.click();
        index += 1;
        setTimeout(next, 180);
      }, 200);
    }

    next();
  }

  function runQuiz() {
    if (quizRunning || !task || task.status !== 'running') return;
    if (task.currentStep !== 'quiz' || !matchesCurrentStep(task, 'quiz')) return;
    quizRunning = true;

    waitForQuizDom(function (ready) {
      if (!ready) {
        reportDone('quiz', false, 'Quiz 页面未加载出题目');
        return;
      }
      waitForQuizAnswers(function (answers) {
        if (!answers) {
          reportDone('quiz', false, '没有捕获到 quiz 答案，请确认答题助手已开启');
          return;
        }
        if (answers.some(function (a) { return a.correctIndex < 0; })) {
          reportDone('quiz', false, 'Quiz 含开放题，无法自动完成');
          return;
        }
        selectCorrectChoices(answers, function (ok, message) {
          if (!ok) {
            reportDone('quiz', false, message || '自动选择答案失败');
            return;
          }
          setTimeout(function () {
            const done = document.querySelector('#done');
            if (!done) {
              reportDone('quiz', false, '没有找到 Done 按钮');
              return;
            }
            done.click();
            // 正常情况下页面会跳到 ActivityReward，由 reward 页面上报结果
            setTimeout(function () {
              if (location.pathname.indexOf('/main/ActivityReward/') !== 0) {
                reportDone('quiz', false, '提交后没有跳转到奖励页');
              }
            }, 9000);
          }, 500);
        });
      });
    });
  }

  function initActivityPage() {
    chrome.storage.local.get({ autoCompleteTask: null }, function (items) {
      task = items.autoCompleteTask;
      if (!task || task.status !== 'running') return;

      if (task.currentStep === 'read' || task.currentStep === 'listen') {
        postTaskToMain();
        // task 可能比页面晚一点写入，补一次轮询
        if (!mainPosted) {
          let attempts = 0;
          const timer = setInterval(function () {
            attempts += 1;
            if (!task || attempts > 20) {
              clearInterval(timer);
              return;
            }
            postTaskToMain();
            if (mainPosted) clearInterval(timer);
          }, 300);
        }
      } else if (task.currentStep === 'quiz') {
        runQuiz();
      }
    });
  }

  function initRewardPage() {
    chrome.storage.local.get({ autoCompleteTask: null }, function (items) {
      task = items.autoCompleteTask;
      if (!task || task.status !== 'running' || rewardReported) return;
      if (task.currentStep !== 'quiz') return;
      const quizId = task.book && task.book.quizId;
      if (
        !quizId ||
        location.pathname.indexOf('/main/ActivityReward/id/' + quizId) !== 0
      ) {
        return;
      }

      setTimeout(function () {
        const text = clean(document.body ? document.body.innerText : '');
        const success =
          /out of|stars|perfect/i.test(text) &&
          !/too quickly|read it again|incorrect/i.test(text);
        rewardReported = true;
        reportDone(
          'quiz',
          success,
          success ? 'Quiz 已提交' : 'Quiz 结果异常：' + text.slice(0, 120)
        );
      }, 800);
    });
  }

  // ========== 启动 ==========
  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message && message.type === 'getAutoCompleteBooks') {
      getBooksForCurrentPage()
        .then(function (result) {
          sendResponse(result);
        })
        .catch(function (error) {
          sendResponse({ error: String(error && error.message || error) });
        });
      return true;
    }
    if (message && message.type === 'getDownloadBooks') {
      getDownloadBooksForCurrentPage()
        .then(function (result) {
          sendResponse(result);
        })
        .catch(function (error) {
          sendResponse({ error: String(error && error.message || error) });
        });
      return true;
    }
  });

  window.addEventListener('message', function (event) {
    if (!event.data || event.data.source !== 'kidsaz-answer-helper') return;
    if (event.data.type !== 'auto-complete-step-done') return;
    reportDone(
      event.data.payload.step,
      event.data.payload.success,
      event.data.payload.message
    );
  });

  chrome.storage.onChanged.addListener(function (changes) {
    if (
      changes.enabled ||
      changes.autoCompleteEnabled ||
      changes.autoCompleteCardEnabled ||
      changes.autoCompleteRead ||
      changes.autoCompleteQuiz ||
      changes.autoCompleteListen ||
      changes.downloadEnabled ||
      changes.downloadCardEnabled
    ) {
      getSettings(function () {
        removeButtons();
        refreshButtons();
      });
    }
  });

  getSettings(function () {
    const path = location.pathname;
    if (path.indexOf('/main/Activity/id/') === 0) {
      initActivityPage();
    } else if (path.indexOf('/main/ActivityReward/id/') === 0) {
      initRewardPage();
    } else if (
      path.indexOf('/ng/student-portal/reading/self-paced-assignment') === 0 ||
      path.indexOf('/main/ReadingBookRoom') === 0
    ) {
      refreshButtons();
      setInterval(refreshButtons, 1500);
    }
  });
})();
