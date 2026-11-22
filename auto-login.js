// Kids A-Z 答案助手 - 学生自动登录
// 依次处理：老师用户名 -> 选择学生图标 -> 学生密码
(function () {
  'use strict';

  const DEFAULTS = {
    enabled: true,
    autoLoginEnabled: false,
    teacherUsername: '',
    studentName: '',
    studentPassword: '',
  };

  // 同一步骤在短时间内只执行一次，避免密码错误时反复提交
  const ATTEMPT_TTL_MS = 60 * 1000;
  const STEP_KEY_PREFIX = 'kaz-auto-login:';

  function normalize(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  // Angular 表单需要原生 setter + input 事件才能识别新值
  function setInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    ).set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function markAttempt(step) {
    try {
      sessionStorage.setItem(STEP_KEY_PREFIX + step, String(Date.now()));
    } catch (e) {}
  }

  function recentlyAttempted(step) {
    try {
      const value = Number(sessionStorage.getItem(STEP_KEY_PREFIX + step) || 0);
      return value > 0 && Date.now() - value < ATTEMPT_TTL_MS;
    } catch (e) {
      return false;
    }
  }

  function waitForElement(getElement, callback) {
    let attempts = 0;

    function check() {
      const element = getElement();
      if (element) {
        callback(element);
        return;
      }
      attempts += 1;
      if (attempts < 20) {
        setTimeout(check, 500);
      }
    }

    check();
  }

  function goButton() {
    return document.querySelector('button[aria-label="Go"]');
  }

  function handleTeacherPage(settings) {
    if (recentlyAttempted('teacher')) return;

    waitForElement(
      function () {
        return document.querySelector('#username');
      },
      function (input) {
        if (!isActive()) return;
        const button = goButton();
        if (!button) return;

        // 站点通常已记住老师用户名；有值就沿用，空着才用设置里的值
        const teacher = normalize(input.value) || settings.teacherUsername;
        if (!teacher) return;

        setInputValue(input, teacher);
        markAttempt('teacher');
        setTimeout(function () {
          button.click();
        }, 150);
      }
    );
  }

  function handleClassChart(settings) {
    if (recentlyAttempted('student')) return;

    const wanted = settings.studentName.toLowerCase();

    waitForElement(
      function () {
        const buttons = Array.from(
          document.querySelectorAll('button.class-chart__students-link')
        );
        return (
          buttons.find(function (button) {
            return normalize(button.innerText).toLowerCase() === wanted;
          }) || null
        );
      },
      function (button) {
        if (!isActive()) return;
        markAttempt('student');
        button.click();
      }
    );
  }

  function handleStudentPassword(settings) {
    if (!settings.studentPassword || recentlyAttempted('password')) return;

    waitForElement(
      function () {
        return document.querySelector('#password');
      },
      function (input) {
        if (!isActive()) return;
        const button =
          document.querySelector('button.student-password__submit-button') ||
          goButton();
        if (!button) return;

        setInputValue(input, settings.studentPassword);
        markAttempt('password');
        setTimeout(function () {
          button.click();
        }, 150);
      }
    );
  }

  let settings = null;
  let lastPath = null;

  function isActive() {
    return !!(settings && settings.enabled && settings.autoLoginEnabled);
  }

  function handleCurrentPath() {
    if (!isActive() || !settings.studentName) {
      return;
    }

    const path = location.pathname;
    if (path === '/ng/' || path === '/ng') {
      handleTeacherPage(settings);
    } else if (path.indexOf('/ng/login/class-chart') === 0) {
      handleClassChart(settings);
    } else if (path.indexOf('/ng/login/student') === 0) {
      handleStudentPassword(settings);
    }
  }

  // Kids A-Z 是 Angular 单页应用，路由变化不一定重新加载脚本
  function watchPath() {
    const path = location.pathname;
    if (path === lastPath) return;
    lastPath = path;
    handleCurrentPath();
  }

  chrome.storage.local.get(DEFAULTS, function (items) {
    settings = items;
    watchPath();
    setInterval(watchPath, 500);
  });

  chrome.storage.onChanged.addListener(function (changes) {
    if (
      changes.enabled ||
      changes.autoLoginEnabled ||
      changes.teacherUsername ||
      changes.studentName ||
      changes.studentPassword
    ) {
      chrome.storage.local.get(DEFAULTS, function (items) {
        settings = items;
        if (
          (changes.enabled && changes.enabled.newValue) ||
          (changes.autoLoginEnabled && changes.autoLoginEnabled.newValue)
        ) {
          lastPath = null;
          watchPath();
        }
      });
    }
  });
})();
