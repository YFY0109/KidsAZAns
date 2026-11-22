// Kids A-Z 答案助手 - Content Script
(function () {
  'use strict';

  let quizData = null;
  let enabled = true;
  let quizAnswersEnabled = true;
  let highlightEnabled = false;
  let ignoreReadingPace = true;
  let readingSecondsPerPage = 10;
  let observer = null;

  function postReadingSettings() {
    window.postMessage(
      {
        source: 'kidsaz-answer-helper',
        type: 'reading-settings',
        payload: {
          ignoreReadingPace: enabled && ignoreReadingPace,
          readingSecondsPerPage: Math.max(
            1,
            Math.min(60, Number(readingSecondsPerPage) || 10)
          ),
        },
      },
      '*'
    );
  }

  // ========== 页面加载时清除旧答案 ==========
  chrome.storage.local.set({ quizAnswers: null });

  // ========== 读取开关状态 ==========
  chrome.storage.local.get(
    {
      enabled: true,
      quizAnswersEnabled: true,
      highlightEnabled: false,
      ignoreReadingPace: true,
      readingSecondsPerPage: 10,
    },
    function (items) {
      enabled = items.enabled;
      quizAnswersEnabled = items.quizAnswersEnabled;
      highlightEnabled = items.highlightEnabled;
      ignoreReadingPace = items.ignoreReadingPace;
      readingSecondsPerPage = items.readingSecondsPerPage;
      postReadingSettings();
    }
  );

  chrome.storage.onChanged.addListener(function (changes) {
    if (changes.enabled) {
      enabled = changes.enabled.newValue;
      if (!enabled) {
        stopHighlight();
      } else if (highlightEnabled && quizData) {
        waitForDOMThenHighlight(quizData);
      }
      postReadingSettings();
    }
    if (changes.quizAnswersEnabled) {
      quizAnswersEnabled = changes.quizAnswersEnabled.newValue;
    }
    if (changes.highlightEnabled) {
      highlightEnabled = changes.highlightEnabled.newValue;
      if (enabled && highlightEnabled && quizData) {
        waitForDOMThenHighlight(quizData);
      } else {
        stopHighlight();
      }
    }
    if (changes.ignoreReadingPace) {
      ignoreReadingPace = changes.ignoreReadingPace.newValue;
      postReadingSettings();
    }
    if (changes.readingSecondsPerPage) {
      readingSecondsPerPage = changes.readingSecondsPerPage.newValue;
      postReadingSettings();
    }
  });

  // ========== 监听来自注入脚本的消息 ==========
  window.addEventListener('message', function (event) {
    if (
      event.data &&
      event.data.source === 'kidsaz-answer-helper' &&
      event.data.type === 'quiz-data'
    ) {
      if (enabled && quizAnswersEnabled) {
        quizData = event.data.payload;
        const answers = getCorrectAnswers(quizData);
        chrome.storage.local.set({ quizAnswers: answers });
        if (enabled && highlightEnabled) {
          waitForDOMThenHighlight(quizData);
        }
      }
    }
  });

  // ========== 提取正确答案 ==========
  function getCorrectAnswers(data) {
    if (!data || !data.questions) return [];
    return data.questions.map(function (q) {
      const choices = q.choices
        ? q.choices.map(function (c) {
            return {
              id: c.answer_id,
              text: c.answer.replace(/<[^>]+>/g, ''),
              isCorrect: c.is_correct,
            };
          })
        : [];
      let correctIndex = -1;
      for (let i = 0; i < choices.length; i++) {
        if (choices[i].isCorrect) {
          correctIndex = i;
          break;
        }
      }
      if (q.correct_answer_id) {
        for (let i = 0; i < q.choices.length; i++) {
          if (q.choices[i].answer_id === q.correct_answer_id) {
            correctIndex = i;
            for (let j = 0; j < choices.length; j++) {
              choices[j].isCorrect = j === i;
            }
            break;
          }
        }
      }
      const correctChoice = correctIndex >= 0 ? choices[correctIndex] : null;
      return {
        questionId: q.question_id,
        question: q.question.replace(/<[^>]+>/g, ''),
        choices: choices,
        correctIndex: correctIndex,
        correctLetter: correctIndex >= 0 ? 'ABCDEFGH'[correctIndex] : '',
        correctAnswer: correctChoice ? correctChoice.text : '',
        correctAnswerId: q.correct_answer_id,
      };
    });
  }

  // ========== 页面高亮正确答案 ==========
  function waitForDOMThenHighlight(data) {
    stopHighlight();
    if (!enabled) return;
    let attempts = 0;
    const maxAttempts = 20;

    function tryHighlight() {
      if (!enabled || !highlightEnabled) return;
      attempts++;
      const answers = getCorrectAnswers(data);
      if (attempts >= maxAttempts) return;

      if (highlightCorrectChoices(answers)) {
        startHighlight(data);
      } else {
        setTimeout(tryHighlight, 500);
      }
    }

    setTimeout(tryHighlight, 300);
  }

  function highlightCorrectChoices(answers) {
    let anyHighlighted = false;
    for (let i = 0; i < answers.length; i++) {
      const elements = findAnswerElements(answers[i].correctAnswer);
      for (let j = 0; j < elements.length; j++) {
        const el = elements[j];
        if (!el.dataset.kazHighlighted) {
          markAsCorrect(el);
          el.dataset.kazHighlighted = '1';
          anyHighlighted = true;
        }
      }
    }
    return anyHighlighted;
  }

  function findAnswerElements(answerText) {
    const results = [];
    const cleanText = answerText.replace(/\s+/g, ' ').trim();
    if (!cleanText || cleanText.length < 3) return results;

    const candidates = document.querySelectorAll(
      'label, span, div, p, li, button, .answer, .choice, .option, [class*="answer"], [class*="choice"], [class*="option"]'
    );

    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      if (el.dataset.kazHighlighted === '1') continue;
      if (el.children.length > 0) continue;
      const text = el.textContent.replace(/\s+/g, ' ').trim();
      if (text === cleanText || text.includes(cleanText)) {
        results.push(el);
      }
    }
    return results;
  }

  function markAsCorrect(el) {
    el.style.outline = '3px solid #22c55e';
    el.style.outlineOffset = '2px';
    el.style.borderRadius = '4px';
    el.style.backgroundColor = 'rgba(34, 197, 94, 0.1)';
    el.style.position = 'relative';

    const marker = document.createElement('span');
    marker.className = 'kaz-marker';
    marker.textContent = ' ✓';
    marker.style.cssText =
      'color:#22c55e;font-weight:bold;font-size:14px;margin-left:4px;';
    el.appendChild(marker);
  }

  function startHighlight(data) {
    stopHighlight();
    observer = new MutationObserver(function () {
      if (!enabled || !highlightEnabled) return;
      const answers = getCorrectAnswers(data);
      highlightCorrectChoices(answers);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function stopHighlight() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    const highlighted = document.querySelectorAll('[data-kaz-highlighted]');
    for (let i = 0; i < highlighted.length; i++) {
      const el = highlighted[i];
      el.style.outline = '';
      el.style.outlineOffset = '';
      el.style.borderRadius = '';
      el.style.backgroundColor = '';
      const marker = el.querySelector('.kaz-marker');
      if (marker) marker.remove();
      delete el.dataset.kazHighlighted;
    }
  }
})();
