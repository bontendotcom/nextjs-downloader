import { NextResponse } from 'next/server';
import archiver from 'archiver';
import { Buffer } from 'buffer';
import fs from 'fs';
import path from 'path';
import os from 'os';

// 一時ファイルの保存場所を定義
const TMP_DIR = path.join(os.tmpdir(), 'nextjs-downloader');
// 存在しない場合はディレクトリを作成
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

export async function POST(req: Request) {
  try {
    const { urls, username, password } = await req.json();

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: 'URLsが指定されていません。' }, { status: 400 });
    }

    const authHeader = (username && password) ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` : undefined;
    const MAX_RETRIES = 3; // 最大再試行回数
    const RETRY_DELAY_MS = 1000; // 再試行間の遅延（ミリ秒）

    const downloadLogs: { url: string; status: 'success' | 'failed'; error?: string; retries?: number }[] = [];
    const downloadedFiles: { name: string; buffer: Buffer }[] = [];

    // ダウンロードと再試行ロジックをカプセル化する関数
    const downloadFileWithRetry = async (url: string, attempt = 1): Promise<void> => {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: authHeader ? { 'Authorization': authHeader } : {},
        });

        if (!response.ok) {
          const errorMessage = `ステータス: ${response.status} ${response.statusText}`;
          if (attempt <= MAX_RETRIES) {
            console.warn(`URL: ${url} のダウンロードに失敗しました。再試行します (${attempt}/${MAX_RETRIES})。エラー: ${errorMessage}`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            return downloadFileWithRetry(url, attempt + 1);
          } else {
            downloadLogs.push({ url, status: 'failed', error: errorMessage, retries: attempt - 1 });
            return;
          }
        }

        const buffer = await response.arrayBuffer();
        const urlObj = new URL(url);
        
        // パスをセグメントに分割し、不正な文字をクリーンアップ
        const pathSegments = urlObj.pathname.split('/').filter(Boolean).map(segment => segment.replace(/[/?<>\\:*|"]/g, '_'));
        
        let fullPath: string;

        // パスが空またはスラッシュで終わる場合、index.htmlを補完
        if (urlObj.pathname === '/' || urlObj.pathname.endsWith('/')) {
            fullPath = path.join(urlObj.hostname, ...pathSegments, 'index.html');
        } else {
            // パスの最後のセグメントに拡張子がない場合、index.htmlを追加
            const lastSegment = pathSegments[pathSegments.length - 1];
            if (!path.extname(lastSegment)) {
                fullPath = path.join(urlObj.hostname, ...pathSegments, 'index.html');
            } else {
                fullPath = path.join(urlObj.hostname, ...pathSegments);
            }
        }
        
        downloadedFiles.push({ name: fullPath, buffer: Buffer.from(buffer) });
        downloadLogs.push({ url, status: 'success', retries: attempt - 1 });
      } catch (e: unknown) {
        let errorMessage = '不明なエラー';
        if (e instanceof Error) {
          errorMessage = e.message;
        }
        if (attempt <= MAX_RETRIES) {
          console.warn(`URL: ${url} のダウンロード中にエラーが発生しました。再試行します (${attempt}/${MAX_RETRIES})。エラー: ${errorMessage}`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          return downloadFileWithRetry(url, attempt + 1);
        } else {
          downloadLogs.push({ url, status: 'failed', error: errorMessage, retries: attempt - 1 });
        }
      }
    };

    // すべてのダウンロードプロミスを開始
    const allDownloadPromises = urls.map((url: string) => downloadFileWithRetry(url));
    await Promise.allSettled(allDownloadPromises);

    // 失敗したダウンロードがあるか確認
    const failedDownloads = downloadLogs.filter(log => log.status === 'failed');
    if (failedDownloads.length > 0) {
      console.error('ダウンロードに失敗したURL:', failedDownloads);
      return NextResponse.json({ 
        error: '一部のURLのダウンロードに失敗しました。', 
        downloadLogs,
      }, { status: 500 });
    }

    // ZIPファイルの一時的な保存先を定義
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const zipFilename = `downloaded_${year}${month}${day}_${hours}${minutes}${seconds}.zip`;
    const zipPath = path.join(TMP_DIR, zipFilename);
    const output = fs.createWriteStream(zipPath);

    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    archive.pipe(output);

    // ダウンロードしたファイルをアーカイブに追加
    downloadedFiles.forEach(file => {
      try {
        archive.append(file.buffer, { name: file.name });
      } catch (archiveAppendError) {
        console.error('アーカイブへの追加中にエラーが発生しました:', archiveAppendError, 'ファイル名:', file.name);
        return NextResponse.json({ error: 'ZIPファイルの作成中にエラーが発生しました。' }, { status: 500 });
      }
    });

    // ZIPアーカイブの終了を待機
    try {
      await new Promise<void>((resolve, reject) => {
        output.on('close', () => resolve());
        archive.on('error', (err) => {
          console.error('アーカイブ中にエラーが発生しました:', err);
          reject(err);
        });
        archive.finalize();
      });
    } catch (archiveFinalizeError) {
      console.error('アーカイブの終了中にエラーが発生しました:', archiveFinalizeError);
      return NextResponse.json({ error: 'ZIPファイルの作成中にエラーが発生しました。' }, { status: 500 });
    }
    
    // ZIPファイルをダウンロードするためのURLを返す
    const zipUrl = `/api/download-zip/${zipFilename}`;

    return NextResponse.json({ 
      message: 'ZIPファイルの作成に成功しました。', 
      zipUrl,
      downloadLogs,
    });

  } catch (error) {
    console.error('サーバーエラー:', error);
    return NextResponse.json({ error: 'サーバーで内部エラーが発生しました。' }, { status: 500 });
  }
}
