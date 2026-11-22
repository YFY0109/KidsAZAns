// Kids A-Z 答案助手 - 书籍下载
// 页图 / ZIP / PDF / 朗读音频 / 单页下载
(function () {
  'use strict';

  const DEFAULTS = {
    enabled: true,
    downloadEnabled: true,
    downloadImages: true,
    downloadZip: false,
    downloadPdf: false,
    downloadAudio: false,
    downloadAudioMerge: true,
    audioSilenceSeconds: 0,
    downloadBundle: true,
    downloadSinglePageEnabled: true,
  };

  let settings = null;
  let taskStarted = false;
  let statusTimer = null;

  function clean(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  function safeName(text) {
    return clean(text)
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, ' ')
      .slice(0, 120) || 'book';
  }

  function pad(number) {
    return String(number).padStart(2, '0');
  }

  function sendMessage(message) {
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage(message, function (response) {
        if (chrome.runtime.lastError) {
          resolve({ error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response);
      });
    });
  }

  function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function base64ToBlob(base64, type) {
    return new Blob([base64ToBytes(base64)], { type: type });
  }

  async function fetchBase64(url) {
    const response = await sendMessage({ type: 'downloadFetch', url: url });
    if (!response || response.error || !response.base64) {
      throw new Error((response && response.error) || '下载失败');
    }
    return response.base64;
  }

  async function downloadData(base64, filename, mime) {
    const response = await sendMessage({
      type: 'downloadData',
      base64: base64,
      filename: filename,
      mime: mime,
    });
    if (!response || response.error) {
      throw new Error((response && response.error) || '下载失败');
    }
    return response;
  }

  function arrayBufferToBase64(buffer) {
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

  async function saveBlob(blob, filename) {
    const buffer = await blob.arrayBuffer();
    await downloadData(
      arrayBufferToBase64(buffer),
      filename,
      blob.type || 'application/octet-stream'
    );
  }

  async function saveRemoteFile(url, filename, type) {
    const base64 = await fetchBase64(url);
    await downloadData(base64, filename, type);
  }

  function setStatus(text, isError) {
    let element = document.getElementById('kaz-download-status');
    if (!element) {
      element = document.createElement('div');
      element.id = 'kaz-download-status';
      element.style.cssText =
        'position:fixed;left:16px;bottom:16px;z-index:2147483647;' +
        'max-width:360px;padding:8px 10px;border-radius:6px;' +
        'background:#313244;color:#cdd6f4;font:12px/1.5 system-ui,sans-serif;' +
        'box-shadow:0 2px 8px rgba(0,0,0,.35);white-space:pre-wrap;';
      document.documentElement.appendChild(element);
    }
    element.textContent = text;
    element.style.color = isError ? '#f38ba8' : '#cdd6f4';
    clearTimeout(statusTimer);
    if (!isError) {
      statusTimer = setTimeout(function () {
        element.remove();
      }, 6000);
    }
  }

  // ========== 主世界数据 ==========
  function requestDownloadData() {
    return new Promise(function (resolve) {
      let done = false;
      function handler(event) {
        if (
          event.data &&
          event.data.source === 'kidsaz-answer-helper' &&
          event.data.type === 'download-data'
        ) {
          done = true;
          window.removeEventListener('message', handler);
          resolve(event.data.payload);
        }
      }
      window.addEventListener('message', handler);
      window.postMessage(
        {
          source: 'kidsaz-answer-helper',
          type: 'request-download-data',
        },
        '*'
      );
      setTimeout(function () {
        if (done) return;
        window.removeEventListener('message', handler);
        resolve(null);
      }, 1200);
    });
  }

  async function getDownloadData() {
    for (let i = 0; i < 25; i++) {
      const data = await requestDownloadData();
      if (data && data.pages && data.pages.length) return data;
      await new Promise(function (resolve) {
        setTimeout(resolve, 400);
      });
    }
    return null;
  }

  // ========== ZIP ==========
  function crc32(bytes) {
    if (!crc32.table) {
      const table = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
          c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[i] = c >>> 0;
      }
      crc32.table = table;
    }
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc = crc32.table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function createZip(files) {
    const encoder = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;

    files.forEach(function (file) {
      const nameBytes = encoder.encode(file.name);
      const data = file.data;
      const crc = crc32(data);
      const local = new Uint8Array(30 + nameBytes.length);
      const view = new DataView(local.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0x0800, true);
      view.setUint16(8, 0, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, 0, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, data.length, true);
      view.setUint32(22, data.length, true);
      view.setUint16(26, nameBytes.length, true);
      view.setUint16(28, 0, true);
      local.set(nameBytes, 30);

      parts.push(local, data);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(centralHeader.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      centralHeader.set(nameBytes, 46);
      central.push(centralHeader);

      offset += local.length + data.length;
    });

    const centralStart = offset;
    let centralSize = 0;
    central.forEach(function (header) {
      parts.push(header);
      centralSize += header.length;
    });

    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, centralStart, true);
    ev.setUint16(20, 0, true);
    parts.push(eocd);

    return new Blob(parts, { type: 'application/zip' });
  }

  // ========== PDF ==========
  async function imageInfo(blob) {
    try {
      const bitmap = await createImageBitmap(blob);
      const info = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return info;
    } catch (e) {
      return await new Promise(function (resolve, reject) {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onload = function () {
          URL.revokeObjectURL(url);
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
        };
        img.onerror = function () {
          URL.revokeObjectURL(url);
          reject(new Error('无法读取图片尺寸'));
        };
        img.src = url;
      });
    }
  }

  async function createPdf(imageEntries) {
    const encoder = new TextEncoder();
    const chunks = [];
    let length = 0;
    const offsets = [];

    function push(part) {
      const bytes = typeof part === 'string' ? encoder.encode(part) : part;
      chunks.push(bytes);
      length += bytes.length;
    }

    push(
      new Uint8Array([
        0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a,
        0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a,
      ])
    );

    const pageIds = [];
    imageEntries.forEach(function (_, index) {
      pageIds.push(5 + index * 3);
    });

    function object(id, parts) {
      offsets[id] = length;
      push(id + ' 0 obj\n');
      parts.forEach(push);
      push('\nendobj\n');
    }

    object(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
    object(2, [
      '<< /Type /Pages /Kids [' +
        pageIds
          .map(function (id) {
            return id + ' 0 R';
          })
          .join(' ') +
        '] /Count ' +
        pageIds.length +
        ' >>',
    ]);

    imageEntries.forEach(function (entry, index) {
      const imageId = 3 + index * 3;
      const contentId = 4 + index * 3;
      const pageId = 5 + index * 3;
      const image = entry.bytes;
      const width = Math.max(1, Math.round(entry.width));
      const height = Math.max(1, Math.round(entry.height));
      const content = encoder.encode(
        'q\n' + width + ' 0 0 ' + height + ' 0 0 cm\n/Im0 Do\nQ\n'
      );

      object(imageId, [
        '<< /Type /XObject /Subtype /Image /Width ' +
          width +
          ' /Height ' +
          height +
          ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' +
          image.length +
          ' >>\nstream\n',
        image,
        '\nendstream',
      ]);

      object(contentId, [
        '<< /Length ' + content.length + ' >>\nstream\n',
        content,
        'endstream',
      ]);

      object(pageId, [
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' +
          width +
          ' ' +
          height +
          '] /Resources << /XObject << /Im0 ' +
          imageId +
          ' 0 R >> >> /Contents ' +
          contentId +
          ' 0 R >>',
      ]);
    });

    const maxId = 2 + imageEntries.length * 3;
    const xrefStart = length;
    let xref = 'xref\n0 ' + (maxId + 1) + '\n0000000000 65535 f \n';
    for (let id = 1; id <= maxId; id++) {
      xref += String(offsets[id] || 0).padStart(10, '0') + ' 00000 n \n';
    }
    push(xref);
    push(
      'trailer\n<< /Size ' +
        (maxId + 1) +
        ' /Root 1 0 R >>\nstartxref\n' +
        xrefStart +
        '\n%%EOF\n'
    );

    return new Blob(chunks, { type: 'application/pdf' });
  }

  // ========== 音频合并 ==========
  async function mergeAudio(urls, silenceSeconds) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('浏览器不支持 AudioContext');

    const context = new AudioContextClass();
    const buffers = [];
    for (const url of urls) {
      const base64 = await fetchBase64(url);
      const bytes = base64ToBytes(base64);
      const buffer = await context.decodeAudioData(bytes.buffer.slice(0));
      buffers.push(buffer);
    }

    if (!buffers.length) {
      await context.close();
      throw new Error('没有可合并的音频');
    }

    const sampleRate = buffers[0].sampleRate || context.sampleRate;
    const channels = Math.min(
      2,
      Math.max.apply(
        null,
        buffers.map(function (b) {
          return b.numberOfChannels;
        })
      )
    );
    const silence = Math.max(0, Math.min(30, Number(silenceSeconds) || 0));
    const silenceFrames = Math.round(sampleRate * silence);
    let totalFrames = 0;
    buffers.forEach(function (b, index) {
      totalFrames += b.length;
      if (index < buffers.length - 1) totalFrames += silenceFrames;
    });

    const output = [];
    for (let ch = 0; ch < channels; ch++) {
      output.push(new Float32Array(totalFrames));
    }

    let offset = 0;
    buffers.forEach(function (buffer, index) {
      for (let ch = 0; ch < channels; ch++) {
        const source = buffer.getChannelData(
          Math.min(ch, buffer.numberOfChannels - 1)
        );
        output[ch].set(source, offset);
      }
      offset += buffer.length;
      if (index < buffers.length - 1) offset += silenceFrames;
    });

    await context.close();

    const dataSize = totalFrames * channels * 2;
    const wav = new ArrayBuffer(44 + dataSize);
    const view = new DataView(wav);
    function writeString(offset, text) {
      for (let i = 0; i < text.length; i++) {
        view.setUint8(offset + i, text.charCodeAt(i));
      }
    }
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    let byteOffset = 44;
    for (let i = 0; i < totalFrames; i++) {
      for (let ch = 0; ch < channels; ch++) {
        const sample = Math.max(-1, Math.min(1, output[ch][i]));
        view.setInt16(
          byteOffset,
          sample < 0 ? sample * 0x8000 : sample * 0x7fff,
          true
        );
        byteOffset += 2;
      }
    }

    return new Blob([wav], { type: 'audio/wav' });
  }

  // ========== 任务执行 ==========
  function pageName(title, pageNumber) {
    return safeName(title) + '_page-' + pad(pageNumber) + '.jpg';
  }

  async function runBookDownload(task) {
    if (taskStarted) return;

    const listenId = task.book && task.book.listenId;
    const readId = task.book && task.book.readId;
    const isListen =
      listenId &&
      location.pathname.indexOf('/main/Activity/id/' + listenId) === 0;
    const isRead =
      readId && location.pathname.indexOf('/main/Activity/id/' + readId) === 0;
    if (!isListen && !isRead) return;

    taskStarted = true;
    chrome.storage.local.remove('downloadTask');

    const options = task.settings || settings;
    setStatus('正在读取页数据…');

    const data = await getDownloadData();
    if (!data) {
      setStatus('没有读到页面数据，请刷新页面后重试', true);
      return;
    }

    const title = safeName(
      (task.book && task.book.title) || data.title
    );
    const pages = data.pages || [];
    const needImages =
      options.downloadImages || options.downloadZip || options.downloadPdf;

    let imageEntries = [];
    let pdfBlob = null;
    let audioBlob = null;

    if (needImages) {
      setStatus('正在读取页图 0/' + pages.length + '…');
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        try {
          if (options.downloadZip || options.downloadPdf) {
            const base64 = await fetchBase64(page.imageUrl);
            const blob = base64ToBlob(base64, 'image/jpeg');
            const info = await imageInfo(blob);
            imageEntries.push({
              pageNumber: page.pageNumber,
              bytes: base64ToBytes(base64),
              blob: blob,
              width: info.width,
              height: info.height,
            });
          }
          if (options.downloadImages) {
            await saveRemoteFile(
              page.imageUrl,
              pageName(title, page.pageNumber),
              'image/jpeg'
            );
            await new Promise(function (resolve) {
              setTimeout(resolve, 250);
            });
          }
          setStatus('正在读取页图 ' + (i + 1) + '/' + pages.length + '…');
        } catch (error) {
          setStatus('页图下载失败：' + error.message, true);
        }
      }

      if (options.downloadZip && imageEntries.length) {
        setStatus('正在生成 ZIP…');
        const files = imageEntries.map(function (entry) {
          return {
            name: 'page-' + pad(entry.pageNumber) + '.jpg',
            data: entry.bytes,
          };
        });
        await saveBlob(createZip(files), title + '.zip');
      }

      if (options.downloadPdf && imageEntries.length) {
        setStatus('正在生成 PDF…');
        try {
          pdfBlob = await createPdf(imageEntries);
        } catch (error) {
          setStatus('PDF 生成失败：' + error.message, true);
        }
      }
    }

    if (options.downloadAudio) {
      const audioUrls = [];
      const seen = {};
      pages.forEach(function (page) {
        (page.audioUrls || []).forEach(function (url) {
          if (url && !seen[url]) {
            seen[url] = true;
            audioUrls.push(url);
          }
        });
      });

      if (!audioUrls.length) {
        setStatus('这本书没有可下载的朗读音频', true);
      } else if (options.downloadAudioMerge) {
        setStatus('正在合并朗读音频…');
        try {
          audioBlob = await mergeAudio(
            audioUrls,
            options.audioSilenceSeconds
          );
        } catch (error) {
          setStatus('音频合并失败，改为分段下载：' + error.message, true);
          for (let i = 0; i < audioUrls.length; i++) {
            await saveRemoteFile(
              audioUrls[i],
              title + '-audio-' + pad(i + 1) + '.mp3',
              'audio/mpeg'
            );
          }
        }
      } else {
        setStatus('正在下载音频分段…');
        for (let i = 0; i < audioUrls.length; i++) {
          await saveRemoteFile(
            audioUrls[i],
            title + '-audio-' + pad(i + 1) + '.mp3',
            'audio/mpeg'
          );
          await new Promise(function (resolve) {
            setTimeout(resolve, 250);
          });
        }
      }
    }

    if (options.downloadBundle && pdfBlob && audioBlob) {
      setStatus('正在打包 PDF + 音频…');
      try {
        const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());
        const audioBytes = new Uint8Array(await audioBlob.arrayBuffer());
        const bundle = createZip([
          { name: title + '.pdf', data: pdfBytes },
          { name: title + '-audio.wav', data: audioBytes },
        ]);
        await saveBlob(bundle, title + '_pdf_audio.zip');
        pdfBlob = null;
        audioBlob = null;
      } catch (error) {
        setStatus('PDF + 音频打包失败：' + error.message, true);
      }
    }

    if (pdfBlob) {
      await saveBlob(pdfBlob, title + '.pdf');
    }
    if (audioBlob) {
      await saveBlob(audioBlob, title + '-audio.wav');
    }

    setStatus('下载完成：' + data.title);
  }

  // ========== 单页下载 ==========
  function removeSinglePageButton() {
    const button = document.getElementById('kaz-download-page');
    if (button) button.remove();
  }

  function addSinglePageButton() {
    if (
      !settings ||
      !settings.enabled ||
      !settings.downloadEnabled ||
      !settings.downloadSinglePageEnabled ||
      location.pathname.indexOf('/main/Activity/id/') !== 0
    ) {
      removeSinglePageButton();
      return;
    }
    if (document.getElementById('kaz-download-page')) return;

    const button = document.createElement('button');
    button.id = 'kaz-download-page';
    button.textContent = '下载本页';
    button.style.cssText =
      'position:fixed;top:64px;right:12px;z-index:2147483646;' +
      'padding:6px 9px;border:0;border-radius:6px;background:#89b4fa;' +
      'color:#1e1e2e;font:12px/1.2 system-ui,sans-serif;font-weight:700;' +
      'cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.35);';
    button.addEventListener('click', downloadCurrentPage);
    document.documentElement.appendChild(button);
  }

  async function downloadCurrentPage() {
    const data = await getDownloadData();
    if (!data || !data.pages || !data.pages.length) {
      setStatus('没有读到页面数据，请刷新后重试', true);
      return;
    }
    const page =
      data.pages[Math.max(0, Math.min(data.currentPageIndex || 0, data.pages.length - 1))];
    if (!page || !page.imageUrl) {
      setStatus('当前页没有图片', true);
      return;
    }
    try {
      await saveRemoteFile(
        page.imageUrl,
        pageName(data.title, page.pageNumber),
        'image/jpeg'
      );
      setStatus('已下载第 ' + page.pageNumber + ' 页');
    } catch (error) {
      setStatus('下载失败：' + error.message, true);
    }
  }

  // ========== 启动 ==========
  chrome.storage.local.get(
    Object.assign({ downloadTask: null }, DEFAULTS),
    function (items) {
      settings = items;
      addSinglePageButton();
      if (items.downloadTask) {
        runBookDownload(items.downloadTask);
      }
    }
  );

  chrome.storage.onChanged.addListener(function (changes) {
    if (
      changes.enabled ||
      changes.downloadEnabled ||
      changes.downloadSinglePageEnabled
    ) {
      chrome.storage.local.get(DEFAULTS, function (items) {
        settings = items;
        addSinglePageButton();
      });
    }
    if (changes.downloadTask && changes.downloadTask.newValue) {
      runBookDownload(changes.downloadTask.newValue);
    }
  });
})();
