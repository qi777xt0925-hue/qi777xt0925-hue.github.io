// JSON 읽기/쓰기 유틸.
// 윈도우 편집기(메모장, PowerShell Set-Content 등)는 UTF-8 파일에 BOM을 붙입니다.
// BOM이 남아 있으면 JSON.parse가 그대로 터지므로 읽을 때 제거합니다.

import fs from 'node:fs';

export function readJson(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${file} 파싱 실패: ${err.message}`);
  }
}

/** 항상 BOM 없는 UTF-8 + 개행으로 저장합니다. */
export function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}
