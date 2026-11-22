// Kids A-Z 答案助手 - 页面主世界注入脚本
// 此脚本在页面上下文中运行，用于拦截 fetch 和 XHR
(function () {
  'use strict';

  const QUIZ_API_PATTERN = /HTML5QuizPlayerService\/action\/get_quiz_info/;

  function sendQuizData(data) {
    window.postMessage(
      {
        source: 'kidsaz-answer-helper',
        type: 'quiz-data',
        payload: data,
      },
      '*'
    );
  }

  // 拦截 fetch
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input.url || '';
    return originalFetch.apply(this, arguments).then(function (response) {
      if (QUIZ_API_PATTERN.test(url)) {
        const cloned = response.clone();
        cloned
          .json()
          .then(function (data) {
            if (data && data.questions) {
              sendQuizData(data);
            }
          })
          .catch(function () {});
      }
      return response;
    });
  };

  // 拦截 XMLHttpRequest
  const OrigXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function () {
    const xhr = new OrigXHR();
    const origOpen = xhr.open;
    const origSend = xhr.send;
    let reqUrl = '';

    xhr.open = function (method, url) {
      reqUrl = url;
      return origOpen.apply(this, arguments);
    };

    xhr.send = function () {
      xhr.addEventListener('load', function () {
        if (QUIZ_API_PATTERN.test(reqUrl) && xhr.responseText) {
          try {
            const data = JSON.parse(xhr.responseText);
            if (data && data.questions) {
              sendQuizData(data);
            }
          } catch (e) {}
        }
      });
      return origSend.apply(this, arguments);
    };

    return xhr;
  };
  window.XMLHttpRequest.prototype = OrigXHR.prototype;

  // ========== 解除阅读速度限制 ==========
  // 阅读器在完成时检查 totalTime / pagesRead 是否小于 1000ms，
  // 过快会跳过 engagementUrl（通常是进入 quiz 的跳转）。
  const READING_PATH = /^\/main\/Activity/;
  let ignoreReadingPace = false;
  let readingSecondsPerPage = 10;

  function unlockReadingPace() {
    if (!ignoreReadingPace) return;

    const book = window.studentBook;
    if (!book) return;

    if (book.isTimedRead) {
      book.isTimedRead = false;
    }

    // 服务端也会校验“读得太快”；10 秒/页已实测可通过
    const seconds = Math.max(1, Math.min(60, Number(readingSecondsPerPage) || 10));
    const totalPages = Number(book.totalPages) || 0;
    const bookmarkedPage = Number(book.bookmarkedPage) || 0;
    const pages = Math.max(1, totalPages - bookmarkedPage);
    const earliestStart = Date.now() - pages * seconds * 1000;
    if (!book.startTime || book.startTime > earliestStart) {
      book.startTime = earliestStart;
    }
  }

  // ========== 一键完成：Read / Listen 执行器 ==========
  let autoTask = null;
  let autoRunning = false;

  function postAutoDone(step, success, message) {
    window.postMessage(
      {
        source: 'kidsaz-answer-helper',
        type: 'auto-complete-step-done',
        payload: {
          step: step,
          success: success,
          message: message,
          url: location.href,
        },
      },
      '*'
    );
  }

  function matchesTaskStep(task, step) {
    const id = task && task.book && task.book[step + 'Id'];
    return id && location.pathname.indexOf('/main/Activity/id/' + id) === 0;
  }

  function runAutoRead(task) {
    if (autoRunning) return;
    autoRunning = true;
    const seconds = Math.max(
      1,
      Math.min(60, Number(task.secondsPerPage) || readingSecondsPerPage || 10)
    );

    const waitBook = setInterval(function () {
      const book = window.studentBook;
      if (!book) return;
      clearInterval(waitBook);

      if (!matchesTaskStep(task, 'read')) {
        postAutoDone('read', false, '页面 ID 与 Read 任务不匹配');
        return;
      }

      book.isTimedRead = false;
      const pages = Math.max(
        1,
        (Number(book.totalPages) || 0) - (Number(book.bookmarkedPage) || 0)
      );
      book.startTime = Date.now() - pages * seconds * 1000;

      let clicks = 0;
      const timer = setInterval(function () {
        if (!window.studentBook) {
          clearInterval(timer);
          postAutoDone('read', true, '已离开阅读器');
          return;
        }
        if (clicks > (Number(book.totalPages) || 30) + 5) {
          clearInterval(timer);
          postAutoDone('read', false, '翻页超时');
          return;
        }
        if (location.pathname.indexOf('/main/Activity/id/') !== 0) {
          clearInterval(timer);
          postAutoDone('read', true, '阅读器已跳转');
          return;
        }
        const forward = document.querySelector('#forward-page');
        if (!forward) return;
        forward.click();
        clicks += 1;
        if (book.curPageIndex >= book.totalPages) {
          clearInterval(timer);
          postAutoDone('read', true, '阅读完成');
        }
      }, 250);
    }, 200);
  }

  function runAutoListen(task) {
    if (autoRunning) return;
    autoRunning = true;

    const waitBook = setInterval(function () {
      const book = window.studentBook;
      const audio = document.querySelector('#book-player');
      const play = document.querySelector('#audio-play-pause');
      if (!book || !audio || !play) return;
      clearInterval(waitBook);

      if (!matchesTaskStep(task, 'listen')) {
        postAutoDone('listen', false, '页面 ID 与 Listen 任务不匹配');
        return;
      }

      let pages = 0;
      const total = Number(book.totalPages) || 1;

      function nextPage() {
        if (pages >= total + 2) {
          postAutoDone('listen', true, '听力翻页完成');
          return;
        }
        const forward = document.querySelector('#forward-page');
        if (!forward) {
          postAutoDone('listen', false, '没有找到下一页按钮');
          return;
        }
        forward.click();
        pages += 1;
        setTimeout(playPage, 500);
      }

      function playPage() {
        const currentAudio = document.querySelector('#book-player');
        const currentPlay = document.querySelector('#audio-play-pause');
        if (!currentAudio || !currentPlay) {
          postAutoDone('listen', false, '听力播放器未加载');
          return;
        }
        currentAudio.playbackRate = 16;
        currentPlay.click();
        const started = Date.now();
        const timer = setInterval(function () {
          const ended =
            currentAudio.ended ||
            (currentAudio.duration &&
              currentAudio.currentTime >= currentAudio.duration - 0.05);
          if (ended || (currentAudio.paused && Date.now() - started > 2500)) {
            clearInterval(timer);
            nextPage();
          } else if (Date.now() - started > 30000) {
            clearInterval(timer);
            postAutoDone('listen', false, '单页音频播放超时');
          }
        }, 300);
      }

      playPage();
    }, 300);
  }

  window.addEventListener('message', function (event) {
    if (
      event.data &&
      event.data.source === 'kidsaz-answer-helper' &&
      event.data.type === 'reading-settings'
    ) {
      ignoreReadingPace = !!(
        event.data.payload && event.data.payload.ignoreReadingPace
      );
      readingSecondsPerPage = Math.max(
        1,
        Math.min(
          60,
          Number(event.data.payload && event.data.payload.readingSecondsPerPage) || 10
        )
      );
      unlockReadingPace();
    }

    if (
      event.data &&
      event.data.source === 'kidsaz-answer-helper' &&
      event.data.type === 'auto-complete-task'
    ) {
      autoTask = event.data.payload;
      if (!autoTask || autoTask.status !== 'running') return;
      if (
        autoTask.currentStep === 'read' &&
        matchesTaskStep(autoTask, 'read')
      ) {
        runAutoRead(autoTask);
      } else if (
        autoTask.currentStep === 'listen' &&
        matchesTaskStep(autoTask, 'listen')
      ) {
        runAutoListen(autoTask);
      }
    }
  });

  // ========== Reading Room 书目（主世界） ==========
  // AngularJS 的 scope 只能在主世界访问；隔离世界的 auto-complete.js 通过消息请求
  function collectAngularBooks() {
    const books = [];
    if (!window.angular) return books;

    const seen = {};
    document.querySelectorAll('.card_container').forEach(function (card) {
      let resource = null;
      try {
        const scope = window.angular.element(card).scope();
        resource = scope && scope.$ctrl && scope.$ctrl.resource;
      } catch (e) {}
      if (!resource) return;

      function find(name) {
        return (resource.deliveries || []).find(function (d) {
          return d.name === name;
        });
      }
      const listen = find('listen');
      const read = find('read');
      const quiz = find('quiz');
      const key = resource.title + '|' + (resource.collection_id || '');
      if (seen[key]) return;
      seen[key] = true;

      books.push({
        title: resource.title,
        level: resource.level || null,
        collectionId: resource.collection_id || null,
        listenId: listen ? listen.resourceDeploymentId : null,
        readId: read ? read.resourceDeploymentId : null,
        quizId: quiz ? quiz.resourceDeploymentId : null,
        listenCompleted: !!(listen && listen.status && listen.status.isCompleted),
        readCompleted: !!(read && read.status && read.status.isCompleted),
        quizCompleted: !!(
          quiz &&
          quiz.status &&
          (quiz.status.isPassed ||
            quiz.status.isPassedPerfect ||
            quiz.status.isCompleted)
        ),
        quizLocked: !!(
          quiz &&
          quiz.status &&
          (quiz.status.isDisabled || quiz.status.isLocked)
        ),
      });
    });
    return books;
  }

  window.addEventListener('message', function (event) {
    if (
      event.data &&
      event.data.source === 'kidsaz-answer-helper' &&
      event.data.type === 'request-angular-books'
    ) {
      window.postMessage(
        {
          source: 'kidsaz-answer-helper',
          type: 'angular-books',
          payload: collectAngularBooks(),
        },
        '*'
      );
    }
  });

  // ========== 下载数据 ==========
  function collectDownloadData() {
    const book = window.studentBook;
    if (!book) return null;

    const pages = [];
    if (Array.isArray(book.playerData)) {
      book.playerData.forEach(function (page) {
        const audioUrls = [];
        (page.sections || []).forEach(function (section) {
          if (section.section_audio) audioUrls.push(section.section_audio);
        });
        if (
          !audioUrls.length &&
          page.animation_content &&
          page.animation_content.audio_url
        ) {
          audioUrls.push(page.animation_content.audio_url);
        }
        pages.push({
          pageNumber: page.page_number,
          imageUrl: page.page_image,
          audioUrls: audioUrls,
        });
      });
    } else if (Array.isArray(book.imageData)) {
      book.imageData.forEach(function (page) {
        pages.push({
          pageNumber: page.page_number,
          imageUrl: page.page_image,
          audioUrls: [],
        });
      });
    }

    if (!pages.length) return null;

    const title =
      (document.title || '').replace(/\s*-\s*Kids A-Z.*$/i, '').trim() ||
      'book';

    return {
      title: title,
      pageCount: pages.length,
      currentPageIndex: Number(book.curPageIndex) || 0,
      pages: pages,
    };
  }

  window.addEventListener('message', function (event) {
    if (
      event.data &&
      event.data.source === 'kidsaz-answer-helper' &&
      event.data.type === 'request-download-data'
    ) {
      window.postMessage(
        {
          source: 'kidsaz-answer-helper',
          type: 'download-data',
          payload: collectDownloadData(),
        },
        '*'
      );
    }
  });

  if (READING_PATH.test(location.pathname)) {
    setInterval(unlockReadingPace, 500);
  }
})();
