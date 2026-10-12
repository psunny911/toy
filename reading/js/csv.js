// CSV → 문장 목록 (순수 함수, UMD). 열: 영어 문장, 뜻(선택). 따옴표·줄바꿈·탭 구분(시트 붙여넣기)을 처리한다.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Csv = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const HEADER_WORDS = /^(english|sentence|sentences|text|en|영어|문장|영어\s*문장|영문)$/i;

  /** 첫 줄에 탭이 쉼표보다 많으면 탭 구분(스프레드시트에서 복사한 경우)으로 본다. */
  function detectDelimiter(text) {
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const tabs = (firstLine.match(/\t/g) || []).length;
    const commas = (firstLine.match(/,/g) || []).length;
    return tabs > 0 && tabs >= commas ? '\t' : ',';
  }

  /** RFC 4180 방식 파싱: "..." 안의 구분자·줄바꿈 허용, "" → " */
  function parseRows(text, delimiter) {
    const src = String(text || '').replace(/^﻿/, '');
    const delim = delimiter || detectDelimiter(src);
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (quoted) {
        if (c === '"') {
          if (src[i + 1] === '"') { field += '"'; i++; } else { quoted = false; }
        } else {
          field += c;
        }
      } else if (c === '"' && field === '') {
        quoted = true;
      } else if (c === delim) {
        row.push(field); field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && src[i + 1] === '\n') i++;
        row.push(field); field = '';
        rows.push(row); row = [];
      } else {
        field += c;
      }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  /**
   * 텍스트 → [{ en, ko }]. 첫 칸이 비어 있는 줄은 건너뛰고, 첫 줄이 머리글이면 뺀다.
   * 뜻은 둘째 칸, 없으면 ''.
   */
  function parseSentences(text) {
    const rows = parseRows(text);
    const items = [];
    rows.forEach((cells, idx) => {
      const en = (cells[0] || '').replace(/\s+/g, ' ').trim();
      const ko = (cells[1] || '').replace(/\s+/g, ' ').trim();
      if (!en) return;
      if (idx === 0 && HEADER_WORDS.test(en)) return;
      if (!/[A-Za-z0-9]/.test(en)) return; // 영어로 읽을 단어가 없는 줄
      items.push({ en, ko });
    });
    return items;
  }

  /**
   * 파일 바이트 → 텍스트. UTF-8이 아니면 엑셀 한글 기본값인 EUC-KR(CP949)로 다시 읽는다.
   * @param {ArrayBuffer|Uint8Array} buf
   */
  function decodeBytes(buf) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch (e) {
      try { return new TextDecoder('euc-kr').decode(buf); } catch (e2) { return new TextDecoder('utf-8').decode(buf); }
    }
  }

  /** [{ en, ko }] → CSV 텍스트 (머리글 포함). 쉼표·따옴표·줄바꿈이 있는 칸은 따옴표로 감싼다. */
  function toCsv(items) {
    const cell = (v) => {
      const t = String(v == null ? '' : v);
      return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    };
    return ['english,meaning'].concat(items.map((it) => cell(it.en) + ',' + cell(it.ko))).join('\r\n') + '\r\n';
  }

  return { detectDelimiter, parseRows, parseSentences, decodeBytes, toCsv };
});
